from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import execute_query, execute_insert
from auth import jwt_required_with_role, get_user_identity_details

inventory_bp = Blueprint('inventory', __name__, url_prefix='/api/inventory')

@inventory_bp.route('/batches', methods=['GET'])
@jwt_required()
def get_batches():
    """Get all batches with inventory"""
    try:
        # First, cleanup any rolls with zero length (but preserve spare pieces and bundles)
        cleanup_query = """
            UPDATE rolls
            SET deleted_at = NOW(), status = 'SOLD_OUT'
            WHERE length_meters = 0
            AND deleted_at IS NULL
            AND roll_type IS NULL
        """
        execute_query(cleanup_query, fetch_all=False)

        query = """
            SELECT DISTINCT
                b.id, b.batch_code, b.batch_no, b.current_quantity,
                b.production_date, b.attachment_url, b.created_at,
                b.product_variant_id,
                pv.parameters,
                pt.id as product_type_id,
                pt.name as product_type_name,
                br.id as brand_id,
                br.name as brand_name
            FROM batches b
            JOIN product_variants pv ON b.product_variant_id = pv.id
            JOIN product_types pt ON pv.product_type_id = pt.id
            JOIN brands br ON pv.brand_id = br.id
            LEFT JOIN rolls r ON r.batch_id = b.id AND r.deleted_at IS NULL
            WHERE b.deleted_at IS NULL
            AND (b.current_quantity > 0 OR r.roll_type IN ('spare', 'bundle_10', 'bundle_20', 'bundle_50', 'bundle_100'))
            ORDER BY b.created_at DESC
        """

        batches = execute_query(query)

        # Get rolls for each batch
        for batch in batches:
            rolls_query = """
                SELECT id, length_meters, initial_length_meters, status, is_cut_roll,
                       roll_type, bundle_size
                FROM rolls
                WHERE batch_id = %s AND deleted_at IS NULL
                ORDER BY roll_type, created_at
            """
            rolls = execute_query(rolls_query, (batch['id'],))
            # Add roll_number based on position
            for idx, roll in enumerate(rolls, 1):
                roll['roll_number'] = idx
            batch['rolls'] = rolls

        return jsonify(batches), 200
    except Exception as e:
        return jsonify({'error': 'Failed to fetch batches', 'details': str(e)}), 500

@inventory_bp.route('/product-types', methods=['GET'])
@jwt_required()
def get_product_types():
    """Get all product types"""
    try:
        query = """
            SELECT pt.*, u.name as unit_name, u.abbreviation as unit_abbr
            FROM product_types pt
            JOIN units u ON pt.unit_id = u.id
            WHERE pt.deleted_at IS NULL
            ORDER BY pt.name
        """
        product_types = execute_query(query)
        return jsonify(product_types), 200
    except Exception as e:
        return jsonify({'error': 'Failed to fetch product types', 'details': str(e)}), 500

@inventory_bp.route('/brands', methods=['GET'])
@jwt_required()
def get_brands():
    """Get all brands"""
    try:
        query = "SELECT * FROM brands WHERE deleted_at IS NULL ORDER BY name"
        brands = execute_query(query)
        return jsonify(brands), 200
    except Exception as e:
        return jsonify({'error': 'Failed to fetch brands', 'details': str(e)}), 500

@inventory_bp.route('/batches/<uuid:batch_id>', methods=['PUT'])
@jwt_required_with_role('admin')
def update_batch(batch_id):
    """Update batch details (admin only)"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        actor = get_user_identity_details(user_id)

        allowed_fields = ['batch_no', 'batch_code', 'notes']
        updates = []
        params = []

        for field in allowed_fields:
            if field in data:
                updates.append(f"{field} = %s")
                params.append(data[field])

        if not updates:
            return jsonify({'error': 'No valid fields to update'}), 400

        updates.append("updated_at = NOW()")
        params.append(str(batch_id))

        query = f"UPDATE batches SET {', '.join(updates)} WHERE id = %s"
        execute_query(query, params, fetch_all=False)

        # Audit log
        execute_query("""
            INSERT INTO audit_logs (
                user_id, action_type, entity_type, entity_id,
                description, created_at
            ) VALUES (%s, 'UPDATE_BATCH', 'BATCH', %s, %s, NOW())
        """, (
            user_id,
            str(batch_id),
            f"{actor['name']} ({actor['role']}) updated batch fields: {', '.join(allowed_fields)}"
        ), fetch_all=False)

        return jsonify({'message': 'Batch updated successfully'}), 200
    except Exception as e:
        return jsonify({'error': 'Failed to update batch', 'details': str(e)}), 500

@inventory_bp.route('/rolls/<uuid:roll_id>', methods=['PUT'])
@jwt_required_with_role('admin')
def update_roll(roll_id):
    """Update roll details (admin only)"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        actor = get_user_identity_details(user_id)

        length_meters = data.get('length_meters')
        status = data.get('status')
        create_transaction = data.get('create_transaction', False)

        # Get the current roll data before update
        current_roll = execute_query("""
            SELECT r.*, b.batch_code, b.batch_no
            FROM rolls r
            JOIN batches b ON r.batch_id = b.id
            WHERE r.id = %s
        """, (str(roll_id),))

        if not current_roll:
            return jsonify({'error': 'Roll not found'}), 404

        current_roll = current_roll[0]
        old_status = current_roll['status']
        old_length = current_roll['length_meters']

        updates = []
        params = []

        if length_meters is not None:
            updates.append("length_meters = %s")
            params.append(float(length_meters))

        if status and status in ['AVAILABLE', 'PARTIAL', 'SOLD_OUT']:
            updates.append("status = %s")
            params.append(status)

        if not updates:
            return jsonify({'error': 'No valid fields to update'}), 400

        updates.append("updated_at = NOW()")
        params.append(str(roll_id))

        query = f"UPDATE rolls SET {', '.join(updates)} WHERE id = %s"
        execute_query(query, params, fetch_all=False)

        # Update batch current_quantity
        execute_query("""
            UPDATE batches b
            SET current_quantity = (
                SELECT COALESCE(SUM(length_meters), 0)
                FROM rolls
                WHERE batch_id = b.id AND deleted_at IS NULL
            ),
            updated_at = NOW()
            WHERE id = (
                SELECT batch_id FROM rolls WHERE id = %s
            )
        """, (str(roll_id),), fetch_all=False)

        # Create transaction if status changed to SOLD_OUT
        if create_transaction and status == 'SOLD_OUT' and old_status != 'SOLD_OUT':
            quantity_change = -(float(length_meters) if length_meters is not None else old_length)

            execute_query("""
                INSERT INTO transactions (
                    batch_id, transaction_type, quantity_change,
                    transaction_date, notes, created_by, created_at, updated_at
                ) VALUES (
                    %s, 'SALE', %s, NOW(), %s, %s, NOW(), NOW()
                )
            """, (
                str(current_roll['batch_id']),
                quantity_change,
                f"Roll marked as SOLD_OUT by {actor['name']} ({actor['role']})",
                user_id
            ), fetch_all=False)

        # Audit log
        log_description = f"{actor['name']} ({actor['role']}) updated roll"
        if old_status != status:
            log_description += f" (status: {old_status} → {status})"
        if length_meters is not None and old_length != length_meters:
            log_description += f" (length: {old_length} → {length_meters}m)"
        if create_transaction and status == 'SOLD_OUT':
            log_description += " [Transaction created]"

        execute_query("""
            INSERT INTO audit_logs (
                user_id, action_type, entity_type, entity_id,
                description, created_at
            ) VALUES (%s, 'UPDATE_ROLL', 'ROLL', %s, %s, NOW())
        """, (
            user_id,
            str(roll_id),
            log_description
        ), fetch_all=False)

        return jsonify({'message': 'Roll updated successfully'}), 200
    except Exception as e:
        return jsonify({'error': 'Failed to update roll', 'details': str(e)}), 500

@inventory_bp.route('/customers', methods=['GET', 'OPTIONS'])
@jwt_required()
def get_customers():
    """Get all customers"""
    try:
        query = "SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY name"
        customers = execute_query(query)
        return jsonify(customers), 200
    except Exception as e:
        return jsonify({'error': 'Failed to fetch customers', 'details': str(e)}), 500

@inventory_bp.route('/search', methods=['POST', 'OPTIONS'])
def search_inventory():
    """Search for available rolls by product type, brand, and parameters"""
    # Allow OPTIONS without authentication for CORS preflight
    if request.method == 'OPTIONS':
        return jsonify({}), 200

    # Require JWT for actual request
    from flask_jwt_extended import verify_jwt_in_request
    verify_jwt_in_request()

    try:
        data = request.json or {}
        product_type_id = data.get('product_type_id')
        brand_id = data.get('brand_id')
        parameters = data.get('parameters', {})

        # Return empty if no product_type_id
        if not product_type_id:
            return jsonify([]), 200

        # Build query
        query = """
            SELECT
                r.id as roll_id,
                r.length_meters,
                r.status,
                r.roll_type,
                r.bundle_size,
                b.id as batch_id,
                b.batch_code,
                b.current_quantity,
                pv.id as product_variant_id,
                pv.parameters,
                pt.id as product_type_id,
                pt.name as product_type_name,
                br.id as brand_id,
                br.name as brand_name
            FROM rolls r
            JOIN batches b ON r.batch_id = b.id
            JOIN product_variants pv ON b.product_variant_id = pv.id
            JOIN product_types pt ON pv.product_type_id = pt.id
            JOIN brands br ON pv.brand_id = br.id
            WHERE r.deleted_at IS NULL
            AND b.deleted_at IS NULL
            AND r.status IN ('AVAILABLE', 'PARTIAL')
            AND r.length_meters > 0
            AND pt.id = %s
        """

        params = [product_type_id]

        # Optional: filter by brand
        if brand_id:
            query += " AND br.id = %s"
            params.append(brand_id)

        # Optional: filter by parameters if provided
        if parameters:
            for key, value in parameters.items():
                if value:
                    query += f" AND pv.parameters->>%s = %s"
                    params.extend([key, str(value)])

        query += " ORDER BY b.batch_code, r.length_meters DESC"

        rolls = execute_query(query, tuple(params))

        return jsonify(rolls), 200

    except Exception as e:
        return jsonify({'error': 'Failed to search inventory', 'details': str(e)}), 500

@inventory_bp.route('/product-variants/search', methods=['GET', 'OPTIONS'])
@jwt_required()
def search_product_variants():
    """Search product variants by batch code or parameters"""
    try:
        product_type_id = request.args.get('product_type_id')
        brand_id = request.args.get('brand_id')
        search = request.args.get('search', '').strip()

        if not product_type_id or not brand_id:
            return jsonify({'error': 'product_type_id and brand_id are required'}), 400

        if len(search) < 2:
            return jsonify([]), 200

        # Search in batches with matching product variants
        query = """
            SELECT DISTINCT
                pv.id as variant_id,
                pv.parameters,
                pt.name as product_type,
                br.name as brand,
                b.batch_code,
                b.current_quantity
            FROM product_variants pv
            JOIN product_types pt ON pv.product_type_id = pt.id
            JOIN brands br ON pv.brand_id = br.id
            LEFT JOIN batches b ON b.product_variant_id = pv.id AND b.deleted_at IS NULL
            WHERE pv.product_type_id = %s
            AND pv.brand_id = %s
            AND b.current_quantity > 0
            AND (
                b.batch_code ILIKE %s
                OR CAST(pv.parameters AS TEXT) ILIKE %s
            )
            ORDER BY b.batch_code
            LIMIT 10
        """

        search_pattern = f'%{search}%'
        variants = execute_query(query, (product_type_id, brand_id, search_pattern, search_pattern))

        return jsonify(variants), 200
    except Exception as e:
        return jsonify({'error': 'Failed to search variants', 'details': str(e)}), 500
