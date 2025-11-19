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

@reports_bp.route('/analytics/overview', methods=['GET'])
@jwt_required()
def get_analytics_overview():
    """Get comprehensive business analytics overview"""
    days = int(request.args.get('days', 30))
    start_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')

    # Top selling products with complete details
    top_products_query = """
        SELECT
            pt.name as product_type,
            br.name as brand,
            pv.parameters,
            SUM(ABS(t.quantity_change)) as total_sold,
            COUNT(DISTINCT t.id) as sales_count,
            COUNT(DISTINCT t.customer_id) as unique_customers,
            SUM(ABS(t.quantity_change) * b.weight_per_meter) as total_weight
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
    top_products = execute_query(top_products_query, (start_date,))

    # Top customers with order details
    top_customers_query = """
        SELECT
            c.name as customer_name,
            c.city,
            c.state,
            c.pincode,
            SUM(ABS(t.quantity_change)) as total_quantity,
            COUNT(DISTINCT t.id) as order_count,
            COUNT(DISTINCT pt.id) as product_types_count,
            STRING_AGG(DISTINCT pt.name, ', ') as products_ordered
        FROM transactions t
        JOIN customers c ON t.customer_id = c.id
        JOIN batches b ON t.batch_id = b.id
        JOIN product_variants pv ON b.product_variant_id = pv.id
        JOIN product_types pt ON pv.product_type_id = pt.id
        WHERE t.transaction_type = 'SALE'
        AND t.transaction_date >= %s
        AND t.deleted_at IS NULL
        GROUP BY c.id, c.name, c.city, c.state, c.pincode
        ORDER BY total_quantity DESC
        LIMIT 10
    """
    top_customers = execute_query(top_customers_query, (start_date,))

    # Regional analysis - products by region
    regional_analysis_query = """
        SELECT
            COALESCE(c.state, 'Unknown') as region,
            pt.name as product_type,
            br.name as brand,
            SUM(ABS(t.quantity_change)) as total_quantity,
            COUNT(DISTINCT c.id) as customer_count,
            COUNT(DISTINCT t.id) as order_count
        FROM transactions t
        JOIN customers c ON t.customer_id = c.id
        JOIN batches b ON t.batch_id = b.id
        JOIN product_variants pv ON b.product_variant_id = pv.id
        JOIN product_types pt ON pv.product_type_id = pt.id
        JOIN brands br ON pv.brand_id = br.id
        WHERE t.transaction_type = 'SALE'
        AND t.transaction_date >= %s
        AND t.deleted_at IS NULL
        GROUP BY c.state, pt.name, br.name
        ORDER BY region, total_quantity DESC
    """
    regional_analysis = execute_query(regional_analysis_query, (start_date,))

    # Customer product preferences
    customer_preferences_query = """
        SELECT
            c.name as customer_name,
            pt.name as preferred_product,
            br.name as preferred_brand,
            SUM(ABS(t.quantity_change)) as total_quantity,
            COUNT(t.id) as order_frequency
        FROM transactions t
        JOIN customers c ON t.customer_id = c.id
        JOIN batches b ON t.batch_id = b.id
        JOIN product_variants pv ON b.product_variant_id = pv.id
        JOIN product_types pt ON pv.product_type_id = pt.id
        JOIN brands br ON pv.brand_id = br.id
        WHERE t.transaction_type = 'SALE'
        AND t.transaction_date >= %s
        AND t.deleted_at IS NULL
        GROUP BY c.name, pt.name, br.name
        ORDER BY total_quantity DESC
        LIMIT 20
    """
    customer_preferences = execute_query(customer_preferences_query, (start_date,))

    # Sales trends - daily/weekly aggregation
    sales_trends_query = """
        SELECT
            DATE(t.transaction_date) as sale_date,
            COUNT(DISTINCT t.id) as order_count,
            SUM(ABS(t.quantity_change)) as total_quantity,
            COUNT(DISTINCT t.customer_id) as unique_customers
        FROM transactions t
        WHERE t.transaction_type = 'SALE'
        AND t.transaction_date >= %s
        AND t.deleted_at IS NULL
        GROUP BY DATE(t.transaction_date)
        ORDER BY sale_date DESC
    """
    sales_trends = execute_query(sales_trends_query, (start_date,))

    # Product performance metrics
    product_performance_query = """
        SELECT
            pt.name as product_type,
            COUNT(DISTINCT b.id) as batches_produced,
            COUNT(DISTINCT t.id) as times_sold,
            SUM(CASE WHEN t.transaction_type = 'PRODUCTION' THEN t.quantity_change ELSE 0 END) as total_produced,
            SUM(CASE WHEN t.transaction_type = 'SALE' THEN ABS(t.quantity_change) ELSE 0 END) as total_sold,
            ROUND(
                CAST(SUM(CASE WHEN t.transaction_type = 'SALE' THEN ABS(t.quantity_change) ELSE 0 END) AS DECIMAL) /
                NULLIF(SUM(CASE WHEN t.transaction_type = 'PRODUCTION' THEN t.quantity_change ELSE 0 END), 0) * 100,
                2
            ) as sales_percentage
        FROM transactions t
        JOIN batches b ON t.batch_id = b.id
        JOIN product_variants pv ON b.product_variant_id = pv.id
        JOIN product_types pt ON pv.product_type_id = pt.id
        WHERE t.transaction_date >= %s
        AND t.deleted_at IS NULL
        GROUP BY pt.name
        ORDER BY total_sold DESC
    """
    product_performance = execute_query(product_performance_query, (start_date,))

    # Summary statistics
    summary_stats_query = """
        SELECT
            COUNT(DISTINCT CASE WHEN t.transaction_type = 'SALE' THEN t.customer_id END) as total_customers,
            COUNT(DISTINCT CASE WHEN t.transaction_type = 'SALE' THEN t.id END) as total_orders,
            COUNT(DISTINCT pt.id) as products_sold_count,
            SUM(CASE WHEN t.transaction_type = 'SALE' THEN ABS(t.quantity_change) ELSE 0 END) as total_quantity_sold,
            SUM(CASE WHEN t.transaction_type = 'PRODUCTION' THEN t.quantity_change ELSE 0 END) as total_quantity_produced
        FROM transactions t
        JOIN batches b ON t.batch_id = b.id
        JOIN product_variants pv ON b.product_variant_id = pv.id
        JOIN product_types pt ON pv.product_type_id = pt.id
        WHERE t.transaction_date >= %s
        AND t.deleted_at IS NULL
    """
    summary_stats = execute_query(summary_stats_query, (start_date,))

    return jsonify({
        'summary': summary_stats[0] if summary_stats else {},
        'top_products': top_products,
        'top_customers': top_customers,
        'regional_analysis': regional_analysis,
        'customer_preferences': customer_preferences,
        'sales_trends': sales_trends,
        'product_performance': product_performance
    }), 200

@reports_bp.route('/analytics/customer-regions', methods=['GET'])
@jwt_required()
def get_customer_regions():
    """Get customer distribution and sales by region"""
    days = int(request.args.get('days', 30))
    start_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')

    query = """
        SELECT
            COALESCE(c.state, 'Unknown') as region,
            COALESCE(c.city, 'Unknown') as city,
            COUNT(DISTINCT c.id) as customer_count,
            COUNT(DISTINCT t.id) as order_count,
            SUM(ABS(t.quantity_change)) as total_quantity
        FROM customers c
        LEFT JOIN transactions t ON c.id = t.customer_id
            AND t.transaction_type = 'SALE'
            AND t.transaction_date >= %s
            AND t.deleted_at IS NULL
        WHERE c.deleted_at IS NULL
        GROUP BY c.state, c.city
        ORDER BY order_count DESC NULLS LAST
    """

    return jsonify(execute_query(query, (start_date,))), 200
