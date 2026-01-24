from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from database import get_db_cursor, execute_query
from services.auth import jwt_required_with_role, get_user_identity_details
from services.inventory_operations import InventoryOperations

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
        actor_label = f"{actor.get('name', 'Unknown')} ({actor.get('role', 'Unknown')})" if actor else "Unknown User"
        cursor.execute("""
            INSERT INTO audit_logs (
                user_id, action_type, entity_type, entity_id,
                description, created_at
            ) VALUES (%s, %s, 'TRANSACTION', %s, %s, NOW())
        """, (
            user_id,
            f'{transaction_type}_TRANSACTION',
            txn['id'],
            f"{actor_label} recorded {transaction_type.lower()} transaction: {quantity} units"
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
    query = """
        -- Main batch-level transactions
        SELECT
            CONCAT('txn_', t.id) as id,
            t.dispatch_id,
            t.transaction_type::text,
            t.quantity_change,
            to_char(t.transaction_date AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"') as transaction_date,
            t.invoice_no,
            t.notes,
            to_char(t.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"') as created_at,
            t.transaction_date as transaction_date_sort,
            t.created_at as created_at_sort,
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
        WHERE t.deleted_at IS NULL""" + date_filter + """

        UNION ALL

        -- Stock-level inventory transactions (cut rolls, cut bundles, combine bundles)
        SELECT
            CONCAT('inv_', it.id) as id,
            NULL as dispatch_id,
            it.transaction_type::text,
            COALESCE(it.to_quantity, 0) - COALESCE(it.from_quantity, 0) as quantity_change,
            to_char(it.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"') as transaction_date,
            NULL as invoice_no,
            it.notes,
            to_char(it.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"') as created_at,
            it.created_at as transaction_date_sort,
            it.created_at as created_at_sort,
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
                                     WHERE hcp.created_by_transaction_id = it.id
                                     AND hcp.deleted_at IS NULL),
                                    '[]'::jsonb
                                ),
                                'total_cut_length', COALESCE(
                                    (SELECT SUM(hcp.length_meters)
                                     FROM hdpe_cut_pieces hcp
                                     WHERE hcp.created_by_transaction_id = it.id
                                     AND hcp.deleted_at IS NULL),
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
                WHEN it.transaction_type = 'COMBINE_SPARES' THEN
                    jsonb_build_object(
                        'stock_entries',
                        jsonb_build_array(
                            jsonb_build_object(
                                'stock_type', 'BUNDLE',
                                'bundles_created', COALESCE(it.to_quantity, 0),
                                'bundle_size', ist_to.pieces_per_bundle,
                                'piece_length', ist_to.piece_length_meters,
                                'spares_used', COALESCE(it.from_quantity, 0)
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
                     WHERE hcp.created_by_transaction_id = it.id
                     AND hcp.deleted_at IS NULL)
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
                     WHERE hcp.created_by_transaction_id = it.id
                     AND hcp.deleted_at IS NULL)
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
            u.email as created_by_email,
            u.username as created_by_username,
            u.full_name as created_by_name,
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
        LEFT JOIN users u ON it.created_by = u.id
        WHERE it.transaction_type IN ('CUT_ROLL', 'SPLIT_BUNDLE', 'COMBINE_SPARES')
        AND it.reverted_at IS NULL""" + date_filter_inv + """

        UNION ALL

        -- Dispatch transactions from new dispatch system (grouped by dispatch)
        SELECT
            CONCAT('dispatch_', d.id) as id,
            d.id as dispatch_id,
            CASE
                WHEN d.reverted_at IS NOT NULL THEN 'REVERTED'
                ELSE 'DISPATCH'
            END as transaction_type,
            -COALESCE(SUM(di.quantity), 0) as quantity_change,
            to_char(d.dispatch_date AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"') as transaction_date,
            d.invoice_number as invoice_no,
            CONCAT('Dispatch: ', d.dispatch_number,
                   CASE
                       WHEN COUNT(DISTINCT di.product_variant_id) > 1
                       THEN ' (Mixed Products)'
                       ELSE ''
                   END,
                   CASE
                       WHEN d.reverted_at IS NOT NULL THEN ' [REVERTED]'
                       ELSE ''
                   END) as notes,
            to_char(d.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"') as created_at,
            d.dispatch_date as transaction_date_sort,
            d.created_at as created_at_sort,
            jsonb_build_object(
                'dispatch_number', d.dispatch_number,
                'dispatch_id', d.id,
                'status', d.status,
                'reverted_at', d.reverted_at,
                'reverted_by', d.reverted_by,
                'total_items', COUNT(di.id),
                'item_types', jsonb_agg(DISTINCT di.item_type),
                'mixed_products', COUNT(DISTINCT di.product_variant_id) > 1,
                'vehicle_number', v.vehicle_number,
                'driver_name', v.driver_name,
                'transport_name', t.name,
                'bill_to_name', bt.name,
                'item_breakdown', jsonb_agg(jsonb_build_object(
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
                WHEN COUNT(DISTINCT di.product_variant_id) > 1 THEN '{}'::jsonb
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
        WHERE d.deleted_at IS NULL""" + date_filter_dispatch + """
        GROUP BY d.id, d.dispatch_number, d.dispatch_date, d.invoice_number, d.created_at, v.vehicle_number, v.driver_name, t.name, bt.name, d.status, d.reverted_at

        UNION ALL

        -- Return transactions from new return system (one row per return)
        SELECT DISTINCT ON (r.id)
            CONCAT('return_', r.id) as id,
            NULL as dispatch_id,
            CASE
                WHEN r.reverted_at IS NOT NULL THEN 'REVERTED'
                ELSE 'RETURN'
            END as transaction_type,
            (SELECT COALESCE(SUM(ri_sum.quantity), 0) FROM return_items ri_sum WHERE ri_sum.return_id = r.id) as quantity_change,
            to_char(r.return_date AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"') as transaction_date,
            NULL as invoice_no,
            CASE
                WHEN (SELECT COUNT(DISTINCT ri_count.product_variant_id) FROM return_items ri_count WHERE ri_count.return_id = r.id) > 1
                THEN CONCAT('Return: ', r.return_number, ' (Mixed Products)',
                       CASE
                           WHEN r.reverted_at IS NOT NULL THEN ' [REVERTED]'
                           ELSE ''
                       END)
                ELSE CONCAT('Return: ', r.return_number, COALESCE(': ' || (
                    SELECT string_agg(
                        CASE ri_agg.item_type
                            WHEN 'FULL_ROLL' THEN ri_agg.quantity::text || 'R'
                            WHEN 'CUT_ROLL' THEN ri_agg.quantity::text || 'C'
                            WHEN 'BUNDLE' THEN ri_agg.quantity::text || 'B'
                            WHEN 'SPARE_PIECES' THEN ri_agg.piece_count::text || 'S'
                        END, ' + ')
                    FROM return_items ri_agg WHERE ri_agg.return_id = r.id
                ), ''),
                       CASE
                           WHEN r.reverted_at IS NOT NULL THEN ' [REVERTED]'
                           ELSE ''
                       END)            END as notes,
            to_char(r.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"') as created_at,
            r.return_date as transaction_date_sort,
            r.created_at as created_at_sort,
            (SELECT jsonb_build_object(
                'return_number', r.return_number,
                'return_id', r.id,
                'status', r.status,
                'reverted_at', r.reverted_at,
                'reverted_by', r.reverted_by,
                'total_items', COUNT(ri2.id),
                'item_types', jsonb_agg(DISTINCT ri2.item_type),
                'mixed_products', COUNT(DISTINCT ri2.product_variant_id) > 1,
                'full_rolls', COALESCE(SUM(CASE WHEN ri2.item_type = 'FULL_ROLL' THEN ri2.quantity ELSE 0 END), 0),
                'cut_rolls', COALESCE(SUM(CASE WHEN ri2.item_type = 'CUT_ROLL' THEN ri2.quantity ELSE 0 END), 0),
                'bundles', COALESCE(SUM(CASE WHEN ri2.item_type = 'BUNDLE' THEN ri2.quantity ELSE 0 END), 0),
                'spare_pieces', COALESCE(SUM(CASE WHEN ri2.item_type = 'SPARE_PIECES' THEN ri2.piece_count ELSE 0 END), 0),
                'total_rolls', COALESCE(SUM(CASE WHEN ri2.item_type IN ('FULL_ROLL', 'CUT_ROLL') THEN ri2.quantity ELSE 0 END), 0),
                'item_breakdown', jsonb_agg(jsonb_build_object(
                    'item_type', ri2.item_type,
                    'quantity', ri2.quantity,
                    'product_type', pt2.name,
                    'brand', br2.name,
                    'parameters', pv2.parameters,
                    'piece_count', ri2.piece_count,
                    'piece_length', ri2.piece_length_meters,
                    'length_meters', ri2.length_meters,
                    'bundle_size', ri2.bundle_size
                ))
            )
            FROM return_items ri2
            JOIN product_variants pv2 ON ri2.product_variant_id = pv2.id
            JOIN product_types pt2 ON pv2.product_type_id = pt2.id
            JOIN brands br2 ON pv2.brand_id = br2.id
            WHERE ri2.return_id = r.id
            GROUP BY r.return_number, r.id
            ) as roll_snapshot,
            r.return_number as batch_code,
            r.return_number as batch_no,
            NULL as initial_quantity,
            NULL as weight_per_meter,
            NULL as total_weight,
            NULL as piece_length,
            NULL as attachment_url,
            NULL as production_date,
            CASE
                WHEN (SELECT COUNT(DISTINCT ri_pv.product_variant_id) FROM return_items ri_pv WHERE ri_pv.return_id = r.id) > 1 THEN 'Mixed'
                ELSE (SELECT pt3.name FROM return_items ri4
                      JOIN product_variants pv3 ON ri4.product_variant_id = pv3.id
                      JOIN product_types pt3 ON pv3.product_type_id = pt3.id
                      WHERE ri4.return_id = r.id LIMIT 1)
            END as product_type,
            CASE
                WHEN (SELECT COUNT(DISTINCT ri_pv.product_variant_id) FROM return_items ri_pv WHERE ri_pv.return_id = r.id) > 1 THEN NULL
                ELSE (SELECT pv3.id FROM return_items ri4
                      JOIN product_variants pv3 ON ri4.product_variant_id = pv3.id
                      WHERE ri4.return_id = r.id LIMIT 1)
            END as product_variant_id,
            NULL as product_type_id,
            NULL as brand_id,
            CASE
                WHEN (SELECT COUNT(DISTINCT ri_pv.product_variant_id) FROM return_items ri_pv WHERE ri_pv.return_id = r.id) > 1 THEN 'Mixed'
                ELSE (SELECT br3.name FROM return_items ri4
                      JOIN product_variants pv3 ON ri4.product_variant_id = pv3.id
                      JOIN brands br3 ON pv3.brand_id = br3.id
                      WHERE ri4.return_id = r.id LIMIT 1)
            END as brand,
            CASE
                WHEN (SELECT COUNT(DISTINCT ri_pv.product_variant_id) FROM return_items ri_pv WHERE ri_pv.return_id = r.id) > 1 THEN '{}'::jsonb
                ELSE (SELECT pv3.parameters FROM return_items ri4
                      JOIN product_variants pv3 ON ri4.product_variant_id = pv3.id
                      WHERE ri4.return_id = r.id LIMIT 1)
            END as parameters,
            (SELECT SUM(
                CASE
                    -- For FULL_ROLL and CUT_ROLL, length_meters is already the total (sum of all roll lengths)
                    WHEN ri_len.item_type IN ('FULL_ROLL', 'CUT_ROLL') THEN COALESCE(ri_len.length_meters, 0)
                    -- For BUNDLE, calculate: quantity × pieces_per_bundle × length_per_piece
                    WHEN ri_len.item_type = 'BUNDLE' THEN COALESCE(ri_len.quantity * ri_len.piece_count * ri_len.piece_length_meters, 0)
                    -- For SPARE_PIECES, calculate: piece_count × length_per_piece
                    WHEN ri_len.item_type = 'SPARE_PIECES' THEN COALESCE(ri_len.piece_count * ri_len.piece_length_meters, 0)
                    ELSE 0
                END
             )
             FROM return_items ri_len
             WHERE ri_len.return_id = r.id) as roll_length_meters,
            NULL as roll_initial_length_meters,
            FALSE as roll_is_cut,
            NULL as roll_type,
            NULL as roll_bundle_size,
            NULL as roll_weight,
            NULL as unit_abbreviation,
            c.name as customer_name,
            c.city as customer_city,
            u.email as created_by_email,
            u.username as created_by_username,
            u.full_name as created_by_name,
            NULL::bigint as standard_rolls_count,
            NULL::bigint as cut_rolls_count,
            NULL::bigint as bundles_count,
            NULL::bigint as spare_pieces_count,
            NULL::numeric as avg_standard_roll_length,
            NULL as bundle_size,
            NULL::numeric[] as cut_rolls_details,
            NULL::numeric[] as spare_pieces_details
        FROM returns r
        LEFT JOIN customers c ON r.customer_id = c.id
        LEFT JOIN users u ON r.created_by = u.id
        WHERE r.deleted_at IS NULL""" + date_filter_dispatch + """

        UNION ALL

        -- Reverted inventory transactions (CUT_ROLL, SPLIT_BUNDLE, COMBINE_SPARES)
        SELECT
            CONCAT('inv_', it.id) as id,
            NULL as dispatch_id,
            'REVERTED' as transaction_type,
            0 as quantity_change,
            to_char(it.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"') as transaction_date,
            NULL as invoice_no,
            CONCAT('[REVERTED] ',
                CASE it.transaction_type
                    WHEN 'CUT_ROLL' THEN 'Cut Roll'
                    WHEN 'SPLIT_BUNDLE' THEN 'Split Bundle'
                    WHEN 'COMBINE_SPARES' THEN 'Combine Spares'
                    ELSE it.transaction_type
                END,
                COALESCE(': ' || it.notes, '')) as notes,
            to_char(it.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"') as created_at,
            it.created_at as transaction_date_sort,
            it.created_at as created_at_sort,
            -- Fetch roll_snapshot from the original transaction data (before it was reverted)
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
                                     WHERE hcp.created_by_transaction_id = it.id
                                     AND hcp.deleted_at IS NOT NULL),
                                    '[]'::jsonb
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
                WHEN it.transaction_type = 'COMBINE_SPARES' THEN
                    jsonb_build_object(
                        'stock_entries',
                        jsonb_build_array(
                            jsonb_build_object(
                                'stock_type', 'BUNDLE',
                                'bundles_created', COALESCE(it.to_quantity, 0),
                                'bundle_size', ist_to.pieces_per_bundle,
                                'piece_length', ist_to.piece_length_meters
                            )
                        )
                    )
                ELSE NULL
            END as roll_snapshot,
            b.batch_code,
            b.batch_no,
            NULL as initial_quantity,
            NULL as weight_per_meter,
            NULL as total_weight,
            b.piece_length,
            b.attachment_url,
            b.created_at as production_date,
            pt.name as product_type,
            pv.id as product_variant_id,
            pv.product_type_id,
            pv.brand_id,
            br.name as brand,
            pv.parameters,
            NULL as roll_length_meters,
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
        AND it.reverted_at IS NOT NULL""" + date_filter_inv + """

        UNION ALL

        -- Scrap transactions from new scrap system (one row per scrap)
        SELECT DISTINCT ON (s.id)
            CONCAT('scrap_', s.id) as id,
            NULL as dispatch_id,
            'SCRAP' as transaction_type,
            -COALESCE(s.total_quantity, 0) as quantity_change,
            to_char(s.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"') as transaction_date,
            NULL as invoice_no,
            CASE
                WHEN (SELECT COUNT(DISTINCT si_count.product_variant_id) FROM scrap_items si_count WHERE si_count.scrap_id = s.id) > 1
                THEN CONCAT('Scrap: ', s.scrap_number, ' (Mixed Products) - ', s.reason)
                ELSE CONCAT('Scrap: ', s.scrap_number, ' - ', s.reason, COALESCE(': ' || (
                    SELECT string_agg(
                        CASE si_agg.stock_type
                            WHEN 'FULL_ROLL' THEN si_agg.quantity_scrapped::text || 'R'
                            WHEN 'CUT_ROLL' THEN si_agg.quantity_scrapped::text || 'C'
                            WHEN 'BUNDLE' THEN si_agg.quantity_scrapped::text || 'B'
                            WHEN 'SPARE' THEN si_agg.quantity_scrapped::text || 'S'
                        END, ' + ')
                    FROM scrap_items si_agg WHERE si_agg.scrap_id = s.id
                ), ''))
            END as notes,
            to_char(s.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"') as created_at,
            s.created_at as transaction_date_sort,
            s.created_at as created_at_sort,
            (SELECT jsonb_build_object(
                'scrap_number', s.scrap_number,
                'scrap_id', s.id,
                'status', s.status,
                'reason', s.reason,
                'scrap_notes', s.notes,
                'total_items', COUNT(si2.id),
                'item_types', jsonb_agg(DISTINCT si2.stock_type),
                'mixed_products', COUNT(DISTINCT si2.product_variant_id) > 1,
                'full_rolls', COALESCE(SUM(CASE WHEN si2.stock_type = 'FULL_ROLL' THEN si2.quantity_scrapped ELSE 0 END), 0),
                'cut_rolls', COALESCE(SUM(CASE WHEN si2.stock_type = 'CUT_ROLL' THEN si2.quantity_scrapped ELSE 0 END), 0),
                'bundles', COALESCE(SUM(CASE WHEN si2.stock_type = 'BUNDLE' THEN si2.quantity_scrapped ELSE 0 END), 0),
                'spare_pieces', COALESCE(SUM(CASE WHEN si2.stock_type = 'SPARE' THEN si2.quantity_scrapped ELSE 0 END), 0),
                'total_quantity', s.total_quantity,
                'estimated_loss', s.estimated_loss,
                'item_breakdown', jsonb_agg(jsonb_build_object(
                    'stock_type', si2.stock_type,
                    'quantity', si2.quantity_scrapped,
                    'product_type', pt2.name,
                    'brand', br2.name,
                    'parameters', pv2.parameters,
                    'batch_code', b2.batch_code,
                    'length_per_unit', si2.length_per_unit,
                    'pieces_per_bundle', si2.pieces_per_bundle,
                    'piece_length_meters', si2.piece_length_meters,
                    'estimated_value', si2.estimated_value,
                    'item_notes', si2.notes,
                    'pieces', COALESCE(
                        (SELECT jsonb_agg(jsonb_build_object(
                            'piece_type', sp.piece_type,
                            'length_meters', sp.length_meters,
                            'piece_count', sp.piece_count,
                            'piece_length_meters', sp.piece_length_meters
                        ) ORDER BY sp.created_at)
                         FROM scrap_pieces sp
                         WHERE sp.scrap_item_id = si2.id),
                        '[]'::jsonb
                    )
                ))
            ) FROM scrap_items si2
            JOIN batches b2 ON si2.batch_id = b2.id
            JOIN product_variants pv2 ON si2.product_variant_id = pv2.id
            JOIN product_types pt2 ON pv2.product_type_id = pt2.id
            JOIN brands br2 ON pv2.brand_id = br2.id
            WHERE si2.scrap_id = s.id) as roll_snapshot,
            CASE
                WHEN (SELECT COUNT(DISTINCT si_b.batch_id) FROM scrap_items si_b WHERE si_b.scrap_id = s.id) > 1 THEN NULL
                ELSE (SELECT b2.batch_code FROM scrap_items si4 JOIN batches b2 ON si4.batch_id = b2.id WHERE si4.scrap_id = s.id LIMIT 1)
            END as batch_code,
            CASE
                WHEN (SELECT COUNT(DISTINCT si_b.batch_id) FROM scrap_items si_b WHERE si_b.scrap_id = s.id) > 1 THEN NULL
                ELSE (SELECT b2.batch_no FROM scrap_items si4 JOIN batches b2 ON si4.batch_id = b2.id WHERE si4.scrap_id = s.id LIMIT 1)
            END as batch_no,
            NULL as initial_quantity,
            NULL as weight_per_meter,
            NULL as total_weight,
            NULL as piece_length,
            NULL as attachment_url,
            NULL as production_date,
            CASE
                WHEN (SELECT COUNT(DISTINCT si_pv.product_variant_id) FROM scrap_items si_pv WHERE si_pv.scrap_id = s.id) > 1 THEN 'Mixed'
                ELSE (SELECT pt3.name FROM scrap_items si4 JOIN product_variants pv3 ON si4.product_variant_id = pv3.id JOIN product_types pt3 ON pv3.product_type_id = pt3.id WHERE si4.scrap_id = s.id LIMIT 1)
            END as product_type,
            CASE
                WHEN (SELECT COUNT(DISTINCT si_pv.product_variant_id) FROM scrap_items si_pv WHERE si_pv.scrap_id = s.id) > 1 THEN NULL
                ELSE (SELECT si4.product_variant_id FROM scrap_items si4 WHERE si4.scrap_id = s.id LIMIT 1)
            END as product_variant_id,
            CASE
                WHEN (SELECT COUNT(DISTINCT si_pv.product_variant_id) FROM scrap_items si_pv WHERE si_pv.scrap_id = s.id) > 1 THEN NULL
                ELSE (SELECT pv3.product_type_id FROM scrap_items si4 JOIN product_variants pv3 ON si4.product_variant_id = pv3.id WHERE si4.scrap_id = s.id LIMIT 1)
            END as product_type_id,
            CASE
                WHEN (SELECT COUNT(DISTINCT si_pv.product_variant_id) FROM scrap_items si_pv WHERE si_pv.scrap_id = s.id) > 1 THEN NULL
                ELSE (SELECT pv3.brand_id FROM scrap_items si4 JOIN product_variants pv3 ON si4.product_variant_id = pv3.id WHERE si4.scrap_id = s.id LIMIT 1)
            END as brand_id,
            CASE
                WHEN (SELECT COUNT(DISTINCT si_pv.product_variant_id) FROM scrap_items si_pv WHERE si_pv.scrap_id = s.id) > 1 THEN 'Mixed'
                ELSE (SELECT br3.name FROM scrap_items si4 JOIN product_variants pv3 ON si4.product_variant_id = pv3.id JOIN brands br3 ON pv3.brand_id = br3.id WHERE si4.scrap_id = s.id LIMIT 1)
            END as brand,
            CASE
                WHEN (SELECT COUNT(DISTINCT si_pv.product_variant_id) FROM scrap_items si_pv WHERE si_pv.scrap_id = s.id) > 1 THEN '{}'::jsonb
                ELSE (SELECT pv3.parameters FROM scrap_items si4 JOIN product_variants pv3 ON si4.product_variant_id = pv3.id WHERE si4.scrap_id = s.id LIMIT 1)
            END as parameters,
            (SELECT SUM(
                CASE
                    WHEN si_len.stock_type = 'FULL_ROLL' THEN COALESCE(si_len.length_per_unit * si_len.quantity_scrapped, 0)
                    WHEN si_len.stock_type = 'CUT_ROLL' THEN COALESCE(si_len.length_per_unit * si_len.quantity_scrapped, 0)
                    WHEN si_len.stock_type = 'BUNDLE' THEN COALESCE(si_len.quantity_scrapped * si_len.pieces_per_bundle * si_len.piece_length_meters, 0)
                    WHEN si_len.stock_type = 'SPARE' THEN COALESCE(si_len.quantity_scrapped * si_len.piece_length_meters, 0)
                    ELSE 0
                END
             )
             FROM scrap_items si_len
             WHERE si_len.scrap_id = s.id) as roll_length_meters,
            NULL as roll_initial_length_meters,
            FALSE as roll_is_cut,
            NULL as roll_type,
            NULL as roll_bundle_size,
            NULL as roll_weight,
            NULL as unit_abbreviation,
            NULL as customer_name,
            NULL as customer_city,
            u.email as created_by_email,
            u.username as created_by_username,
            u.full_name as created_by_name,
            NULL::bigint as standard_rolls_count,
            NULL::bigint as cut_rolls_count,
            NULL::bigint as bundles_count,
            NULL::bigint as spare_pieces_count,
            NULL::numeric as avg_standard_roll_length,
            NULL as bundle_size,
            NULL::numeric[] as cut_rolls_details,
            NULL::numeric[] as spare_pieces_details
        FROM scraps s
        LEFT JOIN users u ON s.created_by = u.id
        WHERE s.deleted_at IS NULL AND s.status = 'SCRAPPED'""" + date_filter_dispatch + """

        ORDER BY transaction_date_sort DESC, created_at_sort DESC
        LIMIT 1000
    """

    print(f"\n=== TRANSACTION QUERY DEBUG ===")
    print(f"Date filter params: {params if params else 'None'}")

    transactions = execute_query(query, tuple(params)) if params else execute_query(query)

    # Sort all records by transaction date
    all_records = list(transactions) if transactions else []

    print(f"Total records returned: {len(all_records)}")

    # Debug: Check for duplicate return entries
    return_records = [r for r in all_records if r['id'].startswith('return_')]
    return_ids = [r['id'] for r in return_records]

    print(f"Return records found: {len(return_records)}")
    print(f"Unique return IDs: {len(set(return_ids))}")

    # Debug: Log return calculations
    for ret in return_records[:3]:  # First 3 returns
        print(f"Return {ret.get('batch_code', 'N/A')}: roll_length_meters = {ret.get('roll_length_meters', 'N/A')}")

    if len(return_ids) != len(set(return_ids)):
        print(f"⚠️  WARNING: Duplicate return entries found!")
        print(f"   Total: {len(return_ids)}, Unique: {len(set(return_ids))}")
        print(f"   Return IDs: {return_ids}")
        for ret in return_records:
            print(f"   - {ret['id']}: {ret.get('notes', 'N/A')}")
    else:
        print(f"✓ No duplicate returns detected")
        if return_records:
            print(f"Return entries:")
            for ret in return_records:
                print(f"   - {ret['id']}: {ret.get('notes', 'N/A')}")

    print(f"=== END DEBUG ===\n")

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
                        failed_transactions.append({'id': transaction_id, 'error': 'Dispatch not found or already deleted'})
                        continue

                    # Check if dispatch is already reverted
                    if dispatch.get('reverted_at') is not None:
                        failed_transactions.append({'id': transaction_id, 'error': f"Dispatch {dispatch['dispatch_number']} is already reverted"})
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

                        # Handle item-type specific reversals FIRST (before updating stock quantity)
                        # This is important for SPARE_PIECES where the validation trigger checks piece count
                        if item_type == 'CUT_PIECE' and item.get('cut_piece_id'):
                            # Restore cut piece status
                            cursor.execute("""
                                UPDATE hdpe_cut_pieces
                                SET status = 'IN_STOCK', dispatch_id = NULL, updated_at = NOW()
                                WHERE id = %s
                            """, (item['cut_piece_id'],))

                            # For CUT_PIECE, the auto_update_stock_from_hdpe_pieces trigger
                            # automatically updates stock quantity, so we only update status
                            cursor.execute("""
                                UPDATE inventory_stock
                                SET status = 'IN_STOCK',
                                    updated_at = NOW()
                                WHERE id = %s
                            """, (stock_id,))
                            skip_stock_update = True

                        elif item_type == 'CUT_ROLL':
                            # Restore cut roll pieces (multiple pieces may have been dispatched)
                            cursor.execute("""
                                UPDATE hdpe_cut_pieces
                                SET status = 'IN_STOCK', dispatch_id = NULL, updated_at = NOW()
                                WHERE stock_id = %s AND dispatch_id = %s
                            """, (stock_id, clean_id))

                            # For CUT_ROLL, the auto_update_stock_from_hdpe_pieces trigger
                            # automatically updates stock quantity, so we only update status
                            cursor.execute("""
                                UPDATE inventory_stock
                                SET status = 'IN_STOCK',
                                    updated_at = NOW()
                                WHERE id = %s
                            """, (stock_id,))
                            skip_stock_update = True

                        elif item_type == 'SPARE_PIECES':
                            # Restore spare pieces BEFORE updating stock quantity
                            # The dispatch creates spare piece records with dispatch_id set, so we need to:
                            # 1. Mark all spare pieces with this dispatch_id as IN_STOCK
                            # 2. Clear the dispatch_id reference
                            # This works for both full and partial dispatches
                            cursor.execute("""
                                UPDATE sprinkler_spare_pieces
                                SET status = 'IN_STOCK', dispatch_id = NULL, updated_at = NOW()
                                WHERE dispatch_id = %s AND stock_id = %s
                            """, (clean_id, stock_id))

                            # For SPARE_PIECES, the auto_update_stock_from_sprinkler_pieces trigger
                            # automatically updates stock quantity by counting IN_STOCK pieces
                            # We only need to update the status field
                            cursor.execute("""
                                UPDATE inventory_stock
                                SET status = 'IN_STOCK',
                                    updated_at = NOW()
                                WHERE id = %s
                            """, (stock_id,))
                            skip_stock_update = True

                        # Now restore inventory_stock quantity for non-piece-based types (BUNDLE, FULL_ROLL)
                        # Skip for piece-based types (CUT_PIECE, CUT_ROLL, SPARE_PIECES) as triggers handle them
                        if not locals().get('skip_stock_update', False):
                            cursor.execute("""
                                UPDATE inventory_stock
                                SET quantity = quantity + %s,
                                    status = 'IN_STOCK',
                                    updated_at = NOW()
                                WHERE id = %s
                            """, (quantity, stock_id))

                        # Reset the flag for next item
                        skip_stock_update = False                        # Get the batch_id from this stock and restore it if deleted
                        cursor.execute("""
                            SELECT batch_id FROM inventory_stock WHERE id = %s
                        """, (stock_id,))
                        stock_row = cursor.fetchone()
                        if stock_row:
                            # Restore the batch (set deleted_at to NULL if it was deleted)
                            cursor.execute("""
                                UPDATE batches
                                SET deleted_at = NULL, updated_at = NOW()
                                WHERE id = %s AND deleted_at IS NOT NULL
                            """, (stock_row['batch_id'],))

                    # Mark the dispatch as reverted (NOT deleted - keep it visible in activity feed)
                    # First clean up orphaned created_by reference if the user no longer exists
                    cursor.execute("""
                        UPDATE dispatches
                        SET created_by = NULL
                        WHERE id = %s
                          AND created_by IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM users WHERE id = created_by)
                    """, (clean_id,))

                    cursor.execute("""
                        UPDATE dispatches
                        SET reverted_at = NOW(), reverted_by = %s, status = 'REVERTED', updated_at = NOW()
                        WHERE id = %s
                    """, (user_id, clean_id))

                    # Create audit log
                    actor_label = f"{actor.get('name', 'Unknown')} ({actor.get('role', 'Unknown')})" if actor else "Unknown User"
                    log_msg = f"{actor_label} reverted dispatch {dispatch['dispatch_number']}"

                    cursor.execute("""
                        INSERT INTO audit_logs (
                            user_id, action_type, entity_type, entity_id,
                            description, created_at
                        ) VALUES (%s, 'REVERT_DISPATCH', 'DISPATCH', %s, %s, NOW())
                    """, (user_id, clean_id, log_msg))

                    reverted_count += 1
                    continue

                # Check if this is a return transaction
                if transaction_id.startswith('return_'):
                    clean_id = transaction_id.replace('return_', '')

                    # Get return details
                    cursor.execute("""
                        SELECT r.*
                        FROM returns r
                        WHERE r.id = %s AND r.deleted_at IS NULL
                    """, (clean_id,))

                    return_record = cursor.fetchone()
                    if not return_record:
                        failed_transactions.append({'id': transaction_id, 'error': 'Return not found or already deleted'})
                        continue

                    # Check if return is already reverted
                    if return_record.get('reverted_at') is not None:
                        failed_transactions.append({'id': transaction_id, 'error': f"Return {return_record['return_number']} is already reverted"})
                        continue

                    # Get inventory_stock IDs linked to this return through return_items
                    # Returns can reuse existing batches, so we find stock via linkage tables
                    stock_ids = []

                    # Get stock from return_rolls (FULL_ROLL, CUT_ROLL)
                    cursor.execute("""
                        SELECT DISTINCT rr.stock_id
                        FROM return_rolls rr
                        JOIN return_items ri ON rr.return_item_id = ri.id
                        WHERE ri.return_id = %s AND rr.stock_id IS NOT NULL
                    """, (clean_id,))
                    stock_ids.extend([row['stock_id'] for row in cursor.fetchall()])

                    # Get stock from return_bundles (BUNDLE)
                    cursor.execute("""
                        SELECT DISTINCT rb.stock_id
                        FROM return_bundles rb
                        JOIN return_items ri ON rb.return_item_id = ri.id
                        WHERE ri.return_id = %s AND rb.stock_id IS NOT NULL
                    """, (clean_id,))
                    stock_ids.extend([row['stock_id'] for row in cursor.fetchall()])

                    # For SPARE_PIECES: find stock via created pieces' stock_id
                    # Get transaction IDs created by this return
                    cursor.execute("""
                        SELECT id FROM inventory_transactions
                        WHERE transaction_type = 'RETURN'
                        AND notes LIKE %s
                    """, (f"Return {return_record['return_number']}:%",))

                    txn_ids = [row['id'] for row in cursor.fetchall()]

                    if txn_ids:
                        # Find stock_ids from pieces created by these transactions
                        cursor.execute("""
                            SELECT DISTINCT stock_id
                            FROM sprinkler_spare_pieces
                            WHERE created_by_transaction_id = ANY(%s::uuid[])
                            AND deleted_at IS NULL
                        """, (txn_ids,))
                        stock_ids.extend([row['stock_id'] for row in cursor.fetchall()])

                    # Remove duplicates
                    stock_ids = list(set(stock_ids))

                    if stock_ids:
                        # Soft delete pieces first (triggers will update stock quantities)
                        cursor.execute("""
                            UPDATE hdpe_cut_pieces
                            SET status = 'SOLD_OUT', deleted_at = NOW()
                            WHERE stock_id = ANY(%s::uuid[]) AND deleted_at IS NULL
                        """, (stock_ids,))

                        cursor.execute("""
                            UPDATE sprinkler_spare_pieces
                            SET status = 'SOLD_OUT', deleted_at = NOW()
                            WHERE stock_id = ANY(%s::uuid[]) AND deleted_at IS NULL
                        """, (stock_ids,))

                        # Soft delete the inventory_stock records (use deleted_at, not status='DELETED')
                        cursor.execute("""
                            UPDATE inventory_stock
                            SET status = 'SOLD_OUT', deleted_at = NOW()
                            WHERE id = ANY(%s::uuid[]) AND deleted_at IS NULL
                        """, (stock_ids,))

                    # Mark the return as reverted
                    # First clean up orphaned created_by reference if the user no longer exists
                    cursor.execute("""
                        UPDATE returns
                        SET created_by = NULL
                        WHERE id = %s
                          AND created_by IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM users WHERE id = created_by)
                    """, (clean_id,))

                    cursor.execute("""
                        UPDATE returns
                        SET reverted_at = NOW(), reverted_by = %s, status = 'REVERTED', updated_at = NOW()
                        WHERE id = %s
                    """, (user_id, clean_id))

                    # Create audit log
                    actor_label = f"{actor.get('name', 'Unknown')} ({actor.get('role', 'Unknown')})" if actor else "Unknown User"
                    log_msg = f"{actor_label} reverted return {return_record['return_number']}"

                    cursor.execute("""
                        INSERT INTO audit_logs (
                            user_id, action_type, entity_type, entity_id,
                            description, created_at
                        ) VALUES (%s, 'REVERT_RETURN', 'RETURN', %s, %s, NOW())
                    """, (user_id, clean_id, log_msg))

                    reverted_count += 1
                    continue

                # Check if this is a scrap transaction
                if transaction_id.startswith('scrap_'):
                    clean_id = transaction_id.replace('scrap_', '')

                    # Get scrap details
                    cursor.execute("""
                        SELECT s.*
                        FROM scraps s
                        WHERE s.id = %s AND s.deleted_at IS NULL
                    """, (clean_id,))

                    scrap_record = cursor.fetchone()
                    if not scrap_record:
                        failed_transactions.append({'id': transaction_id, 'error': 'Scrap not found or already deleted'})
                        continue

                    # Check if scrap is already cancelled
                    if scrap_record.get('status') == 'CANCELLED':
                        failed_transactions.append({'id': transaction_id, 'error': f"Scrap {scrap_record['scrap_number']} is already cancelled"})
                        continue

                    # Get all scrapped items
                    cursor.execute("""
                        SELECT
                            si.id,
                            si.stock_id,
                            si.stock_type,
                            si.quantity_scrapped,
                            si.batch_id
                        FROM scrap_items si
                        WHERE si.scrap_id = %s
                    """, (clean_id,))

                    scrap_items = cursor.fetchall()

                    if not scrap_items:
                        failed_transactions.append({'id': transaction_id, 'error': 'No scrap items found'})
                        continue

                    # Restore inventory for each scrapped item
                    for item in scrap_items:
                        stock_id = item['stock_id']
                        stock_type = item['stock_type']
                        quantity_scrapped = item['quantity_scrapped']

                        # Check if stock still exists
                        cursor.execute("""
                            SELECT id, quantity, status
                            FROM inventory_stock
                            WHERE id = %s
                        """, (stock_id,))

                        stock = cursor.fetchone()

                        if not stock:
                            print(f"Warning: Stock {stock_id} not found, skipping restoration")
                            continue

                        # Restore quantity to inventory_stock
                        cursor.execute("""
                            UPDATE inventory_stock
                            SET quantity = quantity + %s,
                                status = 'IN_STOCK',
                                updated_at = NOW()
                            WHERE id = %s
                        """, (quantity_scrapped, stock_id))

                        # For CUT_ROLL and SPARE types, restore pieces status
                        if stock_type in ('CUT_ROLL', 'SPARE'):
                            # Get the piece IDs from scrap_pieces
                            cursor.execute("""
                                SELECT original_piece_id, piece_type
                                FROM scrap_pieces sp
                                JOIN scrap_items si ON sp.scrap_item_id = si.id
                                WHERE si.id = %s AND sp.original_piece_id IS NOT NULL
                            """, (item['id'],))

                            pieces = cursor.fetchall()

                            for piece in pieces:
                                piece_id = piece['original_piece_id']
                                piece_type = piece['piece_type']

                                if piece_type == 'CUT_PIECE':
                                    # Restore cut piece status
                                    cursor.execute("""
                                        UPDATE hdpe_cut_pieces
                                        SET status = 'IN_STOCK', deleted_at = NULL, updated_at = NOW()
                                        WHERE id = %s
                                    """, (piece_id,))
                                elif piece_type == 'SPARE_PIECE':
                                    # Restore spare piece status
                                    cursor.execute("""
                                        UPDATE sprinkler_spare_pieces
                                        SET status = 'IN_STOCK', deleted_at = NULL, updated_at = NOW()
                                        WHERE id = %s
                                    """, (piece_id,))

                    # Mark the scrap as cancelled
                    cursor.execute("""
                        UPDATE scraps
                        SET status = 'CANCELLED', updated_at = NOW()
                        WHERE id = %s
                    """, (clean_id,))

                    # Create audit log
                    actor_label = f"{actor.get('name', 'Unknown')} ({actor.get('role', 'Unknown')})" if actor else "Unknown User"
                    log_msg = f"{actor_label} reverted scrap {scrap_record['scrap_number']}"

                    cursor.execute("""
                        INSERT INTO audit_logs (
                            user_id, action_type, entity_type, entity_id,
                            description, created_at
                        ) VALUES (%s, 'REVERT_SCRAP', 'SCRAP', %s, %s, NOW())
                    """, (user_id, clean_id, log_msg))

                    reverted_count += 1
                    continue

                # Check if this is an inventory transaction
                if transaction_id.startswith('inv_'):
                    # Handle inventory operations (CUT_ROLL, SPLIT_BUNDLE, COMBINE_SPARES)
                    clean_id = transaction_id.replace('inv_', '')

                    try:
                        # Get inventory transaction details with dispatch status
                        cursor.execute("""
                            SELECT it.*,
                                   ist_to.batch_id as to_batch_id, ist_from.batch_id as from_batch_id,
                                   ist_to.stock_type as to_stock_type, ist_from.stock_type as from_stock_type,
                                   ist_to.status as to_stock_status, ist_from.status as from_stock_status
                            FROM inventory_transactions it
                            LEFT JOIN inventory_stock ist_to ON it.to_stock_id = ist_to.id
                            LEFT JOIN inventory_stock ist_from ON it.from_stock_id = ist_from.id
                            WHERE it.id = %s
                        """, (clean_id,))

                        inv_transaction = cursor.fetchone()

                        if not inv_transaction:
                            failed_transactions.append({'id': transaction_id, 'error': 'Inventory transaction not found'})
                            continue
                    except Exception as e:
                        import traceback
                        error_trace = traceback.format_exc()
                        print(f"Error fetching inventory transaction: {error_trace}")
                        failed_transactions.append({'id': transaction_id, 'error': f'Error fetching transaction: {str(e)}'})
                        continue

                    # Check if transaction is already reverted
                    if inv_transaction.get('reverted_at') is not None:
                        failed_transactions.append({'id': transaction_id, 'error': f"Transaction {inv_transaction['transaction_type']} is already reverted"})
                        continue

                    # Handle different inventory operation types
                    if inv_transaction['transaction_type'] == 'CUT_ROLL':
                        # Use the proper revert function from inventory_operations
                        try:
                            inv_ops = InventoryOperations(cursor, user_id)
                            inv_ops.revert_cut_roll(clean_id)
                        except Exception as e:
                            import traceback
                            error_trace = traceback.format_exc()
                            print(f"Error reverting CUT_ROLL: {error_trace}")
                            failed_transactions.append({
                                'id': transaction_id,
                                'error': f"Error reverting cut roll: {str(e)}"
                            })
                            continue

                    elif inv_transaction['transaction_type'] == 'SPLIT_BUNDLE':
                        # Validate: Check if spare pieces were already dispatched
                        cursor.execute("""
                            SELECT COUNT(*) as dispatched_count
                            FROM sprinkler_spare_pieces
                            WHERE transaction_id = %s
                            AND status = 'DISPATCHED'
                        """, (clean_id,))

                        dispatched_check = cursor.fetchone()
                        if dispatched_check['dispatched_count'] > 0:
                            failed_transactions.append({
                                'id': transaction_id,
                                'error': f"Cannot revert: {dispatched_check['dispatched_count']} spare pieces have already been dispatched"
                            })
                            continue

                        # Count pieces created by THIS specific transaction
                        cursor.execute("""
                            SELECT COUNT(*) as piece_count
                            FROM sprinkler_spare_pieces
                            WHERE transaction_id = %s
                            AND status = 'IN_STOCK'
                        """, (clean_id,))

                        piece_count = cursor.fetchone()['piece_count']

                        # Soft delete spare pieces created by THIS transaction
                        cursor.execute("""
                            UPDATE sprinkler_spare_pieces
                            SET deleted_at = NOW(),
                                deleted_by_transaction_id = %s,
                                status = 'SOLD_OUT',
                                updated_at = NOW()
                            WHERE created_by_transaction_id = %s
                            AND deleted_at IS NULL
                        """, (clean_id, clean_id))

                        # Reduce SPARE stock quantity and check if it should be deleted
                        if inv_transaction['to_stock_id']:
                            cursor.execute("""
                                UPDATE inventory_stock
                                SET quantity = quantity - %s,
                                    updated_at = NOW()
                                WHERE id = %s
                                RETURNING quantity, created_at
                            """, (piece_count, inv_transaction['to_stock_id']))

                            updated_spare = cursor.fetchone()

                            # If SPARE stock quantity is now 0 and it was created by this transaction, delete it
                            if updated_spare and updated_spare['quantity'] <= 0:
                                # Check if this SPARE stock was created by this transaction
                                import datetime
                                spare_created_at = updated_spare['created_at']
                                transaction_created_at = inv_transaction['created_at']

                                if spare_created_at and transaction_created_at:
                                    time_diff = abs((spare_created_at - transaction_created_at).total_seconds())
                                    is_new_stock = time_diff < 1

                                    if is_new_stock:
                                        # This SPARE stock was created by this transaction - delete it
                                        cursor.execute("""
                                            UPDATE inventory_stock
                                            SET deleted_at = NOW(), status = 'SOLD_OUT'
                                            WHERE id = %s
                                        """, (inv_transaction['to_stock_id'],))

                        # Restore the original bundle
                        if inv_transaction['from_stock_id']:
                            # Check if the bundle stock was deleted (quantity became 0)
                            cursor.execute("""
                                SELECT deleted_at, quantity FROM inventory_stock WHERE id = %s
                            """, (inv_transaction['from_stock_id'],))

                            bundle_stock = cursor.fetchone()

                            if bundle_stock and bundle_stock['deleted_at']:
                                # Bundle was deleted (quantity was 0) - undelete and set quantity to 1
                                cursor.execute("""
                                    UPDATE inventory_stock
                                    SET deleted_at = NULL,
                                        status = 'IN_STOCK',
                                        quantity = 1,
                                        updated_at = NOW()
                                    WHERE id = %s
                                """, (inv_transaction['from_stock_id'],))
                            elif bundle_stock:
                                # Bundle still exists - just increment quantity by 1
                                cursor.execute("""
                                    UPDATE inventory_stock
                                    SET quantity = quantity + 1,
                                        updated_at = NOW()
                                    WHERE id = %s
                                """, (inv_transaction['from_stock_id'],))


                    elif inv_transaction['transaction_type'] == 'COMBINE_SPARES':
                        # Use the proper revert function from inventory_operations
                        try:
                            inv_ops = InventoryOperations(cursor, user_id)
                            inv_ops.revert_combine_spares(clean_id)
                        except Exception as e:
                            import traceback
                            error_trace = traceback.format_exc()
                            print(f"Error reverting COMBINE_SPARES: {error_trace}")
                            failed_transactions.append({
                                'id': transaction_id,
                                'error': f"Error reverting combine spares: {str(e)}"
                            })
                            continue

                    # Mark inventory transaction as reverted using reverted_at/reverted_by columns
                    # First, clean up any orphaned created_by reference that might cause FK constraint failure
                    # This handles cases where data was restored from backup or users were deleted
                    try:
                        cursor.execute("""
                            UPDATE inventory_transactions
                            SET created_by = NULL
                            WHERE id = %s
                              AND created_by IS NOT NULL
                              AND NOT EXISTS (SELECT 1 FROM users WHERE id = created_by)
                        """, (clean_id,))

                        cursor.execute("""
                            UPDATE inventory_transactions
                            SET reverted_at = NOW(), reverted_by = %s
                            WHERE id = %s
                        """, (user_id, clean_id))
                    except Exception as update_error:
                        print(f"Error marking transaction as reverted: {update_error}")
                        print(f"  user_id: {user_id}, clean_id: {clean_id}")
                        failed_transactions.append({
                            'id': transaction_id,
                            'error': f'Failed to mark as reverted: {str(update_error)}'
                        })
                        continue

                    # Create audit log
                    try:
                        actor_label = f"{actor.get('name', 'Unknown')} ({actor.get('role', 'Unknown')})" if actor else "Unknown User"
                        log_msg = f"{actor_label} reverted inventory operation {clean_id} - {inv_transaction['transaction_type']}"

                        cursor.execute("""
                            INSERT INTO audit_logs (
                                user_id, action_type, entity_type, entity_id,
                                description, created_at
                            ) VALUES (%s, 'REVERT_INVENTORY_TRANSACTION', 'INVENTORY_TRANSACTION', %s, %s, NOW())
                        """, (user_id, clean_id, log_msg))
                    except Exception as log_error:
                        print(f"Warning: Failed to create audit log: {log_error}")

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
                actor_label = f"{actor.get('name', 'Unknown')} ({actor.get('role', 'Unknown')})" if actor else "Unknown User"
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
