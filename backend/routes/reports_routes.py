from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from database import execute_query
from datetime import datetime, timedelta

reports_bp = Blueprint('reports', __name__, url_prefix='/api/reports')

@reports_bp.route('/top-selling-products', methods=['GET'])
@jwt_required()
def get_top_selling_products():
    """Get top selling products in date range"""
    days = int(request.args.get('days', 30))
    start_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')

    query = """
        SELECT
            pt.name as product_type,
            br.name as brand,
            pv.parameters,
            SUM(ABS(t.quantity_change)) as total_sold,
            COUNT(t.id) as sales_count
        FROM transactions t
        JOIN batches b ON t.batch_id = b.id
        JOIN product_variants pv ON b.product_variant_id = pv.id
        JOIN product_types pt ON pv.product_type_id = pt.id
        JOIN brands br ON pv.brand_id = br.id
        WHERE t.transaction_type = 'SALE'
        AND t.transaction_date >= %s
        AND t.deleted_at IS NULL
        GROUP BY pt.name, br.name, pv.parameters
        ORDER BY total_sold DESC
        LIMIT 10
    """

    result = execute_query(query, (start_date,))
    return jsonify(result), 200

@reports_bp.route('/location-inventory', methods=['GET'])
@jwt_required()
def get_location_inventory():
    """Get inventory summary by location"""
    query = """
        SELECT
            l.name as location,
            SUM(b.current_quantity) as total_quantity,
            COUNT(b.id) as batch_count
        FROM batches b
        JOIN locations l ON b.location_id = l.id
        WHERE b.deleted_at IS NULL
        AND b.current_quantity > 0
        GROUP BY l.name
        ORDER BY total_quantity DESC
    """

    result = execute_query(query)
    return jsonify(result), 200

@reports_bp.route('/customer-sales', methods=['GET'])
@jwt_required()
def get_customer_sales():
    """Get sales summary by customer"""
    days = int(request.args.get('days', 30))
    start_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')

    query = """
        SELECT
            c.name as customer_name,
            SUM(ABS(t.quantity_change)) as total_quantity,
            COUNT(t.id) as transaction_count,
            COALESCE(SUM(t.amount), 0) as total_amount
        FROM transactions t
        JOIN customers c ON t.customer_id = c.id
        WHERE t.transaction_type = 'SALE'
        AND t.transaction_date >= %s
        AND t.deleted_at IS NULL
        GROUP BY c.name
        ORDER BY total_quantity DESC
    """

    result = execute_query(query, (start_date,))
    return jsonify(result), 200

@reports_bp.route('/product-inventory', methods=['GET'])
@jwt_required()
def get_product_inventory():
    """Get inventory summary by product type"""
    query = """
        SELECT
            pt.name as product_type,
            br.name as brand,
            pv.parameters,
            SUM(b.current_quantity) as total_quantity,
            COUNT(b.id) as batch_count
        FROM batches b
        JOIN product_variants pv ON b.product_variant_id = pv.id
        JOIN product_types pt ON pv.product_type_id = pt.id
        JOIN brands br ON pv.brand_id = br.id
        WHERE b.deleted_at IS NULL
        AND b.current_quantity > 0
        GROUP BY pt.name, br.name, pv.parameters
        ORDER BY total_quantity DESC
    """

    result = execute_query(query)
    return jsonify(result), 200
