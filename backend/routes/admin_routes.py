from flask import Blueprint, request, jsonify, make_response
from flask_jwt_extended import jwt_required
from database import execute_query, execute_insert, get_db_cursor
from auth import jwt_required_with_role, hash_password
import json
import csv
import io

admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')

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
    result = execute_insert(query, (name, str(brand_id)))
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
    execute_query(query, (str(brand_id),), fetch_all=False)
    return jsonify({'message': 'Brand deleted'}), 200

# Product Types
@admin_bp.route('/product-types', methods=['GET'])
@jwt_required()
def get_product_types():
    """Get all product types with units"""
    query = """
        SELECT pt.id, pt.name, pt.unit_id, pt.description,
               pt.parameter_schema, pt.roll_configuration,
               u.name as unit_name, u.abbreviation as unit_symbol
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
    description = data.get('description', '')
    parameter_schema = data.get('parameter_schema', [])
    roll_configuration = data.get('roll_configuration', {
        'type': 'standard_rolls',
        'options': [{'value': 500, 'label': '500m'}, {'value': 300, 'label': '300m'}, {'value': 200, 'label': '200m'}, {'value': 100, 'label': '100m'}],
        'allow_cut_rolls': True,
        'bundle_sizes': [],
        'allow_spare': False
    })

    if not name or not unit_id:
        return jsonify({'error': 'Product type name and unit are required'}), 400

    query = """
        INSERT INTO product_types (name, unit_id, description, parameter_schema, roll_configuration)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, name, unit_id, description, parameter_schema, roll_configuration
    """
    result = execute_insert(query, (name, unit_id, description, json.dumps(parameter_schema), json.dumps(roll_configuration)))
    return jsonify(result), 201

@admin_bp.route('/product-types/<uuid:product_type_id>', methods=['PUT'])
@jwt_required_with_role('admin')
def update_product_type(product_type_id):
    """Update a product type"""
    data = request.json
    name = data.get('name')
    unit_id = data.get('unit_id')
    description = data.get('description', '')
    parameter_schema = data.get('parameter_schema', [])
    roll_configuration = data.get('roll_configuration', {
        'type': 'standard_rolls',
        'options': [{'value': 500, 'label': '500m'}, {'value': 300, 'label': '300m'}, {'value': 200, 'label': '200m'}, {'value': 100, 'label': '100m'}],
        'allow_cut_rolls': True,
        'bundle_sizes': [],
        'allow_spare': False
    })

    if not name or not unit_id:
        return jsonify({'error': 'Product type name and unit are required'}), 400

    query = """
        UPDATE product_types
        SET name = %s, unit_id = %s, description = %s, parameter_schema = %s, roll_configuration = %s
        WHERE id = %s
        RETURNING id, name, unit_id, description, parameter_schema, roll_configuration
    """
    with get_db_cursor() as cursor:
        cursor.execute(query, (name, unit_id, description, json.dumps(parameter_schema), json.dumps(roll_configuration), str(product_type_id)))
        result = cursor.fetchone()

    if not result:
        return jsonify({'error': 'Product type not found'}), 404

    return jsonify(result), 200

@admin_bp.route('/product-types/<uuid:product_type_id>', methods=['DELETE'])
@jwt_required_with_role('admin')
def delete_product_type(product_type_id):
    """Soft delete a product type"""
    query = """
        UPDATE product_types
        SET deleted_at = NOW()
        WHERE id = %s
    """
    execute_query(query, (str(product_type_id),), fetch_all=False)
    return jsonify({'message': 'Product type deleted'}), 200

# Customers
@admin_bp.route('/customers', methods=['GET'])
@jwt_required()
def get_customers():
    """Get all customers"""
    query = "SELECT id, name, contact_person, phone, email, gstin, address, city, state, pincode, created_at, is_active FROM customers WHERE deleted_at IS NULL ORDER BY name"
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
    city = data.get('city', '')
    state = data.get('state', '')
    pincode = data.get('pincode', '')

    if not name:
        return jsonify({'error': 'Customer name is required'}), 400

    # Check for duplicate customer by name
    check_query = """
        SELECT id, name FROM customers
        WHERE LOWER(TRIM(name)) = LOWER(TRIM(%s))
        AND deleted_at IS NULL
    """
    existing = execute_query(check_query, (name,))
    if existing:
        return jsonify({'error': f'Customer "{existing[0]["name"]}" already exists'}), 409

    query = """
        INSERT INTO customers (name, contact_person, phone, email, gstin, address, city, state, pincode)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id, name, contact_person, phone, email, gstin, address, city, state, pincode
    """
    result = execute_insert(query, (name, contact_person, phone, email, gstin, address, city, state, pincode))
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
    city = data.get('city', '')
    state = data.get('state', '')
    pincode = data.get('pincode', '')

    if not name:
        return jsonify({'error': 'Customer name is required'}), 400

    query = """
        UPDATE customers
        SET name = %s, contact_person = %s, phone = %s, email = %s, gstin = %s, address = %s,
            city = %s, state = %s, pincode = %s
        WHERE id = %s AND deleted_at IS NULL
        RETURNING id, name, contact_person, phone, email, gstin, address, city, state, pincode
    """
    result = execute_insert(query, (name, contact_person, phone, email, gstin, address, city, state, pincode, str(customer_id)))
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
    execute_query(query, (str(customer_id),), fetch_all=False)
    return jsonify({'message': 'Customer deleted'}), 200

@admin_bp.route('/customers/template', methods=['GET'])
@jwt_required()
def download_customer_template():
    """Download CSV template for customer import"""
    # Create CSV template with headers and example data
    output = io.StringIO()
    writer = csv.writer(output)

    # Write header
    writer.writerow(['Name', 'Contact Person', 'Phone', 'Email', 'GSTIN', 'Address'])

    # Write example rows
    writer.writerow(['ABC Corporation', 'John Doe', '+91-9876543210', 'john@abc.com', '29ABCDE1234F1Z5', '123 Main Street, City'])
    writer.writerow(['XYZ Industries Ltd', 'Jane Smith', '+91-8765432109', 'jane@xyz.com', '27XYZAB5678G2Y4', '456 Park Avenue, Town'])

    # Create response
    output.seek(0)
    response = make_response(output.getvalue())
    response.headers['Content-Type'] = 'text/csv'
    response.headers['Content-Disposition'] = 'attachment; filename=customer_import_template.csv'

    return response

@admin_bp.route('/customers/export', methods=['GET'])
@jwt_required()
def export_customers():
    """Export all customers to CSV"""
    query = """
        SELECT name, contact_person, phone, email, gstin, address
        FROM customers
        WHERE deleted_at IS NULL
        ORDER BY name
    """
    customers = execute_query(query)

    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)

    # Write header
    writer.writerow(['Name', 'Contact Person', 'Phone', 'Email', 'GSTIN', 'Address'])

    # Write data
    for customer in customers:
        writer.writerow([
            customer.get('name', ''),
            customer.get('contact_person', ''),
            customer.get('phone', ''),
            customer.get('email', ''),
            customer.get('gstin', ''),
            customer.get('address', '')
        ])

    # Create response
    output.seek(0)
    response = make_response(output.getvalue())
    response.headers['Content-Type'] = 'text/csv'
    response.headers['Content-Disposition'] = 'attachment; filename=customers.csv'

    return response

@admin_bp.route('/customers/import', methods=['POST'])
@jwt_required_with_role('admin')
def import_customers():
    """Import customers from CSV file"""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not file.filename.endswith('.csv'):
        return jsonify({'error': 'File must be a CSV'}), 400

    try:
        # Read CSV file
        stream = io.StringIO(file.stream.read().decode('utf-8'), newline=None)
        csv_reader = csv.DictReader(stream)

        imported = 0
        skipped = 0
        errors = []

        with get_db_cursor() as cursor:
            for row_num, row in enumerate(csv_reader, start=2):  # Start at 2 to account for header
                try:
                    # Get values from CSV (handle both cases)
                    name = row.get('Name') or row.get('name', '').strip()
                    contact_person = row.get('Contact Person') or row.get('contact_person', '').strip()
                    phone = row.get('Phone') or row.get('phone', '').strip()
                    email = row.get('Email') or row.get('email', '').strip()
                    gstin = row.get('GSTIN') or row.get('gstin', '').strip()
                    address = row.get('Address') or row.get('address', '').strip()

                    if not name:
                        errors.append(f"Row {row_num}: Customer name is required")
                        continue

                    # Check if customer already exists (case-insensitive)
                    cursor.execute("""
                        SELECT id, name FROM customers
                        WHERE LOWER(TRIM(name)) = LOWER(TRIM(%s))
                        AND deleted_at IS NULL
                    """, (name,))
                    existing = cursor.fetchone()

                    if existing:
                        errors.append(f"Row {row_num}: Customer '{name}' already exists (skipped)")
                        skipped += 1
                        continue

                    # Insert customer
                    cursor.execute("""
                        INSERT INTO customers (name, contact_person, phone, email, gstin, address)
                        VALUES (%s, %s, %s, %s, %s, %s)
                    """, (name, contact_person, phone, email, gstin, address))

                    imported += 1

                except Exception as e:
                    errors.append(f"Row {row_num}: {str(e)}")

        message = f'Successfully imported {imported} customers'
        if skipped > 0:
            message += f', skipped {skipped} duplicates'

        return jsonify({
            'message': message,
            'imported': imported,
            'skipped': skipped,
            'errors': errors
        }), 200

    except Exception as e:
        return jsonify({'error': f'Failed to import CSV: {str(e)}'}), 400

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
    """Get detailed audit logs with transaction and entity info"""
    user_filter = request.args.get('user_id')
    action_filter = request.args.get('action_type')
    limit = request.args.get('limit', 100)

    where_clauses = []
    params = []

    if user_filter:
        where_clauses.append("al.user_id = %s")
        params.append(user_filter)

    if action_filter:
        where_clauses.append("al.action_type = %s")
        params.append(action_filter)

    where_sql = " AND " + " AND ".join(where_clauses) if where_clauses else ""

    query = f"""
        SELECT
            al.*,
            u.email as user_email,
            u.username as user_username,
            u.full_name as user_name,
            -- Get transaction details if entity is TRANSACTION or if there's a related transaction for ROLL
            t.customer_id,
            t.invoice_no,
            t.quantity_change,
            t.roll_snapshot,
            c.name as customer_name,
            -- Get batch details
            b.batch_code,
            b.batch_no,
            -- Get roll details if entity is ROLL
            r.length_meters as roll_length,
            r.initial_length_meters as roll_initial_length
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        LEFT JOIN transactions t ON (
            (al.entity_type = 'TRANSACTION' AND al.entity_id::text = t.id::text) OR
            (al.entity_type = 'ROLL' AND al.entity_id::text = t.roll_id::text AND al.action_type = 'CUT_ROLL')
        )
        LEFT JOIN customers c ON t.customer_id = c.id
        LEFT JOIN batches b ON t.batch_id = b.id
        LEFT JOIN rolls r ON al.entity_type = 'ROLL' AND al.entity_id::text = r.id::text
        WHERE 1=1{where_sql}
        ORDER BY al.created_at DESC
        LIMIT %s
    """
    params.append(limit)

    logs = execute_query(query, tuple(params))
    return jsonify(logs), 200

# User Management
@admin_bp.route('/users', methods=['GET'])
@jwt_required_with_role('admin')
def get_users():
    """Get all users"""
    query = """
        SELECT
            u.id, u.email, u.username, u.full_name,
            u.is_active, u.created_at, u.last_login_at,
            ur.role
        FROM users u
        LEFT JOIN user_roles ur ON u.id = ur.user_id
        WHERE u.deleted_at IS NULL
        ORDER BY u.created_at DESC
    """
    users = execute_query(query)
    return jsonify(users), 200

@admin_bp.route('/users', methods=['POST'])
@jwt_required_with_role('admin')
def create_user():
    """Admin creates a new user"""
    from flask_jwt_extended import get_jwt_identity
    from auth import create_user as auth_create_user

    admin_id = get_jwt_identity()
    data = request.json

    email = data.get('email')
    username = data.get('username')
    password = data.get('password')
    full_name = data.get('full_name', '')
    role = data.get('role', 'user')

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400

    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    if role not in ['admin', 'user', 'reader']:
        return jsonify({'error': 'Invalid role'}), 400

    try:
        # Hash password using Python bcrypt
        password_hash = hash_password(password)

        # Create user with additional fields
        query = """
            INSERT INTO users (email, username, full_name, password_hash, is_active, created_by_user_id)
            VALUES (%s, %s, %s, %s, true, %s)
            RETURNING id, email, username, full_name
        """
        user = execute_insert(query, (email, username, full_name, password_hash, admin_id))

        # Assign role
        execute_query("""
            INSERT INTO user_roles (user_id, role)
            VALUES (%s, %s)
        """, (user['id'], role), fetch_all=False)

        # Audit log
        execute_query("""
            INSERT INTO audit_logs (user_id, action_type, entity_type, entity_id, description)
            VALUES (%s, 'CREATE_USER', 'USER', %s, %s)
        """, (admin_id, user['id'], f"Created user {email} with role {role}"), fetch_all=False)

        return jsonify({**user, 'role': role}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@admin_bp.route('/users/<uuid:user_id>', methods=['PUT'])
@jwt_required_with_role('admin')
def update_user(user_id):
    """Update user details"""
    from flask_jwt_extended import get_jwt_identity

    admin_id = get_jwt_identity()
    data = request.json

    updates = []
    params = []

    if 'email' in data:
        updates.append("email = %s")
        params.append(data['email'])

    if 'username' in data:
        updates.append("username = %s")
        params.append(data['username'])

    if 'full_name' in data:
        updates.append("full_name = %s")
        params.append(data['full_name'])

    if 'is_active' in data:
        updates.append("is_active = %s")
        params.append(data['is_active'])

    if 'password' in data and data['password']:
        if len(data['password']) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400
        password_hash = hash_password(data['password'])
        updates.append("password_hash = %s")
        params.append(password_hash)

    if not updates:
        return jsonify({'error': 'No fields to update'}), 400

    updates.append("updated_at = NOW()")
    params.append(str(user_id))

    query = f"UPDATE users SET {', '.join(updates)} WHERE id = %s"
    execute_query(query, params, fetch_all=False)

    # Update role if provided
    if 'role' in data:
        execute_query("DELETE FROM user_roles WHERE user_id = %s", (str(user_id),), fetch_all=False)
        execute_query("INSERT INTO user_roles (user_id, role) VALUES (%s, %s)",
                     (str(user_id), data['role']), fetch_all=False)

    # Audit log
    execute_query("""
        INSERT INTO audit_logs (user_id, action_type, entity_type, entity_id, description)
        VALUES (%s, 'UPDATE_USER', 'USER', %s, %s)
    """, (admin_id, str(user_id), f"Updated user: {', '.join(k for k in data.keys())}"), fetch_all=False)

    return jsonify({'message': 'User updated successfully'}), 200

@admin_bp.route('/users/<uuid:user_id>', methods=['DELETE'])
@jwt_required_with_role('admin')
def delete_user(user_id):
    """Soft delete a user"""
    from flask_jwt_extended import get_jwt_identity

    admin_id = get_jwt_identity()

    # Don't allow deleting yourself
    if str(user_id) == str(admin_id):
        return jsonify({'error': 'Cannot delete your own account'}), 400

    execute_query("UPDATE users SET deleted_at = NOW() WHERE id = %s", (str(user_id),), fetch_all=False)

    # Audit log
    execute_query("""
        INSERT INTO audit_logs (user_id, action_type, entity_type, entity_id, description)
        VALUES (%s, 'DELETE_USER', 'USER', %s, %s)
    """, (admin_id, str(user_id), "Deleted user"), fetch_all=False)

    return jsonify({'message': 'User deleted successfully'}), 200
