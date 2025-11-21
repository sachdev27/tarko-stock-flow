from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from database import get_db_cursor, execute_query
from auth import jwt_required_with_role, get_user_identity_details

transaction_bp = Blueprint('transactions', __name__, url_prefix='/api/transactions')

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

        date_filter = " AND t.created_at >= %s AND t.created_at <= %s"
        params = [start_ist, end_ist]

    # Query both transactions and inventory_transactions tables
    query = f"""
        -- Main batch-level transactions
        SELECT
            CONCAT('txn_', t.id) as id,
            t.dispatch_id,
            t.transaction_type::text,
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
            -- Extract roll information from roll_snapshot (supports both single roll and multi-roll formats)
            COALESCE(
                (t.roll_snapshot->>'length_meters')::numeric,
                (t.roll_snapshot->'rolls'->0->>'length_meters')::numeric
            ) as roll_length_meters,
            COALESCE(
                (t.roll_snapshot->>'initial_length_meters')::numeric,
                (t.roll_snapshot->'rolls'->0->>'initial_length_meters')::numeric
            ) as roll_initial_length_meters,
            COALESCE(
                (t.roll_snapshot->>'is_cut_roll')::boolean,
                (t.roll_snapshot->'rolls'->0->>'is_cut_roll')::boolean,
                FALSE
            ) as roll_is_cut,
            COALESCE(
                t.roll_snapshot->>'roll_type',
                t.roll_snapshot->'rolls'->0->>'roll_type'
            ) as roll_type,
            COALESCE(
                (t.roll_snapshot->>'bundle_size')::integer,
                (t.roll_snapshot->'rolls'->0->>'bundle_size')::integer
            ) as roll_bundle_size,
            NULL as roll_weight,
            u_unit.abbreviation as unit_abbreviation,
            c.name as customer_name,
            u.email as created_by_email,
            u.username as created_by_username,
            u.full_name as created_by_name,
            -- Extract production breakdown from roll_snapshot or batch data
            NULL::bigint as standard_rolls_count,
            NULL::bigint as cut_rolls_count,
            NULL::bigint as bundles_count,
            NULL::bigint as spare_pieces_count,
            NULL::numeric as avg_standard_roll_length,
            NULL::integer as bundle_size,
            NULL::numeric[] as cut_rolls_details,
            NULL::numeric[] as spare_pieces_details
        FROM transactions t
        JOIN batches b ON t.batch_id = b.id
        JOIN product_variants pv ON b.product_variant_id = pv.id
        JOIN product_types pt ON pv.product_type_id = pt.id
        JOIN brands br ON pv.brand_id = br.id
        LEFT JOIN units u_unit ON pt.unit_id = u_unit.id
        LEFT JOIN customers c ON t.customer_id = c.id
        LEFT JOIN users u ON t.created_by = u.id
        WHERE t.deleted_at IS NULL{date_filter}

        UNION ALL

        -- Stock-level inventory transactions (cut rolls, cut bundles, combine bundles)
        SELECT
            CONCAT('inv_', it.id) as id,
            NULL as dispatch_id,
            it.transaction_type::text,
            COALESCE(it.to_quantity, 0) - COALESCE(it.from_quantity, 0) as quantity_change,
            it.created_at as transaction_date,
            NULL as invoice_no,
            it.notes,
            it.created_at,
            -- Build roll_snapshot with cut piece information for CUT_ROLL transactions
            -- and bundle info for SPLIT_BUNDLE transactions
            CASE
                WHEN it.transaction_type = 'CUT_ROLL' THEN
                    jsonb_build_object(
                        'stock_entries',
                        jsonb_build_array(
                            jsonb_build_object(
                                'stock_type', 'CUT_ROLL',
                                'quantity', COALESCE(it.to_quantity, 0),
                                'cut_piece_lengths', COALESCE(
                                    (SELECT jsonb_agg(hcp.length_meters ORDER BY hcp.created_at)
                                     FROM hdpe_cut_pieces hcp
                                     WHERE hcp.stock_id = it.to_stock_id
                                     AND hcp.created_at >= it.created_at
                                     AND hcp.created_at < it.created_at + interval '1 second'),
                                    '[]'::jsonb
                                ),
                                'total_cut_length', COALESCE(
                                    (SELECT SUM(hcp.length_meters)
                                     FROM hdpe_cut_pieces hcp
                                     WHERE hcp.stock_id = it.to_stock_id
                                     AND hcp.created_at >= it.created_at
                                     AND hcp.created_at < it.created_at + interval '1 second'),
                                    0
                                )
                            )
                        )
                    )
                WHEN it.transaction_type = 'SPLIT_BUNDLE' THEN
                    jsonb_build_object(
                        'stock_entries',
                        jsonb_build_array(
                            jsonb_build_object(
                                'stock_type', 'SPLIT_BUNDLE',
                                'from_bundle_size', ist_from.pieces_per_bundle,
                                'piece_length', COALESCE(ist_from.piece_length_meters, b.piece_length),
                                'spare_groups', it.to_quantity
                            )
                        )
                    )
                ELSE NULL
            END as roll_snapshot,
            b.batch_code,
            b.batch_no,
            b.initial_quantity,
            b.weight_per_meter,
            -- For CUT_ROLL, calculate weight based on cut pieces only, not batch total
            CASE
                WHEN it.transaction_type = 'CUT_ROLL' THEN
                    (SELECT SUM(hcp.length_meters) * b.weight_per_meter
                     FROM hdpe_cut_pieces hcp
                     WHERE hcp.stock_id = it.to_stock_id
                     AND hcp.created_at >= it.created_at
                     AND hcp.created_at < it.created_at + interval '1 second')
                ELSE b.total_weight
            END as total_weight,
            b.piece_length,
            b.attachment_url,
            b.created_at as production_date,
            pt.name as product_type,
            pv.id as product_variant_id,
            pv.product_type_id,
            pv.brand_id,
            br.name as brand,
            pv.parameters,
            -- For CUT_ROLL, show total cut length in meters
            CASE
                WHEN it.transaction_type = 'CUT_ROLL' THEN
                    (SELECT SUM(hcp.length_meters)
                     FROM hdpe_cut_pieces hcp
                     WHERE hcp.stock_id = it.to_stock_id
                     AND hcp.created_at >= it.created_at
                     AND hcp.created_at < it.created_at + interval '1 second')
                ELSE NULL
            END as roll_length_meters,
            NULL as roll_initial_length_meters,
            FALSE as roll_is_cut,
            NULL as roll_type,
            NULL as roll_bundle_size,
            NULL as roll_weight,
            u_unit.abbreviation as unit_abbreviation,
            NULL as customer_name,
            NULL as created_by_email,
            NULL as created_by_username,
            NULL as created_by_name,
            NULL::bigint as standard_rolls_count,
            NULL::bigint as cut_rolls_count,
            NULL::bigint as bundles_count,
            NULL::bigint as spare_pieces_count,
            NULL::numeric as avg_standard_roll_length,
            NULL::integer as bundle_size,
            NULL::numeric[] as cut_rolls_details,
            NULL::numeric[] as spare_pieces_details
        FROM inventory_transactions it
        LEFT JOIN inventory_stock ist_to ON it.to_stock_id = ist_to.id
        LEFT JOIN inventory_stock ist_from ON it.from_stock_id = ist_from.id
        LEFT JOIN batches b ON COALESCE(ist_to.batch_id, ist_from.batch_id) = b.id
        LEFT JOIN product_variants pv ON b.product_variant_id = pv.id
        LEFT JOIN product_types pt ON pv.product_type_id = pt.id
        LEFT JOIN brands br ON pv.brand_id = br.id
        LEFT JOIN units u_unit ON pt.unit_id = u_unit.id
        WHERE it.transaction_type IN ('CUT_ROLL', 'SPLIT_BUNDLE', 'COMBINE_SPARES')

        ORDER BY transaction_date DESC
        LIMIT 1000
    """

    transactions = execute_query(query, tuple(params)) if params else execute_query(query)

    # Sort all records by transaction date
    all_records = list(transactions) if transactions else []
    if all_records:
        all_records.sort(key=lambda x: x['transaction_date'], reverse=True)
        sample_ids = [r['id'] for r in all_records[:3]]

    return jsonify(all_records), 200


@transaction_bp.route('/revert', methods=['POST'])
@jwt_required_with_role('user')
def revert_transactions():
    """Revert one or more transactions"""
    user_id = get_jwt_identity()
    data = request.get_json()

    transaction_ids = data.get('transaction_ids', [])

    if not transaction_ids or not isinstance(transaction_ids, list):
        return jsonify({'error': 'transaction_ids array is required'}), 400

    actor = get_user_identity_details(user_id)
    reverted_count = 0
    failed_transactions = []

    with get_db_cursor() as cursor:
        for transaction_id in transaction_ids:
            try:
                # Strip 'txn_' prefix if present (frontend adds this prefix)
                clean_id = transaction_id.replace('txn_', '') if transaction_id.startswith('txn_') else transaction_id

                # Get transaction details
                cursor.execute("""
                    SELECT t.*, b.product_variant_id, b.current_quantity as batch_current_quantity,
                           r.id as roll_id, r.length_meters as roll_length, r.status as roll_status,
                           r.deleted_at as roll_deleted_at, pv.product_type_id,
                           pt.name as product_type_name
                    FROM transactions t
                    JOIN batches b ON t.batch_id = b.id
                    JOIN product_variants pv ON b.product_variant_id = pv.id
                    JOIN product_types pt ON pv.product_type_id = pt.id
                    LEFT JOIN rolls r ON t.roll_id = r.id
                    WHERE t.id = %s AND t.deleted_at IS NULL
                """, (clean_id,))

                transaction = cursor.fetchone()

                if not transaction:
                    failed_transactions.append({'id': transaction_id, 'error': 'Transaction not found'})
                    continue

                # Calculate revert quantity (opposite of original change)
                revert_quantity = -float(transaction['quantity_change'])

                # Update batch quantity
                cursor.execute("""
                    UPDATE batches
                    SET current_quantity = current_quantity + %s,
                        updated_at = NOW()
                    WHERE id = %s
                    RETURNING current_quantity
                """, (revert_quantity, transaction['batch_id']))

                new_batch_qty = cursor.fetchone()# Handle PRODUCTION transaction reversal - delete the rolls that were created
                if transaction['transaction_type'] == 'PRODUCTION':# Find all rolls created for this batch around the transaction time
                    cursor.execute("""
                        SELECT id, roll_type, bundle_size, length_meters
                        FROM rolls
                        WHERE batch_id = %s
                        AND deleted_at IS NULL
                        AND created_at >= %s - INTERVAL '1 minute'
                        AND created_at <= %s + INTERVAL '1 minute'
                    """, (transaction['batch_id'], transaction['created_at'], transaction['created_at']))

                    rolls_to_delete = cursor.fetchall()

                    for roll in rolls_to_delete:
                        cursor.execute("""
                            UPDATE rolls
                            SET deleted_at = NOW()
                            WHERE id = %s
                        """, (roll['id'],))

                # Handle CUT transaction reversal - restore the original roll and delete cut pieces
                elif transaction['transaction_type'] == 'CUT':# Check if this is a cut bundle or cut roll
                    if 'Cut bundle' in (transaction.get('notes') or ''):# Find the bundle that was cut and restore it
                        # Find spare pieces created from this transaction and delete them
                        cursor.execute("""
                            SELECT id, roll_type, length_meters, bundle_size
                            FROM rolls
                            WHERE batch_id = %s
                            AND roll_type = 'spare'
                            AND deleted_at IS NULL
                            AND created_at >= %s - INTERVAL '1 minute'
                            AND created_at <= %s + INTERVAL '1 minute'
                        """, (transaction['batch_id'], transaction['created_at'], transaction['created_at']))

                        spare_pieces = cursor.fetchall()

                        for piece in spare_pieces:
                            cursor.execute("UPDATE rolls SET deleted_at = NOW() WHERE id = %s", (piece['id'],))

                        # Restore the bundle that was cut
                        if transaction['roll_id']:
                            cursor.execute("""
                                UPDATE rolls
                                SET length_meters = initial_length_meters,
                                    status = 'AVAILABLE',
                                    deleted_at = NULL,
                                    updated_at = NOW()
                                WHERE id = %s
                            """, (transaction['roll_id'],))
                    else:
                        # Find the cut pieces created and delete them
                        cursor.execute("""
                            SELECT id, roll_type, length_meters, is_cut_roll
                            FROM rolls
                            WHERE batch_id = %s
                            AND (is_cut_roll = TRUE OR roll_type = 'cut')
                            AND deleted_at IS NULL
                            AND created_at >= %s - INTERVAL '1 minute'
                            AND created_at <= %s + INTERVAL '1 minute'
                        """, (transaction['batch_id'], transaction['created_at'], transaction['created_at']))

                        cut_pieces = cursor.fetchall()

                        for piece in cut_pieces:
                            cursor.execute("UPDATE rolls SET deleted_at = NOW() WHERE id = %s", (piece['id'],))

                        # Restore the original roll that was cut
                        if transaction['roll_id']:
                            cursor.execute("""
                                UPDATE rolls
                                SET length_meters = initial_length_meters,
                                    status = 'AVAILABLE',
                                    is_cut_roll = FALSE,
                                    deleted_at = NULL,
                                    updated_at = NOW()
                                WHERE id = %s
                            """, (transaction['roll_id'],))# Handle BUNDLED/COMBINED transaction reversal - restore spare pieces and delete the bundle
                elif transaction['transaction_type'] == 'PRODUCTION' and 'Combined' in (transaction.get('notes') or '') and 'spare' in (transaction.get('notes') or ''):# Find the bundle created and delete it
                    cursor.execute("""
                        SELECT id, roll_type, bundle_size, length_meters
                        FROM rolls
                        WHERE batch_id = %s
                        AND roll_type LIKE 'bundle_%'
                        AND deleted_at IS NULL
                        AND created_at >= %s - INTERVAL '1 minute'
                        AND created_at <= %s + INTERVAL '1 minute'
                    """, (transaction['batch_id'], transaction['created_at'], transaction['created_at']))

                    bundles = cursor.fetchall()

                    for bundle in bundles:
                        cursor.execute("UPDATE rolls SET deleted_at = NOW() WHERE id = %s", (bundle['id'],))

                    # Restore the spare pieces that were combined
                    # Parse the transaction notes to get the spare piece IDs
                    notes = transaction.get('notes') or ''
                    import re
                    # Extract spare piece info from notes (format: "Combined X spare pieces")
                    # We need to find spare pieces that existed before this transaction
                    cursor.execute("""
                        SELECT id, length_meters
                        FROM rolls
                        WHERE batch_id = %s
                        AND roll_type = 'spare'
                        AND deleted_at IS NOT NULL
                        AND deleted_at >= %s - INTERVAL '1 minute'
                        AND deleted_at <= %s + INTERVAL '1 minute'
                    """, (transaction['batch_id'], transaction['created_at'], transaction['created_at']))

                    deleted_spares = cursor.fetchall()

                    for spare in deleted_spares:
                        cursor.execute("""
                            UPDATE rolls
                            SET deleted_at = NULL,
                                updated_at = NOW()
                            WHERE id = %s
                        """, (spare['id'],))

                # Handle SALE/DISPATCH transaction reversal - restore rolls from snapshot
                elif transaction.get('roll_snapshot'):
                    import json
                    roll_snapshot = transaction['roll_snapshot']
                    if isinstance(roll_snapshot, str):
                        roll_snapshot = json.loads(roll_snapshot)

                    # Check if it's a multi-roll snapshot
                    if isinstance(roll_snapshot, dict) and 'rolls' in roll_snapshot:
                        # Restore each roll from the snapshot
                        for roll_data in roll_snapshot['rolls']:
                            roll_id = roll_data.get('roll_id')
                            quantity_dispatched = float(roll_data.get('quantity_dispatched', 0))

                            if roll_id:
                                # Get current roll state
                                cursor.execute("SELECT length_meters, status, deleted_at FROM rolls WHERE id = %s", (roll_id,))
                                current_roll = cursor.fetchone()

                                if current_roll:
                                    current_length = float(current_roll['length_meters'] or 0)
                                    new_length = current_length + quantity_dispatched
                                    new_status = 'AVAILABLE' if new_length > 0 else 'SOLD_OUT'

                                    cursor.execute("""
                                        UPDATE rolls
                                        SET length_meters = %s,
                                            status = %s,
                                            deleted_at = NULL,
                                            updated_at = NOW()
                                        WHERE id = %s
                                    """, (new_length, new_status, roll_id))
                    else:
                        # Old single-roll snapshot format
                        if transaction['roll_id']:
                            roll_length = float(transaction['roll_length'] or 0)
                            new_roll_length = roll_length + revert_quantity
                            new_status = 'AVAILABLE' if new_roll_length > 0 else 'SOLD_OUT'

                            cursor.execute("""
                                UPDATE rolls
                                SET length_meters = %s,
                                    status = %s,
                                    deleted_at = NULL,
                                    updated_at = NOW()
                                WHERE id = %s
                            """, (new_roll_length, new_status, transaction['roll_id']))
                elif transaction['roll_id']:
                    # No snapshot, just a single roll
                    roll_length = float(transaction['roll_length'] or 0)
                    new_roll_length = roll_length + revert_quantity
                    new_status = 'AVAILABLE' if new_roll_length > 0 else 'SOLD_OUT'

                    cursor.execute("""
                        UPDATE rolls
                        SET length_meters = %s,
                            status = %s,
                            deleted_at = NULL,
                            updated_at = NOW()
                        WHERE id = %s
                    """, (new_roll_length, new_status, transaction['roll_id']))

                # Mark transaction as deleted (soft delete)
                cursor.execute("""
                    UPDATE transactions
                    SET deleted_at = NOW()
                    WHERE id = %s
                """, (clean_id,))

                # Create audit log
                actor_label = f"{actor['name']} ({actor['role']})"
                log_msg = f"{actor_label} reverted transaction {clean_id} - {transaction['transaction_type']}: {abs(float(transaction['quantity_change']))} units"

                cursor.execute("""
                    INSERT INTO audit_logs (
                        user_id, action_type, entity_type, entity_id,
                        description, created_at
                    ) VALUES (%s, 'REVERT_TRANSACTION', 'TRANSACTION', %s, %s, NOW())
                """, (user_id, clean_id, log_msg))

                reverted_count += 1

            except Exception as e:
                failed_transactions.append({'id': transaction_id, 'error': str(e)})
                continue

    response = {
        'reverted_count': reverted_count,
        'total_requested': len(transaction_ids),
        'failed_transactions': failed_transactions
    }

    if reverted_count > 0:
        return jsonify(response), 200
    else:
        return jsonify(response), 400
