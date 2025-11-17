from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from database import get_db_cursor, execute_query
from auth import jwt_required_with_role

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
    quantity = float(data.get('quantity'))
    customer_id = data.get('customer_id')
    invoice_no = data.get('invoice_no')
    notes = data.get('notes', '')

    # Determine quantity change
    if transaction_type in ['PRODUCTION', 'RETURN', 'TRANSFER_IN']:
        quantity_change = quantity
    else:
        quantity_change = -quantity

    with get_db_cursor() as cursor:
        # Update roll if specified
        if roll_id:
            cursor.execute("SELECT length_meters, initial_length_meters FROM rolls WHERE id = %s", (roll_id,))
            roll = cursor.fetchone()

            new_length = roll['length_meters'] - quantity
            if new_length < 0:
                return jsonify({'error': 'Insufficient roll length'}), 400

            new_status = 'SOLD_OUT' if new_length <= 0 else ('PARTIAL' if new_length < roll['initial_length_meters'] else 'AVAILABLE')

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
        """, (user_id, f'{transaction_type}_TRANSACTION', txn['id'],
              f"{transaction_type} transaction: {quantity} units"))

    return jsonify({'id': txn['id'], 'message': 'Transaction recorded successfully'}), 201

@transaction_bp.route('/', methods=['GET'])
@jwt_required_with_role()
def get_transactions():
    """Get recent transactions"""
    query = """
        SELECT
            t.id, t.transaction_type, t.quantity_change, t.transaction_date,
            t.invoice_no, t.notes, t.created_at,
            b.batch_code,
            c.name as customer_name
        FROM transactions t
        JOIN batches b ON t.batch_id = b.id
        LEFT JOIN customers c ON t.customer_id = c.id
        WHERE t.deleted_at IS NULL
        ORDER BY t.created_at DESC
        LIMIT 50
    """

    transactions = execute_query(query)
    return jsonify(transactions), 200
