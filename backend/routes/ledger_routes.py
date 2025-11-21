from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from database import execute_query
from datetime import datetime, timedelta

ledger_bp = Blueprint('ledger', __name__, url_prefix='/api/ledger')

@ledger_bp.route('/product/<product_variant_id>', methods=['GET'])
@jwt_required()
def get_product_ledger(product_variant_id):
    """Get complete transaction history/ledger for a specific product variant"""
    try:
        # Get query parameters for filtering
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        transaction_type = request.args.get('transaction_type')

        # Build filter conditions for both queries
        date_filter = ""
        date_params = []

        if start_date:
            date_filter += " AND transaction_date >= %s"
            date_params.append(start_date)

        if end_date:
            date_filter += " AND transaction_date <= %s"
            date_params.append(end_date)

        # UNION query combining transactions and inventory_transactions tables
        query = f"""
            WITH all_transactions AS (
                -- Batch-level transactions (PRODUCTION, DISPATCH, SALE)
                SELECT
                    t.id::text as id,
                    t.transaction_type::text,
                    t.quantity_change::numeric,
                    t.transaction_date,
                    t.invoice_no,
                    t.notes,
                    t.created_at,
                    t.batch_id,
                    t.roll_snapshot,
                    'transactions' as source_table,
                    -- Batch information
                    b.batch_code,
                    b.batch_no,
                    b.initial_quantity as batch_initial_quantity,
                    b.current_quantity as batch_current_quantity,
                    b.weight_per_meter as batch_weight_per_meter,
                    b.total_weight as batch_total_weight,
                    b.attachment_url as batch_attachment_url,
                    b.production_date,
                    b.piece_length as batch_piece_length,
                    -- Product information
                    pt.name as product_type,
                    pt.id as product_type_id,
                    br.name as brand,
                    br.id as brand_id,
                    pv.id as product_variant_id,
                    pv.parameters,
                    u.abbreviation as unit_abbreviation,
                    -- Customer information
                    c.name as customer_name,
                    -- User information
                    usr.email as created_by_email,
                    usr.username as created_by_username,
                    usr.full_name as created_by_name
                FROM transactions t
                LEFT JOIN batches b ON t.batch_id = b.id
                LEFT JOIN product_variants pv ON b.product_variant_id = pv.id
                LEFT JOIN product_types pt ON pv.product_type_id = pt.id
                LEFT JOIN brands br ON pv.brand_id = br.id
                LEFT JOIN units u ON pt.unit_id = u.id
                LEFT JOIN customers c ON t.customer_id = c.id
                LEFT JOIN users usr ON t.created_by = usr.id
                WHERE t.deleted_at IS NULL
                AND pv.id = %s
                {date_filter}

                UNION ALL

                -- Stock-level operations (CUT_ROLL, SPLIT_BUNDLE, COMBINE_SPARES)
                SELECT
                    it.id::text as id,
                    it.transaction_type::text,
                    COALESCE(it.to_quantity, it.from_quantity, 0)::numeric as quantity_change,
                    it.created_at as transaction_date,
                    NULL as invoice_no,
                    it.notes,
                    it.created_at,
                    it.batch_id,
                    it.cut_piece_details as roll_snapshot,
                    'inventory_transactions' as source_table,
                    -- Batch information (from batch_id if available, or from stock)
                    b.batch_code,
                    b.batch_no,
                    b.initial_quantity as batch_initial_quantity,
                    b.current_quantity as batch_current_quantity,
                    b.weight_per_meter as batch_weight_per_meter,
                    b.total_weight as batch_total_weight,
                    b.attachment_url as batch_attachment_url,
                    b.production_date,
                    b.piece_length as batch_piece_length,
                    -- Product information
                    pt.name as product_type,
                    pt.id as product_type_id,
                    br.name as brand,
                    br.id as brand_id,
                    pv.id as product_variant_id,
                    pv.parameters,
                    u.abbreviation as unit_abbreviation,
                    -- Customer information
                    NULL as customer_name,
                    -- User information
                    usr.email as created_by_email,
                    usr.username as created_by_username,
                    usr.full_name as created_by_name
                FROM inventory_transactions it
                LEFT JOIN inventory_stock s ON it.from_stock_id = s.id
                LEFT JOIN batches b ON COALESCE(it.batch_id, s.batch_id) = b.id
                LEFT JOIN product_variants pv ON b.product_variant_id = pv.id
                LEFT JOIN product_types pt ON pv.product_type_id = pt.id
                LEFT JOIN brands br ON pv.brand_id = br.id
                LEFT JOIN units u ON pt.unit_id = u.id
                LEFT JOIN users usr ON it.created_by = usr.id
                WHERE pv.id = %s
                {date_filter}
            )
            SELECT *
            FROM all_transactions
            ORDER BY transaction_date DESC, created_at DESC
        """

        # Parameters: product_variant_id for transactions query + date filters,
        # then product_variant_id for inventory_transactions query + date filters
        params = [product_variant_id] + date_params + [product_variant_id] + date_params

        transactions = execute_query(query, tuple(params))

        # Remove duplicate PRODUCTION entries (keep only one per batch)
        seen_batch_productions = set()
        unique_transactions = []

        for txn in transactions:
            # For PRODUCTION transactions, check if we've seen this batch already
            if txn.get('transaction_type') == 'PRODUCTION':
                batch_id = txn.get('batch_id')
                if batch_id in seen_batch_productions:
                    continue  # Skip duplicate
                seen_batch_productions.add(batch_id)

            unique_transactions.append(txn)

        transactions = unique_transactions

        # Enrich transactions with current stock counts from inventory_stock
        for txn in transactions:
            batch_id = txn.get('batch_id')
            if batch_id:
                stock_query = """
                    SELECT
                        stock_type,
                        SUM(quantity) as count
                    FROM inventory_stock
                    WHERE batch_id = %s
                    AND deleted_at IS NULL
                    AND quantity > 0
                    GROUP BY stock_type
                """
                stock_counts = execute_query(stock_query, (batch_id,))

                txn['full_rolls'] = 0
                txn['cut_rolls'] = 0
                txn['bundles'] = 0
                txn['spares'] = 0

                for stock in stock_counts:
                    if stock['stock_type'] == 'FULL_ROLL':
                        txn['full_rolls'] = int(stock['count'] or 0)
                    elif stock['stock_type'] == 'CUT_ROLL':
                        txn['cut_rolls'] = int(stock['count'] or 0)
                    elif stock['stock_type'] == 'BUNDLE':
                        txn['bundles'] = int(stock['count'] or 0)
                    elif stock['stock_type'] == 'SPARE':
                        # For spares, get piece count from sprinkler_spare_pieces table
                        spare_query = """
                            SELECT COALESCE(SUM(ssp.piece_count), 0) as total_pieces
                            FROM inventory_stock s
                            JOIN sprinkler_spare_pieces ssp ON ssp.stock_id = s.id
                            WHERE s.batch_id = %s
                            AND s.stock_type = 'SPARE'
                            AND s.deleted_at IS NULL
                        """
                        spare_result = execute_query(spare_query, (batch_id,), fetch_one=True)
                        txn['spares'] = int(spare_result['total_pieces'] or 0) if spare_result else 0

        # Calculate summary statistics
        summary = {
            'total_transactions': len(transactions),
            'total_produced': 0,
            'total_sold': 0,
            'total_cut_operations': 0,
            'total_split_operations': 0,
            'total_combine_operations': 0,
            'total_adjustments': 0,
            'total_returns': 0
        }

        for txn in transactions:
            qty = abs(txn.get('quantity_change', 0))
            txn_type = txn.get('transaction_type')

            if txn_type == 'PRODUCTION':
                summary['total_produced'] += qty
            elif txn_type in ['SALE', 'DISPATCH']:
                summary['total_sold'] += qty
            elif txn_type == 'CUT_ROLL':
                summary['total_cut_operations'] += 1
            elif txn_type == 'SPLIT_BUNDLE':
                summary['total_split_operations'] += 1
            elif txn_type == 'COMBINE_SPARES':
                summary['total_combine_operations'] += 1
            elif txn_type == 'RETURN':
                summary['total_returns'] += qty
            elif txn_type == 'ADJUSTMENT':
                summary['total_adjustments'] += qty

        # Get current stock summary from inventory_stock
        current_stock_query = """
            SELECT
                stock_type,
                SUM(count) as count,
                SUM(total_length) as total_length
            FROM (
                SELECT
                    s.stock_type,
                    CASE
                        WHEN s.stock_type = 'FULL_ROLL' THEN s.quantity
                        WHEN s.stock_type = 'CUT_ROLL' THEN (
                            SELECT COUNT(*)
                            FROM hdpe_cut_pieces cp
                            WHERE cp.stock_id = s.id AND cp.status = 'IN_STOCK'
                        )
                        WHEN s.stock_type = 'BUNDLE' THEN s.quantity
                        WHEN s.stock_type = 'SPARE' THEN (
                            SELECT COALESCE(SUM(sp.piece_count), 0)
                            FROM sprinkler_spare_pieces sp
                            WHERE sp.stock_id = s.id AND sp.status = 'IN_STOCK'
                        )
                        ELSE s.quantity
                    END as count,
                    CASE
                        WHEN s.stock_type = 'FULL_ROLL' THEN s.quantity * s.length_per_unit
                        WHEN s.stock_type = 'CUT_ROLL' THEN (
                            SELECT COALESCE(SUM(cp.length_meters), 0)
                            FROM hdpe_cut_pieces cp
                            WHERE cp.stock_id = s.id AND cp.status = 'IN_STOCK'
                        )
                        ELSE 0
                    END as total_length
                FROM inventory_stock s
                JOIN batches b ON s.batch_id = b.id
                WHERE b.product_variant_id = %s
                AND s.deleted_at IS NULL
                AND s.quantity > 0
            ) subquery
            GROUP BY stock_type
        """
        current_stock = execute_query(current_stock_query, (product_variant_id,))

        summary['current_stock'] = {
            'full_rolls': 0,
            'cut_rolls': 0,
            'bundles': 0,
            'spares': 0,
            'total_length': 0,
            'total_weight': 0
        }

        for stock in current_stock:
            stock_type = stock['stock_type']
            count = int(stock['count'] or 0)
            total_length = float(stock['total_length'] or 0)

            if stock_type == 'FULL_ROLL':
                summary['current_stock']['full_rolls'] = count
                summary['current_stock']['total_length'] += total_length
            elif stock_type == 'CUT_ROLL':
                summary['current_stock']['cut_rolls'] = count
                summary['current_stock']['total_length'] += total_length
            elif stock_type == 'BUNDLE':
                summary['current_stock']['bundles'] = count
            elif stock_type == 'SPARE':
                summary['current_stock']['spares'] = count

        # Get total weight from batches
        weight_query = """
            SELECT COALESCE(SUM(b.total_weight), 0) as total_weight
            FROM batches b
            WHERE b.product_variant_id = %s
            AND b.deleted_at IS NULL
            AND b.current_quantity > 0
        """
        weight_result = execute_query(weight_query, (product_variant_id,), fetch_one=True)
        summary['current_stock']['total_weight'] = float(weight_result['total_weight'] or 0) if weight_result else 0

        # Get product details
        product_query = """
            SELECT
                pt.name as product_type,
                br.name as brand,
                pv.parameters,
                u.abbreviation as unit,
                pt.id as product_type_id,
                br.id as brand_id
            FROM product_variants pv
            JOIN product_types pt ON pv.product_type_id = pt.id
            JOIN brands br ON pv.brand_id = br.id
            LEFT JOIN units u ON pt.unit_id = u.id
            WHERE pv.id = %s
        """
        product = execute_query(product_query, (product_variant_id,), fetch_one=True)

        return jsonify({
            'product': product,
            'transactions': transactions,
            'summary': summary
        }), 200

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        return jsonify({'error': str(e)}), 500


@ledger_bp.route('/batch/<batch_id>', methods=['GET'])
@jwt_required()
def get_batch_ledger(batch_id):
    """Get transaction history for a specific batch"""
    try:
        query = """
            SELECT
                t.id,
                t.transaction_type,
                t.quantity_change,
                t.transaction_date,
                t.invoice_no,
                t.notes,
                t.created_at,
                -- Roll snapshot data (if available)
                t.roll_snapshot,
                -- Customer information
                c.name as customer_name,
                -- User information
                usr.full_name as created_by_name
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            LEFT JOIN users usr ON t.created_by = usr.id
            WHERE t.batch_id = %s
            AND t.deleted_at IS NULL
            ORDER BY t.transaction_date DESC, t.created_at DESC
        """

        transactions = execute_query(query, (batch_id,))

        # Get batch details
        batch_query = """
            SELECT
                b.batch_code,
                b.batch_no,
                b.initial_quantity,
                b.current_quantity,
                b.production_date,
                pt.name as product_type,
                br.name as brand,
                pv.parameters
            FROM batches b
            JOIN product_variants pv ON b.product_variant_id = pv.id
            JOIN product_types pt ON pv.product_type_id = pt.id
            JOIN brands br ON pv.brand_id = br.id
            WHERE b.id = %s
        """
        batch = execute_query(batch_query, (batch_id,), fetch_one=True)

        return jsonify({
            'batch': batch,
            'transactions': transactions
        }), 200

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        return jsonify({'error': str(e)}), 500
