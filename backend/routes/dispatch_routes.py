from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import execute_query, execute_insert, get_db_cursor
from services.inventory_helpers_aggregate import AggregateInventoryHelper as InventoryHelper
from services.inventory_operations import InventoryOperations, ValidationError, ConcurrencyError, ReservationError
from services.auth import get_user_identity_details
from decimal import Decimal
import json

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
    brand_id = data.get('brand_id')  # Optional for "All Brands"
    parameters = data.get('parameters', {})

    if not product_type_id:
        return jsonify({'error': 'product_type_id is required'}), 400

    # Find the product variant
    if brand_id:
        variant_query = """
            SELECT id, parameters
            FROM product_variants
            WHERE product_type_id = %s
            AND brand_id = %s
            AND deleted_at IS NULL
        """
        variants = execute_query(variant_query, (product_type_id, brand_id))
    else:
        # All brands - fetch all variants for this product type
        variant_query = """
            SELECT id, parameters
            FROM product_variants
            WHERE product_type_id = %s
            AND deleted_at IS NULL
        """
        variants = execute_query(variant_query, (product_type_id,))

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
        return jsonify({'products': [], 'message': 'No matching product variant found'}), 200

    # Get all available rolls for matching variants
    variant_ids = [v['id'] for v in matching_variants]
    placeholders = ','.join(['%s'] * len(variant_ids))

    # Use inventory_unified view for querying
    rolls_query = f"""
        SELECT
            id,
            batch_id,
            batch_code,
            status,
            product_category,
            product_variant_id,
            parameters,
            product_type_name as product_type,
            brand_name as brand,
            -- HDPE fields
            length_meters,
            initial_length_meters,
            is_cut_roll,
            -- Sprinkler fields
            bundle_type,
            bundle_size,
            piece_count,
            piece_length_meters,
            total_length_meters
        FROM inventory_unified
        WHERE product_variant_id IN ({placeholders})
        AND deleted_at IS NULL
        AND status IN ('AVAILABLE', 'PARTIAL')
        AND (
            (product_category = 'HDPE' AND length_meters > 0) OR
            (product_category = 'SPRINKLER' AND piece_count > 0)
        )
        ORDER BY parameters, product_category, created_at
    """

    all_rolls = execute_query(rolls_query, tuple(variant_ids))

    # Group by product parameters (not variant_id) to merge across batches
    product_groups = {}  # key: product_label, value: {product_info, standard_rolls, cut_rolls}

    for roll in all_rolls:
        # Build product label: PRODUCT-PARAMS-BRAND
        params_str = ''
        if roll['parameters']:
            params_list = [str(v) for v in roll['parameters'].values()]
            params_str = '-'.join(params_list)

        product_label = f"{roll['product_type']}"
        if params_str:
            product_label += f"-{params_str}"
        product_label += f"-{roll['brand']}"

        # Initialize product group if not exists
        if product_label not in product_groups:
            product_groups[product_label] = {
                'product_label': product_label,
                'product_type': roll['product_type'],
                'brand': roll['brand'],
                'parameters': roll['parameters'],
                'product_category': roll['product_category'],
                'standard_rolls': [],
                'cut_rolls': [],
                'bundles': [],
                'spares': [],
                'total_length': 0
            }

        # Build roll info based on product category
        if roll['product_category'] == 'HDPE':
            roll_info = {
                'id': roll['id'],
                'batch_id': roll['batch_id'],
                'batch_code': roll['batch_code'],
                'length_meters': float(roll['length_meters']),
                'initial_length_meters': float(roll['initial_length_meters']),
                'status': roll['status'],
                'is_cut_roll': roll['is_cut_roll'],
                'product_category': 'HDPE'
            }

            if roll['is_cut_roll']:
                product_groups[product_label]['cut_rolls'].append(roll_info)
            else:
                product_groups[product_label]['standard_rolls'].append(roll_info)
            product_groups[product_label]['total_length'] += float(roll['length_meters'])

        elif roll['product_category'] == 'SPRINKLER':
            roll_info = {
                'id': roll['id'],
                'batch_id': roll['batch_id'],
                'batch_code': roll['batch_code'],
                'bundle_type': roll['bundle_type'],
                'bundle_size': roll['bundle_size'],
                'piece_count': roll['piece_count'],
                'piece_length_meters': float(roll['piece_length_meters']),
                'total_length_meters': float(roll['total_length_meters']),
                'status': roll['status'],
                'product_category': 'SPRINKLER'
            }

            # For spare pieces, fetch individual spare_ids from sprinkler_spare_pieces table
            if roll['bundle_type'] == 'spare':
                cursor = get_db_cursor().__enter__()
                cursor.execute("""
                    SELECT array_agg(id::text ORDER BY created_at) as spare_ids
                    FROM sprinkler_spare_pieces
                    WHERE stock_id = %s AND status = 'IN_STOCK'
                """, (roll['id'],))
                spare_ids_result = cursor.fetchone()
                roll_info['spare_ids'] = spare_ids_result['spare_ids'] if spare_ids_result and spare_ids_result['spare_ids'] else []

            if roll['bundle_type'] == 'bundle':
                product_groups[product_label]['bundles'].append(roll_info)
            else:  # spare
                product_groups[product_label]['spares'].append(roll_info)
            product_groups[product_label]['total_length'] += float(roll['total_length_meters'])

    # Convert to list format
    products = []
    for group in product_groups.values():
        products.append({
            'product_label': group['product_label'],
            'product_type': group['product_type'],
            'brand': group['brand'],
            'parameters': group['parameters'],
            'product_category': group['product_category'],
            'standard_rolls': group['standard_rolls'],
            'cut_rolls': group['cut_rolls'],
            'bundles': group['bundles'],
            'spares': group['spares'],
            'total_available_meters': group['total_length']
        })

    return jsonify({
        'products': products
    }), 200


@dispatch_bp.route('/create', methods=['POST'])
@jwt_required()
def create_dispatch_legacy():
    """
    LEGACY: Create a dispatch/sale transaction (old system).
    Use /create-dispatch endpoint instead for new modular system.

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
    transaction_date = data.get('transaction_date')  # Optional custom date

    if not customer_id or not items:
        return jsonify({'error': 'customer_id and items are required'}), 400

    try:
        with get_db_cursor() as cursor:
            # Generate a single dispatch_id for this dispatch
            cursor.execute("SELECT gen_random_uuid() as dispatch_id")
            dispatch_id = cursor.fetchone()['dispatch_id']

            total_quantity = 0
            roll_snapshots = []  # Store all rolls in this dispatch
            first_batch_id = None
            first_roll_id = None

            for item in items:
                roll_id = item.get('roll_id')
                dispatch_quantity = float(item.get('quantity', 0))
                item_type = item.get('type', 'full_roll')

                if not roll_id or dispatch_quantity <= 0:
                    return jsonify({'error': 'Invalid item data'}), 400

                # Get roll/bundle details using inventory_unified view
                cursor.execute("""
                    SELECT
                        id, batch_id, product_variant_id, product_category, status,
                        length_meters, is_cut_roll,
                        bundle_type, bundle_size, piece_count, piece_length_meters,
                        batch_code, product_type_name, brand_name, parameters
                    FROM inventory_unified
                    WHERE id = %s AND deleted_at IS NULL
                """, (roll_id,))

                roll = cursor.fetchone()
                if not roll:
                    return jsonify({'error': f'Inventory item {roll_id} not found'}), 404

                # Store first batch/roll for the transaction record
                if first_batch_id is None:
                    first_batch_id = roll['batch_id']
                    first_roll_id = roll_id

                product_category = roll['product_category']

                # ==================================================
                # HDPE Roll Dispatch
                # ==================================================
                if product_category == 'HDPE':
                    available_length = float(roll['length_meters'])

                    if item_type == 'full_roll':
                        # Dispatch entire roll
                        quantity_dispatched = available_length
                        InventoryHelper.update_hdpe_roll_length(cursor, roll_id, 0)

                    elif item_type == 'partial_roll':
                        # Dispatch partial quantity from roll
                        if dispatch_quantity > available_length:
                            return jsonify({'error': f'Insufficient length in HDPE roll {roll_id}'}), 400

                        quantity_dispatched = dispatch_quantity
                        remaining = available_length - dispatch_quantity
                        InventoryHelper.update_hdpe_roll_length(cursor, roll_id, remaining)

                    else:
                        return jsonify({'error': f'Invalid item type for HDPE: {item_type}'}), 400

                # ==================================================
                # Sprinkler Bundle/Spare Dispatch
                # ==================================================
                elif product_category == 'SPRINKLER':
                    if item_type == 'full_roll':  # Actually full bundle
                        # Dispatch entire bundle/spare
                        quantity_dispatched = float(roll['total_length_meters']) if roll.get('total_length_meters') else float(roll['piece_count']) * float(roll['piece_length_meters'])

                        # Mark as SOLD_OUT
                        cursor.execute("""
                            UPDATE inventory_items
                            SET status = 'SOLD_OUT', deleted_at = NOW(), updated_at = NOW()
                            WHERE id = %s
                        """, (roll_id,))

                    elif item_type == 'partial_roll':
                        # For Sprinkler, "partial" means dispatching some pieces from a bundle
                        # This is rare but possible
                        pieces_to_dispatch = int(dispatch_quantity / float(roll['piece_length_meters']))
                        if pieces_to_dispatch > roll['piece_count']:
                            return jsonify({'error': f'Insufficient pieces in bundle {roll_id}'}), 400

                        quantity_dispatched = pieces_to_dispatch * float(roll['piece_length_meters'])
                        InventoryHelper.update_sprinkler_bundle_pieces(cursor, roll_id, pieces_to_dispatch)

                    else:
                        return jsonify({'error': f'Invalid item type for Sprinkler: {item_type}'}), 400

                else:
                    return jsonify({'error': f'Unknown product category: {product_category}'}), 400

                # Collect roll snapshot for this roll with batch and product info
                roll_snapshots.append({
                    'roll_id': str(roll_id),
                    'batch_id': str(roll['batch_id']),
                    'batch_code': roll['batch_code'],
                    'batch_no': roll['batch_no'],
                    'product_type': roll['product_type_name'],
                    'brand': roll['brand_name'],
                    'parameters': roll['parameters'],
                    'quantity_dispatched': quantity_dispatched,
                    'length_meters': float(roll['length_meters']),
                    'initial_length_meters': float(roll['initial_length_meters']),
                    'is_cut_roll': roll.get('is_cut_roll', False),
                    'roll_type': roll.get('roll_type'),
                    'bundle_size': roll.get('bundle_size'),
                    'status': roll.get('status')
                })

                total_quantity += quantity_dispatched

            # Create ONE transaction for the entire dispatch
            # Store all rolls in roll_snapshot as an array
            if transaction_date:
                cursor.execute("""
                    INSERT INTO transactions (
                        batch_id, roll_id, transaction_type, quantity_change,
                        customer_id, invoice_no, notes, roll_snapshot, dispatch_id, created_by, transaction_date
                    )
                    VALUES (%s, %s, 'SALE', %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    first_batch_id,
                    first_roll_id,
                    -total_quantity,  # Negative for outgoing, total of all rolls
                    customer_id,
                    invoice_number,
                    notes,
                    json.dumps({'rolls': roll_snapshots, 'total_rolls': len(roll_snapshots)}),
                    dispatch_id,
                    user_id,
                    transaction_date
                ))
            else:
                cursor.execute("""
                    INSERT INTO transactions (
                        batch_id, roll_id, transaction_type, quantity_change,
                        customer_id, invoice_no, notes, roll_snapshot, dispatch_id, created_by
                    )
                    VALUES (%s, %s, 'SALE', %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    first_batch_id,
                    first_roll_id,
                    -total_quantity,  # Negative for outgoing, total of all rolls
                    customer_id,
                    invoice_number,
                    notes,
                    json.dumps({'rolls': roll_snapshots, 'total_rolls': len(roll_snapshots)}),
                    dispatch_id,
                    user_id
                ))

            transaction_id = cursor.fetchone()['id']

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
                str(transaction_id),
                f"{actor['name']} dispatched {len(roll_snapshots)} roll(s) totaling {total_quantity}m to customer"
            ))

        return jsonify({
            'message': 'Dispatch created successfully',
            'transaction_id': str(transaction_id),
            'total_quantity': float(total_quantity),
            'rolls_count': len(roll_snapshots)
        }), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dispatch_bp.route('/products-summary', methods=['GET'])
@jwt_required()
def get_products_summary():
    """
    Get aggregated product inventory grouped by product category (type + brand + parameters).
    Returns total quantities and roll counts across all batches.
    """
    try:
        brand_id = request.args.get('brand_id')
        product_type_id = request.args.get('product_type_id')

        # Build WHERE clause based on filters
        where_conditions = ["pv.deleted_at IS NULL"]
        params = []

        if brand_id and brand_id != 'all':
            where_conditions.append("br.id = %s")
            params.append(brand_id)

        if product_type_id and product_type_id != 'all':
            where_conditions.append("pt.id = %s")
            params.append(product_type_id)

        where_clause = " AND ".join(where_conditions)

        # Query to aggregate rolls by product variant
        query = f"""
            SELECT
                pv.id as variant_id,
                pt.id as product_type_id,
                pt.name as product_type,
                pt.roll_configuration,
                br.id as brand_id,
                br.name as brand,
                pv.parameters,
                COUNT(CASE WHEN r.roll_type = 'standard' AND NOT r.is_cut_roll THEN 1 END) as standard_rolls_count,
                COUNT(CASE WHEN r.is_cut_roll THEN 1 END) as cut_rolls_count,
                COUNT(CASE WHEN r.roll_type LIKE 'bundle_%' THEN 1 END) as bundles_count,
                COUNT(CASE WHEN r.roll_type = 'spare' THEN 1 END) as spare_pieces_count,
                COALESCE(SUM(r.length_meters), 0) as total_quantity,
                COALESCE(AVG(CASE WHEN r.roll_type = 'standard' AND NOT r.is_cut_roll THEN r.length_meters END), 0) as avg_standard_length,
                COUNT(r.id) as total_items
            FROM product_variants pv
            JOIN product_types pt ON pv.product_type_id = pt.id
            JOIN brands br ON pv.brand_id = br.id
            LEFT JOIN rolls r ON r.product_variant_id = pv.id
                AND r.deleted_at IS NULL
                AND r.status IN ('AVAILABLE', 'PARTIAL')
                AND r.length_meters > 0
            WHERE {where_clause}
            GROUP BY pv.id, pt.id, pt.name, pt.roll_configuration, br.id, br.name, pv.parameters
            HAVING COUNT(r.id) > 0
            ORDER BY pt.name, br.name, pv.parameters
        """

        products = execute_query(query, tuple(params))

        result = []
        for product in products:
            result.append({
                'variant_id': str(product['variant_id']),
                'product_type_id': product['product_type_id'],
                'product_type': product['product_type'],
                'brand_id': product['brand_id'],
                'brand': product['brand'],
                'parameters': product['parameters'] or {},
                'roll_configuration': product['roll_configuration'] or {},
                'standard_rolls_count': int(product['standard_rolls_count'] or 0),
                'cut_rolls_count': int(product['cut_rolls_count'] or 0),
                'bundles_count': int(product['bundles_count'] or 0),
                'spare_pieces_count': int(product['spare_pieces_count'] or 0),
                'total_quantity': float(product['total_quantity'] or 0),
                'avg_standard_length': float(product['avg_standard_length'] or 0),
                'total_items': int(product['total_items'] or 0)
            })

        return jsonify({'products': result}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dispatch_bp.route('/product-rolls/<variant_id>', methods=['GET'])
@jwt_required()
def get_product_rolls(variant_id):
    """
    Get all available rolls for a specific product variant.
    Used when user selects a product category to dispatch.
    """
    try:
        query = """
            SELECT
                r.id,
                r.batch_id,
                r.length_meters,
                r.initial_length_meters,
                r.status,
                r.is_cut_roll,
                r.roll_type,
                r.bundle_size,
                b.batch_code,
                b.batch_no
            FROM rolls r
            JOIN batches b ON r.batch_id = b.id
            WHERE r.product_variant_id = %s
            AND r.deleted_at IS NULL
            AND r.status IN ('AVAILABLE', 'PARTIAL')
            AND r.length_meters > 0
            ORDER BY
                CASE WHEN r.roll_type = 'standard' THEN 1
                     WHEN r.is_cut_roll THEN 2
                     WHEN r.roll_type LIKE 'bundle_%' THEN 3
                     ELSE 4 END,
                r.length_meters DESC,
                r.created_at
        """

        rolls = execute_query(query, (variant_id,))

        # Separate by type
        standard_rolls = []
        cut_rolls = []
        bundles = []
        spares = []

        for roll in rolls:
            roll_data = {
                'id': str(roll['id']),
                'batch_id': str(roll['batch_id']),
                'batch_code': roll['batch_code'],
                'batch_no': roll['batch_no'],
                'length_meters': float(roll['length_meters']),
                'initial_length_meters': float(roll['initial_length_meters']),
                'status': roll['status'],
                'is_cut_roll': roll['is_cut_roll'],
                'roll_type': roll['roll_type'],
                'bundle_size': roll['bundle_size']
            }

            if roll['roll_type'] == 'standard' and not roll['is_cut_roll']:
                standard_rolls.append(roll_data)
            elif roll['is_cut_roll']:
                cut_rolls.append(roll_data)
            elif roll['roll_type'] and roll['roll_type'].startswith('bundle_'):
                bundles.append(roll_data)
            elif roll['roll_type'] == 'spare':
                spares.append(roll_data)

        return jsonify({
            'standard_rolls': standard_rolls,
            'cut_rolls': cut_rolls,
            'bundles': bundles,
            'spares': spares
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dispatch_bp.route('/dispatch-sale', methods=['POST'])
@jwt_required()
def dispatch_sale():
    """
    Create a dispatch sale with enhanced fields.
    Request body: {
        customer_id: UUID,
        bill_to_id: UUID (optional),
        transport_id: UUID (optional),
        vehicle_id: UUID (optional),
        invoice_number: string (optional),
        notes: string (optional),
        rolls: [
            {
                roll_id: UUID,
                quantity: float (length in meters or count)
            }
        ]
    }
    """
    user_id = get_jwt_identity()
    data = request.json

    customer_id = data.get('customer_id')
    bill_to_id = data.get('bill_to_id')
    transport_id = data.get('transport_id')
    vehicle_id = data.get('vehicle_id')
    invoice_number = data.get('invoice_number')
    notes = data.get('notes', '')
    rolls = data.get('rolls', [])

    if not customer_id:
        return jsonify({'error': 'customer_id is required'}), 400

    if not rolls or len(rolls) == 0:
        return jsonify({'error': 'At least one roll is required'}), 400

    try:
        with get_db_cursor() as cursor:
            # Generate dispatch_id
            cursor.execute("SELECT gen_random_uuid() as dispatch_id")
            dispatch_id = cursor.fetchone()['dispatch_id']

            total_quantity = 0
            roll_snapshots = []
            first_batch_id = None
            first_roll_id = None

            for roll_item in rolls:
                roll_id = roll_item.get('roll_id')
                dispatch_quantity = float(roll_item.get('quantity', 0))

                if not roll_id or dispatch_quantity <= 0:
                    return jsonify({'error': 'Invalid roll data'}), 400

                # Get roll details
                cursor.execute("""
                    SELECT
                        r.*,
                        r.batch_id,
                        pv.id as product_variant_id,
                        b.batch_code,
                        b.batch_no,
                        pt.name as product_type_name,
                        br.name as brand_name,
                        pv.parameters
                    FROM rolls r
                    JOIN batches b ON r.batch_id = b.id
                    JOIN product_variants pv ON b.product_variant_id = pv.id
                    JOIN product_types pt ON pv.product_type_id = pt.id
                    JOIN brands br ON pv.brand_id = br.id
                    WHERE r.id = %s AND r.deleted_at IS NULL
                """, (roll_id,))

                roll = cursor.fetchone()
                if not roll:
                    return jsonify({'error': f'Roll {roll_id} not found'}), 404

                if first_batch_id is None:
                    first_batch_id = roll['batch_id']
                    first_roll_id = roll_id

                available_length = float(roll['length_meters'])

                # Determine if full or partial dispatch
                if dispatch_quantity >= available_length:
                    # Full roll dispatch
                    quantity_dispatched = available_length
                    cursor.execute("""
                        UPDATE rolls
                        SET length_meters = 0, status = 'SOLD_OUT', deleted_at = NOW(), updated_at = NOW()
                        WHERE id = %s
                    """, (roll_id,))
                else:
                    # Partial dispatch
                    quantity_dispatched = dispatch_quantity
                    remaining = available_length - dispatch_quantity

                    if remaining == 0:
                        cursor.execute("""
                            UPDATE rolls
                            SET length_meters = 0, status = 'SOLD_OUT', deleted_at = NOW(), updated_at = NOW()
                            WHERE id = %s
                        """, (roll_id,))
                    else:
                        cursor.execute("""
                            UPDATE rolls
                            SET length_meters = %s, status = 'PARTIAL', updated_at = NOW()
                            WHERE id = %s
                        """, (remaining, roll_id))

                # Update batch quantity
                cursor.execute("""
                    UPDATE batches
                    SET current_quantity = current_quantity - %s, updated_at = NOW()
                    WHERE id = %s
                """, (quantity_dispatched, roll['batch_id']))

                # Create transaction record
                cursor.execute("""
                    INSERT INTO transactions (
                        batch_id,
                        roll_id,
                        transaction_type,
                        quantity_change,
                        customer_id,
                        bill_to_id,
                        transport_id,
                        vehicle_id,
                        invoice_no,
                        notes,
                        roll_snapshot,
                        dispatch_id,
                        created_by
                    )
                    VALUES (%s, %s, 'SALE', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    roll['batch_id'],
                    roll_id,
                    -quantity_dispatched,
                    customer_id,
                    bill_to_id,
                    transport_id,
                    vehicle_id,
                    invoice_number,
                    notes,
                    json.dumps({
                        'roll_id': str(roll_id),
                        'batch_code': roll['batch_code'],
                        'quantity': quantity_dispatched
                    }),
                    dispatch_id,
                    user_id
                ))

                total_quantity += quantity_dispatched

            return jsonify({
                'success': True,
                'dispatch_id': str(dispatch_id),
                'total_quantity': total_quantity,
                'rolls_dispatched': len(rolls)
            }), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dispatch_bp.route('/create-dispatch', methods=['POST'])
@jwt_required()
def create_dispatch():
    """
    Create a new dispatch using inventory_stock (new modular system).
    Supports HDPE rolls, cut pieces, Sprinkler bundles, and spare pieces.

    Request body:
    {
        "customer_id": "uuid",
        "bill_to_id": "uuid" (optional),
        "transport_id": "uuid" (optional),
        "vehicle_id": "uuid" (optional),
        "invoice_number": "string" (optional),
        "notes": "string" (optional),
        "items": [
            {
                "stock_id": "uuid",
                "product_variant_id": "uuid",
                "item_type": "FULL_ROLL|CUT_PIECE|BUNDLE|SPARE_PIECES",
                "quantity": number,
                "cut_piece_id": "uuid" (for CUT_PIECE),
                "length_meters": number (for CUT_PIECE),
                "spare_piece_ids": ["uuid"] (for SPARE_PIECES),
                "piece_count": number (for SPARE_PIECES),
                "bundle_size": number (for BUNDLE),
                "pieces_per_bundle": number (for BUNDLE),
                "piece_length_meters": number (for BUNDLE)
            }
        ]
    }
    """
    try:
        data = request.json
        user_id = get_jwt_identity()

        # Validate required fields
        customer_id = data.get('customer_id')
        items = data.get('items', [])

        if not customer_id:
            return jsonify({'error': 'customer_id is required'}), 400

        if not items or len(items) == 0:
            return jsonify({'error': 'At least one item is required'}), 400

        # Optional fields
        bill_to_id = data.get('bill_to_id')
        transport_id = data.get('transport_id')
        vehicle_id = data.get('vehicle_id')
        invoice_number = data.get('invoice_number')
        notes = data.get('notes')
        dispatch_date = data.get('dispatch_date')  # Optional: for backdating

        print(f"DEBUG: Received dispatch_date = {dispatch_date}")

        with get_db_cursor() as cursor:
            # Start explicit transaction
            cursor.execute("BEGIN")

            try:
                # ============================================================
                # PHASE 1: PRE-VALIDATION - Validate ALL items before dispatch
                # This ensures atomic all-or-nothing behavior
                # ============================================================
                print(f"DEBUG: Pre-validating {len(items)} items before dispatch...")

                for idx, item in enumerate(items):
                    stock_id = item.get('stock_id')
                    product_variant_id = item.get('product_variant_id')
                    item_type = item.get('item_type')
                    quantity = item.get('quantity', 1)

                    if not all([stock_id, product_variant_id, item_type]):
                        cursor.execute("ROLLBACK")
                        return jsonify({'error': f'Item {idx+1}: Missing required fields (stock_id, product_variant_id, item_type)'}), 400

                    # Validate stock exists and is available
                    cursor.execute("""
                        SELECT quantity, status, stock_type
                        FROM inventory_stock
                        WHERE id = %s AND deleted_at IS NULL
                    """, (stock_id,))

                    stock = cursor.fetchone()
                    if not stock:
                        cursor.execute("ROLLBACK")
                        return jsonify({'error': f'Item {idx+1}: Stock {stock_id} not found'}), 404

                    if stock['status'] != 'IN_STOCK':
                        cursor.execute("ROLLBACK")
                        return jsonify({'error': f'Item {idx+1}: Stock {stock_id} is not available (status: {stock["status"]})'}), 400

                    if stock['quantity'] < quantity:
                        cursor.execute("ROLLBACK")
                        return jsonify({'error': f'Item {idx+1}: Insufficient quantity for stock {stock_id}. Available: {stock["quantity"]}, Requested: {quantity}'}), 400

                    # Validate item-type specific requirements
                    if item_type == 'CUT_PIECE':
                        cut_piece_id = item.get('cut_piece_id')
                        if not cut_piece_id:
                            cursor.execute("ROLLBACK")
                            return jsonify({'error': f'Item {idx+1}: cut_piece_id required for CUT_PIECE'}), 400

                        cursor.execute("""
                            SELECT status FROM hdpe_cut_pieces
                            WHERE id = %s AND stock_id = %s AND deleted_at IS NULL
                        """, (cut_piece_id, stock_id))

                        cut_piece = cursor.fetchone()
                        if not cut_piece:
                            cursor.execute("ROLLBACK")
                            return jsonify({'error': f'Item {idx+1}: Cut piece {cut_piece_id} not found'}), 400

                        if cut_piece['status'] != 'IN_STOCK':
                            cursor.execute("ROLLBACK")
                            return jsonify({'error': f'Item {idx+1}: Cut piece {cut_piece_id} not available (status: {cut_piece["status"]})'}, 400)

                    elif item_type == 'SPARE_PIECES':
                        spare_piece_ids = item.get('spare_piece_ids', [])
                        piece_count = item.get('piece_count', 0)

                        if not spare_piece_ids or piece_count <= 0:
                            cursor.execute("ROLLBACK")
                            return jsonify({'error': f'Item {idx+1}: spare_piece_ids and piece_count required for SPARE_PIECES'}), 400

                        # Validate all spare pieces exist and are available
                        from collections import Counter
                        spare_id_counts = Counter(spare_piece_ids)

                        for spare_id, count_needed in spare_id_counts.items():
                            cursor.execute("""
                                SELECT piece_count, status
                                FROM sprinkler_spare_pieces
                                WHERE id = %s AND deleted_at IS NULL
                            """, (spare_id,))

                            spare_record = cursor.fetchone()
                            if not spare_record:
                                cursor.execute("ROLLBACK")
                                return jsonify({'error': f'Item {idx+1}: Spare piece {spare_id} not found'}), 400

                            if spare_record['status'] != 'IN_STOCK':
                                cursor.execute("ROLLBACK")
                                return jsonify({'error': f'Item {idx+1}: Spare piece {spare_id} not available (status: {spare_record["status"]})'}, 400)

                            if count_needed > spare_record['piece_count']:
                                cursor.execute("ROLLBACK")
                                return jsonify({'error': f'Item {idx+1}: Not enough pieces in spare group {spare_id}. Available: {spare_record["piece_count"]}, Requested: {count_needed}'}), 400

                print(f"DEBUG: All {len(items)} items validated successfully. Proceeding with dispatch...")

                # ============================================================
                # PHASE 2: CREATE DISPATCH - All validations passed
                # ============================================================

                # Generate dispatch number
                current_year = 2025
                cursor.execute("""
                    SELECT dispatch_number
                    FROM dispatches
                    WHERE dispatch_number LIKE %s
                    ORDER BY dispatch_number DESC
                    LIMIT 1
                """, (f'DISP-{current_year}-%',))

                last_dispatch = cursor.fetchone()
                if last_dispatch:
                    last_number = int(last_dispatch['dispatch_number'].split('-')[-1])
                    new_number = last_number + 1
                else:
                    new_number = 1

                dispatch_number = f'DISP-{current_year}-{new_number:04d}'

                # Create dispatch record
                # Append +05:30 to tell PostgreSQL the input is in IST
                dispatch_date_with_tz = f"{dispatch_date}+05:30" if dispatch_date else None
                cursor.execute("""
                    INSERT INTO dispatches (
                        dispatch_number, customer_id, bill_to_id, transport_id,
                        vehicle_id, invoice_number, notes, status, created_by, dispatch_date
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, 'DISPATCHED', %s, COALESCE(%s::timestamptz, NOW()))
                    RETURNING id, dispatch_number
                """, (
                    dispatch_number, customer_id, bill_to_id, transport_id,
                    vehicle_id, invoice_number, notes, user_id, dispatch_date_with_tz
                ))

                dispatch_result = cursor.fetchone()
                dispatch_id = dispatch_result['id']

                # Process each item
                total_items_dispatched = 0

                for item in items:
                    stock_id = item.get('stock_id')
                    product_variant_id = item.get('product_variant_id')
                    item_type = item.get('item_type')
                    quantity = item.get('quantity', 1)

                    # All validations already done in Phase 1
                    # Directly process the dispatch

                    # Handle different item types
                    if item_type == 'CUT_PIECE':
                        # Cut piece dispatch
                        cut_piece_id = item.get('cut_piece_id')
                        length_meters = item.get('length_meters')

                        if not cut_piece_id or not length_meters:
                            return jsonify({'error': 'cut_piece_id and length_meters required for CUT_PIECE'}), 400

                        # Mark cut piece as dispatched
                        cursor.execute("""
                            UPDATE hdpe_cut_pieces
                            SET status = 'DISPATCHED', dispatch_id = %s, updated_at = NOW()
                            WHERE id = %s AND status = 'IN_STOCK'
                            RETURNING id
                        """, (dispatch_id, cut_piece_id))

                        if not cursor.fetchone():
                            return jsonify({'error': f'Cut piece {cut_piece_id} not available'}), 400

                        # Create dispatch item
                        cursor.execute("""
                            INSERT INTO dispatch_items (
                                dispatch_id, stock_id, product_variant_id, item_type,
                                quantity, cut_piece_id, length_meters
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                            RETURNING id
                        """, (
                            dispatch_id, stock_id, product_variant_id, item_type,
                            quantity, cut_piece_id, length_meters
                        ))

                        dispatch_item_id = cursor.fetchone()['id']

                        # NOTE: inventory_stock quantity is automatically updated by auto_update_stock_quantity trigger
                        # when hdpe_cut_pieces status changes. No manual update needed.

                        # Update status based on remaining pieces
                        cursor.execute("""
                            SELECT COUNT(*) as remaining
                            FROM hdpe_cut_pieces
                            WHERE stock_id = %s AND status = 'IN_STOCK' AND deleted_at IS NULL
                        """, (stock_id,))
                        remaining = cursor.fetchone()['remaining']

                        cursor.execute("""
                            UPDATE inventory_stock
                            SET status = CASE WHEN %s <= 0 THEN 'SOLD_OUT' ELSE 'IN_STOCK' END,
                                updated_at = NOW()
                            WHERE id = %s
                        """, (remaining, stock_id))

                        # Record in inventory_transactions
                        cursor.execute("""
                            INSERT INTO inventory_transactions (
                                transaction_type, from_stock_id, from_quantity,
                                dispatch_id, dispatch_item_id, notes, created_by
                            )
                            VALUES ('DISPATCH', %s, %s, %s, %s, %s, %s)
                        """, (stock_id, quantity, dispatch_id, dispatch_item_id, f'Cut piece dispatched: {length_meters}m', user_id))

                    elif item_type == 'SPARE_PIECES':
                        # Spare pieces dispatch
                        spare_piece_ids = item.get('spare_piece_ids', [])
                        piece_count = item.get('piece_count', 0)

                        # Already validated in Phase 1
                        print(f"DEBUG: Dispatching spares - spare_piece_ids: {spare_piece_ids}, piece_count: {piece_count}")

                        # Get unique spare piece IDs and count how many times each appears
                        from collections import Counter
                        spare_id_counts = Counter(spare_piece_ids)
                        print(f"DEBUG: spare_id_counts: {spare_id_counts}")

                        # For each unique spare_id, check if we're taking all pieces or partial
                        # Also get the piece length for meter calculation
                        cursor.execute("""
                            SELECT
                                sp.piece_count,
                                sp.status,
                                st.piece_length_meters
                            FROM sprinkler_spare_pieces sp
                            JOIN inventory_stock st ON sp.stock_id = st.id
                            WHERE sp.id = ANY(%s::uuid[])
                            LIMIT 1
                        """, (list(spare_id_counts.keys()),))

                        first_spare = cursor.fetchone()
                        piece_length_meters = first_spare['piece_length_meters'] if first_spare else None

                        for spare_id, count_needed in spare_id_counts.items():
                            cursor.execute("""
                                SELECT piece_count, status
                                FROM sprinkler_spare_pieces
                                WHERE id = %s
                            """, (spare_id,))

                            spare_record = cursor.fetchone()
                            available_pieces = spare_record['piece_count']
                            print(f"DEBUG: spare_id {spare_id}: available={available_pieces}, needed={count_needed}")

                            # Already validated in Phase 1, proceed with dispatch
                            if count_needed == available_pieces:
                                # Dispatching all pieces - mark as DISPATCHED
                                cursor.execute("""
                                    UPDATE sprinkler_spare_pieces
                                    SET status = 'DISPATCHED', dispatch_id = %s, updated_at = NOW()
                                    WHERE id = %s
                                """, (dispatch_id, spare_id))
                            else:
                                # Partial dispatch - reduce piece_count and create new records for dispatched portion
                                # ONE RECORD PER PHYSICAL PIECE (foundational model)
                                cursor.execute("""
                                    UPDATE sprinkler_spare_pieces
                                    SET piece_count = piece_count - %s, updated_at = NOW()
                                    WHERE id = %s
                                """, (count_needed, spare_id))

                                # Create individual records for dispatched pieces
                                for _ in range(count_needed):
                                    cursor.execute("""
                                        INSERT INTO sprinkler_spare_pieces (
                                            stock_id, piece_count, status, dispatch_id,
                                            created_by_transaction_id, original_stock_id,
                                            version, created_at, updated_at
                                        )
                                        SELECT stock_id, 1, 'DISPATCHED', %s,
                                            created_by_transaction_id, original_stock_id,
                                            1, NOW(), NOW()
                                        FROM sprinkler_spare_pieces
                                        WHERE id = %s
                                    """, (dispatch_id, spare_id))

                        # Create dispatch item
                        cursor.execute("""
                            INSERT INTO dispatch_items (
                                dispatch_id, stock_id, product_variant_id, item_type,
                                quantity, spare_piece_ids, piece_count, piece_length_meters
                            )
                            VALUES (%s, %s, %s, %s, %s, %s::uuid[], %s, %s)
                            RETURNING id
                        """, (
                            dispatch_id, stock_id, product_variant_id, item_type,
                            quantity, spare_piece_ids, piece_count, piece_length_meters
                        ))

                        dispatch_item_id = cursor.fetchone()['id']

                        # Check if any spare pieces remain IN_STOCK for this stock_id
                        cursor.execute("""
                            SELECT COALESCE(SUM(piece_count), 0) as remaining_pieces
                            FROM sprinkler_spare_pieces
                            WHERE stock_id = %s AND status = 'IN_STOCK'
                        """, (stock_id,))

                        remaining = cursor.fetchone()['remaining_pieces']

                        # NOTE: inventory_stock quantity is automatically updated by auto_update_stock_quantity trigger
                        # when sprinkler_spare_pieces status/piece_count changes. Only update status here.
                        cursor.execute("""
                            UPDATE inventory_stock
                            SET status = CASE
                                    WHEN %s <= 0 THEN 'SOLD_OUT'
                                    ELSE 'IN_STOCK'
                                END,
                                updated_at = NOW()
                            WHERE id = %s
                        """, (remaining, stock_id))

                        # Record in inventory_transactions
                        cursor.execute("""
                            INSERT INTO inventory_transactions (
                                transaction_type, from_stock_id, from_quantity, from_pieces,
                                dispatch_id, dispatch_item_id, notes, created_by
                            )
                            VALUES ('DISPATCH', %s, %s, %s, %s, %s, %s, %s)
                        """, (stock_id, quantity, piece_count, dispatch_id, dispatch_item_id, f'Spare pieces dispatched: {piece_count} pcs', user_id))

                    elif item_type == 'BUNDLE':
                        # Bundle dispatch
                        bundle_size = item.get('bundle_size')
                        pieces_per_bundle = item.get('pieces_per_bundle')
                        piece_length_meters = item.get('piece_length_meters')

                        # Create dispatch item
                        cursor.execute("""
                            INSERT INTO dispatch_items (
                                dispatch_id, stock_id, product_variant_id, item_type,
                                quantity, bundle_size, pieces_per_bundle, piece_length_meters
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                            RETURNING id
                        """, (
                            dispatch_id, stock_id, product_variant_id, item_type,
                            quantity, bundle_size, pieces_per_bundle, piece_length_meters
                        ))

                        dispatch_item_id = cursor.fetchone()['id']

                        # Reduce inventory_stock quantity
                        cursor.execute("""
                            UPDATE inventory_stock
                            SET quantity = quantity - %s,
                                status = CASE
                                    WHEN quantity - %s <= 0 THEN 'SOLD_OUT'
                                    ELSE 'IN_STOCK'
                                END,
                                updated_at = NOW()
                            WHERE id = %s
                        """, (quantity, quantity, stock_id))

                        # Record in inventory_transactions
                        cursor.execute("""
                            INSERT INTO inventory_transactions (
                                transaction_type, from_stock_id, from_quantity,
                                dispatch_id, dispatch_item_id, notes, created_by
                            )
                            VALUES ('DISPATCH', %s, %s, %s, %s, %s, %s)
                        """, (stock_id, quantity, dispatch_id, dispatch_item_id, f'Bundle dispatched: {bundle_size}x{piece_length_meters}m', user_id))

                    elif item_type == 'FULL_ROLL':
                        # Full roll dispatch (or cut roll stock dispatched as full)
                        length_meters = item.get('length_meters')

                        # Check if this is actually a CUT_ROLL stock
                        stock_type = stock['stock_type']
                        actual_item_type = item_type

                        # If stock_type is CUT_ROLL, adjust the item_type for better tracking
                        if stock_type == 'CUT_ROLL':
                            actual_item_type = 'CUT_ROLL'  # Store as CUT_ROLL for better display

                            # For CUT_ROLL, mark individual pieces as DISPATCHED
                            cursor.execute("""
                                UPDATE hdpe_cut_pieces
                                SET status = 'DISPATCHED', dispatch_id = %s, updated_at = NOW()
                                WHERE id IN (
                                    SELECT id FROM hdpe_cut_pieces
                                    WHERE stock_id = %s AND status = 'IN_STOCK'
                                    ORDER BY created_at
                                    LIMIT %s
                                )
                                RETURNING id
                            """, (dispatch_id, stock_id, quantity))

                            updated_pieces = cursor.fetchall()
                            if len(updated_pieces) < quantity:
                                return jsonify({'error': f'Not enough IN_STOCK pieces available. Requested: {quantity}, Available: {len(updated_pieces)}'}), 400

                        # Create dispatch item
                        cursor.execute("""
                            INSERT INTO dispatch_items (
                                dispatch_id, stock_id, product_variant_id, item_type,
                                quantity, length_meters
                            )
                            VALUES (%s, %s, %s, %s, %s, %s)
                            RETURNING id
                        """, (
                            dispatch_id, stock_id, product_variant_id, actual_item_type,
                            quantity, length_meters
                        ))

                        dispatch_item_id = cursor.fetchone()['id']

                        # Update inventory_stock quantity and status
                        if stock_type == 'CUT_ROLL':
                            # NOTE: For CUT_ROLL, quantity is automatically updated by auto_update_stock_quantity trigger
                            # when hdpe_cut_pieces status changes. Only update status here.
                            cursor.execute("""
                                SELECT COUNT(*) as remaining
                                FROM hdpe_cut_pieces
                                WHERE stock_id = %s AND status = 'IN_STOCK' AND deleted_at IS NULL
                            """, (stock_id,))
                            remaining = cursor.fetchone()['remaining']

                            cursor.execute("""
                                UPDATE inventory_stock
                                SET status = CASE WHEN %s <= 0 THEN 'SOLD_OUT' ELSE 'IN_STOCK' END,
                                    updated_at = NOW()
                                WHERE id = %s
                            """, (remaining, stock_id))
                        else:
                            # For true FULL_ROLL (not from cut pieces), manually update quantity
                            cursor.execute("""
                                UPDATE inventory_stock
                                SET quantity = quantity - %s,
                                    status = CASE
                                        WHEN quantity - %s <= 0 THEN 'SOLD_OUT'
                                        ELSE 'IN_STOCK'
                                    END,
                                    updated_at = NOW()
                                WHERE id = %s
                            """, (quantity, quantity, stock_id))

                        # Create appropriate notes based on stock type
                        if stock_type == 'CUT_ROLL':
                            notes = f'Cut roll dispatched: {length_meters}m'
                        else:
                            notes = f'Full roll dispatched: {length_meters}m'

                        # Record in inventory_transactions
                        cursor.execute("""
                            INSERT INTO inventory_transactions (
                                transaction_type, from_stock_id, from_quantity,
                                dispatch_id, dispatch_item_id, notes, created_by
                            )
                            VALUES ('DISPATCH', %s, %s, %s, %s, %s, %s)
                        """, (stock_id, quantity, dispatch_id, dispatch_item_id, notes, user_id))

                    total_items_dispatched += quantity

                # CRITICAL: Update batches.current_quantity for all affected batches
                # Get unique batch_ids from all dispatched stock items
                cursor.execute("""
                    SELECT DISTINCT s.batch_id
                    FROM dispatch_items di
                    JOIN inventory_stock s ON di.stock_id = s.id
                    WHERE di.dispatch_id = %s
                """, (dispatch_id,))

                affected_batches = cursor.fetchall()

                for batch_row in affected_batches:
                    batch_id = batch_row['batch_id']

                    # Recalculate batch quantity from all stock in this batch
                    # Wait for triggers to update inventory_stock.quantity for CUT_ROLL/SPARE
                    # Unit semantics: HDPE uses roll/piece COUNT, Sprinkler uses piece COUNT
                    cursor.execute("""
                        UPDATE batches b
                        SET current_quantity = (
                            SELECT COALESCE(
                                SUM(CASE
                                    WHEN s.stock_type = 'FULL_ROLL' THEN s.quantity
                                    WHEN s.stock_type = 'CUT_ROLL' THEN (
                                        SELECT COALESCE(COUNT(*), 0)
                                        FROM hdpe_cut_pieces cp
                                        WHERE cp.stock_id = s.id AND cp.status = 'IN_STOCK'
                                    )
                                    WHEN s.stock_type = 'BUNDLE' THEN s.quantity * s.pieces_per_bundle
                                    WHEN s.stock_type = 'SPARE' THEN (
                                        SELECT COALESCE(SUM(sp.piece_count), 0)
                                        FROM sprinkler_spare_pieces sp
                                        WHERE sp.stock_id = s.id AND sp.status = 'IN_STOCK'
                                    )
                                    ELSE 0
                                END), 0)
                            FROM inventory_stock s
                            WHERE s.batch_id = b.id AND s.deleted_at IS NULL
                        ),
                        updated_at = NOW()
                        WHERE id = %s
                    """, (batch_id,))

                # Record in audit log
                cursor.execute("""
                    INSERT INTO audit_logs (
                        user_id, action_type, entity_type, entity_id, description
                    )
                    VALUES (%s, 'CREATE', 'dispatch', %s, %s)
                """, (
                    user_id, dispatch_id,
                    json.dumps({
                        'dispatch_number': dispatch_number,
                        'customer_id': customer_id,
                        'total_items': total_items_dispatched,
                        'item_count': len(items)
                    })
                ))

                # Commit transaction - all or nothing
                cursor.execute("COMMIT")

                # After successful commit, check for and clean up empty batches
                with get_db_cursor() as cleanup_cursor:
                    # Find batches with no remaining stock
                    cleanup_cursor.execute("""
                        SELECT DISTINCT b.id, b.batch_code
                        FROM batches b
                        LEFT JOIN inventory_stock s ON s.batch_id = b.id
                            AND s.deleted_at IS NULL
                            AND s.quantity > 0
                        WHERE b.deleted_at IS NULL
                          AND s.id IS NULL
                    """)

                    empty_batches = cleanup_cursor.fetchall()

                    if empty_batches:
                        batch_ids = [b['id'] for b in empty_batches]
                        # Soft delete empty batches
                        cleanup_cursor.execute("""
                            UPDATE batches
                            SET deleted_at = NOW(), updated_at = NOW()
                            WHERE id = ANY(%s::uuid[])
                        """, (batch_ids,))

                return jsonify({
                'success': True,
                'dispatch_id': str(dispatch_id),
                'dispatch_number': dispatch_number,
                'total_items': total_items_dispatched,
                'items_count': len(items)
            }), 201

            except Exception as inner_error:
                # Rollback transaction on any error
                cursor.execute("ROLLBACK")
                raise inner_error

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@dispatch_bp.route('/dispatches', methods=['GET', 'OPTIONS'])
@jwt_required()
def get_dispatches():
    """Get all dispatches with summary information"""
    if request.method == 'OPTIONS':
        return jsonify({}), 200

    try:
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT
                    d.id,
                    d.dispatch_number,
                    d.dispatch_date,
                    d.status,
                    d.invoice_number,
                    d.notes,
                    c.name as customer_name,
                    c.city as customer_city,
                    bt.name as bill_to_name,
                    t.name as transport_name,
                    v.driver_name as vehicle_driver,
                    v.vehicle_number,
                    COUNT(DISTINCT di.id) as total_items,
                    SUM(di.quantity) as total_quantity,
                    u.email as created_by_email,
                    d.created_at
                FROM dispatches d
                LEFT JOIN customers c ON d.customer_id = c.id
                LEFT JOIN bill_to bt ON d.bill_to_id = bt.id
                LEFT JOIN transports t ON d.transport_id = t.id
                LEFT JOIN vehicles v ON d.vehicle_id = v.id
                LEFT JOIN dispatch_items di ON d.id = di.dispatch_id
                LEFT JOIN users u ON d.created_by = u.id
                WHERE d.deleted_at IS NULL
                GROUP BY d.id, c.name, c.city, bt.name, t.name, v.driver_name, v.vehicle_number, u.email
                ORDER BY d.dispatch_date DESC, d.created_at DESC
            """)

            dispatches = cursor.fetchall()
            return jsonify([dict(row) for row in dispatches]), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@dispatch_bp.route('/dispatches/<dispatch_id>', methods=['GET', 'OPTIONS'])
@jwt_required()
def get_dispatch_details(dispatch_id):
    """Get detailed information for a specific dispatch including all items"""
    if request.method == 'OPTIONS':
        return jsonify({}), 200

    try:
        with get_db_cursor() as cursor:
            # Get dispatch header
            cursor.execute("""
                SELECT
                    d.id,
                    d.dispatch_number,
                    d.dispatch_date,
                    d.status,
                    d.invoice_number,
                    d.notes,
                    d.customer_id,
                    c.name as customer_name,
                    c.city as customer_city,
                    d.bill_to_id,
                    bt.name as bill_to_name,
                    d.transport_id,
                    t.name as transport_name,
                    d.vehicle_id,
                    v.driver_name as vehicle_driver,
                    v.vehicle_number,
                    u.email as created_by_email,
                    d.created_at
                FROM dispatches d
                LEFT JOIN customers c ON d.customer_id = c.id
                LEFT JOIN bill_to bt ON d.bill_to_id = bt.id
                LEFT JOIN transports t ON d.transport_id = t.id
                LEFT JOIN vehicles v ON d.vehicle_id = v.id
                LEFT JOIN users u ON d.created_by = u.id
                WHERE d.id = %s AND d.deleted_at IS NULL
            """, (dispatch_id,))

            dispatch = cursor.fetchone()
            if not dispatch:
                return jsonify({'error': 'Dispatch not found'}), 404

            # Get dispatch items
            cursor.execute("""
                SELECT
                    di.id,
                    di.item_type,
                    di.quantity,
                    di.length_meters,
                    di.piece_count,
                    di.bundle_size,
                    di.pieces_per_bundle,
                    di.piece_length_meters,
                    di.notes,
                    b.batch_code,
                    pt.name as product_type_name,
                    br.name as brand_name,
                    pv.parameters,
                    di.created_at
                FROM dispatch_items di
                JOIN inventory_stock s ON di.stock_id = s.id
                JOIN batches b ON s.batch_id = b.id
                JOIN product_variants pv ON di.product_variant_id = pv.id
                JOIN product_types pt ON pv.product_type_id = pt.id
                JOIN brands br ON pv.brand_id = br.id
                WHERE di.dispatch_id = %s
                ORDER BY di.created_at
            """, (dispatch_id,))

            items = cursor.fetchall()

            result = dict(dispatch)
            result['items'] = [dict(item) for item in items]

            return jsonify(result), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
