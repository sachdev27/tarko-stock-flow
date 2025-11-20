from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import execute_query, execute_insert, get_db_cursor
from auth import get_user_identity_details
from decimal import Decimal
import json

dispatch_bp = Blueprint('dispatch', __name__, url_prefix='/api/dispatch')

@dispatch_bp.route('/available-rolls', methods=['POST'])
@jwt_required()
def get_available_rolls():
    """
    Get available rolls/cut rolls for dispatch based on product selection.
    Request body: { product_type_id, brand_id, parameters }
    """
    # Cleanup any rolls with zero length before fetching
    # Exclude spare pieces and bundles which may have legitimate 0 length_meters
    # (for quantity-based products, piece count is stored in bundle_size, not length_meters)
    execute_query("""
        UPDATE rolls
        SET deleted_at = NOW(), status = 'SOLD_OUT'
        WHERE length_meters = 0
        AND roll_type NOT IN ('spare', 'bundle_10', 'bundle_20', 'bundle_50')
        AND roll_type NOT LIKE 'bundle_%%'
        AND deleted_at IS NULL
    """, params=None, fetch_all=False)

    data = request.json
    product_type_id = data.get('product_type_id')
    brand_id = data.get('brand_id')  # Optional for "All Brands"
    parameters = data.get('parameters', {})

    if not product_type_id:
        return jsonify({'error': 'product_type_id is required'}), 400

    # Find the product variant
    if brand_id:
        variant_query = """
            SELECT id, parameters
            FROM product_variants
            WHERE product_type_id = %s
            AND brand_id = %s
            AND deleted_at IS NULL
        """
        variants = execute_query(variant_query, (product_type_id, brand_id))
    else:
        # All brands - fetch all variants for this product type
        variant_query = """
            SELECT id, parameters
            FROM product_variants
            WHERE product_type_id = %s
            AND deleted_at IS NULL
        """
        variants = execute_query(variant_query, (product_type_id,))

    # Match parameters
    matching_variants = []

    # If no parameters provided (empty dict), match ALL variants
    if not parameters or parameters == {}:
        matching_variants = variants
    else:
        # Match exact parameters or partial match
        for variant in variants:
            variant_params = variant['parameters'] or {}
            # Check if all provided parameters match
            matches = all(
                variant_params.get(key) == value
                for key, value in parameters.items()
            )
            if matches:
                matching_variants.append(variant)

    if not matching_variants:
        return jsonify({'products': [], 'message': 'No matching product variant found'}), 200

    # Get all available rolls for matching variants
    variant_ids = [v['id'] for v in matching_variants]
    placeholders = ','.join(['%s'] * len(variant_ids))

    rolls_query = f"""
        SELECT
            r.id,
            r.batch_id,
            r.length_meters,
            r.initial_length_meters,
            r.status,
            r.is_cut_roll,
            r.roll_type,
            r.bundle_size,
            r.product_variant_id,
            b.batch_code,
            b.batch_no,
            pt.name as product_type,
            pt.roll_configuration,
            br.name as brand,
            pv.parameters
        FROM rolls r
        JOIN batches b ON r.batch_id = b.id
        JOIN product_variants pv ON r.product_variant_id = pv.id
        JOIN product_types pt ON pv.product_type_id = pt.id
        JOIN brands br ON pv.brand_id = br.id
        WHERE r.product_variant_id IN ({placeholders})
        AND r.deleted_at IS NULL
        AND r.status IN ('AVAILABLE', 'PARTIAL')
        AND r.length_meters > 0
        ORDER BY pv.parameters, r.roll_type, r.created_at
    """

    all_rolls = execute_query(rolls_query, tuple(variant_ids))

    # Group by product parameters (not variant_id) to merge across batches
    product_groups = {}  # key: product_label, value: {product_info, standard_rolls, cut_rolls}

    for roll in all_rolls:
        # Build product label: PRODUCT-PARAMS-BRAND
        params_str = ''
        if roll['parameters']:
            params_list = [str(v) for v in roll['parameters'].values()]
            params_str = '-'.join(params_list)

        product_label = f"{roll['product_type']}"
        if params_str:
            product_label += f"-{params_str}"
        product_label += f"-{roll['brand']}"

        # Initialize product group if not exists
        if product_label not in product_groups:
            product_groups[product_label] = {
                'product_label': product_label,
                'product_type': roll['product_type'],
                'brand': roll['brand'],
                'parameters': roll['parameters'],
                'standard_rolls': [],
                'cut_rolls': [],
                'bundles': [],
                'spares': [],
                'total_length': 0
            }

        roll_info = {
            'id': roll['id'],
            'batch_id': roll['batch_id'],
            'batch_code': roll['batch_code'],
            'batch_no': roll['batch_no'],
            'length_meters': float(roll['length_meters']),
            'initial_length_meters': float(roll['initial_length_meters']),
            'status': roll['status'],
            'roll_type': roll['roll_type'],
            'bundle_size': roll.get('bundle_size')
        }

        # Categorize rolls by type
        if roll['roll_type'] == 'spare':
            product_groups[product_label]['spares'].append(roll_info)
        elif roll['roll_type'] and roll['roll_type'].startswith('bundle_'):
            product_groups[product_label]['bundles'].append(roll_info)
        elif roll['is_cut_roll'] or roll['roll_type'] == 'cut':
            product_groups[product_label]['cut_rolls'].append(roll_info)
        else:
            product_groups[product_label]['standard_rolls'].append(roll_info)
            product_groups[product_label]['total_length'] += float(roll['length_meters'])

    # Convert to list format
    products = []
    for group in product_groups.values():
        products.append({
            'product_label': group['product_label'],
            'product_type': group['product_type'],
            'brand': group['brand'],
            'parameters': group['parameters'],
            'standard_rolls': group['standard_rolls'],
            'cut_rolls': group['cut_rolls'],
            'bundles': group['bundles'],
            'spares': group['spares'],
            'total_available_meters': group['total_length']
        })

    return jsonify({
        'products': products
    }), 200


@dispatch_bp.route('/cut-roll', methods=['POST'])
@jwt_required()
def cut_roll():
    """
    Cut a standard roll or cut roll into smaller cut rolls.
    Request body: {
        roll_id: UUID,
        cuts: [{ length: float }, { length: float }, ...]
    }
    """
    user_id = get_jwt_identity()
    data = request.json
    roll_id = data.get('roll_id')
    cuts = data.get('cuts', [])

    if not roll_id or not cuts:
        return jsonify({'error': 'roll_id and cuts are required'}), 400

    # Validate cuts
    total_cut_length = sum(float(cut['length']) for cut in cuts)

    try:
        with get_db_cursor() as cursor:
            # Get the roll details
            cursor.execute("""
                SELECT r.*, r.batch_id, pv.id as product_variant_id
                FROM rolls r
                JOIN batches b ON r.batch_id = b.id
                JOIN product_variants pv ON b.product_variant_id = pv.id
                WHERE r.id = %s AND r.deleted_at IS NULL
            """, (roll_id,))

            roll = cursor.fetchone()
            if not roll:
                return jsonify({'error': 'Roll not found'}), 404

            available_length = float(roll['length_meters'])

            if total_cut_length > available_length:
                return jsonify({'error': f'Total cut length ({total_cut_length}m) exceeds available length ({available_length}m)'}), 400

            # Create new cut rolls
            new_cut_rolls = []
            for cut in cuts:
                cut_length = float(cut['length'])
                cursor.execute("""
                    INSERT INTO rolls (
                        batch_id, product_variant_id, length_meters,
                        initial_length_meters, status, is_cut_roll, roll_type
                    )
                    VALUES (%s, %s, %s, %s, 'AVAILABLE', TRUE, 'cut')
                    RETURNING id, length_meters
                """, (
                    roll['batch_id'],
                    roll['product_variant_id'],
                    cut_length,
                    cut_length
                ))
                new_roll = cursor.fetchone()
                new_cut_rolls.append({
                    'id': new_roll['id'],
                    'length_meters': float(new_roll['length_meters'])
                })

            # Update original roll
            remaining_length = available_length - total_cut_length

            if remaining_length == 0:
                # Mark roll as deleted if fully cut
                cursor.execute("""
                    UPDATE rolls
                    SET length_meters = 0, status = 'SOLD_OUT', deleted_at = NOW(), updated_at = NOW()
                    WHERE id = %s
                """, (roll_id,))
            else:
                # Update roll with remaining length
                new_status = 'PARTIAL'
                cursor.execute("""
                    UPDATE rolls
                    SET length_meters = %s, status = %s, updated_at = NOW()
                    WHERE id = %s
                """, (remaining_length, new_status, roll_id))

            # Update batch quantity
            cursor.execute("""
                UPDATE batches
                SET current_quantity = (
                    SELECT COALESCE(SUM(length_meters), 0)
                    FROM rolls
                    WHERE batch_id = %s AND deleted_at IS NULL
                ),
                updated_at = NOW()
                WHERE id = %s
            """, (roll['batch_id'], roll['batch_id']))

            # Create CUT transaction
            cursor.execute("""
                INSERT INTO transactions (
                    batch_id, roll_id, transaction_type, quantity_change,
                    transaction_date, notes, created_by, created_at, updated_at
                ) VALUES (%s, %s, 'CUT', %s, NOW(), %s, %s, NOW(), NOW())
            """, (
                roll['batch_id'],
                roll_id,
                -total_cut_length,  # Negative because it's reducing the original roll
                f"Cut roll into {len(cuts)} pieces: {', '.join([str(c['length']) + 'm' for c in cuts])}",
                user_id
            ))

            # Create audit log
            actor = get_user_identity_details(user_id)
            cursor.execute("""
                INSERT INTO audit_logs (
                    user_id, action_type, entity_type, entity_id,
                    description, created_at
                ) VALUES (%s, 'CUT_ROLL', 'ROLL', %s, %s, NOW())
            """, (
                user_id,
                roll_id,
                f"{actor['name']} cut roll into {len(cuts)} pieces totaling {total_cut_length}m"
            ))

        return jsonify({
            'message': 'Roll cut successfully',
            'new_cut_rolls': new_cut_rolls,
            'original_roll_remaining': float(remaining_length)
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dispatch_bp.route('/cut-bundle', methods=['POST'])
@jwt_required()
def cut_bundle():
    """
    Cut a sprinkler bundle into spare pieces.
    Request body: {
        roll_id: UUID,
        cuts: [{ pieces: int }, { pieces: int }, ...]
    }
    """
    user_id = get_jwt_identity()
    data = request.json
    roll_id = data.get('roll_id')
    cuts = data.get('cuts', [])

    if not roll_id or not cuts:
        return jsonify({'error': 'roll_id and cuts are required'}), 400

    # Validate cuts
    total_cut_pieces = sum(int(cut['pieces']) for cut in cuts)

    try:
        with get_db_cursor() as cursor:
            # Get the bundle details
            cursor.execute("""
                SELECT r.*, r.batch_id, pv.id as product_variant_id, r.bundle_size
                FROM rolls r
                JOIN batches b ON r.batch_id = b.id
                JOIN product_variants pv ON b.product_variant_id = pv.id
                WHERE r.id = %s AND r.deleted_at IS NULL
            """, (roll_id,))

            bundle = cursor.fetchone()
            if not bundle:
                return jsonify({'error': 'Bundle not found'}), 404

            available_pieces = int(bundle['bundle_size'] or 0)

            if total_cut_pieces > available_pieces:
                return jsonify({'error': f'Total cut pieces ({total_cut_pieces}) exceeds available pieces ({available_pieces})'}), 400

            # Create new spare piece rolls
            new_spare_rolls = []
            for cut in cuts:
                pieces_count = int(cut['pieces'])
                cursor.execute("""
                    INSERT INTO rolls (
                        batch_id, product_variant_id, length_meters,
                        initial_length_meters, status, roll_type, bundle_size
                    )
                    VALUES (%s, %s, %s, %s, 'AVAILABLE', 'spare', %s)
                    RETURNING id, bundle_size
                """, (
                    bundle['batch_id'],
                    bundle['product_variant_id'],
                    pieces_count,  # length_meters stores the piece count for spares
                    pieces_count,  # initial_length_meters stores the piece count for spares
                    pieces_count
                ))
                new_roll = cursor.fetchone()
                new_spare_rolls.append({
                    'id': new_roll['id'],
                    'pieces': int(new_roll['bundle_size'])
                })

            # Delete the original bundle (mark as deleted)
            cursor.execute("""
                UPDATE rolls
                SET status = 'SOLD_OUT', deleted_at = NOW(), updated_at = NOW()
                WHERE id = %s
            """, (roll_id,))

            # Create CUT transaction
            cursor.execute("""
                INSERT INTO transactions (
                    batch_id, roll_id, transaction_type, quantity_change,
                    transaction_date, notes, created_by, created_at, updated_at
                ) VALUES (%s, %s, 'CUT', %s, NOW(), %s, %s, NOW(), NOW())
            """, (
                bundle['batch_id'],
                roll_id,
                -available_pieces,
                f"Cut bundle into {len(cuts)} spare batches: {', '.join([str(c['pieces']) + ' pcs' for c in cuts])}",
                user_id
            ))

            # Create audit log
            actor = get_user_identity_details(user_id)
            cursor.execute("""
                INSERT INTO audit_logs (
                    user_id, action_type, entity_type, entity_id,
                    description, created_at
                ) VALUES (%s, 'CUT_BUNDLE', 'ROLL', %s, %s, NOW())
            """, (
                user_id,
                roll_id,
                f"{actor['name']} cut bundle into {len(cuts)} spare batches totaling {total_cut_pieces} pieces"
            ))

        return jsonify({
            'message': 'Bundle cut successfully',
            'new_spare_rolls': new_spare_rolls
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dispatch_bp.route('/combine-spares', methods=['POST'])
@jwt_required()
def combine_spares():
    """
    Combine spare pieces into bundles.
    Request body: {
        spare_roll_ids: [UUID, ...],
        bundle_size: int,
        number_of_bundles: int (optional, defaults to 1)
    }
    """
    user_id = get_jwt_identity()
    data = request.json
    spare_roll_ids = data.get('spare_roll_ids', [])
    bundle_size = int(data.get('bundle_size', 0))
    number_of_bundles = int(data.get('number_of_bundles', 1))

    if not spare_roll_ids or bundle_size <= 0 or number_of_bundles <= 0:
        return jsonify({'error': 'spare_roll_ids, bundle_size, and number_of_bundles are required'}), 400

    try:
        with get_db_cursor() as cursor:
            # Get all spare rolls details
            placeholders = ','.join(['%s'] * len(spare_roll_ids))
            cursor.execute(f"""
                SELECT r.*, r.batch_id, pv.id as product_variant_id, r.bundle_size
                FROM rolls r
                JOIN batches b ON r.batch_id = b.id
                JOIN product_variants pv ON b.product_variant_id = pv.id
                WHERE r.id IN ({placeholders})
                AND r.deleted_at IS NULL
                AND r.roll_type = 'spare'
            """, tuple(spare_roll_ids))

            spares = cursor.fetchall()
            if len(spares) != len(spare_roll_ids):
                return jsonify({'error': 'Some spare rolls not found or are not spare type'}), 404

            # Verify all spares are from the same batch
            batch_ids = set(spare['batch_id'] for spare in spares)
            if len(batch_ids) > 1:
                return jsonify({'error': 'All spare rolls must be from the same batch'}), 400

            batch_id = spares[0]['batch_id']
            product_variant_id = spares[0]['product_variant_id']

            # Calculate total pieces
            total_pieces = sum(int(spare['bundle_size'] or 0) for spare in spares)

            total_pieces_needed = bundle_size * number_of_bundles

            if total_pieces_needed > total_pieces:
                return jsonify({'error': f'Total pieces needed ({total_pieces_needed}) exceeds available pieces ({total_pieces})'}), 400

            # Create multiple bundles
            new_bundle_ids = []
            for i in range(number_of_bundles):
                cursor.execute("""
                    INSERT INTO rolls (
                        batch_id, product_variant_id, length_meters,
                        initial_length_meters, status, roll_type, bundle_size
                    )
                    VALUES (%s, %s, %s, %s, 'AVAILABLE', %s, %s)
                    RETURNING id
                """, (
                    batch_id,
                    product_variant_id,
                    bundle_size,  # length_meters stores the piece count for bundles
                    bundle_size,  # initial_length_meters stores the piece count for bundles
                    f'bundle_{bundle_size}',
                    bundle_size
                ))
                new_bundle = cursor.fetchone()
                new_bundle_ids.append(new_bundle['id'])

            # Handle remaining pieces
            remaining_pieces = total_pieces - total_pieces_needed
            if remaining_pieces > 0:
                # Create a new spare roll with remaining pieces
                cursor.execute("""
                    INSERT INTO rolls (
                        batch_id, product_variant_id, length_meters,
                        initial_length_meters, status, roll_type, bundle_size
                    )
                    VALUES (%s, %s, %s, %s, 'AVAILABLE', 'spare', %s)
                    RETURNING id
                """, (
                    batch_id,
                    product_variant_id,
                    remaining_pieces,  # length_meters stores the piece count for spares
                    remaining_pieces,  # initial_length_meters stores the piece count for spares
                    remaining_pieces
                ))

            # Delete original spare rolls
            for spare_id in spare_roll_ids:
                cursor.execute("""
                    UPDATE rolls
                    SET status = 'SOLD_OUT', deleted_at = NOW(), updated_at = NOW()
                    WHERE id = %s
                """, (spare_id,))

            # Create ONE transaction for all bundles created
            cursor.execute("""
                INSERT INTO transactions (
                    batch_id, roll_id, transaction_type, quantity_change,
                    transaction_date, notes, created_by, created_at, updated_at
                ) VALUES (%s, %s, 'PRODUCTION', %s, NOW(), %s, %s, NOW(), NOW())
            """, (
                batch_id,
                new_bundle_ids[0],  # Reference the first bundle created
                total_pieces_needed,
                f"Combined {len(spare_roll_ids)} spare rolls ({total_pieces} pieces) into {number_of_bundles} bundle{'s' if number_of_bundles > 1 else ''} of {bundle_size} pieces each",
                user_id
            ))

            # Create audit log
            actor = get_user_identity_details(user_id)
            cursor.execute("""
                INSERT INTO audit_logs (
                    user_id, action_type, entity_type, entity_id,
                    description, created_at
                ) VALUES (%s, 'COMBINE_SPARES', 'ROLL', %s, %s, NOW())
            """, (
                user_id,
                new_bundle_ids[0],
                f"{actor['name']} combined {len(spare_roll_ids)} spare rolls into {number_of_bundles} bundle{'s' if number_of_bundles > 1 else ''} of {bundle_size} pieces each"
            ))

        return jsonify({
            'message': 'Spares combined successfully',
            'new_bundle_ids': new_bundle_ids,
            'number_of_bundles': number_of_bundles,
            'bundle_size': bundle_size,
            'remaining_pieces': remaining_pieces
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dispatch_bp.route('/create', methods=['POST'])
@jwt_required()
def create_dispatch():
    """
    Create a dispatch/sale transaction.
    Request body: {
        customer_id: UUID,
        invoice_number: string (optional),
        notes: string (optional),
        items: [
            {
                type: 'full_roll' | 'partial_roll',
                roll_id: UUID,
                quantity: float (for full rolls=1; for partial=length in meters)
            }
        ]
    }
    """
    user_id = get_jwt_identity()
    data = request.json

    customer_id = data.get('customer_id')
    invoice_number = data.get('invoice_number')
    notes = data.get('notes', '')
    items = data.get('items', [])
    transaction_date = data.get('transaction_date')  # Optional custom date

    if not customer_id or not items:
        return jsonify({'error': 'customer_id and items are required'}), 400

    try:
        with get_db_cursor() as cursor:
            # Generate a single dispatch_id for this dispatch
            cursor.execute("SELECT gen_random_uuid() as dispatch_id")
            dispatch_id = cursor.fetchone()['dispatch_id']

            total_quantity = 0
            roll_snapshots = []  # Store all rolls in this dispatch
            first_batch_id = None
            first_roll_id = None

            for item in items:
                roll_id = item.get('roll_id')
                dispatch_quantity = float(item.get('quantity', 0))
                item_type = item.get('type', 'full_roll')

                if not roll_id or dispatch_quantity <= 0:
                    return jsonify({'error': 'Invalid item data'}), 400

                # Get roll details with batch and product info
                cursor.execute("""
                    SELECT
                        r.*,
                        r.batch_id,
                        pv.id as product_variant_id,
                        b.batch_code,
                        b.batch_no,
                        pt.name as product_type_name,
                        br.name as brand_name,
                        pv.parameters
                    FROM rolls r
                    JOIN batches b ON r.batch_id = b.id
                    JOIN product_variants pv ON b.product_variant_id = pv.id
                    JOIN product_types pt ON pv.product_type_id = pt.id
                    JOIN brands br ON pv.brand_id = br.id
                    WHERE r.id = %s AND r.deleted_at IS NULL
                """, (roll_id,))

                roll = cursor.fetchone()
                if not roll:
                    return jsonify({'error': f'Roll {roll_id} not found'}), 404

                # Store first batch/roll for the transaction record
                if first_batch_id is None:
                    first_batch_id = roll['batch_id']
                    first_roll_id = roll_id

                available_length = float(roll['length_meters'])

                if item_type == 'full_roll':
                    # Dispatch entire roll
                    quantity_dispatched = available_length

                    # Soft delete roll (set deleted_at timestamp)
                    cursor.execute("""
                        UPDATE rolls
                        SET length_meters = 0, status = 'SOLD_OUT', deleted_at = NOW(), updated_at = NOW()
                        WHERE id = %s
                    """, (roll_id,))

                elif item_type == 'partial_roll':
                    # Dispatch partial quantity from roll
                    if dispatch_quantity > available_length:
                        return jsonify({'error': f'Insufficient quantity in roll {roll_id}'}), 400

                    quantity_dispatched = dispatch_quantity
                    remaining = available_length - dispatch_quantity

                    if remaining == 0:
                        # Soft delete roll when length reaches 0
                        cursor.execute("""
                            UPDATE rolls
                            SET length_meters = 0, status = 'SOLD_OUT', deleted_at = NOW(), updated_at = NOW()
                            WHERE id = %s
                        """, (roll_id,))
                    else:
                        # Update roll with remaining length
                        cursor.execute("""
                            UPDATE rolls
                            SET length_meters = %s, status = 'PARTIAL', updated_at = NOW()
                            WHERE id = %s
                        """, (remaining, roll_id))

                else:
                    return jsonify({'error': f'Invalid item type: {item_type}'}), 400

                # Collect roll snapshot for this roll with batch and product info
                roll_snapshots.append({
                    'roll_id': str(roll_id),
                    'batch_id': str(roll['batch_id']),
                    'batch_code': roll['batch_code'],
                    'batch_no': roll['batch_no'],
                    'product_type': roll['product_type_name'],
                    'brand': roll['brand_name'],
                    'parameters': roll['parameters'],
                    'quantity_dispatched': quantity_dispatched,
                    'length_meters': float(roll['length_meters']),
                    'initial_length_meters': float(roll['initial_length_meters']),
                    'is_cut_roll': roll.get('is_cut_roll', False),
                    'roll_type': roll.get('roll_type'),
                    'bundle_size': roll.get('bundle_size'),
                    'status': roll.get('status')
                })

                total_quantity += quantity_dispatched

            # Create ONE transaction for the entire dispatch
            # Store all rolls in roll_snapshot as an array
            if transaction_date:
                cursor.execute("""
                    INSERT INTO transactions (
                        batch_id, roll_id, transaction_type, quantity_change,
                        customer_id, invoice_no, notes, roll_snapshot, dispatch_id, created_by, transaction_date
                    )
                    VALUES (%s, %s, 'SALE', %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    first_batch_id,
                    first_roll_id,
                    -total_quantity,  # Negative for outgoing, total of all rolls
                    customer_id,
                    invoice_number,
                    notes,
                    json.dumps({'rolls': roll_snapshots, 'total_rolls': len(roll_snapshots)}),
                    dispatch_id,
                    user_id,
                    transaction_date
                ))
            else:
                cursor.execute("""
                    INSERT INTO transactions (
                        batch_id, roll_id, transaction_type, quantity_change,
                        customer_id, invoice_no, notes, roll_snapshot, dispatch_id, created_by
                    )
                    VALUES (%s, %s, 'SALE', %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    first_batch_id,
                    first_roll_id,
                    -total_quantity,  # Negative for outgoing, total of all rolls
                    customer_id,
                    invoice_number,
                    notes,
                    json.dumps({'rolls': roll_snapshots, 'total_rolls': len(roll_snapshots)}),
                    dispatch_id,
                    user_id
                ))

            transaction_id = cursor.fetchone()['id']

            # Update batch quantities for all affected batches
            roll_ids = [item['roll_id'] for item in items]
            placeholders = ','.join(['%s'] * len(roll_ids))
            cursor.execute(f"""
                SELECT DISTINCT b.id
                FROM rolls r
                JOIN batches b ON r.batch_id = b.id
                WHERE r.id IN ({placeholders})
            """, tuple(roll_ids))

            batch_ids = [row['id'] for row in cursor.fetchall()]

            for batch_id in batch_ids:
                cursor.execute("""
                    UPDATE batches
                    SET current_quantity = (
                        SELECT COALESCE(SUM(length_meters), 0)
                        FROM rolls
                        WHERE batch_id = %s AND deleted_at IS NULL
                    ),
                    updated_at = NOW()
                    WHERE id = %s
                """, (batch_id, batch_id))

            # Create audit log
            actor = get_user_identity_details(user_id)
            cursor.execute("""
                INSERT INTO audit_logs (
                    user_id, action_type, entity_type, entity_id,
                    description, created_at
                ) VALUES (%s, 'DISPATCH', 'TRANSACTION', %s, %s, NOW())
            """, (
                user_id,
                str(transaction_id),
                f"{actor['name']} dispatched {len(roll_snapshots)} roll(s) totaling {total_quantity}m to customer"
            ))

        return jsonify({
            'message': 'Dispatch created successfully',
            'transaction_id': str(transaction_id),
            'total_quantity': float(total_quantity),
            'rolls_count': len(roll_snapshots)
        }), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dispatch_bp.route('/products-summary', methods=['GET'])
@jwt_required()
def get_products_summary():
    """
    Get aggregated product inventory grouped by product category (type + brand + parameters).
    Returns total quantities and roll counts across all batches.
    """
    try:
        brand_id = request.args.get('brand_id')
        product_type_id = request.args.get('product_type_id')

        # Build WHERE clause based on filters
        where_conditions = ["pv.deleted_at IS NULL"]
        params = []

        if brand_id and brand_id != 'all':
            where_conditions.append("br.id = %s")
            params.append(brand_id)

        if product_type_id and product_type_id != 'all':
            where_conditions.append("pt.id = %s")
            params.append(product_type_id)

        where_clause = " AND ".join(where_conditions)

        # Query to aggregate rolls by product variant
        query = f"""
            SELECT
                pv.id as variant_id,
                pt.id as product_type_id,
                pt.name as product_type,
                pt.roll_configuration,
                br.id as brand_id,
                br.name as brand,
                pv.parameters,
                COUNT(CASE WHEN r.roll_type = 'standard' AND NOT r.is_cut_roll THEN 1 END) as standard_rolls_count,
                COUNT(CASE WHEN r.is_cut_roll THEN 1 END) as cut_rolls_count,
                COUNT(CASE WHEN r.roll_type LIKE 'bundle_%' THEN 1 END) as bundles_count,
                COUNT(CASE WHEN r.roll_type = 'spare' THEN 1 END) as spare_pieces_count,
                COALESCE(SUM(r.length_meters), 0) as total_quantity,
                COALESCE(AVG(CASE WHEN r.roll_type = 'standard' AND NOT r.is_cut_roll THEN r.length_meters END), 0) as avg_standard_length,
                COUNT(r.id) as total_items
            FROM product_variants pv
            JOIN product_types pt ON pv.product_type_id = pt.id
            JOIN brands br ON pv.brand_id = br.id
            LEFT JOIN rolls r ON r.product_variant_id = pv.id
                AND r.deleted_at IS NULL
                AND r.status IN ('AVAILABLE', 'PARTIAL')
                AND r.length_meters > 0
            WHERE {where_clause}
            GROUP BY pv.id, pt.id, pt.name, pt.roll_configuration, br.id, br.name, pv.parameters
            HAVING COUNT(r.id) > 0
            ORDER BY pt.name, br.name, pv.parameters
        """

        products = execute_query(query, tuple(params))

        result = []
        for product in products:
            result.append({
                'variant_id': str(product['variant_id']),
                'product_type_id': product['product_type_id'],
                'product_type': product['product_type'],
                'brand_id': product['brand_id'],
                'brand': product['brand'],
                'parameters': product['parameters'] or {},
                'roll_configuration': product['roll_configuration'] or {},
                'standard_rolls_count': int(product['standard_rolls_count'] or 0),
                'cut_rolls_count': int(product['cut_rolls_count'] or 0),
                'bundles_count': int(product['bundles_count'] or 0),
                'spare_pieces_count': int(product['spare_pieces_count'] or 0),
                'total_quantity': float(product['total_quantity'] or 0),
                'avg_standard_length': float(product['avg_standard_length'] or 0),
                'total_items': int(product['total_items'] or 0)
            })

        return jsonify({'products': result}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dispatch_bp.route('/product-rolls/<variant_id>', methods=['GET'])
@jwt_required()
def get_product_rolls(variant_id):
    """
    Get all available rolls for a specific product variant.
    Used when user selects a product category to dispatch.
    """
    try:
        query = """
            SELECT
                r.id,
                r.batch_id,
                r.length_meters,
                r.initial_length_meters,
                r.status,
                r.is_cut_roll,
                r.roll_type,
                r.bundle_size,
                b.batch_code,
                b.batch_no
            FROM rolls r
            JOIN batches b ON r.batch_id = b.id
            WHERE r.product_variant_id = %s
            AND r.deleted_at IS NULL
            AND r.status IN ('AVAILABLE', 'PARTIAL')
            AND r.length_meters > 0
            ORDER BY
                CASE WHEN r.roll_type = 'standard' THEN 1
                     WHEN r.is_cut_roll THEN 2
                     WHEN r.roll_type LIKE 'bundle_%' THEN 3
                     ELSE 4 END,
                r.length_meters DESC,
                r.created_at
        """

        rolls = execute_query(query, (variant_id,))

        # Separate by type
        standard_rolls = []
        cut_rolls = []
        bundles = []
        spares = []

        for roll in rolls:
            roll_data = {
                'id': str(roll['id']),
                'batch_id': str(roll['batch_id']),
                'batch_code': roll['batch_code'],
                'batch_no': roll['batch_no'],
                'length_meters': float(roll['length_meters']),
                'initial_length_meters': float(roll['initial_length_meters']),
                'status': roll['status'],
                'is_cut_roll': roll['is_cut_roll'],
                'roll_type': roll['roll_type'],
                'bundle_size': roll['bundle_size']
            }

            if roll['roll_type'] == 'standard' and not roll['is_cut_roll']:
                standard_rolls.append(roll_data)
            elif roll['is_cut_roll']:
                cut_rolls.append(roll_data)
            elif roll['roll_type'] and roll['roll_type'].startswith('bundle_'):
                bundles.append(roll_data)
            elif roll['roll_type'] == 'spare':
                spares.append(roll_data)

        return jsonify({
            'standard_rolls': standard_rolls,
            'cut_rolls': cut_rolls,
            'bundles': bundles,
            'spares': spares
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dispatch_bp.route('/dispatch-sale', methods=['POST'])
@jwt_required()
def dispatch_sale():
    """
    Create a dispatch sale with enhanced fields.
    Request body: {
        customer_id: UUID,
        bill_to_id: UUID (optional),
        transport_id: UUID (optional),
        vehicle_id: UUID (optional),
        invoice_number: string (optional),
        notes: string (optional),
        rolls: [
            {
                roll_id: UUID,
                quantity: float (length in meters or count)
            }
        ]
    }
    """
    user_id = get_jwt_identity()
    data = request.json

    customer_id = data.get('customer_id')
    bill_to_id = data.get('bill_to_id')
    transport_id = data.get('transport_id')
    vehicle_id = data.get('vehicle_id')
    invoice_number = data.get('invoice_number')
    notes = data.get('notes', '')
    rolls = data.get('rolls', [])

    if not customer_id:
        return jsonify({'error': 'customer_id is required'}), 400

    if not rolls or len(rolls) == 0:
        return jsonify({'error': 'At least one roll is required'}), 400

    try:
        with get_db_cursor() as cursor:
            # Generate dispatch_id
            cursor.execute("SELECT gen_random_uuid() as dispatch_id")
            dispatch_id = cursor.fetchone()['dispatch_id']

            total_quantity = 0
            roll_snapshots = []
            first_batch_id = None
            first_roll_id = None

            for roll_item in rolls:
                roll_id = roll_item.get('roll_id')
                dispatch_quantity = float(roll_item.get('quantity', 0))

                if not roll_id or dispatch_quantity <= 0:
                    return jsonify({'error': 'Invalid roll data'}), 400

                # Get roll details
                cursor.execute("""
                    SELECT
                        r.*,
                        r.batch_id,
                        pv.id as product_variant_id,
                        b.batch_code,
                        b.batch_no,
                        pt.name as product_type_name,
                        br.name as brand_name,
                        pv.parameters
                    FROM rolls r
                    JOIN batches b ON r.batch_id = b.id
                    JOIN product_variants pv ON b.product_variant_id = pv.id
                    JOIN product_types pt ON pv.product_type_id = pt.id
                    JOIN brands br ON pv.brand_id = br.id
                    WHERE r.id = %s AND r.deleted_at IS NULL
                """, (roll_id,))

                roll = cursor.fetchone()
                if not roll:
                    return jsonify({'error': f'Roll {roll_id} not found'}), 404

                if first_batch_id is None:
                    first_batch_id = roll['batch_id']
                    first_roll_id = roll_id

                available_length = float(roll['length_meters'])

                # Determine if full or partial dispatch
                if dispatch_quantity >= available_length:
                    # Full roll dispatch
                    quantity_dispatched = available_length
                    cursor.execute("""
                        UPDATE rolls
                        SET length_meters = 0, status = 'SOLD_OUT', deleted_at = NOW(), updated_at = NOW()
                        WHERE id = %s
                    """, (roll_id,))
                else:
                    # Partial dispatch
                    quantity_dispatched = dispatch_quantity
                    remaining = available_length - dispatch_quantity

                    if remaining == 0:
                        cursor.execute("""
                            UPDATE rolls
                            SET length_meters = 0, status = 'SOLD_OUT', deleted_at = NOW(), updated_at = NOW()
                            WHERE id = %s
                        """, (roll_id,))
                    else:
                        cursor.execute("""
                            UPDATE rolls
                            SET length_meters = %s, status = 'PARTIAL', updated_at = NOW()
                            WHERE id = %s
                        """, (remaining, roll_id))

                # Update batch quantity
                cursor.execute("""
                    UPDATE batches
                    SET current_quantity = current_quantity - %s, updated_at = NOW()
                    WHERE id = %s
                """, (quantity_dispatched, roll['batch_id']))

                # Create transaction record
                cursor.execute("""
                    INSERT INTO transactions (
                        batch_id,
                        roll_id,
                        transaction_type,
                        quantity_change,
                        customer_id,
                        bill_to_id,
                        transport_id,
                        vehicle_id,
                        invoice_no,
                        notes,
                        roll_snapshot,
                        dispatch_id,
                        created_by
                    )
                    VALUES (%s, %s, 'SALE', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    roll['batch_id'],
                    roll_id,
                    -quantity_dispatched,
                    customer_id,
                    bill_to_id,
                    transport_id,
                    vehicle_id,
                    invoice_number,
                    notes,
                    json.dumps({
                        'roll_id': str(roll_id),
                        'batch_code': roll['batch_code'],
                        'quantity': quantity_dispatched
                    }),
                    dispatch_id,
                    user_id
                ))

                total_quantity += quantity_dispatched

            return jsonify({
                'success': True,
                'dispatch_id': str(dispatch_id),
                'total_quantity': total_quantity,
                'rolls_dispatched': len(rolls)
            }), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500
