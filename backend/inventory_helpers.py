"""
Inventory Models - Product-Specific Helpers

This module provides helper functions and classes for working with the new
product-specific inventory structure (inventory_items, hdpe_rolls, sprinkler_bundles).
"""

from typing import Dict, Any, Optional, List, Tuple
import json


class InventoryHelper:
    """Helper class for inventory operations across different product types"""

    @staticmethod
    def get_product_category(product_type_name: str) -> str:
        """Determine product category from product type name"""
        product_type_lower = product_type_name.lower()
        if 'hdpe' in product_type_lower or 'pipe' in product_type_lower:
            return 'HDPE'
        elif 'sprinkler' in product_type_lower:
            return 'SPRINKLER'
        return 'UNKNOWN'

    @staticmethod
    def create_hdpe_roll(
        cursor,
        batch_id: str,
        product_variant_id: str,
        length_meters: float,
        is_cut_roll: bool = False,
        parent_roll_id: Optional[str] = None,
        weight_grams: Optional[float] = None,
        notes: Optional[str] = None
    ) -> str:
        """
        Create a new HDPE roll
        Returns the ID of the created roll
        """
        # Create base inventory item
        cursor.execute("""
            INSERT INTO inventory_items (batch_id, product_variant_id, status)
            VALUES (%s, %s, 'AVAILABLE')
            RETURNING id
        """, (batch_id, product_variant_id))

        item_id = cursor.fetchone()['id']

        # Create HDPE-specific record
        cursor.execute("""
            INSERT INTO hdpe_rolls (
                id, length_meters, initial_length_meters,
                is_cut_roll, parent_roll_id, weight_grams, notes
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            item_id,
            length_meters,
            length_meters,  # initial_length_meters
            is_cut_roll,
            parent_roll_id,
            weight_grams,
            notes
        ))

        return item_id

    @staticmethod
    def create_sprinkler_bundle(
        cursor,
        batch_id: str,
        product_variant_id: str,
        bundle_type: str,  # 'bundle' or 'spare'
        piece_count: int,
        piece_length_meters: float,
        bundle_size: Optional[int] = None,
        notes: Optional[str] = None
    ) -> str:
        """
        Create a new sprinkler bundle or spare
        Returns the ID of the created bundle
        """
        # Validate bundle_type and bundle_size
        if bundle_type == 'bundle' and bundle_size is None:
            raise ValueError("bundle_size is required for bundle type")
        if bundle_type == 'spare' and bundle_size is not None:
            raise ValueError("bundle_size must be NULL for spare type")

        # Create base inventory item
        cursor.execute("""
            INSERT INTO inventory_items (batch_id, product_variant_id, status)
            VALUES (%s, %s, 'AVAILABLE')
            RETURNING id
        """, (batch_id, product_variant_id))

        item_id = cursor.fetchone()['id']

        # Create sprinkler-specific record
        cursor.execute("""
            INSERT INTO sprinkler_bundles (
                id, bundle_type, bundle_size, piece_count,
                piece_length_meters, notes
            )
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            item_id,
            bundle_type,
            bundle_size,
            piece_count,
            piece_length_meters,
            notes
        ))

        return item_id

    @staticmethod
    def get_hdpe_roll(cursor, roll_id: str) -> Optional[Dict[str, Any]]:
        """Get HDPE roll details"""
        cursor.execute("""
            SELECT
                i.id,
                i.batch_id,
                i.product_variant_id,
                i.status,
                i.created_at,
                i.updated_at,
                h.length_meters,
                h.initial_length_meters,
                h.is_cut_roll,
                h.parent_roll_id,
                h.weight_grams,
                h.notes,
                b.batch_code,
                b.batch_no,
                br.name as brand_name,
                pv.parameters
            FROM inventory_items i
            JOIN hdpe_rolls h ON i.id = h.id
            JOIN batches b ON i.batch_id = b.id
            JOIN product_variants pv ON i.product_variant_id = pv.id
            JOIN brands br ON pv.brand_id = br.id
            WHERE i.id = %s AND i.deleted_at IS NULL
        """, (roll_id,))

        return cursor.fetchone()

    @staticmethod
    def get_sprinkler_bundle(cursor, bundle_id: str) -> Optional[Dict[str, Any]]:
        """Get sprinkler bundle details"""
        cursor.execute("""
            SELECT
                i.id,
                i.batch_id,
                i.product_variant_id,
                i.status,
                i.created_at,
                i.updated_at,
                s.bundle_type,
                s.bundle_size,
                s.piece_count,
                s.piece_length_meters,
                s.total_length_meters,
                s.notes,
                b.batch_code,
                b.batch_no,
                br.name as brand_name,
                pv.parameters
            FROM inventory_items i
            JOIN sprinkler_bundles s ON i.id = s.id
            JOIN batches b ON i.batch_id = b.id
            JOIN product_variants pv ON i.product_variant_id = pv.id
            JOIN brands br ON pv.brand_id = br.id
            WHERE i.id = %s AND i.deleted_at IS NULL
        """, (bundle_id,))

        return cursor.fetchone()

    @staticmethod
    def update_hdpe_roll_length(
        cursor,
        roll_id: str,
        new_length: float
    ) -> None:
        """Update HDPE roll length and status"""
        status = 'SOLD_OUT' if new_length <= 0 else ('PARTIAL' if new_length < 100 else 'AVAILABLE')

        cursor.execute("""
            UPDATE hdpe_rolls
            SET length_meters = %s
            WHERE id = %s
        """, (new_length, roll_id))

        cursor.execute("""
            UPDATE inventory_items
            SET status = %s, updated_at = NOW()
            WHERE id = %s
        """, (status, roll_id))

    @staticmethod
    def update_sprinkler_bundle_pieces(
        cursor,
        bundle_id: str,
        pieces_removed: int
    ) -> None:
        """
        Update sprinkler bundle piece count after dispatch
        Note: In most cases, bundles are dispatched whole, so this would mark as SOLD_OUT
        """
        cursor.execute("""
            SELECT piece_count FROM sprinkler_bundles WHERE id = %s
        """, (bundle_id,))

        result = cursor.fetchone()
        if not result:
            raise ValueError(f"Bundle {bundle_id} not found")

        current_pieces = result['piece_count']
        new_piece_count = current_pieces - pieces_removed

        if new_piece_count < 0:
            raise ValueError(f"Cannot remove {pieces_removed} pieces from bundle with {current_pieces} pieces")

        status = 'SOLD_OUT' if new_piece_count == 0 else 'PARTIAL'

        cursor.execute("""
            UPDATE sprinkler_bundles
            SET piece_count = %s
            WHERE id = %s
        """, (new_piece_count, bundle_id))

        cursor.execute("""
            UPDATE inventory_items
            SET status = %s, updated_at = NOW()
            WHERE id = %s
        """, (status, bundle_id))

    @staticmethod
    def search_available_hdpe(
        cursor,
        product_type_id: Optional[str] = None,
        brand_id: Optional[str] = None,
        parameters: Optional[Dict[str, Any]] = None,
        min_length: Optional[float] = None,
        include_cut_rolls: bool = True
    ) -> List[Dict[str, Any]]:
        """Search available HDPE rolls with filters"""

        query = """
            SELECT
                i.id,
                i.batch_id,
                i.status,
                h.length_meters,
                h.initial_length_meters,
                h.is_cut_roll,
                h.parent_roll_id,
                b.batch_code,
                b.batch_no,
                br.name as brand_name,
                pt.name as product_type_name,
                pv.parameters
            FROM inventory_items i
            JOIN hdpe_rolls h ON i.id = h.id
            JOIN batches b ON i.batch_id = b.id
            JOIN product_variants pv ON i.product_variant_id = pv.id
            JOIN product_types pt ON pv.product_type_id = pt.id
            JOIN brands br ON pv.brand_id = br.id
            WHERE i.deleted_at IS NULL
                AND b.deleted_at IS NULL
                AND i.status IN ('AVAILABLE', 'PARTIAL')
                AND h.length_meters > 0
        """

        params = []

        if product_type_id:
            query += " AND pv.product_type_id = %s"
            params.append(product_type_id)

        if brand_id:
            query += " AND pv.brand_id = %s"
            params.append(brand_id)

        if parameters:
            query += " AND pv.parameters @> %s::jsonb"
            params.append(json.dumps(parameters))

        if min_length:
            query += " AND h.length_meters >= %s"
            params.append(min_length)

        if not include_cut_rolls:
            query += " AND h.is_cut_roll = FALSE"

        query += " ORDER BY b.batch_code, h.length_meters DESC"

        cursor.execute(query, params)
        return cursor.fetchall()

    @staticmethod
    def search_available_sprinkler(
        cursor,
        product_type_id: Optional[str] = None,
        brand_id: Optional[str] = None,
        parameters: Optional[Dict[str, Any]] = None,
        bundle_type: Optional[str] = None,  # 'bundle' or 'spare'
        bundle_size: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Search available sprinkler bundles/spares with filters"""

        query = """
            SELECT
                i.id,
                i.batch_id,
                i.status,
                s.bundle_type,
                s.bundle_size,
                s.piece_count,
                s.piece_length_meters,
                s.total_length_meters,
                b.batch_code,
                b.batch_no,
                br.name as brand_name,
                pt.name as product_type_name,
                pv.parameters
            FROM inventory_items i
            JOIN sprinkler_bundles s ON i.id = s.id
            JOIN batches b ON i.batch_id = b.id
            JOIN product_variants pv ON i.product_variant_id = pv.id
            JOIN product_types pt ON pv.product_type_id = pt.id
            JOIN brands br ON pv.brand_id = br.id
            WHERE i.deleted_at IS NULL
                AND b.deleted_at IS NULL
                AND i.status = 'AVAILABLE'
                AND s.piece_count > 0
        """

        params = []

        if product_type_id:
            query += " AND pv.product_type_id = %s"
            params.append(product_type_id)

        if brand_id:
            query += " AND pv.brand_id = %s"
            params.append(brand_id)

        if parameters:
            query += " AND pv.parameters @> %s::jsonb"
            params.append(json.dumps(parameters))

        if bundle_type:
            query += " AND s.bundle_type = %s"
            params.append(bundle_type)

        if bundle_size:
            query += " AND s.bundle_size = %s"
            params.append(bundle_size)

        query += " ORDER BY b.batch_code, s.bundle_size DESC NULLS LAST"

        cursor.execute(query, params)
        return cursor.fetchall()


# Import for JSON handling (moved to top)
