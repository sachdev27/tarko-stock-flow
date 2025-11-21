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
    date_filter_inv = ""
    date_filter_dispatch = ""
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
        date_filter_inv = " AND it.created_at >= %s AND it.created_at <= %s"
        date_filter_dispatch = " AND d.created_at >= %s AND d.created_at <= %s"
        params = [start_ist, end_ist, start_ist, end_ist, start_ist, end_ist]  # For transactions, inventory_transactions, and dispatches

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
            c.city as customer_city,
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
            NULL as customer_city,
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
        AND (it.notes IS NULL OR it.notes NOT LIKE '%%[REVERTED]%%'){date_filter_inv}

        UNION ALL

        -- Dispatch transactions from new dispatch system (grouped by dispatch)
        SELECT
            CONCAT('dispatch_', d.id) as id,
            d.id as dispatch_id,
            'DISPATCH' as transaction_type,
            -COALESCE(SUM(di.quantity), 0) as quantity_change,
            d.dispatch_date as transaction_date,
            d.invoice_number as invoice_no,
            CONCAT('Dispatch: ', d.dispatch_number,
                   CASE
                       WHEN COUNT(DISTINCT di.product_variant_id) > 1
                       THEN ' (Mixed Products)'
                       ELSE ''
                   END) as notes,
            d.created_at,
            jsonb_build_object(
                'dispatch_number', d.dispatch_number,
                'dispatch_id', d.id,
                'total_items', COUNT(di.id),
                'item_types', jsonb_agg(DISTINCT di.item_type),
                'mixed_products', COUNT(DISTINCT di.product_variant_id) > 1,
                'vehicle_number', v.vehicle_number,
                'driver_name', v.driver_name,
                'transport_name', t.name,
                'bill_to_name', bt.name,
                'item_breakdown', jsonb_agg(DISTINCT jsonb_build_object(
                    'item_type', di.item_type,
                    'quantity', di.quantity,
                    'product_type', pt.name,
                    'brand', br.name,
                    'parameters', pv.parameters,
                    'piece_count', di.piece_count,
                    'piece_length', di.piece_length_meters,
                    'length_meters', di.length_meters,
                    'bundle_size', di.bundle_size
                ))
            ) as roll_snapshot,
            CASE
                WHEN COUNT(DISTINCT di.product_variant_id) > 1 THEN NULL
                ELSE MAX(b.batch_code)
            END as batch_code,
            CASE
                WHEN COUNT(DISTINCT di.product_variant_id) > 1 THEN NULL
                ELSE MAX(b.batch_no)
            END as batch_no,
            NULL as initial_quantity,
            NULL as weight_per_meter,
            NULL as total_weight,
            NULL as piece_length,
            NULL as attachment_url,
            NULL as production_date,
            CASE
                WHEN COUNT(DISTINCT di.product_variant_id) > 1 THEN 'Mixed'
                ELSE MAX(pt.name)
            END as product_type,
            CASE
                WHEN COUNT(DISTINCT di.product_variant_id) > 1 THEN NULL
                ELSE MAX(pv.id::text)::uuid
            END as product_variant_id,
            NULL as product_type_id,
            NULL as brand_id,
            CASE
                WHEN COUNT(DISTINCT di.product_variant_id) > 1 THEN 'Mixed'
                ELSE MAX(br.name)
            END as brand,
            CASE
                WHEN COUNT(DISTINCT di.product_variant_id) > 1 THEN '{{}}'::jsonb
                ELSE (array_agg(pv.parameters))[1]
            END as parameters,
            NULL as roll_length_meters,
            NULL as roll_initial_length_meters,
            FALSE as roll_is_cut,
            NULL as roll_type,
            NULL as roll_bundle_size,
            NULL as roll_weight,
            NULL as unit_abbreviation,
            MAX(c.name) as customer_name,
            MAX(c.city) as customer_city,
            MAX(u.email) as created_by_email,
            MAX(u.username) as created_by_username,
            MAX(u.full_name) as created_by_name,
            NULL::bigint as standard_rolls_count,
            NULL::bigint as cut_rolls_count,
            NULL::bigint as bundles_count,
            NULL::bigint as spare_pieces_count,
            NULL::numeric as avg_standard_roll_length,
            NULL as bundle_size,
            NULL::numeric[] as cut_rolls_details,
            NULL::numeric[] as spare_pieces_details
        FROM dispatches d
        LEFT JOIN dispatch_items di ON d.id = di.dispatch_id
        LEFT JOIN inventory_stock ist ON di.stock_id = ist.id
        LEFT JOIN batches b ON ist.batch_id = b.id
        LEFT JOIN product_variants pv ON di.product_variant_id = pv.id
        LEFT JOIN product_types pt ON pv.product_type_id = pt.id
        LEFT JOIN brands br ON pv.brand_id = br.id
        LEFT JOIN units u_unit ON pt.unit_id = u_unit.id
        LEFT JOIN customers c ON d.customer_id = c.id
        LEFT JOIN bill_to bt ON d.bill_to_id = bt.id
        LEFT JOIN transports t ON d.transport_id = t.id
        LEFT JOIN vehicles v ON d.vehicle_id = v.id
        LEFT JOIN users u ON d.created_by = u.id
        WHERE d.deleted_at IS NULL{date_filter_dispatch}
        GROUP BY d.id, d.dispatch_number, d.dispatch_date, d.invoice_number, d.created_at, v.vehicle_number, v.driver_name, t.name, bt.name

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
                # Check if this is a dispatch transaction
                if transaction_id.startswith('dispatch_'):
                    clean_id = transaction_id.replace('dispatch_', '')

                    # Get dispatch details
                    cursor.execute("""
                        SELECT d.*, COUNT(di.id) as item_count
                        FROM dispatches d
                        LEFT JOIN dispatch_items di ON d.id = di.dispatch_id
                        WHERE d.id = %s AND d.deleted_at IS NULL
                        GROUP BY d.id
                    """, (clean_id,))

                    dispatch = cursor.fetchone()
                    if not dispatch:
                        failed_transactions.append({'id': transaction_id, 'error': 'Dispatch not found or already reverted'})
                        continue

                    # Get all dispatch items
                    cursor.execute("""
                        SELECT di.*, ist.stock_type
                        FROM dispatch_items di
                        JOIN inventory_stock ist ON di.stock_id = ist.id
                        WHERE di.dispatch_id = %s
                    """, (clean_id,))

                    dispatch_items = cursor.fetchall()

                    # Revert each dispatch item
                    for item in dispatch_items:
                        stock_id = item['stock_id']
                        quantity = item['quantity']
                        item_type = item['item_type']

                        # Restore inventory_stock quantity
                        cursor.execute("""
                            UPDATE inventory_stock
                            SET quantity = quantity + %s,
                                status = 'IN_STOCK',
                                updated_at = NOW()
                            WHERE id = %s
                        """, (quantity, stock_id))

                        # Handle item-type specific reversals
                        if item_type == 'CUT_PIECE' and item.get('cut_piece_id'):
                            # Restore cut piece status
                            cursor.execute("""
                                UPDATE hdpe_cut_pieces
                                SET status = 'IN_STOCK', dispatch_id = NULL, updated_at = NOW()
                                WHERE id = %s
                            """, (item['cut_piece_id'],))

                        elif item_type == 'SPARE_PIECES':
                            # Restore spare pieces
                            if item.get('spare_piece_ids'):
                                # Mark dispatched spare pieces as IN_STOCK and clear dispatch_id
                                cursor.execute("""
                                    UPDATE sprinkler_spare_pieces
                                    SET status = 'IN_STOCK', dispatch_id = NULL, updated_at = NOW()
                                    WHERE dispatch_id = %s
                                """, (clean_id,))

                                # Also restore piece_count to original spare records if they were partially dispatched
                                # This is complex - for now, keep the dispatched records but mark them as available

                    # Soft delete the dispatch
                    cursor.execute("""
                        UPDATE dispatches
                        SET deleted_at = NOW(), status = 'CANCELLED'
                        WHERE id = %s
                    """, (clean_id,))

                    # Create audit log
                    actor_label = f"{actor['name']} ({actor['role']})"
                    log_msg = f"{actor_label} reverted dispatch {dispatch['dispatch_number']}"

                    cursor.execute("""
                        INSERT INTO audit_logs (
                            user_id, action_type, entity_type, entity_id,
                            description, created_at
                        ) VALUES (%s, 'REVERT_DISPATCH', 'DISPATCH', %s, %s, NOW())
                    """, (user_id, clean_id, log_msg))

                    reverted_count += 1
                    continue

                # Check if this is an inventory transaction
                if transaction_id.startswith('inv_'):
                    # Handle inventory operations (CUT_ROLL, SPLIT_BUNDLE, COMBINE_SPARES)
                    clean_id = transaction_id.replace('inv_', '')

                    # Get inventory transaction details with dispatch status
                    cursor.execute("""
                        SELECT it.*, ist_to.batch_id as to_batch_id, ist_from.batch_id as from_batch_id,
                               ist_to.stock_type as to_stock_type, ist_from.stock_type as from_stock_type,
                               ist_to.id as to_stock_id, ist_from.id as from_stock_id,
                               ist_to.status as to_status, ist_from.status as from_status
                        FROM inventory_transactions it
                        LEFT JOIN inventory_stock ist_to ON it.to_stock_id = ist_to.id
                        LEFT JOIN inventory_stock ist_from ON it.from_stock_id = ist_from.id
                        WHERE it.id = %s
                    """, (clean_id,))

                    inv_transaction = cursor.fetchone()

                    if not inv_transaction:
                        failed_transactions.append({'id': transaction_id, 'error': 'Inventory transaction not found or already reverted'})
                        continue

                    # Handle different inventory operation types
                    if inv_transaction['transaction_type'] == 'CUT_ROLL':
                        # Validate: Check if any cut pieces were already dispatched
                        cursor.execute("""
                            SELECT COUNT(*) as dispatched_count
                            FROM hdpe_cut_pieces
                            WHERE stock_id = %s
                            AND created_at >= %s - INTERVAL '1 minute'
                            AND created_at <= %s + INTERVAL '1 minute'
                            AND status = 'DISPATCHED'
                        """, (inv_transaction['to_stock_id'], inv_transaction['created_at'], inv_transaction['created_at']))

                        dispatched_check = cursor.fetchone()
                        if dispatched_check['dispatched_count'] > 0:
                            failed_transactions.append({
                                'id': transaction_id,
                                'error': f"Cannot revert: {dispatched_check['dispatched_count']} cut pieces have already been dispatched"
                            })
                            continue

                        # Count how many pieces will be reverted
                        cursor.execute("""
                            SELECT COUNT(*) as piece_count
                            FROM hdpe_cut_pieces
                            WHERE stock_id = %s
                            AND created_at >= %s - INTERVAL '1 minute'
                            AND created_at <= %s + INTERVAL '1 minute'
                            AND status = 'IN_STOCK'
                        """, (inv_transaction['to_stock_id'], inv_transaction['created_at'], inv_transaction['created_at']))

                        piece_count = cursor.fetchone()['piece_count']

                        # Mark cut pieces as sold_out (soft delete alternative)
                        cursor.execute("""
                            UPDATE hdpe_cut_pieces
                            SET status = 'SOLD_OUT', updated_at = NOW()
                            WHERE stock_id = %s
                            AND created_at >= %s - INTERVAL '1 minute'
                            AND created_at <= %s + INTERVAL '1 minute'
                            AND status = 'IN_STOCK'
                        """, (inv_transaction['to_stock_id'], inv_transaction['created_at'], inv_transaction['created_at']))

                        # Reduce CUT_ROLL stock quantity
                        if inv_transaction['to_stock_id']:
                            cursor.execute("""
                                UPDATE inventory_stock
                                SET quantity = quantity - %s,
                                    updated_at = NOW()
                                WHERE id = %s
                            """, (piece_count, inv_transaction['to_stock_id']))

                        # Restore the original FULL_ROLL quantity (+1)
                        if inv_transaction['from_stock_id']:
                            cursor.execute("""
                                UPDATE inventory_stock
                                SET quantity = quantity + 1,
                                    status = 'IN_STOCK',
                                    updated_at = NOW()
                                WHERE id = %s
                            """, (inv_transaction['from_stock_id'],))

                    elif inv_transaction['transaction_type'] == 'SPLIT_BUNDLE':
                        # Validate: Check if spare pieces were already dispatched
                        cursor.execute("""
                            SELECT COUNT(*) as dispatched_count
                            FROM sprinkler_spare_pieces
                            WHERE stock_id = %s
                            AND created_at >= %s - INTERVAL '1 minute'
                            AND created_at <= %s + INTERVAL '1 minute'
                            AND status = 'DISPATCHED'
                        """, (inv_transaction['to_stock_id'], inv_transaction['created_at'], inv_transaction['created_at']))

                        dispatched_check = cursor.fetchone()
                        if dispatched_check['dispatched_count'] > 0:
                            failed_transactions.append({
                                'id': transaction_id,
                                'error': f"Cannot revert: {dispatched_check['dispatched_count']} spare pieces have already been dispatched"
                            })
                            continue

                        # Count how many spare pieces will be reverted
                        cursor.execute("""
                            SELECT COUNT(*) as piece_count
                            FROM sprinkler_spare_pieces
                            WHERE stock_id = %s
                            AND created_at >= %s - INTERVAL '1 minute'
                            AND created_at <= %s + INTERVAL '1 minute'
                            AND status = 'IN_STOCK'
                        """, (inv_transaction['to_stock_id'], inv_transaction['created_at'], inv_transaction['created_at']))

                        piece_count = cursor.fetchone()['piece_count']

                        # Mark spare pieces as sold_out (soft delete alternative)
                        cursor.execute("""
                            UPDATE sprinkler_spare_pieces
                            SET status = 'SOLD_OUT', updated_at = NOW()
                            WHERE stock_id = %s
                            AND created_at >= %s - INTERVAL '1 minute'
                            AND created_at <= %s + INTERVAL '1 minute'
                            AND status = 'IN_STOCK'
                        """, (inv_transaction['to_stock_id'], inv_transaction['created_at'], inv_transaction['created_at']))

                        # Reduce SPARE stock quantity
                        if inv_transaction['to_stock_id']:
                            cursor.execute("""
                                UPDATE inventory_stock
                                SET quantity = quantity - %s,
                                    updated_at = NOW()
                                WHERE id = %s
                            """, (piece_count, inv_transaction['to_stock_id']))

                        # Restore the original bundle: undelete + increase quantity by 1
                        if inv_transaction['from_stock_id']:
                            cursor.execute("""
                                UPDATE inventory_stock
                                SET deleted_at = NULL,
                                    status = 'IN_STOCK',
                                    quantity = quantity + 1,
                                    updated_at = NOW()
                                WHERE id = %s
                            """, (inv_transaction['from_stock_id'],))


                    elif inv_transaction['transaction_type'] == 'COMBINE_SPARES':
                        # Validate: Check if combined bundle was already dispatched
                        if inv_transaction['to_stock_id']:
                            cursor.execute("""
                                SELECT status FROM inventory_stock WHERE id = %s
                            """, (inv_transaction['to_stock_id'],))
                            bundle_status = cursor.fetchone()
                            if bundle_status and bundle_status['status'] == 'DISPATCHED':
                                failed_transactions.append({
                                    'id': transaction_id,
                                    'error': 'Cannot revert: Combined bundle has already been dispatched'
                                })
                                continue

                            # Mark combined bundle as deleted
                            cursor.execute("""
                                UPDATE inventory_stock
                                SET deleted_at = NOW(), status = 'SOLD_OUT'
                                WHERE id = %s
                            """, (inv_transaction['to_stock_id'],))

                        # Restore the spare pieces that were combined using from_stock_id
                        if inv_transaction['from_stock_id']:
                            # Restore spares deleted around transaction time
                            cursor.execute("""
                                UPDATE inventory_stock
                                SET deleted_at = NULL,
                                    status = 'IN_STOCK',
                                    updated_at = NOW()
                                WHERE batch_id = %s
                                AND stock_type = 'SPARE'
                                AND deleted_at >= %s - INTERVAL '1 minute'
                                AND deleted_at <= %s + INTERVAL '1 minute'
                            """, (inv_transaction['from_batch_id'], inv_transaction['created_at'], inv_transaction['created_at']))

                    # Soft delete inventory transaction by marking in notes (no deleted_at column)
                    cursor.execute("""
                        UPDATE inventory_transactions
                        SET notes = COALESCE(notes || ' ', '') || '[REVERTED]'
                        WHERE id = %s
                    """, (clean_id,))

                    # Create audit log
                    actor_label = f"{actor['name']} ({actor['role']})"
                    log_msg = f"{actor_label} reverted inventory operation {clean_id} - {inv_transaction['transaction_type']}"

                    cursor.execute("""
                        INSERT INTO audit_logs (
                            user_id, action_type, entity_type, entity_id,
                            description, created_at
                        ) VALUES (%s, 'REVERT_INVENTORY_TRANSACTION', 'INVENTORY_TRANSACTION', %s, %s, NOW())
                    """, (user_id, clean_id, log_msg))

                    reverted_count += 1
                    continue

                # Strip 'txn_' prefix if present (frontend adds this prefix)
                clean_id = transaction_id.replace('txn_', '') if transaction_id.startswith('txn_') else transaction_id

                # Get transaction details
                cursor.execute("""
                    SELECT t.*, b.product_variant_id, b.current_quantity as batch_current_quantity,
                           pv.product_type_id, pt.name as product_type_name
                    FROM transactions t
                    JOIN batches b ON t.batch_id = b.id
                    JOIN product_variants pv ON b.product_variant_id = pv.id
                    JOIN product_types pt ON pv.product_type_id = pt.id
                    WHERE t.id = %s AND t.deleted_at IS NULL
                """, (clean_id,))

                transaction = cursor.fetchone()

                if not transaction:
                    failed_transactions.append({'id': transaction_id, 'error': 'Transaction not found'})
                    continue

                # Only allow reverting PRODUCTION and SALE transactions for now
                if transaction['transaction_type'] not in ['PRODUCTION', 'SALE']:
                    failed_transactions.append({
                        'id': transaction_id,
                        'error': f"{transaction['transaction_type']} transactions cannot be reverted"
                    })
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

                new_batch_qty = cursor.fetchone()

                # For PRODUCTION, validate and soft-delete associated inventory stock entries
                if transaction['transaction_type'] == 'PRODUCTION':
                    # Check if any stock from this production was dispatched
                    cursor.execute("""
                        SELECT COUNT(*) as dispatched_count
                        FROM inventory_stock
                        WHERE batch_id = %s
                        AND deleted_at IS NULL
                        AND status = 'DISPATCHED'
                        AND created_at >= %s - INTERVAL '1 minute'
                        AND created_at <= %s + INTERVAL '1 minute'
                    """, (transaction['batch_id'], transaction['created_at'], transaction['created_at']))

                    dispatch_check = cursor.fetchone()
                    if dispatch_check['dispatched_count'] > 0:
                        failed_transactions.append({
                            'id': transaction_id,
                            'error': f"Cannot revert: {dispatch_check['dispatched_count']} items from this production have been dispatched"
                        })
                        continue

                    # Soft delete inventory stock
                    cursor.execute("""
                        UPDATE inventory_stock
                        SET deleted_at = NOW(), status = 'SOLD_OUT'
                        WHERE batch_id = %s
                        AND deleted_at IS NULL
                        AND created_at >= %s - INTERVAL '1 minute'
                        AND created_at <= %s + INTERVAL '1 minute'
                    """, (transaction['batch_id'], transaction['created_at'], transaction['created_at']))

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
