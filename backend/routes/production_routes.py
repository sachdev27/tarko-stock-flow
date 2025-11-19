from flask import Blueprint, request, jsonify, send_from_directory
from flask_jwt_extended import get_jwt_identity
from database import execute_insert, execute_query, get_db_cursor
from auth import jwt_required_with_role, get_user_identity_details
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

    # DEBUG: Log piece length extraction
    print(f"\n{'='*60}")
    print(f"🔍 PIECE LENGTH DEBUG")
    print(f"Form/JSON keys: {list(data.keys())}")
    print(f"length_per_roll: '{data.get('length_per_roll')}'")
    print(f"lengthPerRoll: '{data.get('lengthPerRoll')}'")
    print(f"{'='*60}\n")

    length_per_roll_input = float(data.get('length_per_roll') or data.get('lengthPerRoll') or 0)

    # Bundle/spare pipe data
    roll_config_type = data.get('roll_config_type', 'standard_rolls')
    quantity_based = data.get('quantity_based', 'false').lower() == 'true'
    number_of_bundles = int(data.get('number_of_bundles', 0))
    bundle_size = int(data.get('bundle_size', 10))
    spare_pipes = json.loads(data.get('spare_pipes', '[]')) if isinstance(data.get('spare_pipes'), str) else data.get('spare_pipes', [])

    # Weight tracking
    weight_per_meter = float(data.get('weight_per_meter')) if data.get('weight_per_meter') else None
    total_weight = float(data.get('total_weight')) if data.get('total_weight') else None

    # Calculate piece_length for quantity-based products (Sprinkler Pipe)
    piece_length_value = None
    if quantity_based and length_per_roll_input > 0:
        piece_length_value = length_per_roll_input
        print(f"📏 Sprinkler Pipe piece_length: {piece_length_value}m")
    elif quantity_based:
        print(f"⚠️  WARNING: Sprinkler Pipe missing piece length!")
        print(f"   - length_per_roll_input: {length_per_roll_input}")
        print(f"   - Received data keys: {list(data.keys())}")



    # Handle file upload
    attachment_url = None
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4()}_{filename}"
        filepath = os.path.join(UPLOAD_FOLDER, unique_filename)
        file.save(filepath)
        attachment_url = f"/api/production/attachment/{unique_filename}"

    actor = get_user_identity_details(user_id)

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
                batch_no, batch_code, product_variant_id,
                production_date, initial_quantity, current_quantity,
                notes, attachment_url, weight_per_meter, total_weight, piece_length,
                created_by, created_at, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
            RETURNING id, batch_code
        """, (batch_no, batch_code, variant_id, production_date,
              quantity, quantity, notes, attachment_url, weight_per_meter, total_weight,
              piece_length_value, user_id))

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
            # Create bundles - each bundle is a single inventory unit with bundle_size pieces
            if number_of_bundles > 0 and bundle_size > 0:
                total_spare_length = sum(float(pipe.get('length', 0)) for pipe in spare_pipes)
                bundled_total = quantity - total_spare_length

                # For quantity-based products (Sprinkler Pipe):
                # - length_meters in rolls = bundle_size (number of pieces)
                # - piece_length is stored in batches table
                # For length-based products (HDPE):
                # - length_meters = actual total length of bundle

                for _ in range(number_of_bundles):
                    if quantity_based:
                        # For Sprinkler: store piece count as length_meters
                        bundle_length = bundle_size
                    else:
                        # For HDPE: calculate actual length
                        bundle_length = length_per_roll_input * bundle_size if length_per_roll_input > 0 else bundled_total / number_of_bundles

                    cursor.execute("""
                        INSERT INTO rolls (
                            batch_id, product_variant_id, length_meters,
                            initial_length_meters, status, is_cut_roll, roll_type, bundle_size, created_at, updated_at
                        ) VALUES (%s, %s, %s, %s, 'AVAILABLE', FALSE, %s, %s, NOW(), NOW())
                    """, (batch_id, variant_id, bundle_length, bundle_length, f'bundle_{bundle_size}', bundle_size))
                    total_items += 1

            # Create spare pipes (not bundled)
            for spare_pipe in spare_pipes:
                pipe_length = float(spare_pipe.get('length', 0))
                if pipe_length > 0:
                    # For quantity-based products (Sprinkler): pipe_length is the count of pieces
                    # For length-based products (HDPE): pipe_length is the actual length in meters
                    if quantity_based:
                        actual_length = pipe_length  # Store the count of spare pieces
                        spare_count = int(pipe_length)
                    else:
                        actual_length = pipe_length  # Store the length in meters
                        spare_count = None

                    cursor.execute("""
                        INSERT INTO rolls (
                            batch_id, product_variant_id, length_meters,
                            initial_length_meters, status, is_cut_roll, roll_type, bundle_size, created_at, updated_at
                        ) VALUES (%s, %s, %s, %s, 'AVAILABLE', FALSE, 'spare', %s, NOW(), NOW())
                    """, (batch_id, variant_id, actual_length, actual_length, spare_count))
                    total_items += 1

        # Note: We don't create a transaction record for production
        # Production batches are shown directly from the batches table
        # Only SALE/DISPATCH operations create transaction records

        # Audit log
        actor_label = f"{actor['name']} ({actor['role']})"
        if roll_config_type == 'standard_rolls':
            log_msg = (
                f"{actor_label} created batch {batch_code} with {quantity} units "
                f"({number_of_rolls} standard rolls, {len(cut_rolls)} cut rolls)"
            )
        else:
            log_msg = (
                f"{actor_label} created batch {batch_code} with {quantity} units "
                f"({number_of_bundles} bundles of {bundle_size}, {len(spare_pipes)} spare pipes)"
            )

        cursor.execute("""
            INSERT INTO audit_logs (
                user_id, action_type, entity_type, entity_id,
                description, created_at
            ) VALUES (%s, 'CREATE_BATCH', 'BATCH', %s, %s, NOW())
        """, (user_id, batch_id, log_msg))

        # Capture roll snapshot for production transaction
        cursor.execute("""
            SELECT id, roll_type, length_meters, initial_length_meters,
                   is_cut_roll, bundle_size, status
            FROM rolls
            WHERE batch_id = %s AND deleted_at IS NULL
            ORDER BY created_at
        """, (batch_id,))

        rolls_at_production = cursor.fetchall()
        roll_snapshots = []

        for roll in rolls_at_production:
            roll_snapshots.append({
                'roll_id': str(roll['id']),
                'batch_id': str(batch_id),
                'roll_type': roll['roll_type'],
                'length_meters': float(roll['length_meters']),
                'initial_length_meters': float(roll['initial_length_meters']),
                'is_cut_roll': roll['is_cut_roll'],
                'bundle_size': roll['bundle_size'],
                'status': roll['status']
            })

        roll_snapshot_json = json.dumps({
            'rolls': roll_snapshots,
            'total_rolls': len(roll_snapshots)
        })

        # Create single batch-level production transaction with roll snapshot
        cursor.execute("""
            INSERT INTO transactions (
                batch_id, roll_id, transaction_type, quantity_change,
                transaction_date, customer_id, invoice_no, notes,
                roll_snapshot, created_by, created_at, updated_at
            ) VALUES (%s, NULL, %s, %s, %s, NULL, NULL, %s, %s, %s, NOW(), NOW())
        """, (batch_id, 'PRODUCTION', float(quantity),
              production_date or None, notes, roll_snapshot_json, user_id))

    return jsonify({
        'id': batch_id,
        'batch_code': batch['batch_code'],
        'message': 'Batch created successfully'
    }), 201

@production_bp.route('/attachment/<filename>', methods=['GET'])
def get_attachment(filename):
    """Serve uploaded batch attachments"""
    return send_from_directory(UPLOAD_FOLDER, filename)
