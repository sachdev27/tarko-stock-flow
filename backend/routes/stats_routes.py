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

        # Total inventory value (meters/pieces in stock)
        inventory_query = """
            SELECT
                pt.name as product_type,
                SUM(b.current_quantity) as total_quantity,
                COUNT(DISTINCT b.id) as batch_count
            FROM batches b
            JOIN product_variants pv ON b.product_variant_id = pv.id
            JOIN product_types pt ON pv.product_type_id = pt.id
            WHERE b.deleted_at IS NULL AND b.current_quantity > 0
            GROUP BY pt.name
            ORDER BY total_quantity DESC
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

        # Low stock alerts (batches with quantity < 100 for HDPE, < 50 pieces for Sprinkler)
        low_stock_query = """
            SELECT
                b.batch_code,
                b.current_quantity,
                pt.name as product_type,
                br.name as brand,
                pv.parameters
            FROM batches b
            JOIN product_variants pv ON b.product_variant_id = pv.id
            JOIN product_types pt ON pv.product_type_id = pt.id
            JOIN brands br ON pv.brand_id = br.id
            WHERE b.deleted_at IS NULL
            AND b.current_quantity > 0
            AND (
                (pt.name LIKE '%%HDPE%%' AND b.current_quantity < 100) OR
                (pt.name LIKE '%%Sprinkler%%' AND b.current_quantity < 50)
            )
            ORDER BY b.current_quantity ASC
            LIMIT 10
        """
        low_stock_items = execute_query(low_stock_query) or []

        # Recent activity (last 20 transactions from all sources)
        recent_activity_query = """
            SELECT * FROM (
                -- Production transactions
                SELECT
                    CONCAT('prod_', t.id) as id,
                    'PRODUCTION' as transaction_type,
                    t.quantity_change,
                    t.created_at,
                    COALESCE(u.full_name, u.username, 'Unknown') as user_name,
                    COALESCE(b.batch_code, 'N/A') as batch_code,
                    COALESCE(pt.name, 'Unknown') as product_type
                FROM transactions t
                LEFT JOIN users u ON t.created_by = u.id
                LEFT JOIN batches b ON t.batch_id = b.id
                LEFT JOIN product_variants pv ON b.product_variant_id = pv.id
                LEFT JOIN product_types pt ON pv.product_type_id = pt.id
                WHERE t.deleted_at IS NULL AND t.transaction_type = 'PRODUCTION'

                UNION ALL

                -- Dispatches
                SELECT
                    CONCAT('dispatch_', d.id) as id,
                    'DISPATCH' as transaction_type,
                    -(SELECT COALESCE(SUM(di.quantity), 0) FROM dispatch_items di WHERE di.dispatch_id = d.id) as quantity_change,
                    d.created_at,
                    COALESCE(u.full_name, u.username, 'Unknown') as user_name,
                    d.dispatch_number as batch_code,
                    CASE
                        WHEN COUNT(DISTINCT pv.product_type_id) > 1 THEN 'Mixed Products'
                        ELSE MAX(pt.name)
                    END as product_type
                FROM dispatches d
                LEFT JOIN dispatch_items di ON d.id = di.dispatch_id
                LEFT JOIN inventory_stock ist ON di.stock_id = ist.id
                LEFT JOIN batches b ON ist.batch_id = b.id
                LEFT JOIN product_variants pv ON di.product_variant_id = pv.id
                LEFT JOIN product_types pt ON pv.product_type_id = pt.id
                LEFT JOIN users u ON d.created_by = u.id
                WHERE d.deleted_at IS NULL
                GROUP BY d.id, d.dispatch_number, d.created_at, u.full_name, u.username

                UNION ALL

                -- Returns
                SELECT
                    CONCAT('return_', r.id) as id,
                    'RETURN' as transaction_type,
                    (SELECT COALESCE(SUM(ri.quantity), 0) FROM return_items ri WHERE ri.return_id = r.id) as quantity_change,
                    r.created_at,
                    COALESCE(u.full_name, u.username, 'Unknown') as user_name,
                    r.return_number as batch_code,
                    CASE
                        WHEN COUNT(DISTINCT pv.product_type_id) > 1 THEN 'Mixed Products'
                        ELSE MAX(pt.name)
                    END as product_type
                FROM returns r
                LEFT JOIN return_items ri ON r.id = ri.return_id
                LEFT JOIN product_variants pv ON ri.product_variant_id = pv.id
                LEFT JOIN product_types pt ON pv.product_type_id = pt.id
                LEFT JOIN users u ON r.created_by = u.id
                WHERE r.deleted_at IS NULL
                GROUP BY r.id, r.return_number, r.created_at, u.full_name, u.username

                UNION ALL

                -- Scraps
                SELECT
                    CONCAT('scrap_', s.id) as id,
                    'SCRAP' as transaction_type,
                    -COALESCE(s.total_quantity, 0) as quantity_change,
                    s.created_at,
                    COALESCE(u.full_name, u.username, 'Unknown') as user_name,
                    s.scrap_number as batch_code,
                    CASE
                        WHEN COUNT(DISTINCT pv.product_type_id) > 1 THEN 'Mixed Products'
                        ELSE MAX(pt.name)
                    END as product_type
                FROM scraps s
                LEFT JOIN scrap_items si ON s.id = si.scrap_id
                LEFT JOIN product_variants pv ON si.product_variant_id = pv.id
                LEFT JOIN product_types pt ON pv.product_type_id = pt.id
                LEFT JOIN users u ON s.created_by = u.id
                WHERE s.deleted_at IS NULL
                GROUP BY s.id, s.scrap_number, s.created_at, s.total_quantity, u.full_name, u.username

                UNION ALL

                -- Inventory operations
                SELECT
                    CONCAT('inv_', it.id) as id,
                    it.transaction_type::text as transaction_type,
                    COALESCE(it.to_quantity, 0) - COALESCE(it.from_quantity, 0) as quantity_change,
                    it.created_at,
                    COALESCE(u.full_name, u.username, 'Unknown') as user_name,
                    COALESCE(b.batch_code, 'N/A') as batch_code,
                    COALESCE(pt.name, 'Unknown') as product_type
                FROM inventory_transactions it
                LEFT JOIN inventory_stock ist ON COALESCE(it.to_stock_id, it.from_stock_id) = ist.id
                LEFT JOIN batches b ON ist.batch_id = b.id
                LEFT JOIN product_variants pv ON b.product_variant_id = pv.id
                LEFT JOIN product_types pt ON pv.product_type_id = pt.id
                LEFT JOIN users u ON it.created_by = u.id
                WHERE it.reverted_at IS NULL
            ) combined_activity
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
