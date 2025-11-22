from flask import Blueprint, request, jsonify, send_from_directory
from flask_jwt_extended import get_jwt_identity
from database import execute_insert, execute_query, get_db_cursor
from auth import jwt_required_with_role, get_user_identity_details
from inventory_helpers_aggregate import AggregateInventoryHelper as InventoryHelper
from werkzeug.utils import secure_filename
import json
import os
import uuid
import psycopg2

production_bp = Blueprint('production', __name__, url_prefix='/api/production')

UPLOAD_FOLDER = 'uploads/batches'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@production_bp.route('/batch', methods=['POST'])
@jwt_required_with_role('user')
def create_batch():
    """Create a new production batch with rolls"""
    try:
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
        quantity = float(data.get('quantity') or data.get('initial_quantity') or 0)
        batch_no = data.get('batch_no')
        batch_code = data.get('batch_code')
        notes = data.get('notes', '')

        # Validate required fields
        if not product_type_id or not brand_id:
            return jsonify({'error': 'Product type and brand are required'}), 400

        if quantity <= 0:
            return jsonify({'error': 'Quantity must be greater than 0'}), 400

        # Handle number_of_rolls safely - can be None for sprinkler imports
        number_of_rolls_raw = data.get('number_of_rolls') or data.get('roll_length')
        number_of_rolls = int(number_of_rolls_raw) if number_of_rolls_raw not in (None, '', 'null') else 1
        cut_rolls = json.loads(data.get('cut_rolls', '[]')) if isinstance(data.get('cut_rolls'), str) else data.get('cut_rolls', [])

        length_per_roll_input = float(data.get('length_per_roll') or data.get('lengthPerRoll') or data.get('roll_length') or data.get('piece_length') or 0)

        # Bundle/spare pipe data
        roll_config_type = data.get('roll_config_type', 'standard_rolls')
        quantity_based = data.get('quantity_based', 'false').lower() == 'true'
        # Handle number_of_bundles safely - can be None
        number_of_bundles_raw = data.get('number_of_bundles')
        number_of_bundles = int(number_of_bundles_raw) if number_of_bundles_raw not in (None, '', 'null') else 0
        # Handle bundle_size/piece_length safely - default to 10 if both are None or empty
        bundle_size_raw = data.get('bundle_size') or data.get('piece_length')
        bundle_size = int(bundle_size_raw) if bundle_size_raw not in (None, '', 'null') else 10
        spare_pipes = json.loads(data.get('spare_pipes', '[]')) if isinstance(data.get('spare_pipes'), str) else data.get('spare_pipes', [])

        # For sprinkler pipes with bundles, recalculate quantity correctly
        # quantity should be: number_of_bundles × bundle_size (pieces)
        if quantity_based and roll_config_type == 'bundles' and number_of_bundles > 0 and bundle_size > 0:
            # Recalculate quantity as total pieces
            quantity = float(number_of_bundles * bundle_size)

        # Weight tracking - weight_per_meter in kg/m, total_weight in kg
        weight_per_meter_raw = data.get('weight_per_meter')
        if weight_per_meter_raw not in (None, '', 'null'):
            weight_per_meter = float(weight_per_meter_raw)
        else:
            weight_per_meter = None

        total_weight_raw = data.get('total_weight')
        total_weight = float(total_weight_raw) if total_weight_raw not in (None, '', 'null') else None

        # Calculate piece_length for quantity-based products (Sprinkler Pipe)
        piece_length_value = None
        if quantity_based and length_per_roll_input > 0:
            piece_length_value = length_per_roll_input

        # Calculate total_weight from weight_per_meter if provided
        # weight_per_meter is in kg/m, total_weight is in kg
        if weight_per_meter and not total_weight and quantity > 0:
            if quantity_based and piece_length_value:
                # For sprinkler pipes: weight (kg) = weight_per_meter (kg/m) × total_length (m)
                # total_length = quantity (pieces) × piece_length (meters/piece)
                total_length = quantity * piece_length_value
                total_weight = weight_per_meter * total_length
            else:
                # For HDPE rolls: weight (kg) = weight_per_meter (kg/m) × quantity (meters)
                total_weight = weight_per_meter * quantity


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
            # Normalize parameters JSON for consistent comparison
            param_json = json.dumps(parameters, sort_keys=True)# First, try to find existing variant
            cursor.execute("""
                SELECT id, parameters FROM product_variants
                WHERE product_type_id = %s
                AND brand_id = %s
                AND parameters = %s::jsonb
            """, (product_type_id, brand_id, param_json))

            variant = cursor.fetchone()

            if variant:
                variant_id = variant['id']
            else:
                # Create new variant
                cursor.execute("""
                    INSERT INTO product_variants (product_type_id, brand_id, parameters, created_at, updated_at)
                    VALUES (%s, %s, %s::jsonb, NOW(), NOW())
                    RETURNING id
                """, (product_type_id, brand_id, param_json))
                variant = cursor.fetchone()
                variant_id = variant['id']

            # Auto-generate batch_no and batch_code if not provided
            if not batch_no:
                cursor.execute("SELECT COALESCE(MAX(CAST(batch_no AS INTEGER)), 0) + 1 as next_no FROM batches WHERE batch_no ~ '^[0-9]+$'")
                result = cursor.fetchone()
                batch_no = str(result['next_no'])

            if not batch_code:
                # Get product type and brand names for batch code
                cursor.execute("""
                    SELECT pt.name as product_type, b.name as brand
                    FROM product_variants pv
                    JOIN product_types pt ON pv.product_type_id = pt.id
                    JOIN brands b ON pv.brand_id = b.id
                    WHERE pv.id = %s
                """, (variant_id,))
                names = cursor.fetchone()
                # Generate: PRODUCTTYPE-PARAMS-BRAND-YEAR-BATCHNO
                param_str = '-'.join([f"{k}{v}" for k, v in sorted(parameters.items())])
                year = production_date[:4] if production_date else '2025'
                batch_code = f"{names['product_type'].replace(' ', '')}-{param_str}-{names['brand']}-{year}-{batch_no.zfill(3)}"

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

            # Determine product category
            product_category = InventoryHelper.get_product_category(cursor, variant_id)

            total_items = 0

            # ==================================================
            # HDPE Product: Create rolls with length tracking
            # ==================================================
            if product_category == 'HDPE Pipe' and roll_config_type == 'standard_rolls':
                # Create standard rolls (aggregate)
                if number_of_rolls > 0:
                    # Calculate length for standard rolls only
                    total_cut_length = sum(float(roll.get('length', 0)) for roll in cut_rolls)
                    standard_total = quantity - total_cut_length
                    if standard_total > 0 and number_of_rolls > 0:
                        length_per_roll = standard_total / number_of_rolls
                        # Create aggregate stock entry for all full rolls
                        InventoryHelper.create_hdpe_stock(
                            cursor,
                            batch_id=batch_id,
                            product_variant_id=variant_id,
                            quantity=number_of_rolls,
                            length_per_roll=length_per_roll,
                            notes=f'{number_of_rolls} full rolls of {length_per_roll}m each'
                        )
                        total_items += number_of_rolls

                # Create cut rolls (aggregate with individual piece tracking)
                if cut_rolls:
                    # Create one CUT_ROLL stock entry
                    cut_stock_id = str(uuid.uuid4())
                    cursor.execute("""
                        INSERT INTO inventory_stock (
                            id, batch_id, product_variant_id, status, stock_type,
                            quantity, notes
                        ) VALUES (%s, %s, %s, 'IN_STOCK', 'CUT_ROLL', %s, %s)
                        RETURNING id
                    """, (cut_stock_id, batch_id, variant_id, len(cut_rolls),
                          f'{len(cut_rolls)} cut rolls from production'))

                    # Create production transaction first to get transaction_id
                    total_cut_length = sum(float(r.get('length', 0)) for r in cut_rolls)
                    cursor.execute("""
                        INSERT INTO inventory_transactions (
                            transaction_type, to_stock_id, to_quantity, batch_id, notes
                        ) VALUES ('PRODUCTION', %s, %s, %s, %s)
                        RETURNING id
                    """, (cut_stock_id, len(cut_rolls), batch_id,
                          f'Produced {len(cut_rolls)} cut rolls ({total_cut_length}m total)'))

                    production_txn_id = cursor.fetchone()['id']

                    # Add individual cut pieces with IMMUTABLE created_by_transaction_id
                    for cut_roll in cut_rolls:
                        roll_length = float(cut_roll.get('length', 0))
                        if roll_length > 0:
                            cursor.execute("""
                                INSERT INTO hdpe_cut_pieces (
                                    stock_id, length_meters, status, notes, created_by_transaction_id, original_stock_id
                                ) VALUES (%s, %s, 'IN_STOCK', %s, %s, %s)
                            """, (cut_stock_id, roll_length, f'Cut roll {roll_length}m from production', production_txn_id, cut_stock_id))
                            total_items += 1

            # ==================================================
            # SPRINKLER Product: Create bundles and spares
            # ==================================================
            elif product_category == 'Sprinkler Pipe' and roll_config_type == 'bundles':
                # piece_length from batch data (length of each individual pipe)
                piece_length_m = piece_length_value or length_per_roll_input or 6.0

                # Create bundles (aggregate)
                if number_of_bundles > 0 and bundle_size > 0:
                    InventoryHelper.create_sprinkler_bundle_stock(
                        cursor,
                        batch_id=batch_id,
                        product_variant_id=variant_id,
                        quantity=number_of_bundles,
                        pieces_per_bundle=bundle_size,
                        piece_length_meters=piece_length_m,
                        notes=f'{number_of_bundles} bundles of {bundle_size} pieces each'
                    )
                    total_items += number_of_bundles

                # Create spare pipes (aggregate with individual piece tracking)
                if spare_pipes:
                    # Collect all spare piece counts
                    spare_piece_counts = []
                    for spare_pipe in spare_pipes:
                        spare_count = int(spare_pipe.get('length', 1))  # 'length' field contains piece count
                        if spare_count > 0:
                            spare_piece_counts.append(spare_count)
                            total_items += 1

                    if spare_piece_counts:
                        InventoryHelper.create_sprinkler_spare_stock(
                            cursor,
                            batch_id=batch_id,
                            product_variant_id=variant_id,
                            spare_pieces=spare_piece_counts,
                            piece_length_meters=piece_length_m,
                            notes=f'{len(spare_piece_counts)} spare piece groups'
                        )


            # Ensure at least some stock was created
            if total_items == 0:
                raise ValueError('No stock items were created. Please check your roll/bundle configuration.')

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
                    f"({number_of_bundles} bundles of {bundle_size}, {len(spare_pipes)} spare piece groups)"
                )

            cursor.execute("""
                INSERT INTO audit_logs (
                    user_id, action_type, entity_type, entity_id,
                    description, created_at
                ) VALUES (%s, 'CREATE_BATCH', 'BATCH', %s, %s, NOW())
            """, (user_id, batch_id, log_msg))

            # Capture stock snapshot for production transaction
            cursor.execute("""
                SELECT
                    ist.id,
                    ist.stock_type,
                    ist.quantity,
                    ist.status,
                    ist.length_per_unit,
                    ist.pieces_per_bundle,
                    ist.piece_length_meters,
                    ssp.piece_count as spare_piece_count
                FROM inventory_stock ist
                LEFT JOIN sprinkler_spare_pieces ssp ON ist.id = ssp.stock_id
                WHERE ist.batch_id = %s
                ORDER BY ist.created_at
            """, (batch_id,))

            stock_at_production = cursor.fetchall()
            stock_snapshots = []

            for stock in stock_at_production:
                snapshot = {
                    'stock_id': str(stock['id']),
                    'batch_id': str(batch_id),
                    'stock_type': stock['stock_type'],
                    'quantity': int(stock['quantity']),
                    'status': stock['status'],
                    'length_per_unit': float(stock['length_per_unit']) if stock['length_per_unit'] else None,
                    'pieces_per_bundle': int(stock['pieces_per_bundle']) if stock['pieces_per_bundle'] else None,
                    'piece_length_meters': float(stock['piece_length_meters']) if stock['piece_length_meters'] else None
                }

                # Add actual piece count for spare pieces
                if stock['stock_type'] in ['SPARE', 'SPARE_PIECES'] and stock['spare_piece_count']:
                    snapshot['spare_piece_count'] = int(stock['spare_piece_count'])

                # Add cut piece lengths for HDPE cut rolls
                if stock['stock_type'] == 'CUT_ROLL':
                    cursor.execute("""
                        SELECT length_meters FROM hdpe_cut_pieces
                        WHERE stock_id = %s
                        ORDER BY created_at
                    """, (stock['id'],))
                    cut_pieces = cursor.fetchall()
                    if cut_pieces:
                        snapshot['cut_piece_lengths'] = [float(cp['length_meters']) for cp in cut_pieces]
                        # Calculate total length for cut rolls
                        total_cut_length = sum(float(cp['length_meters']) for cp in cut_pieces)
                        snapshot['total_cut_length'] = total_cut_length

                stock_snapshots.append(snapshot)

            stock_snapshot_json = json.dumps({
                'stock_entries': stock_snapshots,
                'total_stock_entries': len(stock_snapshots),
                'total_items': total_items
            })

            # Create single batch-level production transaction with stock snapshot
            cursor.execute("""
                INSERT INTO transactions (
                    batch_id, roll_id, transaction_type, quantity_change,
                    transaction_date, customer_id, invoice_no, notes,
                    roll_snapshot, created_by, created_at, updated_at
                ) VALUES (%s, NULL, %s, %s, %s, NULL, NULL, %s, %s, %s, NOW(), NOW())
            """, (batch_id, 'PRODUCTION', float(quantity),
                  production_date or None, notes, stock_snapshot_json, user_id))

        return jsonify({
            'id': batch_id,
            'batch_code': batch['batch_code'],
            'message': 'Batch created successfully'
        }), 201

    except psycopg2.errors.UniqueViolation as e:
        error_detail = str(e).split('DETAIL:')[1].strip() if 'DETAIL:' in str(e) else str(e)
        if 'batch_no' in str(e):
            return jsonify({'error': f'Batch number already exists. {error_detail}'}), 409
        elif 'batch_code' in str(e):
            return jsonify({'error': f'Batch code already exists. {error_detail}'}), 409
        else:
            return jsonify({'error': f'Duplicate entry: {error_detail}'}), 409
    except ValueError as e:
        return jsonify({'error': f'Invalid data format: {str(e)}'}), 400
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error creating batch: {error_trace}")
        return jsonify({'error': f'Failed to create batch: {str(e)}'}), 500

@production_bp.route('/attachment/<filename>', methods=['GET'])
def get_attachment(filename):
    """Serve uploaded batch attachments"""
    return send_from_directory(UPLOAD_FOLDER, filename)
