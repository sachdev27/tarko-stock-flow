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

        # Recent transactions (last 7 days)
        transactions_query = """
            SELECT
                COUNT(*) as total_transactions,
                SUM(CASE WHEN transaction_type = 'SALE' THEN 1 ELSE 0 END) as sales_count,
                SUM(CASE WHEN transaction_type = 'PRODUCTION' THEN 1 ELSE 0 END) as production_count
            FROM transactions
            WHERE created_at >= NOW() - INTERVAL '7 days'
            AND deleted_at IS NULL
        """
        transactions_result = execute_query(transactions_query)
        transactions_stats = transactions_result[0] if transactions_result else {
            'total_transactions': 0,
            'sales_count': 0,
            'production_count': 0
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

        # Recent activity (last 10 transactions)
        recent_activity_query = """
            SELECT
                t.id,
                t.transaction_type,
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
            WHERE t.deleted_at IS NULL
            ORDER BY t.created_at DESC
            LIMIT 10
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
        print(f"Dashboard stats error: {error_details}")
        return jsonify({'error': str(e)}), 500
