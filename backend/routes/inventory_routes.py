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
            pt.id as product_type_id,
            pt.name as product_type_name,
            br.id as brand_id,
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
            SELECT id, length_meters, initial_length_meters, status, is_cut_roll,
                   roll_type, bundle_size
            FROM rolls
            WHERE batch_id = %s AND deleted_at IS NULL
            ORDER BY roll_type, created_at
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

@inventory_bp.route('/batches/<uuid:batch_id>', methods=['PUT'])
@jwt_required_with_role('admin')
def update_batch(batch_id):
    """Update batch details (admin only)"""
    user_id = get_jwt_identity()
    data = request.get_json()

    allowed_fields = ['batch_no', 'batch_code', 'notes', 'location_id']
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
    """, (user_id, str(batch_id), f"Updated batch: {', '.join(allowed_fields)}"), fetch_all=False)

    return jsonify({'message': 'Batch updated successfully'}), 200

@inventory_bp.route('/batches/<uuid:batch_id>/qc', methods=['PUT'])
@jwt_required_with_role('admin')
def update_batch_qc(batch_id):
    """Update QC status for a batch"""
    user_id = get_jwt_identity()
    data = request.get_json()

    qc_status = data.get('qc_status')
    notes = data.get('notes', '')

    if qc_status not in ['PENDING', 'PASSED', 'FAILED']:
        return jsonify({'error': 'Invalid QC status'}), 400

    execute_query("""
        UPDATE batches
        SET qc_status = %s, notes = %s, updated_at = NOW()
        WHERE id = %s
    """, (qc_status, notes, str(batch_id)), fetch_all=False)

    # Audit log
    execute_query("""
        INSERT INTO audit_logs (
            user_id, action_type, entity_type, entity_id,
            description, created_at
        ) VALUES (%s, 'QC_CHECK', 'BATCH', %s, %s, NOW())
    """, (user_id, str(batch_id), f"QC Status changed to {qc_status}: {notes}"), fetch_all=False)

    return jsonify({'message': 'QC status updated successfully'}), 200

@inventory_bp.route('/rolls/<uuid:roll_id>', methods=['PUT'])
@jwt_required_with_role('admin')
def update_roll(roll_id):
    """Update roll details (admin only)"""
    user_id = get_jwt_identity()
    data = request.get_json()

    length_meters = data.get('length_meters')
    status = data.get('status')

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

    # Audit log
    execute_query("""
        INSERT INTO audit_logs (
            user_id, action_type, entity_type, entity_id,
            description, created_at
        ) VALUES (%s, 'UPDATE_ROLL', 'ROLL', %s, %s, NOW())
    """, (user_id, str(roll_id), f"Updated roll: length={length_meters}, status={status}"), fetch_all=False)

    return jsonify({'message': 'Roll updated successfully'}), 200

@inventory_bp.route('/customers', methods=['GET'])
@jwt_required()
def get_customers():
    """Get all customers"""
    query = "SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY name"
    customers = execute_query(query)
    return jsonify(customers), 200
