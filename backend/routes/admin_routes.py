from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from database import execute_query, execute_insert
from auth import jwt_required_with_role

admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')

# Locations
@admin_bp.route('/locations', methods=['GET'])
@jwt_required()
def get_locations():
    """Get all locations"""
    query = "SELECT * FROM locations WHERE deleted_at IS NULL ORDER BY name"
    locations = execute_query(query)
    return jsonify(locations), 200

@admin_bp.route('/locations', methods=['POST'])
@jwt_required_with_role('admin')
def create_location():
    """Create a new location"""
    data = request.json
    name = data.get('name')
    address = data.get('address', '')

    if not name:
        return jsonify({'error': 'Location name is required'}), 400

    query = """
        INSERT INTO locations (name, address)
        VALUES (%s, %s)
        RETURNING id, name, address
    """
    result = execute_insert(query, (name, address))
    return jsonify(result), 201

@admin_bp.route('/locations/<uuid:location_id>', methods=['PUT'])
@jwt_required_with_role('admin')
def update_location(location_id):
    """Update a location"""
    data = request.json
    name = data.get('name')
    address = data.get('address', '')

    if not name:
        return jsonify({'error': 'Location name is required'}), 400

    query = """
        UPDATE locations
        SET name = %s, address = %s
        WHERE id = %s AND deleted_at IS NULL
        RETURNING id, name, address
    """
    result = execute_insert(query, (name, address, location_id))
    return jsonify(result), 200

@admin_bp.route('/locations/<uuid:location_id>', methods=['DELETE'])
@jwt_required_with_role('admin')
def delete_location(location_id):
    """Soft delete a location"""
    query = """
        UPDATE locations
        SET deleted_at = NOW()
        WHERE id = %s
    """
    execute_query(query, (location_id,))
    return jsonify({'message': 'Location deleted'}), 200

# Brands
@admin_bp.route('/brands', methods=['GET'])
@jwt_required()
def get_brands():
    """Get all brands"""
    query = "SELECT * FROM brands WHERE deleted_at IS NULL ORDER BY name"
    brands = execute_query(query)
    return jsonify(brands), 200

@admin_bp.route('/brands', methods=['POST'])
@jwt_required_with_role('admin')
def create_brand():
    """Create a new brand"""
    data = request.json
    name = data.get('name')

    if not name:
        return jsonify({'error': 'Brand name is required'}), 400

    query = """
        INSERT INTO brands (name)
        VALUES (%s)
        RETURNING id, name
    """
    result = execute_insert(query, (name,))
    return jsonify(result), 201

@admin_bp.route('/brands/<uuid:brand_id>', methods=['PUT'])
@jwt_required_with_role('admin')
def update_brand(brand_id):
    """Update a brand"""
    data = request.json
    name = data.get('name')

    if not name:
        return jsonify({'error': 'Brand name is required'}), 400

    query = """
        UPDATE brands
        SET name = %s
        WHERE id = %s AND deleted_at IS NULL
        RETURNING id, name
    """
    result = execute_insert(query, (name, brand_id))
    return jsonify(result), 200

@admin_bp.route('/brands/<uuid:brand_id>', methods=['DELETE'])
@jwt_required_with_role('admin')
def delete_brand(brand_id):
    """Soft delete a brand"""
    query = """
        UPDATE brands
        SET deleted_at = NOW()
        WHERE id = %s
    """
    execute_query(query, (brand_id,))
    return jsonify({'message': 'Brand deleted'}), 200

# Product Types
@admin_bp.route('/product-types', methods=['GET'])
@jwt_required()
def get_product_types():
    """Get all product types with units"""
    query = """
        SELECT pt.*, u.name as unit_name, u.symbol as unit_symbol
        FROM product_types pt
        LEFT JOIN units u ON pt.unit_id = u.id
        WHERE pt.deleted_at IS NULL
        ORDER BY pt.name
    """
    product_types = execute_query(query)
    return jsonify(product_types), 200

@admin_bp.route('/product-types', methods=['POST'])
@jwt_required_with_role('admin')
def create_product_type():
    """Create a new product type"""
    data = request.json
    name = data.get('name')
    unit_id = data.get('unit_id')

    if not name or not unit_id:
        return jsonify({'error': 'Product type name and unit are required'}), 400

    query = """
        INSERT INTO product_types (name, unit_id)
        VALUES (%s, %s)
        RETURNING id, name, unit_id
    """
    result = execute_insert(query, (name, unit_id))
    return jsonify(result), 201

@admin_bp.route('/product-types/<uuid:product_type_id>', methods=['DELETE'])
@jwt_required_with_role('admin')
def delete_product_type(product_type_id):
    """Soft delete a product type"""
    query = """
        UPDATE product_types
        SET deleted_at = NOW()
        WHERE id = %s
    """
    execute_query(query, (product_type_id,))
    return jsonify({'message': 'Product type deleted'}), 200

# Customers
@admin_bp.route('/customers', methods=['GET'])
@jwt_required()
def get_customers():
    """Get all customers"""
    query = "SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY name"
    customers = execute_query(query)
    return jsonify(customers), 200

@admin_bp.route('/customers', methods=['POST'])
@jwt_required_with_role('admin')
def create_customer():
    """Create a new customer"""
    data = request.json
    name = data.get('name')
    contact_person = data.get('contact_person', '')
    phone = data.get('phone', '')
    email = data.get('email', '')
    gstin = data.get('gstin', '')
    address = data.get('address', '')

    if not name:
        return jsonify({'error': 'Customer name is required'}), 400

    query = """
        INSERT INTO customers (name, contact_person, phone, email, gstin, address)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id, name, contact_person, phone, email, gstin, address
    """
    result = execute_insert(query, (name, contact_person, phone, email, gstin, address))
    return jsonify(result), 201

@admin_bp.route('/customers/<uuid:customer_id>', methods=['PUT'])
@jwt_required_with_role('admin')
def update_customer(customer_id):
    """Update a customer"""
    data = request.json
    name = data.get('name')
    contact_person = data.get('contact_person', '')
    phone = data.get('phone', '')
    email = data.get('email', '')
    gstin = data.get('gstin', '')
    address = data.get('address', '')

    if not name:
        return jsonify({'error': 'Customer name is required'}), 400

    query = """
        UPDATE customers
        SET name = %s, contact_person = %s, phone = %s, email = %s, gstin = %s, address = %s
        WHERE id = %s AND deleted_at IS NULL
        RETURNING id, name, contact_person, phone, email, gstin, address
    """
    result = execute_insert(query, (name, contact_person, phone, email, gstin, address, customer_id))
    return jsonify(result), 200

@admin_bp.route('/customers/<uuid:customer_id>', methods=['DELETE'])
@jwt_required_with_role('admin')
def delete_customer(customer_id):
    """Soft delete a customer"""
    query = """
        UPDATE customers
        SET deleted_at = NOW()
        WHERE id = %s
    """
    execute_query(query, (customer_id,))
    return jsonify({'message': 'Customer deleted'}), 200

# Units
@admin_bp.route('/units', methods=['GET'])
@jwt_required()
def get_units():
    """Get all units"""
    query = "SELECT * FROM units ORDER BY name"
    units = execute_query(query)
    return jsonify(units), 200

# Audit Logs
@admin_bp.route('/audit-logs', methods=['GET'])
@jwt_required_with_role('admin')
def get_audit_logs():
    """Get recent audit logs"""
    query = """
        SELECT al.*, u.email as user_email
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ORDER BY al.created_at DESC
        LIMIT 50
    """
    logs = execute_query(query)
    return jsonify(logs), 200
