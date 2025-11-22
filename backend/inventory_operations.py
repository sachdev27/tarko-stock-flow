"""
Inventory Operations Helper - Industry Best Practices Implementation

This module provides thread-safe, transactionally-consistent operations for
inventory management with proper event sourcing, optimistic locking, and
immutable data tracking.

PRINCIPLES:
1. Immutability: created_by_transaction_id never changes after creation
2. Event Sourcing: All state changes logged to piece_lifecycle_events
3. Optimistic Locking: Row versioning prevents race conditions
4. Soft Deletes: Never hard delete - preserves audit trail
5. Atomicity: All operations are transactional with proper rollback

Usage:
    from inventory_operations import InventoryOperations

    with get_db_cursor(commit=True) as cursor:
        ops = InventoryOperations(cursor, user_id)

        # Create pieces (immutable transaction_id)
        piece_ids = ops.create_spare_pieces(
            stock_id=stock_id,
            piece_count=10,
            transaction_id=txn_id
        )

        # Reserve pieces for operation (pessimistic lock)
        reserved = ops.reserve_pieces(
            piece_ids=[...],
            transaction_id=txn_id
        )

        # Combine spares without overwriting creator
        bundle_id = ops.combine_spares(
            spare_piece_ids=[...],
            bundle_size=10,
            transaction_id=txn_id
        )

        # Revert operation (precise rollback)
        ops.revert_transaction(transaction_id=txn_id)
"""

import uuid
import json
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from psycopg2.extras import RealDictCursor
from psycopg2 import sql


class ConcurrencyError(Exception):
    """Raised when optimistic locking detects concurrent modification"""
    pass


class ValidationError(Exception):
    """Raised when business rules are violated"""
    pass


class ReservationError(Exception):
    """Raised when pieces cannot be reserved (already locked)"""
    pass


class InventoryOperations:
    """
    Thread-safe inventory operations with proper event sourcing and locking.
    """

    def __init__(self, cursor, user_id: str):
        """
        Initialize inventory operations.

        Args:
            cursor: psycopg2 cursor with RealDictCursor
            user_id: UUID of user performing operations
        """
        self.cursor = cursor
        self.user_id = user_id

        # Note: Transaction isolation should be set at connection level, not here
        # Removed: SET TRANSACTION ISOLATION LEVEL REPEATABLE READ

    # ========================================================================
    # PIECE CREATION (Immutable transaction_id)
    # ========================================================================

    def create_spare_pieces(
        self,
        stock_id: str,
        piece_count: int,
        transaction_id: str,
        notes: Optional[str] = None
    ) -> List[str]:
        """
        Create spare pieces with IMMUTABLE created_by_transaction_id.

        Args:
            stock_id: UUID of stock record
            piece_count: Number of pieces
            transaction_id: UUID of transaction creating these pieces
            notes: Optional notes

        Returns:
            List of created piece IDs

        Raises:
            ValidationError: If stock not found or invalid
        """
        # Validate stock exists and is correct type
        self.cursor.execute("""
            SELECT id, stock_type, product_variant_id, batch_id, piece_length_meters
            FROM inventory_stock
            WHERE id = %s
              AND stock_type = 'SPARE'
              AND deleted_at IS NULL
            FOR UPDATE  -- Lock this stock record
        """, (stock_id,))

        stock = self.cursor.fetchone()
        if not stock:
            raise ValidationError(f"SPARE stock {stock_id} not found or deleted")

        # Create pieces with IMMUTABLE created_by_transaction_id
        self.cursor.execute("""
            INSERT INTO sprinkler_spare_pieces (
                id,
                stock_id,
                piece_count,
                status,
                notes,
                created_by_transaction_id,  -- IMMUTABLE
                original_stock_id,          -- IMMUTABLE
                version,
                created_at,
                updated_at
            ) VALUES (%s, %s, %s, 'IN_STOCK', %s, %s, %s, 1, NOW(), NOW())
            RETURNING id
        """, (
            str(uuid.uuid4()),
            stock_id,
            piece_count,
            notes,
            transaction_id,  # Set once, never change!
            stock_id         # Remember original location
        ))

        result = self.cursor.fetchone()
        piece_id = result['id']

        # Note: Trigger auto_update_stock_quantity will update stock.quantity
        # Note: Trigger log_piece_lifecycle will log CREATED event

        return [piece_id]

    def create_cut_pieces(
        self,
        stock_id: str,
        lengths: List[float],
        transaction_id: str,
        notes: Optional[str] = None
    ) -> List[str]:
        """
        Create HDPE cut pieces with IMMUTABLE created_by_transaction_id.

        Args:
            stock_id: UUID of stock record
            lengths: List of lengths in meters for each cut piece
            transaction_id: UUID of transaction creating these pieces
            notes: Optional notes

        Returns:
            List of created piece IDs
        """
        # Validate stock exists
        self.cursor.execute("""
            SELECT id, stock_type
            FROM inventory_stock
            WHERE id = %s
              AND stock_type = 'CUT_ROLL'
              AND deleted_at IS NULL
            FOR UPDATE
        """, (stock_id,))

        stock = self.cursor.fetchone()
        if not stock:
            raise ValidationError(f"CUT_ROLL stock {stock_id} not found")

        piece_ids = []
        for length in lengths:
            if length <= 0:
                raise ValidationError(f"Invalid length: {length}")

            self.cursor.execute("""
                INSERT INTO hdpe_cut_pieces (
                    id,
                    stock_id,
                    length_meters,
                    status,
                    notes,
                    created_by_transaction_id,  -- IMMUTABLE
                    original_stock_id,          -- IMMUTABLE
                    version,
                    created_at,
                    updated_at
                ) VALUES (%s, %s, %s, 'IN_STOCK', %s, %s, %s, 1, NOW(), NOW())
                RETURNING id
            """, (
                str(uuid.uuid4()),
                stock_id,
                length,
                notes,
                transaction_id,
                stock_id
            ))

            result = self.cursor.fetchone()
            piece_ids.append(result['id'])

        return piece_ids

    # ========================================================================
    # PIECE RESERVATION (Pessimistic Locking)
    # ========================================================================

    def reserve_pieces(
        self,
        piece_ids: List[str],
        transaction_id: str,
        timeout_minutes: int = 30
    ) -> List[Dict[str, Any]]:
        """
        Reserve spare pieces for operation (pessimistic lock).

        Args:
            piece_ids: List of piece IDs to reserve
            transaction_id: UUID of transaction reserving pieces
            timeout_minutes: Reservation timeout (default 30 min)

        Returns:
            List of reserved piece records

        Raises:
            ReservationError: If pieces already reserved or not available
            ConcurrencyError: If pieces were modified concurrently
        """
        # Release any stale reservations first
        self._release_stale_reservations(timeout_minutes)

        # Try to lock pieces
        self.cursor.execute("""
            SELECT
                id, piece_count, version, status,
                reserved_by_transaction_id, reserved_at
            FROM sprinkler_spare_pieces
            WHERE id = ANY(%s::uuid[])
              AND deleted_at IS NULL
            FOR UPDATE NOWAIT  -- Fail immediately if locked
        """, (piece_ids,))

        pieces = self.cursor.fetchall()

        # Validate all pieces found
        if len(pieces) != len(piece_ids):
            found_ids = {p['id'] for p in pieces}
            missing = set(piece_ids) - found_ids
            raise ValidationError(f"Pieces not found: {missing}")

        # Check for existing reservations
        reserved = [p for p in pieces if p['reserved_by_transaction_id'] is not None]
        if reserved:
            raise ReservationError(
                f"{len(reserved)} pieces already reserved by other transactions"
            )

        # Check all pieces are IN_STOCK
        not_available = [p for p in pieces if p['status'] != 'IN_STOCK']
        if not_available:
            raise ValidationError(
                f"{len(not_available)} pieces not IN_STOCK"
            )

        # Reserve pieces
        self.cursor.execute("""
            UPDATE sprinkler_spare_pieces
            SET
                reserved_by_transaction_id = %s,
                reserved_at = NOW(),
                updated_at = NOW()
            WHERE id = ANY(%s::uuid[])
              AND version = ANY(%s::int[])  -- Optimistic lock check
            RETURNING id, piece_count, version
        """, (
            transaction_id,
            piece_ids,
            [p['version'] for p in pieces]
        ))

        updated = self.cursor.fetchall()

        # Verify all pieces were updated (detect concurrent modifications)
        if len(updated) != len(piece_ids):
            raise ConcurrencyError(
                "Some pieces were modified by another transaction. Please retry."
            )

        return updated

    def release_pieces(
        self,
        piece_ids: List[str],
        transaction_id: str
    ) -> int:
        """
        Release reserved pieces.

        Args:
            piece_ids: List of piece IDs to release
            transaction_id: UUID of transaction that reserved them

        Returns:
            Number of pieces released
        """
        self.cursor.execute("""
            UPDATE sprinkler_spare_pieces
            SET
                reserved_by_transaction_id = NULL,
                reserved_at = NULL,
                updated_at = NOW()
            WHERE id = ANY(%s::uuid[])
              AND reserved_by_transaction_id = %s
            RETURNING id
        """, (piece_ids, transaction_id))

        return self.cursor.rowcount

    def _release_stale_reservations(self, timeout_minutes: int):
        """Release reservations older than timeout"""
        self.cursor.execute("""
            UPDATE sprinkler_spare_pieces
            SET
                reserved_by_transaction_id = NULL,
                reserved_at = NULL,
                updated_at = NOW()
            WHERE reserved_at < NOW() - INTERVAL '%s minutes'
        """, (timeout_minutes,))

    # ========================================================================
    # COMBINE SPARES (Without Overwriting created_by_transaction_id!)
    # ========================================================================

    def combine_spares(
        self,
        spare_piece_ids: List[str],
        bundle_size: int,
        number_of_bundles: int,
        transaction_id: str
    ) -> Tuple[str, Optional[str]]:
        """
        Combine spare pieces into bundles WITHOUT overwriting created_by_transaction_id.

        Args:
            spare_piece_ids: List of spare piece IDs to combine
            bundle_size: Pieces per bundle
            number_of_bundles: Number of bundles to create
            transaction_id: UUID of COMBINE_SPARES transaction

        Returns:
            Tuple of (bundle_stock_id, remainder_piece_id or None)

        Raises:
            ValidationError: If insufficient pieces or invalid params
            ReservationError: If pieces already reserved
            ConcurrencyError: If concurrent modification detected
        """
        # 1. Validate parameters
        if bundle_size <= 0 or number_of_bundles <= 0:
            raise ValidationError("Bundle size and number must be positive")

        total_needed = bundle_size * number_of_bundles

        # 2. Reserve pieces (pessimistic lock)
        try:
            reserved_pieces = self.reserve_pieces(spare_piece_ids, transaction_id)
        except Exception as e:
            raise ValidationError(f"Cannot reserve pieces: {e}")

        # 3. Calculate total pieces
        total_pieces = sum(p['piece_count'] for p in reserved_pieces)

        if total_pieces < total_needed:
            # Release reservation
            self.release_pieces(spare_piece_ids, transaction_id)
            raise ValidationError(
                f"Insufficient pieces: have {total_pieces}, need {total_needed}"
            )

        # 4. Get stock info from first piece
        self.cursor.execute("""
            SELECT
                ssp.stock_id,
                ist.batch_id,
                ist.product_variant_id,
                ist.piece_length_meters
            FROM sprinkler_spare_pieces ssp
            JOIN inventory_stock ist ON ssp.stock_id = ist.id
            WHERE ssp.id = %s
        """, (spare_piece_ids[0],))

        spare_stock_info = self.cursor.fetchone()

        # 5. Create or update BUNDLE stock
        self.cursor.execute("""
            SELECT id, quantity, version
            FROM inventory_stock
            WHERE batch_id = %s
              AND product_variant_id = %s
              AND stock_type = 'BUNDLE'
              AND pieces_per_bundle = %s
              AND piece_length_meters = %s
              AND deleted_at IS NULL
            FOR UPDATE
        """, (
            spare_stock_info['batch_id'],
            spare_stock_info['product_variant_id'],
            bundle_size,
            spare_stock_info['piece_length_meters']
        ))

        bundle_stock = self.cursor.fetchone()

        if bundle_stock:
            # Update existing bundle stock
            self.cursor.execute("""
                UPDATE inventory_stock
                SET
                    quantity = quantity + %s,
                    updated_at = NOW(),
                    version = version + 1
                WHERE id = %s
                  AND version = %s  -- Optimistic lock
                RETURNING id
            """, (number_of_bundles, bundle_stock['id'], bundle_stock['version']))

            if self.cursor.rowcount == 0:
                raise ConcurrencyError("Bundle stock was modified concurrently")

            bundle_stock_id = bundle_stock['id']
        else:
            # Create new bundle stock
            self.cursor.execute("""
                INSERT INTO inventory_stock (
                    id, batch_id, product_variant_id, stock_type,
                    quantity, pieces_per_bundle, piece_length_meters,
                    status, version, created_at, updated_at
                ) VALUES (%s, %s, %s, 'BUNDLE', %s, %s, %s, 'IN_STOCK', 1, NOW(), NOW())
                RETURNING id
            """, (
                str(uuid.uuid4()),
                spare_stock_info['batch_id'],
                spare_stock_info['product_variant_id'],
                number_of_bundles,
                bundle_size,
                spare_stock_info['piece_length_meters']
            ))

            bundle_stock_id = self.cursor.fetchone()['id']

        # 6. Mark spare pieces as SOLD_OUT and set deleted_by_transaction_id
        # (DO NOT overwrite created_by_transaction_id!)
        # The trigger will log this as 'COMBINED' event
        self.cursor.execute("""
            UPDATE sprinkler_spare_pieces
            SET
                status = 'SOLD_OUT',
                deleted_at = NOW(),
                deleted_by_transaction_id = %s,
                updated_at = NOW(),
                reserved_by_transaction_id = NULL,
                reserved_at = NULL
                -- NOTE: created_by_transaction_id is NOT touched!
                -- Trigger prevent_transaction_id_mutation prevents changes
            WHERE id = ANY(%s::uuid[])
        """, (transaction_id, spare_piece_ids))

        # 7. Handle remainder pieces
        remainder = total_pieces - total_needed
        remainder_piece_id = None

        if remainder > 0:
            # Create remainder pieces with THIS transaction as creator
            remainder_piece_id = self.create_spare_pieces(
                stock_id=spare_stock_info['stock_id'],
                piece_count=remainder,
                transaction_id=transaction_id,
                notes=f'Remainder from combining: {remainder} pieces'
            )[0]

        # 8. Soft delete spare stock if quantity = 0
        # The trigger auto_update_stock_quantity will update quantity automatically
        self.cursor.execute("""
            UPDATE inventory_stock
            SET
                deleted_at = CASE
                    WHEN quantity = 0 THEN NOW()
                    ELSE NULL
                END,
                deleted_by_transaction_id = CASE
                    WHEN quantity = 0 THEN %s::uuid
                    ELSE NULL
                END
            WHERE id = %s
        """, (transaction_id, spare_stock_info['stock_id']))

        return (bundle_stock_id, remainder_piece_id)

    # ========================================================================
    # REVERT OPERATIONS (Precise Rollback Using Immutable IDs)
    # ========================================================================

    def revert_cut_roll(self, transaction_id: str) -> Dict[str, Any]:
        """
        Revert a CUT_ROLL operation.

        Uses created_by_transaction_id to find ONLY pieces created by this operation.

        Args:
            transaction_id: UUID of CUT_ROLL transaction to revert

        Returns:
            Dict with revert statistics
        """
        # 1. Verify not already reverted
        self.cursor.execute("""
            SELECT reverted_at FROM inventory_transactions
            WHERE id = %s
        """, (transaction_id,))

        txn = self.cursor.fetchone()
        if not txn:
            raise ValidationError(f"Transaction {transaction_id} not found")

        if txn['reverted_at']:
            raise ValidationError(f"Transaction already reverted at {txn['reverted_at']}")

        # 2. Check if any pieces were dispatched
        self.cursor.execute("""
            SELECT COUNT(*) as dispatched_count
            FROM hdpe_cut_pieces
            WHERE created_by_transaction_id = %s
              AND status = 'DISPATCHED'
              AND deleted_at IS NULL
        """, (transaction_id,))

        check = self.cursor.fetchone()
        if check['dispatched_count'] > 0:
            raise ValidationError(
                f"Cannot revert: {check['dispatched_count']} pieces already dispatched"
            )

        # 3. Count pieces to revert
        self.cursor.execute("""
            SELECT COUNT(*) as piece_count, stock_id
            FROM hdpe_cut_pieces
            WHERE created_by_transaction_id = %s
              AND status = 'IN_STOCK'
              AND deleted_at IS NULL
            GROUP BY stock_id
        """, (transaction_id,))

        stock_info = self.cursor.fetchone()
        if not stock_info:
            raise ValidationError("No pieces found to revert")

        piece_count = stock_info['piece_count']
        stock_id = stock_info['stock_id']

        # 4. Soft delete cut pieces (never hard delete!)
        self.cursor.execute("""
            UPDATE hdpe_cut_pieces
            SET
                status = 'SOLD_OUT',
                deleted_at = NOW(),
                deleted_by_transaction_id = %s,
                updated_at = NOW()
            WHERE created_by_transaction_id = %s
              AND status = 'IN_STOCK'
              AND deleted_at IS NULL
        """, (transaction_id, transaction_id))

        deleted_count = self.cursor.rowcount

        # 5. Get original transaction details
        self.cursor.execute("""
            SELECT from_stock_id, to_stock_id
            FROM inventory_transactions
            WHERE id = %s
        """, (transaction_id,))

        txn_details = self.cursor.fetchone()

        # 6. Restore original FULL_ROLL (+1 quantity)
        if txn_details['from_stock_id']:
            self.cursor.execute("""
                UPDATE inventory_stock
                SET
                    quantity = quantity + 1,
                    status = 'IN_STOCK',
                    updated_at = NOW()
                WHERE id = %s
            """, (txn_details['from_stock_id'],))

        # 7. Mark transaction as reverted
        self.cursor.execute("""
            UPDATE inventory_transactions
            SET reverted_at = NOW(), reverted_by = %s
            WHERE id = %s
        """, (self.user_id, transaction_id))

        return {
            'transaction_id': transaction_id,
            'pieces_reverted': deleted_count,
            'stock_restored': txn_details['from_stock_id']
        }

    def revert_combine_spares(self, transaction_id: str) -> Dict[str, Any]:
        """
        Revert a COMBINE_SPARES operation.

        Uses event history and immutable IDs for precise rollback.

        Args:
            transaction_id: UUID of COMBINE_SPARES transaction to revert

        Returns:
            Dict with revert statistics
        """
        # 1. Get transaction details
        self.cursor.execute("""
            SELECT
                it.reverted_at,
                it.from_stock_id,
                it.to_stock_id,
                it.created_at
            FROM inventory_transactions it
            WHERE it.id = %s
        """, (transaction_id,))

        txn = self.cursor.fetchone()
        if not txn:
            raise ValidationError(f"Transaction {transaction_id} not found")

        if txn['reverted_at']:
            raise ValidationError("Transaction already reverted")

        # 2. Check if bundle was dispatched
        if txn['to_stock_id']:
            self.cursor.execute("""
                SELECT status FROM inventory_stock WHERE id = %s
            """, (txn['to_stock_id'],))

            bundle_stock = self.cursor.fetchone()
            if bundle_stock and bundle_stock['status'] == 'DISPATCHED':
                raise ValidationError("Cannot revert: Bundle already dispatched")

        # 3. Query piece_lifecycle_events to find which pieces were affected
        self.cursor.execute("""
            SELECT
                piece_id,
                event_type,
                state_before,
                state_after
            FROM piece_lifecycle_events
            WHERE transaction_id = %s
              AND piece_type = 'SPRINKLER'
              AND event_type IN ('COMBINED', 'CREATED')
            ORDER BY created_at
        """, (transaction_id,))

        events = self.cursor.fetchall()

        # 4. Restore pieces that were COMBINED (status changed to SOLD_OUT)
        combined_pieces = [
            e['piece_id'] for e in events
            if e['event_type'] == 'COMBINED'
        ]

        if combined_pieces:
            self.cursor.execute("""
                UPDATE sprinkler_spare_pieces
                SET
                    status = 'IN_STOCK',
                    updated_at = NOW()
                WHERE id = ANY(%s::uuid[])
                  AND status = 'SOLD_OUT'
            """, (combined_pieces,))

            restored_count = self.cursor.rowcount
        else:
            restored_count = 0

        # 5. Soft delete remainder pieces CREATED by this transaction
        remainder_pieces = [
            e['piece_id'] for e in events
            if e['event_type'] == 'CREATED'
            and 'Remainder' in (e['state_after'] or {}).get('notes', '')
        ]

        if remainder_pieces:
            self.cursor.execute("""
                UPDATE sprinkler_spare_pieces
                SET
                    deleted_at = NOW(),
                    deleted_by_transaction_id = %s,
                    status = 'SOLD_OUT',
                    updated_at = NOW()
                WHERE id = ANY(%s::uuid[])
                  AND created_by_transaction_id = %s
            """, (transaction_id, remainder_pieces, transaction_id))

        # 6. Restore SPARE stock if it was deleted
        if txn['from_stock_id']:
            self.cursor.execute("""
                UPDATE inventory_stock
                SET
                    deleted_at = NULL,
                    deleted_by_transaction_id = NULL,
                    status = 'IN_STOCK',
                    updated_at = NOW()
                WHERE deleted_by_transaction_id = %s
            """, (transaction_id,))

        # 7. Handle bundle stock
        if txn['to_stock_id']:
            # Check if bundle was created by this transaction
            self.cursor.execute("""
                SELECT created_at, quantity
                FROM inventory_stock
                WHERE id = %s
            """, (txn['to_stock_id'],))

            bundle = self.cursor.fetchone()

            if bundle:
                # Compare timestamps (within 1 second = same transaction)
                time_diff = abs((bundle['created_at'] - txn['created_at']).total_seconds())

                if time_diff < 1:
                    # Bundle was created by this operation - soft delete it
                    self.cursor.execute("""
                        UPDATE inventory_stock
                        SET
                            deleted_at = NOW(),
                            deleted_by_transaction_id = %s,
                            status = 'SOLD_OUT'
                        WHERE id = %s
                    """, (transaction_id, txn['to_stock_id']))
                else:
                    # Bundle existed before - decrement quantity
                    # Get bundles added from transaction record
                    self.cursor.execute("""
                        SELECT to_quantity FROM inventory_transactions WHERE id = %s
                    """, (transaction_id,))

                    bundles_added = self.cursor.fetchone()['to_quantity'] or 0

                    self.cursor.execute("""
                        UPDATE inventory_stock
                        SET
                            quantity = GREATEST(0, quantity - %s),
                            updated_at = NOW()
                        WHERE id = %s
                    """, (bundles_added, txn['to_stock_id']))

        # 8. Mark transaction as reverted
        self.cursor.execute("""
            UPDATE inventory_transactions
            SET reverted_at = NOW(), reverted_by = %s
            WHERE id = %s
        """, (self.user_id, transaction_id))

        return {
            'transaction_id': transaction_id,
            'pieces_restored': restored_count,
            'remainder_deleted': len(remainder_pieces)
        }

    # ========================================================================
    # VALIDATION HELPERS
    # ========================================================================

    def validate_stock_quantities(self) -> List[Dict[str, Any]]:
        """
        Validate all stock quantities match piece counts.

        Returns:
            List of stocks with mismatches (empty if all valid)
        """
        self.cursor.execute("""
            SELECT * FROM v_stock_quantity_validation
            WHERE quantity_mismatch != 0
        """)

        return self.cursor.fetchall()

    def get_piece_audit_trail(
        self,
        piece_id: str,
        piece_type: str = 'SPRINKLER'
    ) -> List[Dict[str, Any]]:
        """
        Get full audit trail for a piece.

        Args:
            piece_id: UUID of piece
            piece_type: 'HDPE' or 'SPRINKLER'

        Returns:
            List of events in chronological order
        """
        self.cursor.execute("""
            SELECT * FROM v_piece_audit_trail
            WHERE piece_id = %s AND piece_type = %s
            ORDER BY created_at
        """, (piece_id, piece_type))

        return self.cursor.fetchall()
