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

        # Base query
        query = """
            SELECT
                t.id,
                t.transaction_type,
                t.quantity_change,
                t.transaction_date,
                t.invoice_no,
                t.notes,
                t.created_at,
                -- Batch information
                b.batch_code,
                b.batch_no,
                b.initial_quantity as batch_initial_quantity,
                b.current_quantity as batch_current_quantity,
                b.weight_per_meter as batch_weight_per_meter,
                b.total_weight as batch_total_weight,
                b.attachment_url as batch_attachment_url,
                b.production_date,
                -- Roll information
                r.length_meters as roll_length_meters,
                r.initial_length_meters as roll_initial_length_meters,
                r.is_cut_roll as roll_is_cut,
                r.roll_type,
                r.bundle_size as roll_bundle_size,
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
            LEFT JOIN rolls r ON t.roll_id = r.id
            LEFT JOIN product_variants pv ON b.product_variant_id = pv.id
            LEFT JOIN product_types pt ON pv.product_type_id = pt.id
            LEFT JOIN brands br ON pv.brand_id = br.id
            LEFT JOIN units u ON pt.unit_id = u.id
            LEFT JOIN customers c ON t.customer_id = c.id
            LEFT JOIN users usr ON t.created_by = usr.id
            WHERE t.deleted_at IS NULL
            AND pv.id = %s
        """

        params = [product_variant_id]

        # Add date filters if provided
        if start_date:
            query += " AND t.transaction_date >= %s"
            params.append(start_date)

        if end_date:
            query += " AND t.transaction_date <= %s"
            params.append(end_date)

        # Add transaction type filter if provided
        if transaction_type:
            query += " AND t.transaction_type = %s"
            params.append(transaction_type)

        # Order by date descending (most recent first)
        query += " ORDER BY t.transaction_date DESC, t.created_at DESC"

        transactions = execute_query(query, tuple(params))

        # Calculate summary statistics
        summary = {
            'total_transactions': len(transactions),
            'total_produced': 0,
            'total_sold': 0,
            'total_adjustments': 0,
            'total_returns': 0,
            'current_stock': 0
        }

        for txn in transactions:
            qty = abs(txn.get('quantity_change', 0))
            txn_type = txn.get('transaction_type')

            if txn_type == 'PRODUCTION':
                summary['total_produced'] += qty
            elif txn_type == 'SALE':
                summary['total_sold'] += qty
            elif txn_type == 'RETURN':
                summary['total_returns'] += qty
            elif txn_type == 'ADJUSTMENT':
                summary['total_adjustments'] += qty

        # Get current stock from batches
        stock_query = """
            SELECT COALESCE(SUM(b.current_quantity), 0) as current_stock
            FROM batches b
            WHERE b.product_variant_id = %s
            AND b.deleted_at IS NULL
        """
        stock_result = execute_query(stock_query, (product_variant_id,), fetch_one=True)
        summary['current_stock'] = float(stock_result['current_stock']) if stock_result else 0

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
                -- Roll information
                r.length_meters as roll_length_meters,
                r.initial_length_meters as roll_initial_length_meters,
                r.is_cut_roll as roll_is_cut,
                r.roll_type,
                r.bundle_size as roll_bundle_size,
                -- Customer information
                c.name as customer_name,
                -- User information
                usr.full_name as created_by_name
            FROM transactions t
            LEFT JOIN rolls r ON t.roll_id = r.id
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
