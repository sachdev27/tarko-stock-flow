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

        # Create rolls
        length_per_roll = quantity / number_of_rolls
        for i in range(number_of_rolls):
            cursor.execute("""
                INSERT INTO rolls (
                    batch_id, product_variant_id, length_meters,
                    initial_length_meters, status, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, 'AVAILABLE', NOW(), NOW())
            """, (batch_id, variant_id, length_per_roll, length_per_roll))

        # Create production transaction
        cursor.execute("""
            INSERT INTO transactions (
                batch_id, transaction_type, quantity_change,
                transaction_date, notes, created_by, created_at, updated_at
            ) VALUES (%s, 'PRODUCTION', %s, %s, %s, %s, NOW(), NOW())
        """, (batch_id, quantity, production_date, notes, user_id))

        # Audit log
        cursor.execute("""
            INSERT INTO audit_logs (
                user_id, action_type, entity_type, entity_id,
                description, created_at
            ) VALUES (%s, 'CREATE_BATCH', 'BATCH', %s, %s, NOW())
        """, (user_id, batch_id, f"Created batch {batch_code} with {quantity} units and {number_of_rolls} rolls"))

    return jsonify({
        'id': batch_id,
        'batch_code': batch['batch_code'],
        'message': 'Batch created successfully'
    }), 201

@production_bp.route('/attachment/<filename>', methods=['GET'])
def get_attachment(filename):
    """Serve uploaded batch attachments"""
    return send_from_directory(UPLOAD_FOLDER, filename)
