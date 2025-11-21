"""
Routes for managing dispatch-related entities:
- Customers
- Bill To (billing entities)
- Transports (transport companies)
- Vehicles
- Product Aliases
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_cursor
import logging

logger = logging.getLogger(__name__)
dispatch_entities_bp = Blueprint('dispatch_entities', __name__, url_prefix='/api')


# ============================================================================
# CUSTOMER ROUTES
# ============================================================================

@dispatch_entities_bp.route('/customers', methods=['GET', 'OPTIONS'])
@jwt_required()
def get_customers():
    """Get all customers with optional search"""
    try:
        search = request.args.get('search', '')

        with get_db_cursor() as cursor:
            if search:
                cursor.execute("""
                    SELECT id, name, city, contact_person, phone, email, gstin, address
                    FROM customers
                    WHERE deleted_at IS NULL
                    AND (name ILIKE %s OR city ILIKE %s)
                    ORDER BY name
                """, (f'%{search}%', f'%{search}%'))
            else:
                cursor.execute("""
                    SELECT id, name, city, contact_person, phone, email, gstin, address
                    FROM customers
                    WHERE deleted_at IS NULL
                    ORDER BY name
                """)

            customers = cursor.fetchall()
            return jsonify(customers), 200

    except Exception as e:
        logger.error(f"Error fetching customers: {e}")
        return jsonify({'error': str(e)}), 500


@dispatch_entities_bp.route('/customers', methods=['POST', 'OPTIONS'])
@jwt_required()
def create_customer():
    """Create a new customer"""
    try:
        data = request.json
        name = data.get('name', '').strip()
        city = data.get('city', '').strip()
        contact_person = data.get('contact_person', '').strip()
        phone = data.get('phone', '').strip()
        email = data.get('email', '').strip()
        gstin = data.get('gstin', '').strip()
        address = data.get('address', '').strip()

        if not name:
            return jsonify({'error': 'Customer name is required'}), 400

        with get_db_cursor(commit=True) as cursor:
            # Check for duplicate (including soft-deleted)
            cursor.execute("""
                SELECT id, name, deleted_at FROM customers
                WHERE LOWER(TRIM(name)) = LOWER(%s)
            """, (name,))
            existing = cursor.fetchone()

            if existing:
                if existing['deleted_at']:
                    # Restore soft-deleted customer
                    cursor.execute("""
                        UPDATE customers
                        SET deleted_at = NULL, city = %s, contact_person = %s, phone = %s,
                            email = %s, gstin = %s, address = %s, updated_at = NOW()
                        WHERE id = %s
                        RETURNING id, name, city, contact_person, phone, email, gstin, address
                    """, (city, contact_person, phone, email, gstin, address, existing['id']))
                    restored = cursor.fetchone()
                    logger.info(f"Restored customer: {name}")
                    return jsonify(restored), 201
                else:
                    return jsonify({'error': f'Customer "{existing["name"]}" already exists'}), 409

            # Insert new customer
            cursor.execute("""
                INSERT INTO customers (name, city, contact_person, phone, email, gstin, address)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, name, city, contact_person, phone, email, gstin, address
            """, (name, city, contact_person, phone, email, gstin, address))

            new_customer = cursor.fetchone()
            logger.info(f"Created customer: {name}")
            return jsonify(new_customer), 201

    except Exception as e:
        logger.error(f"Error creating customer: {e}")
        return jsonify({'error': str(e)}), 500


@dispatch_entities_bp.route('/customers/<customer_id>', methods=['PUT', 'OPTIONS'])
def update_customer(customer_id):
    """Update a customer"""
    if request.method == 'OPTIONS':
        return jsonify({'message': 'OK'}), 200

    # Apply JWT only for non-OPTIONS
    from flask_jwt_extended import verify_jwt_in_request
    verify_jwt_in_request()

    try:
        data = request.get_json(force=True)
        name = data.get('name', '').strip()

        if not name:
            return jsonify({'error': 'Customer name is required'}), 400

        with get_db_cursor(commit=True) as cursor:
            cursor.execute("""
                UPDATE customers
                SET name = %s, city = %s, contact_person = %s, phone = %s,
                    email = %s, gstin = %s, address = %s, updated_at = NOW()
                WHERE id = %s AND deleted_at IS NULL
                RETURNING id, name, city, contact_person, phone, email, gstin, address
            """, (
                name,
                data.get('city', '').strip(),
                data.get('contact_person', '').strip(),
                data.get('phone', '').strip(),
                data.get('email', '').strip(),
                data.get('gstin', '').strip(),
                data.get('address', '').strip(),
                customer_id
            ))

            updated_customer = cursor.fetchone()
            if not updated_customer:
                return jsonify({'error': 'Customer not found'}), 404

            logger.info(f"Updated customer: {name}")
            return jsonify(updated_customer), 200

    except Exception as e:
        logger.error(f"Error updating customer: {e}")
        return jsonify({'error': str(e)}), 500


@dispatch_entities_bp.route('/customers/<customer_id>', methods=['DELETE', 'OPTIONS'])
def delete_customer(customer_id):
    """Soft delete a customer"""
    if request.method == 'OPTIONS':
        return jsonify({'message': 'OK'}), 200

    # Apply JWT only for non-OPTIONS
    from flask_jwt_extended import verify_jwt_in_request
    verify_jwt_in_request()

    try:
        with get_db_cursor(commit=True) as cursor:
            cursor.execute("""
                UPDATE customers
                SET deleted_at = NOW()
                WHERE id = %s AND deleted_at IS NULL
                RETURNING id
            """, (customer_id,))

            deleted = cursor.fetchone()
            if not deleted:
                return jsonify({'error': 'Customer not found'}), 404

            logger.info(f"Deleted customer: {customer_id}")
            return jsonify({'message': 'Customer deleted successfully'}), 200

    except Exception as e:
        logger.error(f"Error deleting customer: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================================
# BILL TO ROUTES
# ============================================================================

@dispatch_entities_bp.route('/bill-to', methods=['GET', 'OPTIONS'])
@jwt_required()
def get_bill_to_list():
    """Get all bill-to entities"""
    try:
        search = request.args.get('search', '')

        with get_db_cursor() as cursor:
            if search:
                cursor.execute("""
                    SELECT id, name, city, gstin, address, contact_person, phone, email
                    FROM bill_to
                    WHERE deleted_at IS NULL
                    AND (name ILIKE %s OR city ILIKE %s)
                    ORDER BY name
                """, (f'%{search}%', f'%{search}%'))
            else:
                cursor.execute("""
                    SELECT id, name, city, gstin, address, contact_person, phone, email
                    FROM bill_to
                    WHERE deleted_at IS NULL
                    ORDER BY name
                """)

            bill_to_list = cursor.fetchall()
            return jsonify(bill_to_list), 200

    except Exception as e:
        logger.error(f"Error fetching bill-to list: {e}")
        return jsonify({'error': str(e)}), 500

@dispatch_entities_bp.route('/bill-to', methods=['POST', 'OPTIONS'])
@jwt_required()
def create_bill_to():
    """Create a new bill-to entity"""
    try:
        data = request.json
        required_fields = ['name']

        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        with get_db_cursor(commit=True) as cursor:
            # Check if bill-to with this name exists (including soft-deleted)
            cursor.execute("""
                SELECT id, deleted_at FROM bill_to WHERE LOWER(TRIM(name)) = LOWER(TRIM(%s))
            """, (data['name'],))
            existing = cursor.fetchone()

            if existing:
                if existing['deleted_at']:
                    # Restore soft-deleted bill-to
                    cursor.execute("""
                        UPDATE bill_to
                        SET deleted_at = NULL, city = %s, gstin = %s, address = %s,
                            contact_person = %s, phone = %s, email = %s, updated_at = NOW()
                        WHERE id = %s
                        RETURNING id, name, city, gstin, address, contact_person, phone, email
                    """, (data.get('city'), data.get('gstin'), data.get('address'),
                          data.get('contact_person'), data.get('phone'), data.get('email'),
                          existing['id']))
                    restored = cursor.fetchone()
                    logger.info(f"Restored bill-to: {data['name']}")
                    return jsonify(restored), 201
                else:
                    return jsonify({'error': f'Bill-to "{data["name"]}" already exists'}), 409

            # Create new bill-to
            cursor.execute("""
                INSERT INTO bill_to (name, city, gstin, address, contact_person, phone, email)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, name, city, gstin, address, contact_person, phone, email
            """, (
                data['name'],
                data.get('city'),
                data.get('gstin'),
                data.get('address'),
                data.get('contact_person'),
                data.get('phone'),
                data.get('email')
            ))

            new_bill_to = cursor.fetchone()
            return jsonify(new_bill_to), 201

    except Exception as e:
        logger.error(f"Error creating bill-to: {e}")
        return jsonify({'error': str(e)}), 500


@dispatch_entities_bp.route('/bill-to/<bill_to_id>', methods=['PUT', 'OPTIONS'])
def update_bill_to(bill_to_id):
    """Update a bill-to entity"""
    if request.method == 'OPTIONS':
        return jsonify({'message': 'OK'}), 200

    # Apply JWT only for non-OPTIONS
    from flask_jwt_extended import verify_jwt_in_request
    verify_jwt_in_request()

    try:
        data = request.get_json(force=True)
        if 'name' not in data:
            return jsonify({'error': 'Name is required'}), 400

        with get_db_cursor(commit=True) as cursor:
            cursor.execute("""
                UPDATE bill_to
                SET name = %s, city = %s, gstin = %s, address = %s,
                    contact_person = %s, phone = %s, email = %s, updated_at = NOW()
                WHERE id = %s AND deleted_at IS NULL
                RETURNING id, name, city, gstin, address, contact_person, phone, email
            """, (
                data['name'],
                data.get('city'),
                data.get('gstin'),
                data.get('address'),
                data.get('contact_person'),
                data.get('phone'),
                data.get('email'),
                bill_to_id
            ))

            updated = cursor.fetchone()
            if not updated:
                return jsonify({'error': 'Bill-to entity not found'}), 404

            return jsonify(updated), 200

    except Exception as e:
        logger.error(f"Error updating bill-to: {e}")
        return jsonify({'error': str(e)}), 500


@dispatch_entities_bp.route('/bill-to/<bill_to_id>', methods=['DELETE', 'OPTIONS'])
def delete_bill_to(bill_to_id):
    """Soft delete a bill-to entity"""
    if request.method == 'OPTIONS':
        return jsonify({'message': 'OK'}), 200

    # Apply JWT only for non-OPTIONS
    from flask_jwt_extended import verify_jwt_in_request
    verify_jwt_in_request()

    try:
        with get_db_cursor(commit=True) as cursor:
            cursor.execute("""
                UPDATE bill_to
                SET deleted_at = NOW()
                WHERE id = %s AND deleted_at IS NULL
                RETURNING id
            """, (bill_to_id,))

            deleted = cursor.fetchone()
            if not deleted:
                return jsonify({'error': 'Bill-to entity not found'}), 404

            return jsonify({'message': 'Bill-to deleted successfully'}), 200

    except Exception as e:
        logger.error(f"Error deleting bill-to: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================================
# TRANSPORT ROUTES
# ============================================================================

@dispatch_entities_bp.route('/transports', methods=['GET', 'OPTIONS'])
@jwt_required()
def get_transports_list():
    """Get all transport companies"""
    try:
        search = request.args.get('search', '')

        with get_db_cursor() as cursor:
            if search:
                cursor.execute("""
                    SELECT id, name, contact_person, phone
                    FROM transports
                    WHERE deleted_at IS NULL
                    AND name ILIKE %s
                    ORDER BY name
                """, (f'%{search}%',))
            else:
                cursor.execute("""
                    SELECT id, name, contact_person, phone
                    FROM transports
                    WHERE deleted_at IS NULL
                    ORDER BY name
                """)

            transports = cursor.fetchall()
            return jsonify(transports), 200

    except Exception as e:
        logger.error(f"Error fetching transports: {e}")
        return jsonify({'error': str(e)}), 500

@dispatch_entities_bp.route('/transports', methods=['POST', 'OPTIONS'])
@jwt_required()
def create_transport():
    """Create a new transport company"""
    try:
        data = request.json
        required_fields = ['name']

        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        with get_db_cursor(commit=True) as cursor:
            # Check if transport with this name exists (including soft-deleted)
            cursor.execute("""
                SELECT id, deleted_at FROM transports WHERE LOWER(TRIM(name)) = LOWER(TRIM(%s))
            """, (data['name'],))
            existing = cursor.fetchone()

            if existing:
                if existing['deleted_at']:
                    # Restore soft-deleted transport
                    cursor.execute("""
                        UPDATE transports
                        SET deleted_at = NULL, contact_person = %s, phone = %s, updated_at = NOW()
                        WHERE id = %s
                        RETURNING id, name, contact_person, phone
                    """, (data.get('contact_person'), data.get('phone'), existing['id']))
                    restored = cursor.fetchone()
                    logger.info(f"Restored transport: {data['name']}")
                    return jsonify(restored), 201
                else:
                    return jsonify({'error': f'Transport "{data["name"]}" already exists'}), 409

            # Create new transport
            cursor.execute("""
                INSERT INTO transports (name, contact_person, phone)
                VALUES (%s, %s, %s)
                RETURNING id, name, contact_person, phone
            """, (
                data['name'],
                data.get('contact_person'),
                data.get('phone')
            ))

            new_transport = cursor.fetchone()
            return jsonify(new_transport), 201

    except Exception as e:
        logger.error(f"Error creating transport: {e}")
        return jsonify({'error': str(e)}), 500


@dispatch_entities_bp.route('/transports/<transport_id>', methods=['PUT', 'OPTIONS'])
def update_transport(transport_id):
    """Update a transport company"""
    if request.method == 'OPTIONS':
        return jsonify({'message': 'OK'}), 200

    # Apply JWT only for non-OPTIONS
    from flask_jwt_extended import verify_jwt_in_request
    verify_jwt_in_request()

    try:
        data = request.get_json(force=True)
        if 'name' not in data:
            return jsonify({'error': 'Name is required'}), 400

        with get_db_cursor(commit=True) as cursor:
            cursor.execute("""
                UPDATE transports
                SET name = %s, contact_person = %s, phone = %s, updated_at = NOW()
                WHERE id = %s AND deleted_at IS NULL
                RETURNING id, name, contact_person, phone
            """, (
                data['name'],
                data.get('contact_person'),
                data.get('phone'),
                transport_id
            ))

            updated = cursor.fetchone()
            if not updated:
                return jsonify({'error': 'Transport not found'}), 404

            return jsonify(updated), 200

    except Exception as e:
        logger.error(f"Error updating transport: {e}")
        return jsonify({'error': str(e)}), 500


@dispatch_entities_bp.route('/transports/<transport_id>', methods=['DELETE', 'OPTIONS'])
def delete_transport(transport_id):
    """Soft delete a transport company"""
    if request.method == 'OPTIONS':
        return jsonify({'message': 'OK'}), 200

    # Apply JWT only for non-OPTIONS
    from flask_jwt_extended import verify_jwt_in_request
    verify_jwt_in_request()

    try:
        with get_db_cursor(commit=True) as cursor:
            cursor.execute("""
                UPDATE transports
                SET deleted_at = NOW()
                WHERE id = %s AND deleted_at IS NULL
                RETURNING id
            """, (transport_id,))

            deleted = cursor.fetchone()
            if not deleted:
                return jsonify({'error': 'Transport not found'}), 404

            return jsonify({'message': 'Transport deleted successfully'}), 200

    except Exception as e:
        logger.error(f"Error deleting transport: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================================
# VEHICLE ROUTES
# ============================================================================

@dispatch_entities_bp.route('/vehicles', methods=['GET', 'OPTIONS'])
@jwt_required()
def get_vehicles_list():
    """Get all vehicles"""
    try:
        search = request.args.get('search', '')

        with get_db_cursor() as cursor:
            if search:
                cursor.execute("""
                    SELECT id, vehicle_number, vehicle_type, driver_name, driver_phone
                    FROM vehicles
                    WHERE deleted_at IS NULL
                    AND (vehicle_number ILIKE %s OR driver_name ILIKE %s)
                    ORDER BY driver_name
                """, (f'%{search}%', f'%{search}%'))
            else:
                cursor.execute("""
                    SELECT id, vehicle_number, vehicle_type, driver_name, driver_phone
                    FROM vehicles
                    WHERE deleted_at IS NULL
                    ORDER BY driver_name
                """)

            vehicles = cursor.fetchall()
            return jsonify(vehicles), 200

    except Exception as e:
        logger.error(f"Error fetching vehicles: {e}")
        return jsonify({'error': str(e)}), 500

@dispatch_entities_bp.route('/vehicles', methods=['POST', 'OPTIONS'])
@jwt_required()
def create_vehicle():
    """Create a new vehicle"""
    try:
        data = request.json

        # Validate required fields
        if not data.get('driver_name', '').strip():
            return jsonify({'error': 'Driver name is required'}), 400

        with get_db_cursor(commit=True) as cursor:
            cursor.execute("""
                INSERT INTO vehicles (vehicle_number, vehicle_type, driver_name, driver_phone)
                VALUES (%s, %s, %s, %s)
                RETURNING id, vehicle_number, vehicle_type, driver_name, driver_phone
            """, (
                data['vehicle_number'],
                data.get('vehicle_type'),
                data.get('driver_name'),
                data.get('driver_phone')
            ))

            new_vehicle = cursor.fetchone()
            return jsonify(new_vehicle), 201

    except Exception as e:
        logger.error(f"Error creating vehicle: {e}")
        return jsonify({'error': str(e)}), 500


@dispatch_entities_bp.route('/vehicles/<vehicle_id>', methods=['PUT', 'OPTIONS'])
def update_vehicle(vehicle_id):
    """Update a vehicle"""
    # Handle OPTIONS request
    if request.method == 'OPTIONS':
        return jsonify({'message': 'OK'}), 200

    # Apply JWT only for non-OPTIONS
    from flask_jwt_extended import verify_jwt_in_request
    verify_jwt_in_request()

    try:
        data = request.get_json(force=True)

        # Validate required fields
        if not data.get('driver_name', '').strip():
            return jsonify({'error': 'Driver name is required'}), 400

        with get_db_cursor(commit=True) as cursor:
            cursor.execute("""
                UPDATE vehicles
                SET vehicle_number = %s, vehicle_type = %s, driver_name = %s,
                    driver_phone = %s, updated_at = NOW()
                WHERE id = %s AND deleted_at IS NULL
                RETURNING id, vehicle_number, vehicle_type, driver_name, driver_phone
            """, (
                data['vehicle_number'],
                data.get('vehicle_type'),
                data.get('driver_name'),
                data.get('driver_phone'),
                vehicle_id
            ))

            updated = cursor.fetchone()
            if not updated:
                return jsonify({'error': 'Vehicle not found'}), 404

            return jsonify(updated), 200

    except Exception as e:
        logger.error(f"Error updating vehicle: {e}")
        return jsonify({'error': str(e)}), 500


@dispatch_entities_bp.route('/vehicles/<vehicle_id>', methods=['DELETE', 'OPTIONS'])
def delete_vehicle(vehicle_id):
    """Soft delete a vehicle"""
    if request.method == 'OPTIONS':
        return jsonify({'message': 'OK'}), 200

    # Apply JWT only for non-OPTIONS
    from flask_jwt_extended import verify_jwt_in_request
    verify_jwt_in_request()

    try:
        with get_db_cursor(commit=True) as cursor:
            cursor.execute("""
                UPDATE vehicles
                SET deleted_at = NOW()
                WHERE id = %s AND deleted_at IS NULL
                RETURNING id
            """, (vehicle_id,))

            deleted = cursor.fetchone()
            if not deleted:
                return jsonify({'error': 'Vehicle not found'}), 404

            return jsonify({'message': 'Vehicle deleted successfully'}), 200

    except Exception as e:
        logger.error(f"Error deleting vehicle: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================================
# PRODUCT ALIAS ROUTES
# ============================================================================

@dispatch_entities_bp.route('/product-aliases', methods=['GET', 'OPTIONS'])
@jwt_required()
def get_product_aliases():
    """Get product aliases for quick search"""
    try:
        search = request.args.get('search', '')

        with get_db_cursor() as cursor:
            if search:
                cursor.execute("""
                    SELECT pa.id, pa.alias, pa.product_variant_id,
                           pv.parameters, pt.name as product_type_name, b.name as brand_name
                    FROM product_aliases pa
                    JOIN product_variants pv ON pa.product_variant_id = pv.id
                    JOIN product_types pt ON pv.product_type_id = pt.id
                    JOIN brands b ON pv.brand_id = b.id
                    WHERE pa.alias ILIKE %s
                    ORDER BY pa.alias
                    LIMIT 20
                """, (f'%{search}%',))
            else:
                cursor.execute("""
                    SELECT pa.id, pa.alias, pa.product_variant_id,
                           pv.parameters, pt.name as product_type_name, b.name as brand_name
                    FROM product_aliases pa
                    JOIN product_variants pv ON pa.product_variant_id = pv.id
                    JOIN product_types pt ON pv.product_type_id = pt.id
                    JOIN brands b ON pv.brand_id = b.id
                    ORDER BY pa.alias
                    LIMIT 100
                """)

            aliases = cursor.fetchall()
            return jsonify(aliases), 200

    except Exception as e:
        logger.error(f"Error fetching product aliases: {e}")
        return jsonify({'error': str(e)}), 500

@dispatch_entities_bp.route('/product-aliases', methods=['POST', 'OPTIONS'])
@jwt_required()
def create_product_alias():
    """Create a product alias"""
    try:
        data = request.json
        required_fields = ['product_variant_id', 'alias']

        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        with get_db_cursor() as cursor:
            cursor.execute("""
                INSERT INTO product_aliases (product_variant_id, alias)
                VALUES (%s, %s)
                RETURNING id, product_variant_id, alias
            """, (data['product_variant_id'], data['alias']))

            new_alias = cursor.fetchone()
            return jsonify(new_alias), 201

    except Exception as e:
        logger.error(f"Error creating product alias: {e}")
        return jsonify({'error': str(e)}), 500
