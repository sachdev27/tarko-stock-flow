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

        # Get product_variant_id from batch
        cursor.execute("SELECT product_variant_id FROM batches WHERE id = %s", (batch_id,))
        batch_data = cursor.fetchone()
        if not batch_data:
            return jsonify({'error': 'Batch not found'}), 404

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
        if not txn:
            return jsonify({'error': 'Failed to create transaction'}), 500

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
    # Get optional date range parameters from query string (in IST)
    start_date_ist = request.args.get('start_date')  # IST datetime string
    end_date_ist = request.args.get('end_date')  # IST datetime string

    # Build WHERE clause for date filtering
    date_filter = ""
    params = []

    if start_date_ist and end_date_ist:
        # Frontend sends IST datetime, database stores timezone-aware IST times
        # Need to add timezone info to match database format
        from datetime import datetime, timezone, timedelta

        # Parse IST datetime and add IST timezone (+05:30)
        ist_tz = timezone(timedelta(hours=5, minutes=30))
        start_naive = datetime.fromisoformat(start_date_ist.replace('Z', ''))
        end_naive = datetime.fromisoformat(end_date_ist.replace('Z', ''))

        # Add IST timezone to make them timezone-aware
        start_ist = start_naive.replace(tzinfo=ist_tz)
        end_ist = end_naive.replace(tzinfo=ist_tz)

        print(f"🔍 Backend Date Filter Debug:")
        print(f"  Received start_date: {start_date_ist}")
        print(f"  Received end_date: {end_date_ist}")
        print(f"  Parsed start (with TZ): {start_ist}")
        print(f"  Parsed end (with TZ): {end_ist}")

        date_filter = " AND t.created_at >= %s AND t.created_at <= %s"
        params = [start_ist, end_ist]

    query = f"""
        SELECT
            CONCAT('txn_', t.id) as id,
            t.dispatch_id,
            t.transaction_type,
            t.quantity_change,
            t.transaction_date,
            t.invoice_no,
            t.notes,
            t.created_at,
            t.roll_snapshot,
            b.batch_code,
            b.batch_no,
            b.initial_quantity,
            b.weight_per_meter,
            b.total_weight,
            b.piece_length,
            b.attachment_url,
            b.created_at as production_date,
            pt.name as product_type,
            pv.id as product_variant_id,
            pv.product_type_id,
            pv.brand_id,
            br.name as brand,
            pv.parameters,
            -- Handle both old single-roll and new multi-roll snapshot formats
            COALESCE(
                r.length_meters,
                (t.roll_snapshot->>'length_meters')::numeric,
                (t.roll_snapshot->'rolls'->0->>'length_meters')::numeric
            ) as roll_length_meters,
            COALESCE(
                r.initial_length_meters,
                (t.roll_snapshot->>'initial_length_meters')::numeric,
                (t.roll_snapshot->'rolls'->0->>'initial_length_meters')::numeric
            ) as roll_initial_length_meters,
            COALESCE(
                r.is_cut_roll,
                (t.roll_snapshot->>'is_cut_roll')::boolean,
                (t.roll_snapshot->'rolls'->0->>'is_cut_roll')::boolean
            ) as roll_is_cut,
            COALESCE(
                r.roll_type,
                t.roll_snapshot->>'roll_type',
                t.roll_snapshot->'rolls'->0->>'roll_type'
            ) as roll_type,
            COALESCE(
                r.bundle_size,
                (t.roll_snapshot->>'bundle_size')::integer,
                (t.roll_snapshot->'rolls'->0->>'bundle_size')::integer
            ) as roll_bundle_size,
            CASE WHEN r.length_meters IS NOT NULL AND b.weight_per_meter IS NOT NULL THEN (r.length_meters * b.weight_per_meter) ELSE NULL END as roll_weight,
            u_unit.abbreviation as unit_abbreviation,
            c.name as customer_name,
            u.email as created_by_email,
            u.username as created_by_username,
            u.full_name as created_by_name,
            rc.standard_rolls_count,
            rc.cut_rolls_count,
            rc.bundles_count,
            rc.spare_pieces_count,
            rc.avg_standard_roll_length,
            rc.bundle_size,
            rc.cut_rolls_details,
            rc.spare_pieces_details
        FROM transactions t
        JOIN batches b ON t.batch_id = b.id
        JOIN product_variants pv ON b.product_variant_id = pv.id
        JOIN product_types pt ON pv.product_type_id = pt.id
        JOIN brands br ON pv.brand_id = br.id
        LEFT JOIN rolls r ON t.roll_id = r.id  -- Include deleted rolls for historical transaction data
        LEFT JOIN units u_unit ON pt.unit_id = u_unit.id
        LEFT JOIN customers c ON t.customer_id = c.id
        LEFT JOIN users u ON t.created_by = u.id
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*) FILTER (WHERE is_cut_roll = FALSE AND (roll_type IS NULL OR roll_type = 'standard')) as standard_rolls_count,
                COUNT(*) FILTER (WHERE is_cut_roll = TRUE OR roll_type = 'cut') as cut_rolls_count,
                COUNT(*) FILTER (WHERE roll_type LIKE 'bundle_%%') as bundles_count,
                COUNT(*) FILTER (WHERE roll_type = 'spare') as spare_pieces_count,
                AVG(length_meters) FILTER (WHERE is_cut_roll = FALSE AND (roll_type IS NULL OR roll_type = 'standard')) as avg_standard_roll_length,
                MAX(bundle_size) FILTER (WHERE roll_type LIKE 'bundle_%%') as bundle_size,
                array_agg(length_meters ORDER BY length_meters DESC) FILTER (WHERE (is_cut_roll = TRUE OR roll_type = 'cut') AND roll_type != 'spare') as cut_rolls_details,
                array_agg(
                    CASE
                        WHEN bundle_size IS NOT NULL THEN bundle_size::numeric
                        ELSE length_meters
                    END ORDER BY created_at
                ) FILTER (WHERE roll_type = 'spare') as spare_pieces_details
            FROM rolls
            WHERE batch_id = b.id AND deleted_at IS NULL
        ) rc ON true
        WHERE t.deleted_at IS NULL{date_filter}
        ORDER BY t.created_at DESC
        LIMIT 1000
    """

    transactions = execute_query(query, tuple(params)) if params else execute_query(query)

    print(f"📊 Query Results:")
    print(f"  Transactions found (filtered): {len(transactions) if transactions else 0}")
    print(f"  Date filter applied: {bool(params)}")

    # Sort all records by creation date
    all_records = list(transactions) if transactions else []
    if all_records:
        all_records.sort(key=lambda x: x['created_at'], reverse=True)
        sample_ids = [r['id'] for r in all_records[:3]]
        print(f"  Sample IDs: {sample_ids}")
        # Debug: Check parameters
        if len(all_records) > 0:
            sample = all_records[0]
            print(f"  Sample parameters type: {type(sample.get('parameters'))}")
            print(f"  Sample parameters value: {sample.get('parameters')}")
            print(f"  Sample batch_code: {sample.get('batch_code')}")
            print(f"  Sample product_type: {sample.get('product_type')}")
            print(f"  Sample spare_pieces_count: {sample.get('spare_pieces_count')}")
            print(f"  Sample spare_pieces_details: {sample.get('spare_pieces_details')}")
            print(f"  Sample bundles_count: {sample.get('bundles_count')}")
            print(f"  Sample piece_length (from batches): {sample.get('piece_length')}")
            print(f"  Sample bundle_size: {sample.get('bundle_size')}")
            print(f"  Sample total_weight: {sample.get('total_weight')}")

    print(f"  Total records returned: {len(all_records)}")

    return jsonify(all_records), 200
