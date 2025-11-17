from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import execute_query, execute_insert
from auth import jwt_required_with_role

inventory_bp = Blueprint('inventory', __name__, url_prefix='/api/inventory')

@inventory_bp.route('/batches', methods=['GET'])
@jwt_required()
def get_batches():
    """Get all batches with inventory"""
    location_id = request.args.get('location_id')

    query = """
        SELECT
            b.id, b.batch_code, b.batch_no, b.current_quantity,
            b.qc_status, b.production_date,
            l.name as location_name,
            pv.parameters,
            pt.name as product_type_name,
            br.name as brand_name
        FROM batches b
        JOIN locations l ON b.location_id = l.id
        JOIN product_variants pv ON b.product_variant_id = pv.id
        JOIN product_types pt ON pv.product_type_id = pt.id
        JOIN brands br ON pv.brand_id = br.id
        WHERE b.deleted_at IS NULL
        AND b.current_quantity > 0
    """

    params = []
    if location_id and location_id != 'all':
        query += " AND b.location_id = %s"
        params.append(location_id)

    query += " ORDER BY b.created_at DESC"

    batches = execute_query(query, params if params else None)

    # Get rolls for each batch
    for batch in batches:
        rolls_query = """
            SELECT id, length_meters, initial_length_meters, status
            FROM rolls
            WHERE batch_id = %s AND deleted_at IS NULL
            ORDER BY created_at
        """
        batch['rolls'] = execute_query(rolls_query, (batch['id'],))

    return jsonify(batches), 200

@inventory_bp.route('/locations', methods=['GET'])
@jwt_required()
def get_locations():
    """Get all locations"""
    query = "SELECT * FROM locations WHERE deleted_at IS NULL ORDER BY name"
    locations = execute_query(query)
    return jsonify(locations), 200

@inventory_bp.route('/product-types', methods=['GET'])
@jwt_required()
def get_product_types():
    """Get all product types"""
    query = """
        SELECT pt.*, u.name as unit_name, u.abbreviation as unit_abbr
        FROM product_types pt
        JOIN units u ON pt.unit_id = u.id
        WHERE pt.deleted_at IS NULL
        ORDER BY pt.name
    """
    product_types = execute_query(query)
    return jsonify(product_types), 200

@inventory_bp.route('/brands', methods=['GET'])
@jwt_required()
def get_brands():
    """Get all brands"""
    query = "SELECT * FROM brands WHERE deleted_at IS NULL ORDER BY name"
    brands = execute_query(query)
    return jsonify(brands), 200

@inventory_bp.route('/customers', methods=['GET'])
@jwt_required()
def get_customers():
    """Get all customers"""
    query = "SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY name"
    customers = execute_query(query)
    return jsonify(customers), 200
