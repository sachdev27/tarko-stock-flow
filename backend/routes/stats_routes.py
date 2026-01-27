from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from database import execute_query

stats_bp = Blueprint('stats', __name__, url_prefix='/api/stats')

@stats_bp.route('/dashboard', methods=['GET'])
@jwt_required()
def get_dashboard_stats():
    """Get comprehensive dashboard statistics"""
    try:
        # Total batches
        total_query = """
            SELECT COUNT(*) as count
            FROM batches
            WHERE deleted_at IS NULL
        """
        total_result = execute_query(total_query)
        total_batches = total_result[0]['count'] if total_result else 0

        # Active batches (with stock)
        active_query = """
            SELECT COUNT(*) as count
            FROM batches
            WHERE deleted_at IS NULL
            AND current_quantity > 0
        """
        active_result = execute_query(active_query)
        active_batches = active_result[0]['count'] if active_result else 0

        # Total inventory value - show ROLLS not just meters
        inventory_query = """
            SELECT
                pt.name as product_type,
                SUM(b.current_quantity) as total_meters,
                COUNT(DISTINCT b.id) as batch_count,
                SUM(CASE WHEN ist.stock_type = 'FULL_ROLL' THEN ist.quantity ELSE 0 END) as full_roll_count,
                SUM(CASE WHEN ist.stock_type = 'CUT_ROLL' THEN ist.quantity ELSE 0 END) as cut_roll_count,
                SUM(ist.quantity) as total_rolls
            FROM batches b
            JOIN product_variants pv ON b.product_variant_id = pv.id
            JOIN product_types pt ON pv.product_type_id = pt.id
            LEFT JOIN inventory_stock ist ON b.id = ist.batch_id AND ist.deleted_at IS NULL
            WHERE b.deleted_at IS NULL AND b.current_quantity > 0
            GROUP BY pt.name
            ORDER BY total_meters DESC
        """
        inventory_by_type = execute_query(inventory_query)

        # Recent transactions (last 7 days) - including all transaction types
        transactions_query = """
            SELECT
                COUNT(*) as total_transactions,
                SUM(CASE WHEN transaction_type = 'PRODUCTION' THEN 1 ELSE 0 END) as production_count,
                SUM(CASE WHEN transaction_type IN ('SALE', 'DISPATCH') THEN 1 ELSE 0 END) as sales_count,
                SUM(CASE WHEN transaction_type = 'RETURN' THEN 1 ELSE 0 END) as return_count,
                SUM(CASE WHEN transaction_type = 'SCRAP' THEN 1 ELSE 0 END) as scrap_count,
                SUM(CASE WHEN transaction_type IN ('CUT_ROLL', 'SPLIT_BUNDLE', 'COMBINE_BUNDLE') THEN 1 ELSE 0 END) as inventory_ops_count
            FROM (
                -- Old transactions table
                SELECT transaction_type::text as transaction_type, created_at FROM transactions WHERE deleted_at IS NULL
                UNION ALL
                -- Dispatches (use text literal, not enum)
                SELECT 'DISPATCH'::text as transaction_type, created_at FROM dispatches WHERE deleted_at IS NULL
                UNION ALL
                -- Returns (use text literal, not enum)
                SELECT 'RETURN'::text as transaction_type, created_at FROM returns WHERE deleted_at IS NULL
                UNION ALL
                -- Scraps (use text literal, not enum)
                SELECT 'SCRAP'::text as transaction_type, created_at FROM scraps WHERE deleted_at IS NULL
                UNION ALL
                -- Inventory operations (uses reverted_at, not deleted_at)
                SELECT transaction_type::text as transaction_type, created_at FROM inventory_transactions WHERE reverted_at IS NULL
            ) all_transactions
            WHERE created_at >= NOW() - INTERVAL '7 days'
        """
        transactions_result = execute_query(transactions_query)
        transactions_stats = transactions_result[0] if transactions_result else {
            'total_transactions': 0,
            'production_count': 0,
            'sales_count': 0,
            'return_count': 0,
            'scrap_count': 0,
            'inventory_ops_count': 0
        }

        # Low stock alerts - query by inventory_stock (rolls) not batches (meters)
        # Get configurable thresholds from system_settings (default: 5 rolls for HDPE, 20 pieces for Sprinkler)
        threshold_query = """
            SELECT setting_value FROM system_settings WHERE setting_key = 'low_stock_threshold_hdpe'
        """
        threshold_result = execute_query(threshold_query)
        hdpe_threshold = int(threshold_result[0]['setting_value']) if threshold_result else 5

        sprinkler_threshold_query = """
            SELECT setting_value FROM system_settings WHERE setting_key = 'low_stock_threshold_sprinkler'
        """
        sprinkler_result = execute_query(sprinkler_threshold_query)
        sprinkler_threshold = int(sprinkler_result[0]['setting_value']) if sprinkler_result else 20

        low_stock_query = """
            -- Full Rolls
            SELECT
                b.batch_code,
                ist.stock_type,
                ist.quantity as stock_quantity,
                ist.length_per_unit as roll_length,
                SUM(ist.quantity) OVER (PARTITION BY b.id) as batch_total_rolls,
                pt.name as product_type,
                br.name as brand,
                pv.parameters,
                ist.id as stock_id
            FROM inventory_stock ist
            JOIN batches b ON ist.batch_id = b.id
            JOIN product_variants pv ON b.product_variant_id = pv.id
            JOIN product_types pt ON pv.product_type_id = pt.id
            JOIN brands br ON pv.brand_id = br.id
            WHERE ist.deleted_at IS NULL AND b.deleted_at IS NULL
            AND ist.quantity > 0
            AND ist.stock_type = 'FULL_ROLL'

            UNION ALL

            -- Cut Pieces (Individual items)
            SELECT
                b.batch_code,
                'CUT_ROLL' as stock_type,
                1 as stock_quantity, -- Each piece is 1 unit
                hcp.length_meters as roll_length,
                NULL as batch_total_rolls,
                pt.name as product_type,
                br.name as brand,
                pv.parameters,
                ist.id as stock_id
            FROM hdpe_cut_pieces hcp
            JOIN inventory_stock ist ON hcp.stock_id = ist.id
            JOIN batches b ON ist.batch_id = b.id
            JOIN product_variants pv ON b.product_variant_id = pv.id
            JOIN product_types pt ON pv.product_type_id = pt.id
            JOIN brands br ON pv.brand_id = br.id
            WHERE hcp.deleted_at IS NULL AND hcp.status = 'IN_STOCK'
            AND ist.deleted_at IS NULL AND b.deleted_at IS NULL
            AND ist.stock_type = 'CUT_ROLL'

            ORDER BY stock_quantity ASC, roll_length ASC
        """
        low_stock_items = execute_query(low_stock_query) or []


        # Recent activity - get balanced mix from all sources (top 5 from each type)
        recent_activity_query = """
            WITH ranked_activity AS (
                -- Production transactions
                SELECT
                    CONCAT('prod_', t.id) as id,
                    'PRODUCTION' as transaction_type,
                    t.quantity_change,
                    t.created_at,
                    COALESCE(u.full_name, u.username, 'Unknown') as user_name,
                    COALESCE(b.batch_code, 'N/A') as batch_code,
                    COALESCE(pt.name, 'Unknown') as product_type,
                    pv.parameters,
                    NULL as customer_name,
                    NULL as total_meters,
                    ROW_NUMBER() OVER (ORDER BY t.created_at DESC) as rn
                FROM transactions t
                LEFT JOIN users u ON t.created_by = u.id
                LEFT JOIN batches b ON t.batch_id = b.id
                LEFT JOIN product_variants pv ON b.product_variant_id = pv.id
                LEFT JOIN product_types pt ON pv.product_type_id = pt.id
                WHERE t.deleted_at IS NULL AND t.transaction_type = 'PRODUCTION'

                UNION ALL

                -- Dispatches with customer and meters
                SELECT
                    CONCAT('dispatch_', d.id) as id,
                    'DISPATCH' as transaction_type,
                    -COALESCE(agg.total_qty, 0) as quantity_change,
                    d.created_at,
                    COALESCE(u.full_name, u.username, 'Unknown') as user_name,
                    d.dispatch_number as batch_code,
                    COALESCE(agg.product_type, 'HDPE Pipe') as product_type,
                    NULL::jsonb as parameters,
                    c.name as customer_name,
                    agg.total_meters,
                    ROW_NUMBER() OVER (ORDER BY d.created_at DESC) as rn
                FROM dispatches d
                LEFT JOIN users u ON d.created_by = u.id
                LEFT JOIN customers c ON d.customer_id = c.id
                LEFT JOIN LATERAL (
                    SELECT
                        SUM(di.quantity) as total_qty,
                        SUM(di.quantity * COALESCE(ist.length_per_unit, 0)) as total_meters,
                        MAX(pt.name) as product_type
                    FROM dispatch_items di
                    LEFT JOIN inventory_stock ist ON di.stock_id = ist.id
                    LEFT JOIN product_variants pv ON di.product_variant_id = pv.id
                    LEFT JOIN product_types pt ON pv.product_type_id = pt.id
                    WHERE di.dispatch_id = d.id
                ) agg ON true
                WHERE d.deleted_at IS NULL

                UNION ALL

                -- Returns
                SELECT
                    CONCAT('return_', r.id) as id,
                    'RETURN' as transaction_type,
                    COALESCE(agg.total_qty, 0) as quantity_change,
                    r.created_at,
                    COALESCE(u.full_name, u.username, 'Unknown') as user_name,
                    r.return_number as batch_code,
                    COALESCE(agg.product_type, 'Unknown') as product_type,
                    NULL::jsonb as parameters,
                    c.name as customer_name,
                    NULL as total_meters,
                    ROW_NUMBER() OVER (ORDER BY r.created_at DESC) as rn
                FROM returns r
                LEFT JOIN users u ON r.created_by = u.id
                LEFT JOIN customers c ON r.customer_id = c.id
                LEFT JOIN LATERAL (
                    SELECT SUM(ri.quantity) as total_qty, MAX(pt.name) as product_type
                    FROM return_items ri
                    LEFT JOIN product_variants pv ON ri.product_variant_id = pv.id
                    LEFT JOIN product_types pt ON pv.product_type_id = pt.id
                    WHERE ri.return_id = r.id
                ) agg ON true
                WHERE r.deleted_at IS NULL

                UNION ALL

                -- Scraps
                SELECT
                    CONCAT('scrap_', s.id) as id,
                    'SCRAP' as transaction_type,
                    -COALESCE(s.total_quantity, 0) as quantity_change,
                    s.created_at,
                    COALESCE(u.full_name, u.username, 'Unknown') as user_name,
                    s.scrap_number as batch_code,
                    'Scrap' as product_type,
                    NULL::jsonb as parameters,
                    NULL as customer_name,
                    NULL as total_meters,
                    ROW_NUMBER() OVER (ORDER BY s.created_at DESC) as rn
                FROM scraps s
                LEFT JOIN users u ON s.created_by = u.id
                WHERE s.deleted_at IS NULL

                UNION ALL

                -- Inventory operations (CUT_ROLL, etc.)
                SELECT
                    CONCAT('inv_', it.id) as id,
                    it.transaction_type::text as transaction_type,
                    COALESCE(it.to_length, 0) - COALESCE(it.from_length, 0) as quantity_change,
                    it.created_at,
                    COALESCE(u.full_name, u.username, 'Unknown') as user_name,
                    COALESCE(b.batch_code, 'N/A') as batch_code,
                    COALESCE(pt.name, 'Unknown') as product_type,
                    pv.parameters,
                    NULL as customer_name,
                    NULL as total_meters,
                    ROW_NUMBER() OVER (PARTITION BY it.transaction_type ORDER BY it.created_at DESC) as rn
                FROM inventory_transactions it
                LEFT JOIN inventory_stock ist ON COALESCE(it.to_stock_id, it.from_stock_id) = ist.id
                LEFT JOIN batches b ON ist.batch_id = b.id
                LEFT JOIN product_variants pv ON b.product_variant_id = pv.id
                LEFT JOIN product_types pt ON pv.product_type_id = pt.id
                LEFT JOIN users u ON it.created_by = u.id
                WHERE it.reverted_at IS NULL
            )
            SELECT id, transaction_type, quantity_change, created_at, user_name,
                   batch_code, product_type, parameters, customer_name, total_meters
            FROM ranked_activity
            WHERE rn <= 5 AND quantity_change != 0
            ORDER BY created_at DESC
            LIMIT 20
        """
        recent_activity = execute_query(recent_activity_query) or []

        # Product type distribution
        product_type_query = """
            SELECT
                pt.name as product_type,
                COUNT(DISTINCT b.id) as batch_count,
                SUM(b.current_quantity) as total_quantity
            FROM batches b
            JOIN product_variants pv ON b.product_variant_id = pv.id
            JOIN product_types pt ON pv.product_type_id = pt.id
            WHERE b.deleted_at IS NULL
            GROUP BY pt.name
        """
        product_distribution = execute_query(product_type_query)

        return jsonify({
            'totalBatches': total_batches,
            'activeBatches': active_batches,
            'inventoryByType': inventory_by_type or [],
            'transactionsStats': transactions_stats,
            'lowStockItems': low_stock_items or [],
            'recentActivity': recent_activity,
            'productDistribution': product_distribution or []
        }), 200

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        return jsonify({'error': str(e)}), 500
