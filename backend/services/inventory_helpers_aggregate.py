"""
Inventory Helper Functions for Aggregate Stock Management

This module provides helper functions for working with the aggregate inventory system:
- inventory_stock: Main aggregate table (one row can represent multiple physical items)
- hdpe_cut_pieces: Individual cut pieces from HDPE rolls
- sprinkler_spare_pieces: Individual spare pieces from sprinkler bundles
- inventory_transactions: Complete audit trail of all operations
"""

import uuid
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
import json
from database import get_db_cursor


class AggregateInventoryHelper:
    """Helper class for aggregate inventory operations"""

    @staticmethod
    def get_product_category(cursor, product_variant_id: str) -> Optional[str]:
        """Get the product category (HDPE Pipe or Sprinkler Pipe) for a variant"""
        cursor.execute("""
            SELECT pt.name
            FROM product_variants pv
            JOIN product_types pt ON pv.product_type_id = pt.id
            WHERE pv.id = %s
        """, (product_variant_id,))

        result = cursor.fetchone()
        return result['name'] if result else None

    # ==========================================
    # PRODUCTION - Create new stock entries
    # ==========================================

    @staticmethod
    def create_hdpe_stock(
        cursor,
        batch_id: str,
        product_variant_id: str,
        quantity: int,
        length_per_roll: float,
        status: str = 'IN_STOCK',
        notes: Optional[str] = None
    ) -> str:
        """
        Create HDPE full rolls stock entry (aggregate)

        Args:
            quantity: Number of rolls (e.g., 10 for ten 300m rolls)
            length_per_roll: Standard length in meters (e.g., 300)

        Returns:
            stock_id: UUID of created stock entry
        """
        stock_id = str(uuid.uuid4())

        cursor.execute("""
            INSERT INTO inventory_stock (
                id, batch_id, product_variant_id, status, stock_type,
                quantity, length_per_unit, notes
            ) VALUES (%s, %s, %s, %s, 'FULL_ROLL', %s, %s, %s)
            RETURNING id
        """, (stock_id, batch_id, product_variant_id, status, quantity, length_per_roll, notes))

        # Create production transaction
        cursor.execute("""
            INSERT INTO inventory_transactions (
                transaction_type, to_stock_id, to_quantity, batch_id, notes
            ) VALUES ('PRODUCTION', %s, %s, %s, %s)
        """, (stock_id, quantity, batch_id, f'Produced {quantity} rolls of {length_per_roll}m'))

        return stock_id

    @staticmethod
    def create_sprinkler_bundle_stock(
        cursor,
        batch_id: str,
        product_variant_id: str,
        quantity: int,
        pieces_per_bundle: int,
        piece_length_meters: float,
        status: str = 'IN_STOCK',
        notes: Optional[str] = None
    ) -> str:
        """
        Create sprinkler bundle stock entry (aggregate)

        Args:
            quantity: Number of bundles (e.g., 5 for five bundles)
            pieces_per_bundle: Pieces per bundle (e.g., 10)
            piece_length_meters: Length of each piece (e.g., 6.0)

        Returns:
            stock_id: UUID of created stock entry
        """
        stock_id = str(uuid.uuid4())

        cursor.execute("""
            INSERT INTO inventory_stock (
                id, batch_id, product_variant_id, status, stock_type,
                quantity, pieces_per_bundle, piece_length_meters, notes
            ) VALUES (%s, %s, %s, %s, 'BUNDLE', %s, %s, %s, %s)
            RETURNING id
        """, (stock_id, batch_id, product_variant_id, status, quantity,
              pieces_per_bundle, piece_length_meters, notes))

        # Create production transaction
        total_pieces = quantity * pieces_per_bundle
        cursor.execute("""
            INSERT INTO inventory_transactions (
                transaction_type, to_stock_id, to_quantity, to_pieces, batch_id, notes
            ) VALUES ('PRODUCTION', %s, %s, %s, %s, %s)
        """, (stock_id, quantity, total_pieces, batch_id,
              f'Produced {quantity} bundles ({total_pieces} pieces total)'))

        return stock_id

    @staticmethod
    def create_sprinkler_spare_stock(
        cursor,
        batch_id: str,
        product_variant_id: str,
        spare_pieces: List[int],
        piece_length_meters: float,
        status: str = 'IN_STOCK',
        notes: Optional[str] = None
    ) -> str:
        """
        Create sprinkler spare pieces stock entry

        Args:
            spare_pieces: List of piece counts (e.g., [3, 5, 2] for three spare groups)
            piece_length_meters: Length of each piece

        Returns:
            stock_id: UUID of created stock entry
        """
        stock_id = str(uuid.uuid4())
        total_spare_count = len(spare_pieces)

        cursor.execute("""
            INSERT INTO inventory_stock (
                id, batch_id, product_variant_id, status, stock_type,
                quantity, piece_length_meters, notes
            ) VALUES (%s, %s, %s, %s, 'SPARE', %s, %s, %s)
            RETURNING id
        """, (stock_id, batch_id, product_variant_id, status,
              total_spare_count, piece_length_meters, notes))

        # Create production transaction first to get transaction_id
        total_pieces = sum(spare_pieces)
        cursor.execute("""
            INSERT INTO inventory_transactions (
                transaction_type, to_stock_id, to_quantity, to_pieces, batch_id, notes
            ) VALUES ('PRODUCTION', %s, %s, %s, %s, %s)
            RETURNING id
        """, (stock_id, total_spare_count, total_pieces, batch_id,
              f'Produced {total_spare_count} spare groups ({total_pieces} pieces total)'))

        production_txn_id = cursor.fetchone()['id']

        # Create individual spare piece entries with IMMUTABLE created_by_transaction_id
        for piece_count in spare_pieces:
            cursor.execute("""
                INSERT INTO sprinkler_spare_pieces (
                    stock_id, piece_count, status, created_by_transaction_id, original_stock_id
                ) VALUES (%s, %s, %s, %s, %s)
            """, (stock_id, piece_count, status, production_txn_id, stock_id))

        return stock_id

    # ==========================================
    # CUT ROLL OPERATIONS - HDPE
    # ==========================================

    @staticmethod
    def cut_hdpe_roll(
        cursor,
        from_stock_id: str,
        cut_lengths: List[float],
        notes: Optional[str] = None,
        created_by: Optional[str] = None
    ) -> Tuple[str, List[str]]:
        """
        Cut one HDPE roll into multiple pieces

        Args:
            from_stock_id: Stock ID of full rolls
            cut_lengths: List of lengths for cut pieces (e.g., [150, 145])

        Returns:
            (new_stock_id, cut_piece_ids): New CUT_ROLL stock entry and list of piece IDs
        """
        # Get the source stock details
        cursor.execute("""
            SELECT batch_id, product_variant_id, quantity, length_per_unit
            FROM inventory_stock
            WHERE id = %s AND stock_type = 'FULL_ROLL' AND status = 'IN_STOCK' AND deleted_at IS NULL
        """, (from_stock_id,))

        source = cursor.fetchone()
        if not source:
            raise ValueError("Source stock not found or not available for cutting")

        batch_id, product_variant_id, quantity, length_per_unit = source

        if quantity < 1:
            raise ValueError("No rolls available to cut")

        # Reduce source stock quantity by 1
        cursor.execute("""
            UPDATE inventory_stock
            SET quantity = quantity - 1,
                updated_at = NOW()
            WHERE id = %s
        """, (from_stock_id,))

        # Check if we need to create a new CUT_ROLL stock entry or use existing
        cursor.execute("""
            SELECT id FROM inventory_stock
            WHERE batch_id = %s
              AND product_variant_id = %s
              AND stock_type = 'CUT_ROLL'
              AND parent_stock_id = %s
              AND deleted_at IS NULL
        """, (batch_id, product_variant_id, from_stock_id))

        existing_cut_stock = cursor.fetchone()

        if existing_cut_stock:
            cut_stock_id = existing_cut_stock[0]
            # NOTE: No manual quantity update needed - trigger handles it
        else:
            # Create new CUT_ROLL stock entry
            cut_stock_id = str(uuid.uuid4())
            # Initialize with 0 quantity, trigger will update it
            cursor.execute("""
                INSERT INTO inventory_stock (
                    id, batch_id, product_variant_id, status, stock_type,
                    quantity, parent_stock_id, notes
                ) VALUES (%s, %s, %s, 'IN_STOCK', 'CUT_ROLL', 0, %s, %s)
            """, (cut_stock_id, batch_id, product_variant_id, from_stock_id, notes))

        # Create transaction record first to get transaction_id
        cursor.execute("""
            INSERT INTO inventory_transactions (
                transaction_type, from_stock_id, from_quantity, from_length,
                to_stock_id, to_quantity, notes, created_by
            ) VALUES ('CUT_ROLL', %s, 1, %s, %s, %s, %s, %s)
            RETURNING id
        """, (from_stock_id, length_per_unit, cut_stock_id, len(cut_lengths), notes, created_by))

        transaction_id = cursor.fetchone()['id']

        # Create individual cut piece entries with IMMUTABLE created_by_transaction_id
        cut_piece_ids = []
        cut_piece_details = []

        for length in cut_lengths:
            piece_id = str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO hdpe_cut_pieces (
                    id, stock_id, length_meters, status, created_by_transaction_id, original_stock_id
                ) VALUES (%s, %s, %s, 'IN_STOCK', %s, %s)
            """, (piece_id, cut_stock_id, length, transaction_id, cut_stock_id))

            cut_piece_ids.append(piece_id)
            cut_piece_details.append({"length": length, "piece_id": piece_id})

        # Update transaction with cut_piece_details
        cursor.execute("""
            UPDATE inventory_transactions
            SET cut_piece_details = %s
            WHERE id = %s
        """, (json.dumps(cut_piece_details), transaction_id))

        return cut_stock_id, cut_piece_ids

    # ==========================================
    # BUNDLE OPERATIONS - SPRINKLER
    # ==========================================

    @staticmethod
    def split_sprinkler_bundle(
        cursor,
        from_stock_id: str,
        pieces_to_split: int,
        notes: Optional[str] = None,
        created_by: Optional[str] = None
    ) -> Tuple[str, str]:
        """
        Split pieces from a sprinkler bundle into spares

        Args:
            from_stock_id: Stock ID of bundles
            pieces_to_split: Number of pieces to split off (creates spare with this count)

        Returns:
            (spare_stock_id, spare_piece_id): New SPARE stock entry and spare piece ID
        """
        # Get the source stock details
        cursor.execute("""
            SELECT batch_id, product_variant_id, quantity, pieces_per_bundle, piece_length_meters
            FROM inventory_stock
            WHERE id = %s AND stock_type = 'BUNDLE' AND status = 'IN_STOCK' AND deleted_at IS NULL
        """, (from_stock_id,))

        source = cursor.fetchone()
        if not source:
            raise ValueError("Source bundle stock not found")

        batch_id, product_variant_id, quantity, pieces_per_bundle, piece_length_meters = source

        if quantity < 1:
            raise ValueError("No bundles available to split")

        if pieces_to_split >= pieces_per_bundle:
            raise ValueError(f"Cannot split {pieces_to_split} pieces from bundle of {pieces_per_bundle}")

        # Reduce source bundle quantity by 1
        cursor.execute("""
            UPDATE inventory_stock
            SET quantity = quantity - 1,
                updated_at = NOW()
            WHERE id = %s
        """, (from_stock_id,))

        # Check for existing spare stock
        cursor.execute("""
            SELECT id FROM inventory_stock
            WHERE batch_id = %s
              AND product_variant_id = %s
              AND stock_type = 'SPARE'
              AND piece_length_meters = %s
              AND deleted_at IS NULL
        """, (batch_id, product_variant_id, piece_length_meters))

        existing_spare = cursor.fetchone()

        if existing_spare:
            spare_stock_id = existing_spare[0]
            # NOTE: No manual quantity update needed - trigger handles it
        else:
            # Create new SPARE stock entry
            spare_stock_id = str(uuid.uuid4())
            # Initialize with 0 quantity, trigger will update it
            cursor.execute("""
                INSERT INTO inventory_stock (
                    id, batch_id, product_variant_id, status, stock_type,
                    quantity, piece_length_meters, parent_stock_id, notes
                ) VALUES (%s, %s, %s, 'IN_STOCK', 'SPARE', 0, %s, %s, %s)
            """, (spare_stock_id, batch_id, product_variant_id,
                  piece_length_meters, from_stock_id, notes))

        # Create transaction first to get transaction_id
        cursor.execute("""
            INSERT INTO inventory_transactions (
                transaction_type, from_stock_id, from_quantity,
                to_stock_id, to_quantity, notes, created_by
            ) VALUES ('SPLIT_BUNDLE', %s, 1, %s, 1, %s, %s)
            RETURNING id
        """, (from_stock_id, spare_stock_id, notes, created_by))

        transaction_id = cursor.fetchone()['id']

        # Create spare piece entry with transaction_id
        spare_piece_id = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO sprinkler_spare_pieces (
                id, stock_id, piece_count, status, transaction_id
            ) VALUES (%s, %s, %s, 'IN_STOCK', %s)
        """, (spare_piece_id, spare_stock_id, pieces_to_split, transaction_id))

        # Create remaining pieces as new bundle if needed
        remaining_pieces = pieces_per_bundle - pieces_to_split
        if remaining_pieces > 0:
            # Check if we have a stock entry for this bundle size
            cursor.execute("""
                SELECT id FROM inventory_stock
                WHERE batch_id = %s
                  AND product_variant_id = %s
                  AND stock_type = 'BUNDLE'
                  AND pieces_per_bundle = %s
                  AND deleted_at IS NULL
            """, (batch_id, product_variant_id, remaining_pieces))

            remaining_bundle = cursor.fetchone()

            if remaining_bundle:
                cursor.execute("""
                    UPDATE inventory_stock
                    SET quantity = quantity + 1,
                        updated_at = NOW()
                    WHERE id = %s
                """, (remaining_bundle[0],))
            else:
                cursor.execute("""
                    INSERT INTO inventory_stock (
                        batch_id, product_variant_id, status, stock_type,
                        quantity, pieces_per_bundle, piece_length_meters, parent_stock_id
                    ) VALUES (%s, %s, 'IN_STOCK', 'BUNDLE', 1, %s, %s, %s)
                """, (batch_id, product_variant_id, remaining_pieces,
                      piece_length_meters, from_stock_id))

        # Create transaction record
        cursor.execute("""
            INSERT INTO inventory_transactions (
                transaction_type, from_stock_id, from_quantity, from_pieces,
                to_stock_id, to_quantity, to_pieces, notes, created_by
            ) VALUES ('SPLIT_BUNDLE', %s, 1, %s, %s, 1, %s, %s, %s)
        """, (from_stock_id, pieces_per_bundle, spare_stock_id, pieces_to_split,
              notes, created_by))

        return spare_stock_id, spare_piece_id

    # ==========================================
    # DISPATCH OPERATIONS
    # ==========================================

    @staticmethod
    def dispatch_hdpe_full_roll(
        cursor,
        stock_id: str,
        quantity: int,
        dispatch_id: str,
        notes: Optional[str] = None
    ) -> bool:
        """Dispatch HDPE full rolls"""
        # Verify availability
        cursor.execute("""
            SELECT quantity FROM inventory_stock
            WHERE id = %s AND stock_type = 'FULL_ROLL' AND status = 'IN_STOCK'
        """, (stock_id,))

        result = cursor.fetchone()
        if not result or result[0] < quantity:
            raise ValueError("Insufficient quantity available")

        # Reduce quantity
        cursor.execute("""
            UPDATE inventory_stock
            SET quantity = quantity - %s,
                status = CASE WHEN quantity - %s = 0 THEN 'SOLD_OUT' ELSE status END,
                updated_at = NOW()
            WHERE id = %s
        """, (quantity, quantity, stock_id))

        # Create transaction
        cursor.execute("""
            INSERT INTO inventory_transactions (
                transaction_type, from_stock_id, from_quantity, dispatch_id, notes
            ) VALUES ('DISPATCH', %s, %s, %s, %s)
        """, (stock_id, quantity, dispatch_id, notes))

        return True

    @staticmethod
    def dispatch_hdpe_cut_piece(
        cursor,
        cut_piece_id: str,
        dispatch_id: str,
        notes: Optional[str] = None
    ) -> bool:
        """Dispatch a specific HDPE cut piece"""
        # Update cut piece status
        cursor.execute("""
            UPDATE hdpe_cut_pieces
            SET status = 'DISPATCHED',
                dispatch_id = %s,
                updated_at = NOW()
            WHERE id = %s AND status = 'IN_STOCK'
            RETURNING stock_id, length_meters
        """, (dispatch_id, cut_piece_id))

        result = cursor.fetchone()
        if not result:
            raise ValueError("Cut piece not found or already dispatched")

        stock_id, length = result

        # Update stock quantity if no more pieces available
        cursor.execute("""
            UPDATE inventory_stock
            SET quantity = (
                SELECT COUNT(*) FROM hdpe_cut_pieces
                WHERE stock_id = %s AND status = 'IN_STOCK'
            ),
            status = CASE
                WHEN (SELECT COUNT(*) FROM hdpe_cut_pieces WHERE stock_id = %s AND status = 'IN_STOCK') = 0
                THEN 'SOLD_OUT' ELSE status
            END,
            updated_at = NOW()
            WHERE id = %s
        """, (stock_id, stock_id, stock_id))

        # Create transaction
        cursor.execute("""
            INSERT INTO inventory_transactions (
                transaction_type, from_stock_id, from_quantity, from_length, dispatch_id, notes
            ) VALUES ('DISPATCH', %s, 1, %s, %s, %s)
        """, (stock_id, length, dispatch_id, notes))

        return True

    @staticmethod
    def dispatch_sprinkler_bundle(
        cursor,
        stock_id: str,
        quantity: int,
        dispatch_id: str,
        notes: Optional[str] = None
    ) -> bool:
        """Dispatch sprinkler bundles"""
        # Verify availability
        cursor.execute("""
            SELECT quantity, pieces_per_bundle FROM inventory_stock
            WHERE id = %s AND stock_type = 'BUNDLE' AND status = 'IN_STOCK'
        """, (stock_id,))

        result = cursor.fetchone()
        if not result or result[0] < quantity:
            raise ValueError("Insufficient bundles available")

        available_qty, pieces_per_bundle = result

        # Reduce quantity
        cursor.execute("""
            UPDATE inventory_stock
            SET quantity = quantity - %s,
                status = CASE WHEN quantity - %s = 0 THEN 'SOLD_OUT' ELSE status END,
                updated_at = NOW()
            WHERE id = %s
        """, (quantity, quantity, stock_id))

        # Create transaction
        total_pieces = quantity * pieces_per_bundle
        cursor.execute("""
            INSERT INTO inventory_transactions (
                transaction_type, from_stock_id, from_quantity, from_pieces, dispatch_id, notes
            ) VALUES ('DISPATCH', %s, %s, %s, %s, %s)
        """, (stock_id, quantity, total_pieces, dispatch_id, notes))

        return True

    @staticmethod
    def dispatch_sprinkler_spare(
        cursor,
        spare_piece_id: str,
        dispatch_id: str,
        notes: Optional[str] = None
    ) -> bool:
        """Dispatch a specific sprinkler spare piece group"""
        # Update spare piece status
        cursor.execute("""
            UPDATE sprinkler_spare_pieces
            SET status = 'DISPATCHED',
                dispatch_id = %s,
                updated_at = NOW()
            WHERE id = %s AND status = 'IN_STOCK'
            RETURNING stock_id, piece_count
        """, (dispatch_id, spare_piece_id))

        result = cursor.fetchone()
        if not result:
            raise ValueError("Spare piece not found or already dispatched")

        stock_id, piece_count = result

        # Update stock quantity
        cursor.execute("""
            UPDATE inventory_stock
            SET quantity = (
                SELECT COUNT(*) FROM sprinkler_spare_pieces
                WHERE stock_id = %s AND status = 'IN_STOCK'
            ),
            status = CASE
                WHEN (SELECT COUNT(*) FROM sprinkler_spare_pieces WHERE stock_id = %s AND status = 'IN_STOCK') = 0
                THEN 'SOLD_OUT' ELSE status
            END,
            updated_at = NOW()
            WHERE id = %s
        """, (stock_id, stock_id, stock_id))

        # Create transaction
        cursor.execute("""
            INSERT INTO inventory_transactions (
                transaction_type, from_stock_id, from_quantity, from_pieces, dispatch_id, notes
            ) VALUES ('DISPATCH', %s, 1, %s, %s, %s)
        """, (stock_id, piece_count, dispatch_id, notes))

        return True

    # ==========================================
    # QUERY HELPERS
    # ==========================================

    @staticmethod
    def get_available_hdpe_stock(cursor, product_variant_id: Optional[str] = None) -> List[Dict]:
        """Get all available HDPE stock with details"""
        query = """
            SELECT * FROM hdpe_stock_details
            WHERE status = 'IN_STOCK'
        """
        params = []

        if product_variant_id:
            query += " AND product_variant_id = %s"
            params.append(product_variant_id)

        query += " ORDER BY created_at DESC"

        cursor.execute(query, params)
        columns = [desc[0] for desc in cursor.description]

        results = []
        for row in cursor.fetchall():
            item = dict(zip(columns, row))
            item['product_category'] = 'HDPE'
            results.append(item)

        return results

    @staticmethod
    def get_available_sprinkler_stock(cursor, product_variant_id: Optional[str] = None) -> List[Dict]:
        """Get all available sprinkler stock with details"""
        query = """
            SELECT * FROM sprinkler_stock_details
            WHERE status = 'IN_STOCK'
        """
        params = []

        if product_variant_id:
            query += " AND product_variant_id = %s"
            params.append(product_variant_id)

        query += " ORDER BY created_at DESC"

        cursor.execute(query, params)
        columns = [desc[0] for desc in cursor.description]

        results = []
        for row in cursor.fetchall():
            item = dict(zip(columns, row))
            item['product_category'] = 'SPRINKLER'
            results.append(item)

        return results

    @staticmethod
    def get_cut_pieces_for_stock(cursor, stock_id: str) -> List[Dict]:
        """Get all cut pieces for a specific stock entry"""
        cursor.execute("""
            SELECT id, length_meters, status, dispatch_id, weight_grams, notes, created_at
            FROM hdpe_cut_pieces
            WHERE stock_id = %s AND status = 'IN_STOCK'
            ORDER BY length_meters DESC
        """, (stock_id,))

        columns = [desc[0] for desc in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]

    @staticmethod
    def get_spare_pieces_for_stock(cursor, stock_id: str) -> List[Dict]:
        """Get all spare pieces for a specific stock entry"""
        cursor.execute("""
            SELECT id, piece_count, status, dispatch_id, notes, created_at
            FROM sprinkler_spare_pieces
            WHERE stock_id = %s AND status = 'IN_STOCK'
            ORDER BY piece_count DESC
        """, (stock_id,))

        columns = [desc[0] for desc in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]

    @staticmethod
    def get_stock_history(cursor, stock_id: str) -> List[Dict]:
        """Get complete transaction history for a stock entry"""
        cursor.execute("""
            SELECT
                t.*,
                u.name as created_by_name
            FROM inventory_transactions t
            LEFT JOIN users u ON t.created_by = u.id
            WHERE t.from_stock_id = %s OR t.to_stock_id = %s
            ORDER BY t.created_at DESC
        """, (stock_id, stock_id))

        columns = [desc[0] for desc in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
