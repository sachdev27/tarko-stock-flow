from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from database import get_db_cursor, execute_query
from auth import jwt_required_with_role, get_user_identity_details

transaction_bp = Blueprint('transaction', __name__, url_prefix='/api/transactions')

@transaction_bp.route('/', methods=['POST'])
@jwt_required_with_role('user')
def create_transaction():
    """Create a new transaction"""
    user_id = get_jwt_identity()
    data = request.get_json()

    transaction_type = data.get('transaction_type')
    batch_id = data.get('batch_id')
    roll_id = data.get('roll_id')
    quantity_change = data.get('quantity_change')
    customer_id = data.get('customer_id')
    invoice_no = data.get('invoice_no')
    notes = data.get('notes', '')

    # Validate required fields
    if not transaction_type or not batch_id:
        return jsonify({'error': 'Transaction type and batch ID are required'}), 400

    if quantity_change is None:
        return jsonify({'error': 'Quantity is required'}), 400

    try:
        quantity_change = float(quantity_change)
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid quantity value'}), 400

    # For roll operations, we need the absolute quantity
    quantity = abs(quantity_change)

    actor = get_user_identity_details(user_id)

    with get_db_cursor() as cursor:
        # Update roll if specified
        if roll_id:
            cursor.execute("SELECT length_meters, initial_length_meters FROM rolls WHERE id = %s", (roll_id,))
            roll = cursor.fetchone()

            # Convert Decimal to float for calculation
            current_length = float(roll['length_meters'])
            initial_length = float(roll['initial_length_meters'])

            new_length = current_length - quantity
            if new_length < 0:
                return jsonify({'error': 'Insufficient roll length'}), 400

            new_status = 'SOLD_OUT' if new_length <= 0 else ('PARTIAL' if new_length < initial_length else 'AVAILABLE')

            cursor.execute("""
                UPDATE rolls
                SET length_meters = %s, status = %s, updated_at = NOW()
                WHERE id = %s
            """, (new_length, new_status, roll_id))

        # Update batch quantity
        cursor.execute("""
            UPDATE batches
            SET current_quantity = current_quantity + %s, updated_at = NOW()
            WHERE id = %s
            RETURNING current_quantity
        """, (quantity_change, batch_id))

        new_batch_qty = cursor.fetchone()
        if new_batch_qty['current_quantity'] < 0:
            return jsonify({'error': 'Insufficient batch quantity'}), 400

        # Create transaction
        cursor.execute("""
            INSERT INTO transactions (
                batch_id, roll_id, transaction_type, quantity_change,
                transaction_date, customer_id, invoice_no, notes,
                created_by, created_at, updated_at
            ) VALUES (%s, %s, %s, %s, NOW(), %s, %s, %s, %s, NOW(), NOW())
            RETURNING id
        """, (batch_id, roll_id, transaction_type, quantity_change,
              customer_id, invoice_no, notes, user_id))

        txn = cursor.fetchone()

        # Audit log
        cursor.execute("""
            INSERT INTO audit_logs (
                user_id, action_type, entity_type, entity_id,
                description, created_at
            ) VALUES (%s, %s, 'TRANSACTION', %s, %s, NOW())
        """, (
            user_id,
            f'{transaction_type}_TRANSACTION',
            txn['id'],
            f"{actor['name']} ({actor['role']}) recorded {transaction_type.lower()} transaction: {quantity} units"
        ))

    return jsonify({'id': txn['id'], 'message': 'Transaction recorded successfully'}), 201

@transaction_bp.route('/', methods=['GET'])
@jwt_required_with_role()
def get_transactions():
    """Get comprehensive transaction history with product details"""
    query = """
        SELECT
            t.id,
            t.transaction_type,
            t.quantity_change,
            t.transaction_date,
            t.invoice_no,
            t.notes,
            t.created_at,
            b.batch_code,
            b.batch_no,
            b.initial_quantity,
            b.weight_per_meter,
            b.total_weight,
            b.created_at as production_date,
            pv.product_type,
            pv.brand,
            pv.parameters,
            ut.abbreviation as unit_abbreviation,
            c.name as customer_name,
            u.email as created_by_email,
            u.username as created_by_username,
            u.full_name as created_by_name
        FROM transactions t
        JOIN batches b ON t.batch_id = b.id
        JOIN product_variants pv ON b.product_variant_id = pv.id
        LEFT JOIN unit_types ut ON pv.unit_type_id = ut.id
        LEFT JOIN customers c ON t.customer_id = c.id
        LEFT JOIN users u ON t.created_by = u.id
        WHERE t.deleted_at IS NULL
        ORDER BY t.created_at DESC
        LIMIT 500
    """

    transactions = execute_query(query)

    # Also fetch production batches (not just transactions)
    production_query = """
        SELECT
            b.id,
            'PRODUCTION' as transaction_type,
            b.initial_quantity as quantity_change,
            b.created_at as transaction_date,
            NULL as invoice_no,
            NULL as notes,
            b.created_at,
            b.batch_code,
            b.batch_no,
            b.initial_quantity,
            b.weight_per_meter,
            b.total_weight,
            b.created_at as production_date,
            pv.product_type,
            pv.brand,
            pv.parameters,
            ut.abbreviation as unit_abbreviation,
            NULL as customer_name,
            u.email as created_by_email,
            u.username as created_by_username,
            u.full_name as created_by_name
        FROM batches b
        JOIN product_variants pv ON b.product_variant_id = pv.id
        LEFT JOIN unit_types ut ON pv.unit_type_id = ut.id
        LEFT JOIN users u ON b.created_by = u.id
        WHERE b.deleted_at IS NULL
        ORDER BY b.created_at DESC
        LIMIT 500
    """

    production_batches = execute_query(production_query)

    # Combine and sort all records
    all_records = transactions + production_batches
    all_records.sort(key=lambda x: x['created_at'], reverse=True)

    return jsonify(all_records), 200
