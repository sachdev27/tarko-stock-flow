from flask import Blueprint, request, jsonify, send_from_directory
from flask_jwt_extended import get_jwt_identity
from database import execute_insert, execute_query, get_db_cursor
from auth import jwt_required_with_role
from werkzeug.utils import secure_filename
import json
import os
import uuid

production_bp = Blueprint('production', __name__, url_prefix='/api/production')

UPLOAD_FOLDER = 'uploads/batches'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@production_bp.route('/batch', methods=['POST'])
@jwt_required_with_role('user')
def create_batch():
    """Create a new production batch with rolls"""
    user_id = get_jwt_identity()

    # Handle multipart/form-data for file upload
    if request.content_type and 'multipart/form-data' in request.content_type:
        data = request.form.to_dict()
        # Parse JSON fields
        if 'parameters' in data:
            data['parameters'] = json.loads(data['parameters'])
        file = request.files.get('attachment')
    else:
        data = request.get_json()
        file = None

    # Extract data
    location_id = data.get('location_id')
    product_type_id = data.get('product_type_id')
    brand_id = data.get('brand_id')
    parameters = data.get('parameters', {})
    production_date = data.get('production_date')
    quantity = float(data.get('quantity'))
    batch_no = data.get('batch_no')
    batch_code = data.get('batch_code')
    notes = data.get('notes', '')
    number_of_rolls = int(data.get('number_of_rolls', 1))
    cut_rolls = json.loads(data.get('cut_rolls', '[]')) if isinstance(data.get('cut_rolls'), str) else data.get('cut_rolls', [])

    # Bundle/spare pipe data
    roll_config_type = data.get('roll_config_type', 'standard_rolls')
    number_of_bundles = int(data.get('number_of_bundles', 0))
    bundle_size = int(data.get('bundle_size', 10))
    spare_pipes = json.loads(data.get('spare_pipes', '[]')) if isinstance(data.get('spare_pipes'), str) else data.get('spare_pipes', [])

    # Handle file upload
    attachment_url = None
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4()}_{filename}"
        filepath = os.path.join(UPLOAD_FOLDER, unique_filename)
        file.save(filepath)
        attachment_url = f"/api/production/attachment/{unique_filename}"

    with get_db_cursor() as cursor:
        # Create or get product variant
        cursor.execute("""
            INSERT INTO product_variants (product_type_id, brand_id, parameters, created_at, updated_at)
            VALUES (%s, %s, %s, NOW(), NOW())
            ON CONFLICT DO NOTHING
            RETURNING id
        """, (product_type_id, brand_id, json.dumps(parameters)))

        variant = cursor.fetchone()
        if not variant:
            # Get existing variant
            cursor.execute("""
                SELECT id FROM product_variants
                WHERE product_type_id = %s AND brand_id = %s AND parameters::text = %s
            """, (product_type_id, brand_id, json.dumps(parameters)))
            variant = cursor.fetchone()

        variant_id = variant['id']

        # Create batch
        cursor.execute("""
            INSERT INTO batches (
                batch_no, batch_code, product_variant_id, location_id,
                production_date, initial_quantity, current_quantity,
                qc_status, notes, attachment_url, created_by, created_at, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'PENDING', %s, %s, %s, NOW(), NOW())
            RETURNING id, batch_code
        """, (batch_no, batch_code, variant_id, location_id, production_date,
              quantity, quantity, notes, attachment_url, user_id))

        batch = cursor.fetchone()
        batch_id = batch['id']

        total_items = 0

        if roll_config_type == 'standard_rolls':
            # Create standard rolls
            if number_of_rolls > 0:
                # Calculate length for standard rolls only
                total_cut_length = sum(float(roll.get('length', 0)) for roll in cut_rolls)
                standard_total = quantity - total_cut_length
                if standard_total > 0 and number_of_rolls > 0:
                    length_per_roll = standard_total / number_of_rolls
                    for i in range(number_of_rolls):
                        cursor.execute("""
                            INSERT INTO rolls (
                                batch_id, product_variant_id, length_meters,
                                initial_length_meters, status, is_cut_roll, roll_type, created_at, updated_at
                            ) VALUES (%s, %s, %s, %s, 'AVAILABLE', FALSE, 'standard', NOW(), NOW())
                        """, (batch_id, variant_id, length_per_roll, length_per_roll))
                        total_items += 1

            # Create cut rolls
            for cut_roll in cut_rolls:
                roll_length = float(cut_roll.get('length', 0))
                if roll_length > 0:
                    cursor.execute("""
                        INSERT INTO rolls (
                            batch_id, product_variant_id, length_meters,
                            initial_length_meters, status, is_cut_roll, roll_type, created_at, updated_at
                        ) VALUES (%s, %s, %s, %s, 'AVAILABLE', TRUE, 'cut', NOW(), NOW())
                    """, (batch_id, variant_id, roll_length, roll_length))
                    total_items += 1

        elif roll_config_type == 'bundles':
            # Create bundles - each bundle creates multiple rolls (pipes)
            if number_of_bundles > 0 and bundle_size > 0:
                # Calculate total bundled items
                total_spare_length = sum(float(pipe.get('length', 0)) for pipe in spare_pipes)
                bundled_total = quantity - total_spare_length
                length_per_pipe = bundled_total / (number_of_bundles * bundle_size) if (number_of_bundles * bundle_size) > 0 else 0

                for bundle_num in range(number_of_bundles):
                    for pipe_num in range(bundle_size):
                        cursor.execute("""
                            INSERT INTO rolls (
                                batch_id, product_variant_id, length_meters,
                                initial_length_meters, status, is_cut_roll, roll_type, bundle_size, created_at, updated_at
                            ) VALUES (%s, %s, %s, %s, 'AVAILABLE', FALSE, %s, %s, NOW(), NOW())
                        """, (batch_id, variant_id, length_per_pipe, length_per_pipe, f'bundle_{bundle_size}', bundle_size))
                        total_items += 1

            # Create spare pipes (not bundled)
            for spare_pipe in spare_pipes:
                pipe_length = float(spare_pipe.get('length', 0))
                if pipe_length > 0:
                    cursor.execute("""
                        INSERT INTO rolls (
                            batch_id, product_variant_id, length_meters,
                            initial_length_meters, status, is_cut_roll, roll_type, created_at, updated_at
                        ) VALUES (%s, %s, %s, %s, 'AVAILABLE', TRUE, 'spare', NOW(), NOW())
                    """, (batch_id, variant_id, pipe_length, pipe_length))
                    total_items += 1

        # Create production transaction
        cursor.execute("""
            INSERT INTO transactions (
                batch_id, transaction_type, quantity_change,
                transaction_date, notes, created_by, created_at, updated_at
            ) VALUES (%s, 'PRODUCTION', %s, %s, %s, %s, NOW(), NOW())
        """, (batch_id, quantity, production_date, notes, user_id))

        # Audit log
        if roll_config_type == 'standard_rolls':
            log_msg = f"Created batch {batch_code} with {quantity} units ({number_of_rolls} standard rolls, {len(cut_rolls)} cut rolls)"
        else:
            log_msg = f"Created batch {batch_code} with {quantity} units ({number_of_bundles} bundles of {bundle_size}, {len(spare_pipes)} spare pipes)"

        cursor.execute("""
            INSERT INTO audit_logs (
                user_id, action_type, entity_type, entity_id,
                description, created_at
            ) VALUES (%s, 'CREATE_BATCH', 'BATCH', %s, %s, NOW())
        """, (user_id, batch_id, log_msg))

    return jsonify({
        'id': batch_id,
        'batch_code': batch['batch_code'],
        'message': 'Batch created successfully'
    }), 201

@production_bp.route('/attachment/<filename>', methods=['GET'])
def get_attachment(filename):
    """Serve uploaded batch attachments"""
    return send_from_directory(UPLOAD_FOLDER, filename)
