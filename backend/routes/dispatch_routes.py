from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import execute_query, execute_insert, get_db_cursor
from auth import get_user_identity_details
from decimal import Decimal

dispatch_bp = Blueprint('dispatch', __name__, url_prefix='/api/dispatch')

@dispatch_bp.route('/available-rolls', methods=['POST'])
@jwt_required()
def get_available_rolls():
    """
    Get available rolls/cut rolls for dispatch based on product selection.
    Request body: { product_type_id, brand_id, parameters }
    """
    data = request.json
    product_type_id = data.get('product_type_id')
    brand_id = data.get('brand_id')
    parameters = data.get('parameters', {})

    if not product_type_id or not brand_id:
        return jsonify({'error': 'product_type_id and brand_id are required'}), 400

    # Find the product variant
    variant_query = """
        SELECT id, parameters
        FROM product_variants
        WHERE product_type_id = %s
        AND brand_id = %s
        AND deleted_at IS NULL
    """
    variants = execute_query(variant_query, (product_type_id, brand_id))

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
        return jsonify({'rolls': [], 'cut_rolls': [], 'message': 'No matching product variant found'}), 200

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

    # Group by variant and separate into standard rolls and cut rolls
    variant_groups = {}  # key: variant_id, value: {variant_info, standard_rolls, cut_rolls}

    for roll in all_rolls:
        variant_id = roll['product_variant_id']

        if variant_id not in variant_groups:
            # Build product label: PRODUCT-PARAMS-BRAND-BATCHCODE
            params_str = ''
            if roll['parameters']:
                params_list = [str(v) for v in roll['parameters'].values()]
                params_str = '-'.join(params_list)

            product_label = f"{roll['product_type']}"
            if params_str:
                product_label += f"-{params_str}"
            product_label += f"-{roll['brand']}"

            variant_groups[variant_id] = {
                'product_label': product_label,
                'product_type': roll['product_type'],
                'brand': roll['brand'],
                'parameters': roll['parameters'],
                'standard_rolls': [],
                'cut_rolls': [],
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

        if roll['is_cut_roll'] or roll['roll_type'] == 'cut':
            variant_groups[variant_id]['cut_rolls'].append(roll_info)
        else:
            variant_groups[variant_id]['standard_rolls'].append(roll_info)
            variant_groups[variant_id]['total_length'] += float(roll['length_meters'])

    # Convert to list format
    products = []
    for group in variant_groups.values():
        products.append({
            'product_label': group['product_label'],
            'product_type': group['product_type'],
            'brand': group['brand'],
            'parameters': group['parameters'],
            'standard_rolls': group['standard_rolls'],
            'cut_rolls': group['cut_rolls'],
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
            new_status = 'SOLD_OUT' if remaining_length == 0 else 'PARTIAL'

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

    if not customer_id or not items:
        return jsonify({'error': 'customer_id and items are required'}), 400

    try:
        with get_db_cursor() as cursor:
            total_quantity = 0
            transactions = []

            for item in items:
                roll_id = item.get('roll_id')
                dispatch_quantity = float(item.get('quantity', 0))
                item_type = item.get('type', 'full_roll')

                if not roll_id or dispatch_quantity <= 0:
                    return jsonify({'error': 'Invalid item data'}), 400

                # Get roll details
                cursor.execute("""
                    SELECT r.*, r.batch_id, pv.id as product_variant_id
                    FROM rolls r
                    JOIN batches b ON r.batch_id = b.id
                    JOIN product_variants pv ON b.product_variant_id = pv.id
                    WHERE r.id = %s AND r.deleted_at IS NULL
                """, (roll_id,))

                roll = cursor.fetchone()
                if not roll:
                    return jsonify({'error': f'Roll {roll_id} not found'}), 404

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

                # Create transaction record
                cursor.execute("""
                    INSERT INTO transactions (
                        batch_id, roll_id, transaction_type, quantity_change,
                        customer_id, invoice_no, notes, created_by
                    )
                    VALUES (%s, %s, 'SALE', %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    roll['batch_id'],
                    roll_id,
                    -quantity_dispatched,  # Negative for outgoing
                    customer_id,
                    invoice_number,
                    notes,
                    user_id
                ))

                transaction_id = cursor.fetchone()['id']
                transactions.append(str(transaction_id))
                total_quantity += quantity_dispatched

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
                transactions[0] if transactions else None,
                f"{actor['name']} dispatched {total_quantity}m to customer"
            ))

        return jsonify({
            'message': 'Dispatch created successfully',
            'transaction_ids': transactions,
            'total_quantity': float(total_quantity)
        }), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500
