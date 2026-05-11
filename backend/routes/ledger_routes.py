from datetime import datetime
from uuid import UUID

from flask import Blueprint, jsonify, request

from database import get_db_cursor
from services.auth import jwt_required_with_role

ledger_bp = Blueprint('ledger', __name__, url_prefix='/api/ledger')


def _parse_datetime(value):
    if not value:
        return None

    normalized = value.strip().replace('Z', '+00:00')
    return datetime.fromisoformat(normalized)


def _parse_bool(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in ('1', 'true', 'yes', 'on')


def _parse_limit(value, default=500, max_limit=2000):
    if value is None:
        return default

    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default

    if parsed < 1:
        return default
    return min(parsed, max_limit)


def _get_variant_base_unit(product_variant_id):
    with get_db_cursor(commit=False) as cursor:
        cursor.execute(
            """
                SELECT pt.name AS product_type_name, u.abbreviation AS unit_abbreviation
                FROM product_variants pv
                JOIN product_types pt ON pv.product_type_id = pt.id
                LEFT JOIN units u ON pt.unit_id = u.id
                WHERE pv.id = %s
            """,
            (product_variant_id,)
        )
        row = cursor.fetchone()

    if not row:
        return 'pcs', False

    unit_abbr = (row.get('unit_abbreviation') or '').strip().lower()
    product_type_name = (row.get('product_type_name') or '').strip().lower()
    is_length_based = unit_abbr in ('m', 'meter', 'meters') or 'hdpe' in product_type_name

    return ('m' if is_length_based else 'pcs', is_length_based)


def _build_base_ledger_events_cte(product_variant_id, include_reverted, is_length_based):
    # Note: include_reverted controls whether logically reverted records are included.
    is_length_based_sql = 'TRUE' if is_length_based else 'FALSE'

    return f"""
        WITH ledger_events AS (
            -- Batch-level transactions (PRODUCTION, SALE, etc.)
            SELECT
                CONCAT('txn_', t.id) AS event_id,
                COALESCE(t.transaction_date, t.created_at) AS event_time,
                t.transaction_type::text AS event_type,
                'transactions'::text AS source_table,
                t.id::text AS source_id,
                b.id AS batch_id,
                b.batch_code,
                b.product_variant_id,
                GREATEST(t.quantity_change, 0)::numeric AS quantity_in,
                GREATEST(-t.quantity_change, 0)::numeric AS quantity_out,
                t.quantity_change::numeric AS signed_change,
                GREATEST(t.quantity_change, 0)::numeric AS base_quantity_in,
                GREATEST(-t.quantity_change, 0)::numeric AS base_quantity_out,
                t.quantity_change::numeric AS base_signed_change,
                t.notes,
                t.invoice_no AS reference_no,
                COALESCE(u.full_name, u.username, u.email) AS actor_name,
                jsonb_build_object(
                    'transaction_date', t.transaction_date,
                    'customer_id', t.customer_id,
                    'roll_id', t.roll_id
                ) AS meta
            FROM transactions t
            JOIN batches b ON t.batch_id = b.id
            LEFT JOIN users u ON t.created_by = u.id
            WHERE t.deleted_at IS NULL
              AND b.product_variant_id = %s
              AND b.status != 'REVERTED'

            UNION ALL

            -- Inventory transformations (CUT_ROLL, SPLIT_BUNDLE, COMBINE_SPARES)
            SELECT
                CONCAT('inv_', it.id) AS event_id,
                it.created_at AS event_time,
                CASE
                    WHEN it.reverted_at IS NOT NULL THEN CONCAT('REVERT_', it.transaction_type::text)
                    ELSE it.transaction_type::text
                END AS event_type,
                'inventory_transactions'::text AS source_table,
                it.id::text AS source_id,
                b.id AS batch_id,
                b.batch_code,
                b.product_variant_id,
                COALESCE(it.to_quantity, 0)::numeric AS quantity_in,
                COALESCE(it.from_quantity, 0)::numeric AS quantity_out,
                (COALESCE(it.to_quantity, 0) - COALESCE(it.from_quantity, 0))::numeric AS signed_change,
                0::numeric AS base_quantity_in,
                0::numeric AS base_quantity_out,
                0::numeric AS base_signed_change,
                it.notes,
                NULL::text AS reference_no,
                COALESCE(u.full_name, u.username, u.email) AS actor_name,
                jsonb_build_object(
                    'from_stock_id', it.from_stock_id,
                    'to_stock_id', it.to_stock_id,
                    'from_stock_type', ist_from.stock_type,
                    'to_stock_type', ist_to.stock_type,
                    'from_quantity', it.from_quantity,
                    'to_quantity', it.to_quantity,
                    'from_length', it.from_length,
                    'to_length', it.to_length,
                    'from_pieces', it.from_pieces,
                    'to_pieces', it.to_pieces,
                    'reverted_at', it.reverted_at
                ) AS meta
            FROM inventory_transactions it
            LEFT JOIN inventory_stock ist_to ON it.to_stock_id = ist_to.id
            LEFT JOIN inventory_stock ist_from ON it.from_stock_id = ist_from.id
            LEFT JOIN batches b ON COALESCE(ist_to.batch_id, ist_from.batch_id) = b.id
            LEFT JOIN users u ON it.created_by = u.id
            WHERE it.transaction_type IN ('CUT_ROLL', 'SPLIT_BUNDLE', 'COMBINE_SPARES')
              AND b.product_variant_id = %s
              AND b.status != 'REVERTED'
              AND (%s OR it.reverted_at IS NULL)

            UNION ALL

            -- Dispatch movement (outgoing)
            SELECT
                CONCAT('dispatch_item_', di.id) AS event_id,
                COALESCE(d.dispatch_date, d.created_at) AS event_time,
                CASE
                    WHEN d.reverted_at IS NOT NULL THEN 'DISPATCH_REVERTED'
                    ELSE 'DISPATCH'
                END AS event_type,
                'dispatches'::text AS source_table,
                d.id::text AS source_id,
                ist.batch_id,
                b.batch_code,
                di.product_variant_id,
                0::numeric AS quantity_in,
                COALESCE(di.piece_count, di.quantity, 0)::numeric AS quantity_out,
                -COALESCE(di.piece_count, di.quantity, 0)::numeric AS signed_change,
                0::numeric AS base_quantity_in,
                CASE
                    WHEN {is_length_based_sql} THEN
                        CASE
                            WHEN di.item_type IN ('FULL_ROLL', 'CUT_ROLL', 'CUT_PIECE') THEN COALESCE(di.quantity, 0)::numeric * COALESCE(di.length_meters, ist.length_per_unit, 0)
                            WHEN di.item_type = 'BUNDLE' THEN COALESCE(di.quantity, 0)::numeric * COALESCE(di.pieces_per_bundle, di.bundle_size, 0)::numeric * COALESCE(di.piece_length_meters, 0)
                            WHEN di.item_type = 'SPARE_PIECES' THEN COALESCE(di.piece_count, 0)::numeric * COALESCE(di.piece_length_meters, 0)
                            ELSE COALESCE(di.quantity, 0)::numeric
                        END
                    ELSE
                        CASE
                            WHEN di.item_type = 'SPARE_PIECES' THEN COALESCE(di.piece_count, 0)::numeric
                            ELSE COALESCE(di.quantity, 0)::numeric
                        END
                END AS base_quantity_out,
                -(
                    CASE
                        WHEN {is_length_based_sql} THEN
                            CASE
                                WHEN di.item_type IN ('FULL_ROLL', 'CUT_ROLL', 'CUT_PIECE') THEN COALESCE(di.quantity, 0)::numeric * COALESCE(di.length_meters, ist.length_per_unit, 0)
                                WHEN di.item_type = 'BUNDLE' THEN COALESCE(di.quantity, 0)::numeric * COALESCE(di.pieces_per_bundle, di.bundle_size, 0)::numeric * COALESCE(di.piece_length_meters, 0)
                                WHEN di.item_type = 'SPARE_PIECES' THEN COALESCE(di.piece_count, 0)::numeric * COALESCE(di.piece_length_meters, 0)
                                ELSE COALESCE(di.quantity, 0)::numeric
                            END
                        ELSE
                            CASE
                                WHEN di.item_type = 'SPARE_PIECES' THEN COALESCE(di.piece_count, 0)::numeric
                                ELSE COALESCE(di.quantity, 0)::numeric
                            END
                    END
                ) AS base_signed_change,
                d.notes,
                d.dispatch_number::text AS reference_no,
                COALESCE(u.full_name, u.username, u.email) AS actor_name,
                jsonb_build_object(
                    'dispatch_item_id', di.id,
                    'dispatch_status', d.status,
                    'dispatch_date', d.dispatch_date,
                    'item_type', di.item_type,
                    'quantity', di.quantity,
                    'length_meters', di.length_meters,
                    'length_meters_total', CASE
                        WHEN di.item_type IN ('FULL_ROLL', 'CUT_ROLL', 'CUT_PIECE') THEN COALESCE(di.quantity, 0)::numeric * COALESCE(di.length_meters, ist.length_per_unit, 0)
                        WHEN di.item_type = 'BUNDLE' THEN COALESCE(di.quantity, 0)::numeric * COALESCE(di.pieces_per_bundle, di.bundle_size, 0)::numeric * COALESCE(di.piece_length_meters, 0)
                        WHEN di.item_type = 'SPARE_PIECES' THEN COALESCE(di.piece_count, 0)::numeric * COALESCE(di.piece_length_meters, 0)
                        ELSE COALESCE(di.quantity, 0)::numeric
                    END,
                    'piece_count', di.piece_count,
                    'bundle_size', di.bundle_size,
                    'pieces_per_bundle', di.pieces_per_bundle,
                    'piece_length_meters', di.piece_length_meters,
                    'customer_id', d.customer_id,
                    'customer_name', c.name,
                    'invoice_number', d.invoice_number,
                    'mixed_products', (
                        SELECT COUNT(DISTINCT di2.product_variant_id) > 1
                        FROM dispatch_items di2
                        WHERE di2.dispatch_id = d.id
                    ),
                    'reverted_at', d.reverted_at
                ) AS meta
            FROM dispatch_items di
            JOIN dispatches d ON di.dispatch_id = d.id
            LEFT JOIN inventory_stock ist ON di.stock_id = ist.id
            LEFT JOIN batches b ON ist.batch_id = b.id
            LEFT JOIN customers c ON d.customer_id = c.id
            LEFT JOIN users u ON d.created_by = u.id
            WHERE d.deleted_at IS NULL
              AND di.product_variant_id = %s
              AND (b.status IS NULL OR b.status != 'REVERTED')
              AND (%s OR d.reverted_at IS NULL)

            UNION ALL

            -- Return movement (incoming)
            SELECT
                CONCAT('return_item_', ri.id) AS event_id,
                COALESCE(r.return_date, r.created_at) AS event_time,
                CASE
                    WHEN r.reverted_at IS NOT NULL THEN 'RETURN_REVERTED'
                    ELSE 'RETURN'
                END AS event_type,
                'returns'::text AS source_table,
                r.id::text AS source_id,
                NULL::uuid AS batch_id,
                r.return_number AS batch_code,
                ri.product_variant_id,
                CASE
                    WHEN ri.item_type = 'SPARE_PIECES' THEN COALESCE(ri.piece_count, 0)::numeric
                    ELSE COALESCE(ri.quantity, 0)::numeric
                END AS quantity_in,
                0::numeric AS quantity_out,
                CASE
                    WHEN ri.item_type = 'SPARE_PIECES' THEN COALESCE(ri.piece_count, 0)::numeric
                    ELSE COALESCE(ri.quantity, 0)::numeric
                END AS signed_change,
                CASE
                    WHEN {is_length_based_sql} THEN
                        CASE
                            WHEN ri.item_type IN ('FULL_ROLL', 'CUT_ROLL', 'CUT_PIECE') THEN COALESCE(ri.length_meters, 0)
                            WHEN ri.item_type = 'BUNDLE' THEN COALESCE(ri.quantity, 0)::numeric * COALESCE(ri.piece_count, 0)::numeric * COALESCE(ri.piece_length_meters, 0)
                            WHEN ri.item_type = 'SPARE_PIECES' THEN COALESCE(ri.piece_count, 0)::numeric * COALESCE(ri.piece_length_meters, 0)
                            ELSE COALESCE(ri.quantity, 0)::numeric
                        END
                    ELSE
                        CASE
                            WHEN ri.item_type = 'SPARE_PIECES' THEN COALESCE(ri.piece_count, 0)::numeric
                            ELSE COALESCE(ri.quantity, 0)::numeric
                        END
                END AS base_quantity_in,
                0::numeric AS base_quantity_out,
                CASE
                    WHEN {is_length_based_sql} THEN
                        CASE
                            WHEN ri.item_type IN ('FULL_ROLL', 'CUT_ROLL', 'CUT_PIECE') THEN COALESCE(ri.length_meters, 0)
                            WHEN ri.item_type = 'BUNDLE' THEN COALESCE(ri.quantity, 0)::numeric * COALESCE(ri.piece_count, 0)::numeric * COALESCE(ri.piece_length_meters, 0)
                            WHEN ri.item_type = 'SPARE_PIECES' THEN COALESCE(ri.piece_count, 0)::numeric * COALESCE(ri.piece_length_meters, 0)
                            ELSE COALESCE(ri.quantity, 0)::numeric
                        END
                    ELSE
                        CASE
                            WHEN ri.item_type = 'SPARE_PIECES' THEN COALESCE(ri.piece_count, 0)::numeric
                            ELSE COALESCE(ri.quantity, 0)::numeric
                        END
                END AS base_signed_change,
                r.notes,
                r.return_number::text AS reference_no,
                COALESCE(u.full_name, u.username, u.email) AS actor_name,
                jsonb_build_object(
                    'return_status', r.status,
                    'return_date', r.return_date,
                    'item_type', ri.item_type,
                    'customer_id', r.customer_id,
                    'customer_name', c.name,
                    'reverted_at', r.reverted_at
                ) AS meta
            FROM return_items ri
            JOIN returns r ON ri.return_id = r.id
            LEFT JOIN customers c ON r.customer_id = c.id
            LEFT JOIN users u ON r.created_by = u.id
            WHERE r.deleted_at IS NULL
              AND ri.product_variant_id = %s
              AND (%s OR r.reverted_at IS NULL)

            UNION ALL

            -- Scrap movement (outgoing)
            SELECT
                CONCAT('scrap_item_', si.id) AS event_id,
                COALESCE(s.scrap_date, s.created_at) AS event_time,
                CASE
                    WHEN COALESCE(s.status, 'SCRAPPED') = 'REVERTED' THEN 'SCRAP_REVERTED'
                    ELSE 'SCRAP'
                END AS event_type,
                'scraps'::text AS source_table,
                s.id::text AS source_id,
                si.batch_id,
                b.batch_code,
                si.product_variant_id,
                0::numeric AS quantity_in,
                COALESCE(si.quantity_scrapped, 0)::numeric AS quantity_out,
                -COALESCE(si.quantity_scrapped, 0)::numeric AS signed_change,
                0::numeric AS base_quantity_in,
                CASE
                    WHEN {is_length_based_sql} THEN
                        CASE
                            WHEN si.stock_type = 'FULL_ROLL' THEN COALESCE(si.quantity_scrapped, 0)::numeric * COALESCE(si.length_per_unit, 0)
                            WHEN si.stock_type = 'CUT_ROLL' THEN COALESCE((
                                SELECT SUM(sp.length_meters)
                                FROM scrap_pieces sp
                                WHERE sp.scrap_item_id = si.id
                                  AND sp.length_meters IS NOT NULL
                            ), 0)
                            WHEN si.stock_type = 'BUNDLE' THEN COALESCE(si.quantity_scrapped, 0)::numeric * COALESCE(si.pieces_per_bundle, 0)::numeric * COALESCE(si.piece_length_meters, 0)
                            WHEN si.stock_type = 'SPARE' THEN COALESCE(si.quantity_scrapped, 0)::numeric * COALESCE(si.piece_length_meters, 0)
                            ELSE COALESCE(si.quantity_scrapped, 0)::numeric
                        END
                    ELSE
                        COALESCE(si.quantity_scrapped, 0)::numeric
                END AS base_quantity_out,
                -(
                    CASE
                        WHEN {is_length_based_sql} THEN
                            CASE
                                WHEN si.stock_type = 'FULL_ROLL' THEN COALESCE(si.quantity_scrapped, 0)::numeric * COALESCE(si.length_per_unit, 0)
                                WHEN si.stock_type = 'CUT_ROLL' THEN COALESCE((
                                    SELECT SUM(sp.length_meters)
                                    FROM scrap_pieces sp
                                    WHERE sp.scrap_item_id = si.id
                                      AND sp.length_meters IS NOT NULL
                                ), 0)
                                WHEN si.stock_type = 'BUNDLE' THEN COALESCE(si.quantity_scrapped, 0)::numeric * COALESCE(si.pieces_per_bundle, 0)::numeric * COALESCE(si.piece_length_meters, 0)
                                WHEN si.stock_type = 'SPARE' THEN COALESCE(si.quantity_scrapped, 0)::numeric * COALESCE(si.piece_length_meters, 0)
                                ELSE COALESCE(si.quantity_scrapped, 0)::numeric
                            END
                        ELSE
                            COALESCE(si.quantity_scrapped, 0)::numeric
                    END
                ) AS base_signed_change,
                s.notes,
                s.scrap_number::text AS reference_no,
                COALESCE(u.full_name, u.username, u.email) AS actor_name,
                jsonb_build_object(
                    'scrap_status', s.status,
                    'scrap_date', s.scrap_date,
                    'reason', s.reason,
                    'stock_type', si.stock_type
                ) AS meta
            FROM scrap_items si
            JOIN scraps s ON si.scrap_id = s.id
            LEFT JOIN batches b ON si.batch_id = b.id
            LEFT JOIN users u ON s.created_by = u.id
            WHERE s.deleted_at IS NULL
              AND si.product_variant_id = %s
              AND (b.status IS NULL OR b.status != 'REVERTED')
              AND (%s OR COALESCE(s.status, 'SCRAPPED') != 'REVERTED')
        )
    """, [
        product_variant_id,
        product_variant_id,
        include_reverted,
        product_variant_id,
        include_reverted,
        product_variant_id,
        include_reverted,
        product_variant_id,
        include_reverted,
    ]


@ledger_bp.route('/product/<product_variant_id>/events', methods=['GET'])
@jwt_required_with_role()
def get_product_ledger_events(product_variant_id):
    include_reverted = _parse_bool(request.args.get('include_reverted'), default=False)
    try:
        start_date = _parse_datetime(request.args.get('start_date'))
        end_date = _parse_datetime(request.args.get('end_date'))
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use ISO-8601 values for start_date/end_date.'}), 400
    batch_id = request.args.get('batch_id')
    limit = _parse_limit(request.args.get('limit'), default=500, max_limit=2000)

    try:
        UUID(product_variant_id)
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid product_variant_id'}), 400

    if batch_id:
        try:
            UUID(batch_id)
        except (TypeError, ValueError):
            return jsonify({'error': 'Invalid batch_id'}), 400

    if start_date and end_date and end_date < start_date:
        return jsonify({'error': 'end_date must be greater than or equal to start_date'}), 400

    base_unit, is_length_based = _get_variant_base_unit(product_variant_id)
    base_cte_sql, base_params = _build_base_ledger_events_cte(product_variant_id, include_reverted, is_length_based)

    query = base_cte_sql + """
        , opening AS (
            SELECT COALESCE(SUM(base_signed_change), 0)::numeric AS opening_balance
            FROM ledger_events
                        WHERE (%s::timestamptz IS NOT NULL AND event_time < %s::timestamptz)
              AND (%s::uuid IS NULL OR batch_id = %s::uuid)
        ),
        filtered AS (
            SELECT *
            FROM ledger_events
            WHERE (%s::timestamptz IS NULL OR event_time >= %s::timestamptz)
              AND (%s::timestamptz IS NULL OR event_time <= %s::timestamptz)
              AND (%s::uuid IS NULL OR batch_id = %s::uuid)
        )
        SELECT
            f.event_id,
            to_char(f.event_time AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"') AS event_time,
            f.event_type,
            f.source_table,
            f.source_id,
            f.batch_id,
            f.batch_code,
            f.product_variant_id,
            f.quantity_in,
            f.quantity_out,
            f.signed_change,
            f.base_quantity_in,
            f.base_quantity_out,
            f.base_signed_change,
            f.notes,
            f.reference_no,
            f.actor_name,
            f.meta,
            (
                SELECT opening_balance FROM opening
            ) + SUM(f.base_signed_change) OVER (ORDER BY f.event_time ASC, f.event_id ASC) AS balance_after
        FROM filtered f
        ORDER BY f.event_time DESC, f.event_id DESC
        LIMIT %s
    """

    params = base_params + [
        start_date, start_date, batch_id, batch_id,
        start_date, start_date, end_date, end_date, batch_id, batch_id,
        limit,
    ]

    summary_query = base_cte_sql + """
        , opening AS (
            SELECT COALESCE(SUM(base_signed_change), 0)::numeric AS opening_balance
            FROM ledger_events
                        WHERE (%s::timestamptz IS NOT NULL AND event_time < %s::timestamptz)
              AND (%s::uuid IS NULL OR batch_id = %s::uuid)
        ),
        filtered AS (
            SELECT *
            FROM ledger_events
            WHERE (%s::timestamptz IS NULL OR event_time >= %s::timestamptz)
              AND (%s::timestamptz IS NULL OR event_time <= %s::timestamptz)
              AND (%s::uuid IS NULL OR batch_id = %s::uuid)
        )
        SELECT
            COUNT(*)::int AS event_count,
            COALESCE((SELECT opening_balance FROM opening), 0)::numeric AS opening_balance,
            COALESCE(SUM(filtered.base_quantity_in), 0)::numeric AS total_in,
            COALESCE(SUM(filtered.base_quantity_out), 0)::numeric AS total_out,
            COALESCE(SUM(filtered.base_signed_change), 0)::numeric AS net_change,
            (COALESCE((SELECT opening_balance FROM opening), 0) + COALESCE(SUM(filtered.base_signed_change), 0))::numeric AS closing_balance
        FROM filtered
    """

    summary_params = base_params + [
        start_date, start_date, batch_id, batch_id,
        start_date, start_date, end_date, end_date, batch_id, batch_id,
    ]

    with get_db_cursor(commit=False) as cursor:
        cursor.execute(summary_query, summary_params)
        summary_row = cursor.fetchone()

        cursor.execute(query, params)
        events = cursor.fetchall()

    summary = {
        'event_count': int(summary_row['event_count'] or 0),
        'opening_balance': float(summary_row['opening_balance'] or 0),
        'total_in': float(summary_row['total_in'] or 0),
        'total_out': float(summary_row['total_out'] or 0),
        'net_change': float(summary_row['net_change'] or 0),
        'closing_balance': float(summary_row['closing_balance'] or 0),
    }

    return jsonify({
        'product_variant_id': product_variant_id,
        'base_unit': base_unit,
        'summary': summary,
        'events': events,
    }), 200


@ledger_bp.route('/product/<product_variant_id>/timeseries', methods=['GET'])
@jwt_required_with_role()
def get_product_ledger_timeseries(product_variant_id):
    include_reverted = _parse_bool(request.args.get('include_reverted'), default=False)
    try:
        start_date = _parse_datetime(request.args.get('start_date'))
        end_date = _parse_datetime(request.args.get('end_date'))
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use ISO-8601 values for start_date/end_date.'}), 400
    granularity = (request.args.get('granularity') or 'day').strip().lower()

    try:
        UUID(product_variant_id)
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid product_variant_id'}), 400

    if start_date and end_date and end_date < start_date:
        return jsonify({'error': 'end_date must be greater than or equal to start_date'}), 400

    granularity_map = {
        'hour': 'hour',
        'day': 'day',
        'week': 'week',
        'month': 'month',
    }

    if granularity not in granularity_map:
        return jsonify({'error': 'granularity must be one of: hour, day, week, month'}), 400

    trunc_unit = granularity_map[granularity]

    base_unit, is_length_based = _get_variant_base_unit(product_variant_id)
    base_cte_sql, base_params = _build_base_ledger_events_cte(product_variant_id, include_reverted, is_length_based)

    query = base_cte_sql + f"""
        , opening AS (
            SELECT COALESCE(SUM(base_signed_change), 0)::numeric AS opening_balance
            FROM ledger_events
            WHERE (%s::timestamptz IS NOT NULL AND event_time < %s::timestamptz)
        ),
        grouped AS (
            SELECT
                date_trunc('{trunc_unit}', event_time) AS bucket_time,
                COALESCE(SUM(base_quantity_in), 0)::numeric AS total_in,
                COALESCE(SUM(base_quantity_out), 0)::numeric AS total_out,
                COALESCE(SUM(base_signed_change), 0)::numeric AS net_change,
                COALESCE(SUM(CASE WHEN event_type = 'PRODUCTION' THEN base_quantity_in ELSE 0 END), 0)::numeric AS produced,
                COALESCE(SUM(CASE WHEN event_type IN ('DISPATCH', 'DISPATCH_REVERTED') THEN base_quantity_out ELSE 0 END), 0)::numeric AS dispatched,
                COALESCE(SUM(CASE WHEN event_type IN ('RETURN', 'RETURN_REVERTED') THEN base_quantity_in ELSE 0 END), 0)::numeric AS returned,
                COALESCE(SUM(CASE WHEN event_type IN ('SCRAP', 'SCRAP_REVERTED') THEN base_quantity_out ELSE 0 END), 0)::numeric AS scrapped,
                COALESCE(SUM(CASE WHEN event_type IN ('CUT_ROLL', 'SPLIT_BUNDLE', 'COMBINE_SPARES', 'REVERT_CUT_ROLL', 'REVERT_SPLIT_BUNDLE', 'REVERT_COMBINE_SPARES') THEN base_quantity_out ELSE 0 END), 0)::numeric AS transformed_out
            FROM ledger_events
            WHERE (%s::timestamptz IS NULL OR event_time >= %s::timestamptz)
              AND (%s::timestamptz IS NULL OR event_time <= %s::timestamptz)
            GROUP BY date_trunc('{trunc_unit}', event_time)
        )
        SELECT
            to_char(bucket_time AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"') AS bucket_time,
            total_in,
            total_out,
            net_change,
            produced,
            dispatched,
            returned,
            scrapped,
            transformed_out,
            (
                SELECT opening_balance FROM opening
            ) + SUM(net_change) OVER (ORDER BY bucket_time ASC) AS running_balance
        FROM grouped
        ORDER BY bucket_time ASC
    """

    params = base_params + [
        start_date, start_date,
        start_date, start_date, end_date, end_date,
    ]

    with get_db_cursor(commit=False) as cursor:
        cursor.execute(query, params)
        points = cursor.fetchall()

    return jsonify({
        'product_variant_id': product_variant_id,
        'base_unit': base_unit,
        'granularity': granularity,
        'points': points,
    }), 200


@ledger_bp.route('/event-details', methods=['GET'])
@jwt_required_with_role()
def get_ledger_event_details():
    source_table = (request.args.get('source_table') or '').strip().lower()
    source_id = (request.args.get('source_id') or '').strip()

    if not source_table or not source_id:
        return jsonify({'error': 'source_table and source_id are required'}), 400

    allowed_tables = {'transactions', 'dispatches', 'inventory_transactions', 'returns', 'scraps'}
    if source_table not in allowed_tables:
        return jsonify({'error': 'Invalid source_table'}), 400

    try:
        UUID(source_id)
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid source_id'}), 400

    with get_db_cursor(commit=False) as cursor:
        if source_table == 'transactions':
            cursor.execute(
                """
                    SELECT
                        t.id,
                        t.transaction_type::text AS transaction_type,
                        t.transaction_date,
                        t.quantity_change,
                        t.invoice_no,
                        t.notes,
                        t.roll_snapshot,
                        b.id AS batch_id,
                        b.batch_code,
                        b.batch_no,
                        b.initial_quantity,
                        b.current_quantity,
                        pt.name AS product_type_name,
                        br.name AS brand_name,
                        pv.parameters,
                        COALESCE(u.full_name, u.username, u.email) AS created_by
                    FROM transactions t
                    JOIN batches b ON t.batch_id = b.id
                    JOIN product_variants pv ON b.product_variant_id = pv.id
                    JOIN product_types pt ON pv.product_type_id = pt.id
                    JOIN brands br ON pv.brand_id = br.id
                    LEFT JOIN users u ON t.created_by = u.id
                    WHERE t.id = %s
                """,
                (source_id,)
            )
            row = cursor.fetchone()
            if not row:
                return jsonify({'error': 'Transaction not found'}), 404

            snapshot = row.get('roll_snapshot')
            stock_entries = []
            if isinstance(snapshot, dict):
                stock_entries = snapshot.get('stock_entries') or []

            return jsonify({
                'source_table': source_table,
                'source_id': source_id,
                'details': {
                    'transaction_type': row.get('transaction_type'),
                    'transaction_date': row.get('transaction_date'),
                    'quantity_change': float(row.get('quantity_change') or 0),
                    'invoice_no': row.get('invoice_no'),
                    'notes': row.get('notes'),
                    'batch': {
                        'id': str(row.get('batch_id')) if row.get('batch_id') else None,
                        'batch_code': row.get('batch_code'),
                        'batch_no': row.get('batch_no'),
                        'initial_quantity': float(row.get('initial_quantity') or 0),
                        'current_quantity': float(row.get('current_quantity') or 0),
                    },
                    'product': {
                        'product_type_name': row.get('product_type_name'),
                        'brand_name': row.get('brand_name'),
                        'parameters': row.get('parameters') or {},
                    },
                    'created_by': row.get('created_by'),
                    'stock_entries': stock_entries,
                }
            }), 200

        if source_table == 'dispatches':
            cursor.execute(
                """
                    SELECT
                        d.id,
                        d.dispatch_number,
                        d.dispatch_date,
                        d.invoice_number,
                        d.status,
                        d.notes,
                        c.name AS customer_name,
                        bt.name AS bill_to_name,
                        tr.name AS transport_name,
                        v.vehicle_number,
                        v.driver_name,
                        COALESCE(u.full_name, u.username, u.email) AS created_by
                    FROM dispatches d
                    LEFT JOIN customers c ON d.customer_id = c.id
                    LEFT JOIN bill_to bt ON d.bill_to_id = bt.id
                    LEFT JOIN transports tr ON d.transport_id = tr.id
                    LEFT JOIN vehicles v ON d.vehicle_id = v.id
                    LEFT JOIN users u ON d.created_by = u.id
                    WHERE d.id = %s
                """,
                (source_id,)
            )
            header = cursor.fetchone()
            if not header:
                return jsonify({'error': 'Dispatch not found'}), 404

            cursor.execute(
                """
                    SELECT
                        di.id,
                        di.item_type,
                        di.quantity,
                        di.length_meters,
                        di.piece_count,
                        di.bundle_size,
                        di.pieces_per_bundle,
                        di.piece_length_meters,
                        pt.name AS product_type_name,
                        br.name AS brand_name,
                        pv.parameters,
                        ist.stock_type,
                        ist.length_per_unit
                    FROM dispatch_items di
                    JOIN product_variants pv ON di.product_variant_id = pv.id
                    JOIN product_types pt ON pv.product_type_id = pt.id
                    JOIN brands br ON pv.brand_id = br.id
                    LEFT JOIN inventory_stock ist ON di.stock_id = ist.id
                    WHERE di.dispatch_id = %s
                    ORDER BY di.created_at
                """,
                (source_id,)
            )
            items = cursor.fetchall()

            return jsonify({
                'source_table': source_table,
                'source_id': source_id,
                'details': {
                    'dispatch_number': header.get('dispatch_number'),
                    'dispatch_date': header.get('dispatch_date'),
                    'invoice_number': header.get('invoice_number'),
                    'status': header.get('status'),
                    'notes': header.get('notes'),
                    'customer_name': header.get('customer_name'),
                    'bill_to_name': header.get('bill_to_name'),
                    'transport_name': header.get('transport_name'),
                    'vehicle_number': header.get('vehicle_number'),
                    'driver_name': header.get('driver_name'),
                    'created_by': header.get('created_by'),
                    'mixed_products': len({str(i.get('product_type_name')) + str(i.get('brand_name')) + str(i.get('parameters')) for i in items}) > 1,
                    'items': items,
                }
            }), 200

        if source_table == 'inventory_transactions':
            cursor.execute(
                """
                    SELECT
                        it.id,
                        it.transaction_type,
                        it.from_quantity,
                        it.to_quantity,
                        it.from_length,
                        it.to_length,
                        it.from_pieces,
                        it.to_pieces,
                        it.notes,
                        it.created_at,
                        it.reverted_at,
                        ist_from.stock_type AS from_stock_type,
                        ist_to.stock_type AS to_stock_type,
                        b.batch_code,
                        pt.name AS product_type_name,
                        br.name AS brand_name,
                        pv.parameters,
                        COALESCE(u.full_name, u.username, u.email) AS created_by
                    FROM inventory_transactions it
                    LEFT JOIN inventory_stock ist_from ON it.from_stock_id = ist_from.id
                    LEFT JOIN inventory_stock ist_to ON it.to_stock_id = ist_to.id
                    LEFT JOIN batches b ON COALESCE(ist_to.batch_id, ist_from.batch_id) = b.id
                    LEFT JOIN product_variants pv ON b.product_variant_id = pv.id
                    LEFT JOIN product_types pt ON pv.product_type_id = pt.id
                    LEFT JOIN brands br ON pv.brand_id = br.id
                    LEFT JOIN users u ON it.created_by = u.id
                    WHERE it.id = %s
                """,
                (source_id,)
            )
            row = cursor.fetchone()
            if not row:
                return jsonify({'error': 'Inventory transaction not found'}), 404

            cursor.execute(
                """
                    SELECT id, length_meters, status, created_at, updated_at
                    FROM hdpe_cut_pieces
                    WHERE created_by_transaction_id = %s
                    ORDER BY created_at
                """,
                (source_id,)
            )
            cut_pieces = cursor.fetchall()

            return jsonify({
                'source_table': source_table,
                'source_id': source_id,
                'details': {
                    'transaction_type': row.get('transaction_type'),
                    'created_at': row.get('created_at'),
                    'reverted_at': row.get('reverted_at'),
                    'notes': row.get('notes'),
                    'from_stock_type': row.get('from_stock_type'),
                    'to_stock_type': row.get('to_stock_type'),
                    'from_quantity': row.get('from_quantity'),
                    'to_quantity': row.get('to_quantity'),
                    'from_length': float(row.get('from_length') or 0) if row.get('from_length') is not None else None,
                    'to_length': float(row.get('to_length') or 0) if row.get('to_length') is not None else None,
                    'from_pieces': row.get('from_pieces'),
                    'to_pieces': row.get('to_pieces'),
                    'batch_code': row.get('batch_code'),
                    'product_type_name': row.get('product_type_name'),
                    'brand_name': row.get('brand_name'),
                    'parameters': row.get('parameters') or {},
                    'created_by': row.get('created_by'),
                    'cut_pieces': cut_pieces,
                }
            }), 200

        if source_table == 'returns':
            cursor.execute(
                """
                    SELECT
                        r.id,
                        r.return_number,
                        r.return_date,
                        r.status,
                        r.notes,
                        c.name AS customer_name,
                        COALESCE(u.full_name, u.username, u.email) AS created_by
                    FROM returns r
                    LEFT JOIN customers c ON r.customer_id = c.id
                    LEFT JOIN users u ON r.created_by = u.id
                    WHERE r.id = %s
                """,
                (source_id,)
            )
            header = cursor.fetchone()
            if not header:
                return jsonify({'error': 'Return not found'}), 404

            cursor.execute(
                """
                    SELECT
                        ri.id,
                        ri.item_type,
                        ri.quantity,
                        ri.length_meters,
                        ri.piece_count,
                        ri.bundle_size,
                        ri.piece_length_meters,
                        pt.name AS product_type_name,
                        br.name AS brand_name,
                        pv.parameters
                    FROM return_items ri
                    JOIN product_variants pv ON ri.product_variant_id = pv.id
                    JOIN product_types pt ON pv.product_type_id = pt.id
                    JOIN brands br ON pv.brand_id = br.id
                    WHERE ri.return_id = %s
                    ORDER BY ri.created_at
                """,
                (source_id,)
            )
            items = cursor.fetchall()

            return jsonify({
                'source_table': source_table,
                'source_id': source_id,
                'details': {
                    'return_number': header.get('return_number'),
                    'return_date': header.get('return_date'),
                    'status': header.get('status'),
                    'notes': header.get('notes'),
                    'customer_name': header.get('customer_name'),
                    'created_by': header.get('created_by'),
                    'items': items,
                }
            }), 200

        if source_table == 'scraps':
            cursor.execute(
                """
                    SELECT
                        s.id,
                        s.scrap_number,
                        s.scrap_date,
                        s.status,
                        s.reason,
                        s.notes,
                        COALESCE(u.full_name, u.username, u.email) AS created_by
                    FROM scraps s
                    LEFT JOIN users u ON s.created_by = u.id
                    WHERE s.id = %s
                """,
                (source_id,)
            )
            header = cursor.fetchone()
            if not header:
                return jsonify({'error': 'Scrap not found'}), 404

            cursor.execute(
                """
                    SELECT
                        si.id,
                        si.stock_type,
                        si.quantity_scrapped,
                        si.length_per_unit,
                        si.pieces_per_bundle,
                        si.piece_length_meters,
                        pt.name AS product_type_name,
                        br.name AS brand_name,
                        pv.parameters
                    FROM scrap_items si
                    JOIN product_variants pv ON si.product_variant_id = pv.id
                    JOIN product_types pt ON pv.product_type_id = pt.id
                    JOIN brands br ON pv.brand_id = br.id
                    WHERE si.scrap_id = %s
                    ORDER BY si.created_at
                """,
                (source_id,)
            )
            items = cursor.fetchall()

            return jsonify({
                'source_table': source_table,
                'source_id': source_id,
                'details': {
                    'scrap_number': header.get('scrap_number'),
                    'scrap_date': header.get('scrap_date'),
                    'status': header.get('status'),
                    'reason': header.get('reason'),
                    'notes': header.get('notes'),
                    'created_by': header.get('created_by'),
                    'items': items,
                }
            }), 200

    return jsonify({'error': 'Unsupported source_table'}), 400


@ledger_bp.route('/product/<uuid:product_variant_id>/current-stock', methods=['GET'])
@jwt_required_with_role()
def get_product_current_stock(product_variant_id):
    product_variant_id_str = str(product_variant_id)
    base_unit, _ = _get_variant_base_unit(product_variant_id_str)

    with get_db_cursor(commit=False) as cursor:
        cursor.execute(
            """
                SELECT
                    pt.name AS product_type_name,
                    pt.roll_configuration
                FROM product_variants pv
                JOIN product_types pt ON pv.product_type_id = pt.id
                WHERE pv.id = %s
            """,
            (product_variant_id_str,)
        )
        product_meta = cursor.fetchone() or {}
        roll_configuration = product_meta.get('roll_configuration') or {}
        is_quantity_based = isinstance(roll_configuration, dict) and bool(roll_configuration.get('quantity_based'))
        is_bundle_based = isinstance(roll_configuration, dict) and roll_configuration.get('type') == 'bundles'

        cursor.execute(
            """
                SELECT COALESCE(SUM(b.current_quantity), 0)::numeric AS total_quantity
                FROM batches b
                WHERE b.product_variant_id = %s
                  AND b.deleted_at IS NULL
                  AND b.current_quantity > 0
            """,
            (product_variant_id_str,)
        )
        quantity_row = cursor.fetchone() or {}

        # For HDPE/length-based products, derive length from live stock composition for better accuracy.
        if base_unit == 'm':
            cursor.execute(
                """
                    SELECT
                        COALESCE(SUM(
                            CASE
                                WHEN ist.stock_type = 'FULL_ROLL' THEN COALESCE(ist.quantity, 0)::numeric * COALESCE(ist.length_per_unit, 0)
                                WHEN ist.stock_type = 'BUNDLE' THEN COALESCE(ist.quantity, 0)::numeric * COALESCE(ist.pieces_per_bundle, 0)::numeric * COALESCE(ist.piece_length_meters, 0)
                                WHEN ist.stock_type = 'SPARE' THEN COALESCE(ist.quantity, 0)::numeric * COALESCE(ist.piece_length_meters, 0)
                                ELSE 0::numeric
                            END
                        ), 0)::numeric AS stock_based_length
                    FROM inventory_stock ist
                    JOIN batches b ON ist.batch_id = b.id
                    WHERE b.product_variant_id = %s
                      AND b.deleted_at IS NULL
                      AND ist.deleted_at IS NULL
                      AND ist.quantity > 0
                      AND COALESCE(ist.status, 'IN_STOCK') = 'IN_STOCK'
                """,
                (product_variant_id_str,)
            )
            stock_length_row = cursor.fetchone() or {}

            cursor.execute(
                """
                    SELECT COALESCE(SUM(hcp.length_meters), 0)::numeric AS cut_piece_total_length
                    FROM hdpe_cut_pieces hcp
                    JOIN inventory_stock ist ON hcp.stock_id = ist.id
                    JOIN batches b ON ist.batch_id = b.id
                    WHERE b.product_variant_id = %s
                      AND hcp.deleted_at IS NULL
                      AND hcp.status = 'IN_STOCK'
                      AND ist.deleted_at IS NULL
                      AND b.deleted_at IS NULL
                """,
                (product_variant_id_str,)
            )
            cut_piece_length_row = cursor.fetchone() or {}

            total_quantity = float(stock_length_row.get('stock_based_length') or 0) + float(cut_piece_length_row.get('cut_piece_total_length') or 0)
        elif is_quantity_based and is_bundle_based:
            # For quantity-based sprinkler products, show total pieces from stock representation.
            cursor.execute(
                """
                    SELECT
                        COALESCE(SUM(
                            CASE
                                WHEN ist.stock_type = 'BUNDLE' THEN COALESCE(ist.quantity, 0)::numeric * COALESCE(ist.pieces_per_bundle, 0)::numeric
                                WHEN ist.stock_type = 'SPARE' THEN COALESCE(ist.quantity, 0)::numeric
                                ELSE 0::numeric
                            END
                        ), 0)::numeric AS stock_based_quantity
                    FROM inventory_stock ist
                    JOIN batches b ON ist.batch_id = b.id
                    WHERE b.product_variant_id = %s
                      AND b.deleted_at IS NULL
                      AND b.status != 'REVERTED'
                      AND ist.deleted_at IS NULL
                      AND ist.quantity > 0
                      AND COALESCE(ist.status, 'IN_STOCK') = 'IN_STOCK'
                """,
                (product_variant_id_str,)
            )
            stock_qty_row = cursor.fetchone() or {}
            total_quantity = float(stock_qty_row.get('stock_based_quantity') or 0)
            base_unit = 'pcs'
        else:
            total_quantity = float(quantity_row.get('total_quantity') or 0)

        cursor.execute(
            """
                SELECT
                    COALESCE(SUM(CASE WHEN ist.stock_type = 'FULL_ROLL' THEN ist.quantity ELSE 0 END), 0)::numeric AS full_roll_count,
                    COALESCE(SUM(CASE WHEN ist.stock_type = 'CUT_ROLL' THEN ist.quantity ELSE 0 END), 0)::numeric AS cut_roll_count,
                    COALESCE(SUM(CASE WHEN ist.stock_type = 'BUNDLE' THEN ist.quantity ELSE 0 END), 0)::numeric AS bundle_count,
                    COALESCE(SUM(CASE WHEN ist.stock_type = 'SPARE' THEN ist.quantity ELSE 0 END), 0)::numeric AS spare_count
                FROM inventory_stock ist
                JOIN batches b ON ist.batch_id = b.id
                WHERE b.product_variant_id = %s
                  AND b.deleted_at IS NULL
                  AND b.status != 'REVERTED'
                  AND ist.deleted_at IS NULL
                  AND ist.quantity > 0
                  AND COALESCE(ist.status, 'IN_STOCK') = 'IN_STOCK'
            """,
            (product_variant_id_str,)
        )
        stock_counts = cursor.fetchone() or {}

        cursor.execute(
            """
                SELECT COALESCE(COUNT(*), 0)::int AS cut_piece_count
                FROM hdpe_cut_pieces hcp
                JOIN inventory_stock ist ON hcp.stock_id = ist.id
                JOIN batches b ON ist.batch_id = b.id
                WHERE b.product_variant_id = %s
                  AND hcp.deleted_at IS NULL
                  AND hcp.status = 'IN_STOCK'
                  AND ist.deleted_at IS NULL
                  AND b.deleted_at IS NULL
                  AND b.status != 'REVERTED'
            """,
            (product_variant_id_str,)
        )
        cut_piece_row = cursor.fetchone() or {}

    return jsonify({
        'product_variant_id': product_variant_id_str,
        'base_unit': base_unit,
        'total_quantity': total_quantity,
        'stock_counts': {
            'full_roll_count': float(stock_counts.get('full_roll_count') or 0),
            'cut_roll_count': float(stock_counts.get('cut_roll_count') or 0),
            'bundle_count': float(stock_counts.get('bundle_count') or 0),
            'spare_count': float(stock_counts.get('spare_count') or 0),
            'cut_piece_count': int(cut_piece_row.get('cut_piece_count') or 0),
        },
        'is_quantity_based': is_quantity_based,
        'is_bundle_based': is_bundle_based,
        'product_type_name': product_meta.get('product_type_name'),
        'as_of': datetime.utcnow().isoformat() + 'Z',
    }), 200
