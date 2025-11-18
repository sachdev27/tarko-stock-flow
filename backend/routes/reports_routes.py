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
            pt.roll_configuration,
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
        GROUP BY pt.name, br.name, pv.parameters, pt.roll_configuration
        ORDER BY total_sold DESC
        LIMIT 10
    """

    result = execute_query(query, (start_date,))
    return jsonify(result), 200

@reports_bp.route('/location-inventory', methods=['GET'])
@jwt_required()
def get_location_inventory():
    """Get inventory summary by location with optional product filtering"""
    brand = request.args.get('brand')
    product_type = request.args.get('product_type')

    query = """
        SELECT
            l.name as location,
            SUM(b.current_quantity) as total_quantity,
            COUNT(b.id) as batch_count
        FROM batches b
        JOIN locations l ON b.location_id = l.id
        JOIN product_variants pv ON b.product_variant_id = pv.id
        JOIN product_types pt ON pv.product_type_id = pt.id
        JOIN brands br ON pv.brand_id = br.id
        WHERE b.deleted_at IS NULL
        AND b.current_quantity > 0
    """

    params = []
    if brand and product_type:
        query += " AND br.name = %s AND pt.name = %s"
        params.extend([brand, product_type])

    query += """
        GROUP BY l.name
        ORDER BY total_quantity DESC
    """

    result = execute_query(query, params if params else None)
    return jsonify(result), 200

@reports_bp.route('/customer-sales', methods=['GET'])
@jwt_required()
def get_customer_sales():
    """Get sales summary by customer with optional product filtering"""
    days = int(request.args.get('days', 30))
    brand = request.args.get('brand')
    product_type = request.args.get('product_type')
    start_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')

    query = """
        SELECT
            c.name as customer_name,
            SUM(ABS(t.quantity_change)) as total_quantity,
            COUNT(t.id) as transaction_count
        FROM transactions t
        JOIN customers c ON t.customer_id = c.id
        JOIN batches b ON t.batch_id = b.id
        JOIN product_variants pv ON b.product_variant_id = pv.id
        JOIN product_types pt ON pv.product_type_id = pt.id
        JOIN brands br ON pv.brand_id = br.id
        WHERE t.transaction_type = 'SALE'
        AND t.transaction_date >= %s
        AND t.deleted_at IS NULL
    """

    params = [start_date]
    if brand and product_type:
        query += " AND br.name = %s AND pt.name = %s"
        params.extend([brand, product_type])

    query += """
        GROUP BY c.name
        ORDER BY total_quantity DESC
    """

    result = execute_query(query, params)
    return jsonify(result), 200

@reports_bp.route('/product-inventory', methods=['GET'])
@jwt_required()
def get_product_inventory():
    """Get inventory summary by product type - includes roll configuration for proper unit display"""
    query = """
        SELECT
            pt.name as product_type,
            br.name as brand,
            pv.parameters,
            pt.roll_configuration,
            pv.id as product_variant_id
        FROM product_variants pv
        JOIN product_types pt ON pv.product_type_id = pt.id
        JOIN brands br ON pv.brand_id = br.id
        WHERE pv.deleted_at IS NULL
        ORDER BY pt.name, br.name
    """

    products = execute_query(query)

    # Calculate quantities based on product type
    for product in products:
        roll_config = product.get('roll_configuration', {})
        is_bundle = roll_config.get('type') == 'bundles'
        is_quantity_based = roll_config.get('quantity_based', False)

        if is_bundle and is_quantity_based:
            # For quantity-based products (sprinkler pipes), count pieces from bundles and spares
            quantity_query = """
                SELECT b.id, r.roll_type, r.bundle_size
                FROM batches b
                JOIN rolls r ON r.batch_id = b.id
                WHERE b.product_variant_id = %s
                AND b.deleted_at IS NULL
                AND r.deleted_at IS NULL
                AND b.current_quantity > 0
                AND (r.roll_type LIKE 'bundle_%%' OR r.roll_type = 'spare')
            """
            rolls = execute_query(quantity_query, (product['product_variant_id'],))

            total_pieces = 0
            for roll in rolls:
                if roll['roll_type'] and roll['roll_type'].startswith('bundle_'):
                    bundle_size = roll.get('bundle_size') or int(roll['roll_type'].split('_')[1] if '_' in roll['roll_type'] else 0)
                    total_pieces += bundle_size
                elif roll['roll_type'] == 'spare':
                    spare_size = roll.get('bundle_size') or 1
                    total_pieces += spare_size

            product['total_quantity'] = total_pieces
        else:
            # For length-based products, use current_quantity (meters)
            quantity_query = """
                SELECT SUM(b.current_quantity) as total_quantity
                FROM batches b
                WHERE b.product_variant_id = %s
                AND b.deleted_at IS NULL
                AND b.current_quantity > 0
            """
            result = execute_query(quantity_query, (product['product_variant_id'],))
            product['total_quantity'] = float(result[0]['total_quantity'] or 0) if result and result[0]['total_quantity'] else 0

        # Get batch count
        batch_count_query = """
            SELECT COUNT(b.id) as batch_count
            FROM batches b
            WHERE b.product_variant_id = %s
            AND b.deleted_at IS NULL
            AND b.current_quantity > 0
        """
        batch_result = execute_query(batch_count_query, (product['product_variant_id'],))
        product['batch_count'] = batch_result[0]['batch_count'] if batch_result else 0

    # Filter out products with zero quantity
    products = [p for p in products if p.get('total_quantity', 0) > 0]

    return jsonify(products), 200
