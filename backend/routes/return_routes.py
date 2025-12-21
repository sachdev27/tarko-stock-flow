from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import execute_query, execute_insert, get_db_cursor
from services.auth import get_user_identity_details
from services.inventory_operations import InventoryOperations
from decimal import Decimal
import json
from datetime import datetime

return_bp = Blueprint('returns', __name__, url_prefix='/api/returns')

@return_bp.route('/create', methods=['POST'])
@jwt_required()
def create_return():
    """
    Create a new return from customer and add items back to inventory.
    Request body:
    {
        customer_id: UUID,
        return_date: YYYY-MM-DD (optional, defaults to today),
        notes: string (optional),
        items: [
            {
                product_type_id: UUID,
                brand_id: UUID,
                parameters: {OD: "32", PN: "6", PE: "63"},
                item_type: 'FULL_ROLL' | 'CUT_ROLL' | 'BUNDLE' | 'SPARE_PIECES',
                quantity: number,

                // For FULL_ROLL or CUT_ROLL
                rolls: [{ length_meters: number }, ...],

                // For BUNDLE
                bundles: [{ bundle_size: number, piece_length_meters: number }, ...],

                // For SPARE_PIECES
                piece_count: number,
                piece_length_meters: number,

                notes: string (optional)
            }
        ]
    }
    """
    try:
        data = request.json
        user_id = get_jwt_identity()
        user_role = get_user_identity_details(user_id)

        # Validate required fields
        customer_id = data.get('customer_id')
        items = data.get('items', [])

        if not customer_id:
            return jsonify({'error': 'customer_id is required'}), 400

        if not items or len(items) == 0:
            return jsonify({'error': 'At least one item is required'}), 400

        return_date = data.get('return_date', datetime.now().date().isoformat())
        notes = data.get('notes', '')

        with get_db_cursor() as cursor:
            # Generate return number
            cursor.execute("""
                SELECT return_number FROM returns
                WHERE return_number LIKE 'RET-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%'
                ORDER BY return_number DESC
                LIMIT 1
            """)
            last_return = cursor.fetchone()

            if last_return:
                last_num = int(last_return['return_number'].split('-')[-1])
                return_number = f"RET-{datetime.now().year}-{last_num + 1:03d}"
            else:
                return_number = f"RET-{datetime.now().year}-001"

            # Create return record
            cursor.execute("""
                INSERT INTO returns (
                    return_number, customer_id, return_date, notes,
                    status, created_by
                )
                VALUES (%s, %s, %s, %s, 'RECEIVED', %s)
                RETURNING id, return_number
            """, (return_number, customer_id, return_date, notes, user_id))

            return_record = cursor.fetchone()
            return_id = return_record['id']
            return_number = return_record['return_number']

            # Track batches and pieces to be created
            variant_batches = {}  # {product_variant_id: batch_id}
            cut_pieces_to_create = []  # List of pieces to create after transactions
            spare_pieces_to_create = []  # List of spare pieces to create after transactions

            # Process each item
            for item in items:
                product_type_id = item.get('product_type_id')
                brand_id = item.get('brand_id')
                parameters = item.get('parameters', {})
                item_type = item.get('item_type')
                quantity = item.get('quantity')
                item_notes = item.get('notes', '')

                if not all([product_type_id, brand_id, item_type, quantity]):
                    raise ValueError('Each item must have product_type_id, brand_id, item_type, and quantity')

                # Normalize parameters (strip units for consistent matching)
                normalized_params = {}
                for key, value in parameters.items():
                    # Remove common units: mm, m, kg, etc.
                    str_value = str(value).strip()
                    # Remove 'mm' suffix if present (case insensitive)
                    if str_value.lower().endswith('mm'):
                        str_value = str_value[:-2].strip()
                    # Remove 'm' suffix (but not if it's part of something else)
                    elif str_value.lower().endswith('m') and len(str_value) > 1:
                        str_value = str_value[:-1].strip()
                    normalized_params[key] = str_value

                # Find or create product_variant using normalized parameters
                cursor.execute("""
                    SELECT id, parameters FROM product_variants
                    WHERE product_type_id = %s
                      AND brand_id = %s
                      AND deleted_at IS NULL
                """, (product_type_id, brand_id))

                variants = cursor.fetchall()
                variant = None

                # Check each variant to find a match (handle units in stored params)
                for v in variants:
                    stored_params = v['parameters'] or {}
                    # Normalize stored params the same way
                    stored_normalized = {}
                    for key, value in stored_params.items():
                        str_value = str(value).strip()
                        if str_value.lower().endswith('mm'):
                            str_value = str_value[:-2].strip()
                        elif str_value.lower().endswith('m') and len(str_value) > 1:
                            str_value = str_value[:-1].strip()
                        stored_normalized[key] = str_value

                    # Compare normalized params
                    if stored_normalized == normalized_params:
                        variant = v
                        break

                if not variant:
                    # Create new product variant with NORMALIZED parameters
                    cursor.execute("""
                        INSERT INTO product_variants (product_type_id, brand_id, parameters)
                        VALUES (%s, %s, %s::jsonb)
                        RETURNING id
                    """, (product_type_id, brand_id, json.dumps(normalized_params)))
                    variant = cursor.fetchone()

                product_variant_id = variant['id']

                # Find or create batch for this product variant
                if product_variant_id not in variant_batches:
                    # Always create a NEW batch for each return (independent audit trail)
                    # Calculate quantity for this variant (count actual items being returned)
                    variant_item_count = sum(1 for i in items
                        if i.get('product_type_id') == product_type_id
                        and i.get('brand_id') == brand_id
                        and json.dumps(i.get('parameters', {}), sort_keys=True) == json.dumps(parameters, sort_keys=True))

                    # Create a unique batch for this variant with sequential batch_code
                    batch_suffix = len(variant_batches) + 1
                    batch_code = f"{return_number}-{batch_suffix:02d}"

                    # Create a batch for this product variant
                    cursor.execute("""
                        INSERT INTO batches (
                            product_variant_id, production_date, initial_quantity, current_quantity,
                            batch_no, batch_code, notes, created_by
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                    """, (product_variant_id, return_date, variant_item_count, variant_item_count,
                          batch_code, batch_code, f"Return batch for {return_number}", user_id))

                    batch_record = cursor.fetchone()
                    batch_id = batch_record['id']

                    # Store for reuse if same variant appears again in THIS return only
                    variant_batches[product_variant_id] = batch_id
                else:
                    # Reuse batch only within the same return (not across different returns)
                    batch_id = variant_batches[product_variant_id]

                # Get product type info for stock type determination
                cursor.execute("""
                    SELECT pt.name as product_type_name
                    FROM product_types pt
                    WHERE pt.id = %s
                """, (product_type_id,))
                pt_info = cursor.fetchone()
                product_type_name = pt_info['product_type_name']

                # Insert return item
                if item_type in ['FULL_ROLL', 'CUT_ROLL']:
                    rolls = item.get('rolls', [])
                    if len(rolls) != quantity:
                        raise ValueError(f'Number of rolls ({len(rolls)}) must match quantity ({quantity})')

                    # Calculate total length for the item summary
                    total_length = sum(roll['length_meters'] for roll in rolls)

                    cursor.execute("""
                        INSERT INTO return_items (
                            return_id, product_variant_id, item_type,
                            quantity, length_meters, notes
                        )
                        VALUES (%s, %s, %s, %s, %s, %s)
                        RETURNING id
                    """, (return_id, product_variant_id, item_type, quantity, total_length, item_notes))

                    return_item = cursor.fetchone()
                    return_item_id = return_item['id']

                    # Group rolls by length (for aggregate inventory)
                    rolls_by_length = {}
                    for roll in rolls:
                        length = roll['length_meters']
                        if length not in rolls_by_length:
                            rolls_by_length[length] = []
                        rolls_by_length[length].append(roll)

                    # Create aggregate inventory stock entries (one per unique length)
                    roll_idx = 1
                    for length, roll_group in rolls_by_length.items():
                        stock_type = 'FULL_ROLL' if item_type == 'FULL_ROLL' else 'CUT_ROLL'

                        # Create stock entry with appropriate initial quantity
                        # For CUT_ROLL: start at 0, auto_update trigger will set based on piece records
                        # For FULL_ROLL: set actual count since no piece records exist
                        initial_quantity = 0 if item_type == 'CUT_ROLL' else len(roll_group)
                        cursor.execute("""
                            INSERT INTO inventory_stock (
                                batch_id, product_variant_id, status, stock_type,
                                quantity, length_per_unit, notes
                            )
                            VALUES (%s, %s, 'IN_STOCK', %s, %s, %s, %s)
                            RETURNING id
                        """, (batch_id, product_variant_id, stock_type, initial_quantity, length,
                              f'{len(roll_group)} rolls of {length}m each from return {return_number}'))

                        stock = cursor.fetchone()
                        stock_id = stock['id']

                        # Store cut roll pieces info for later creation (after transaction exists)
                        if item_type == 'CUT_ROLL' and product_type_name == 'HDPE Pipe':
                            for roll in roll_group:
                                cut_pieces_to_create.append({
                                    'stock_id': stock_id,
                                    'length': roll['length_meters'],
                                    'batch_id': batch_id,
                                    'product_variant_id': product_variant_id
                                })                        # Insert individual return roll records
                        for roll in roll_group:
                            cursor.execute("""
                                INSERT INTO return_rolls (
                                    return_item_id, roll_number, length_meters, stock_id
                                )
                                VALUES (%s, %s, %s, %s)
                            """, (return_item_id, roll_idx, roll['length_meters'], stock_id))
                            roll_idx += 1

                elif item_type == 'BUNDLE':
                    bundles = item.get('bundles', [])
                    if len(bundles) != quantity:
                        raise ValueError(f'Number of bundles ({len(bundles)}) must match quantity ({quantity})')

                    # Use first bundle's details for summary (assuming all bundles are similar)
                    first_bundle = bundles[0]
                    bundle_size = first_bundle['bundle_size']
                    piece_length = first_bundle['piece_length_meters']

                    cursor.execute("""
                        INSERT INTO return_items (
                            return_id, product_variant_id, item_type,
                            quantity, bundle_size, piece_count, piece_length_meters, notes
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                    """, (return_id, product_variant_id, item_type, quantity,
                          bundle_size, bundle_size, piece_length, item_notes))

                    return_item = cursor.fetchone()
                    return_item_id = return_item['id']

                    # Group bundles by size and length (for aggregate inventory)
                    bundles_by_spec = {}
                    for bundle in bundles:
                        key = (bundle['bundle_size'], bundle['piece_length_meters'])
                        if key not in bundles_by_spec:
                            bundles_by_spec[key] = []
                        bundles_by_spec[key].append(bundle)

                    # Create aggregate inventory stock entries (one per unique spec)
                    bundle_idx = 1
                    for (b_size, p_length), bundle_group in bundles_by_spec.items():
                        # Create stock entry
                        cursor.execute("""
                            INSERT INTO inventory_stock (
                                batch_id, product_variant_id, status, stock_type,
                                quantity, pieces_per_bundle, piece_length_meters, notes
                            )
                            VALUES (%s, %s, 'IN_STOCK', 'BUNDLE', %s, %s, %s, %s)
                            RETURNING id
                        """, (batch_id, product_variant_id, len(bundle_group), b_size, p_length,
                              f'{len(bundle_group)} bundles of {b_size} pieces × {p_length}m from return {return_number}'))

                        stock = cursor.fetchone()
                        stock_id = stock['id']

                        # Insert individual return bundle records
                        for bundle in bundle_group:
                            cursor.execute("""
                                INSERT INTO return_bundles (
                                    return_item_id, bundle_number, bundle_size, piece_length_meters, stock_id
                                )
                                VALUES (%s, %s, %s, %s, %s)
                            """, (return_item_id, bundle_idx, bundle['bundle_size'],
                                  bundle['piece_length_meters'], stock_id))
                            bundle_idx += 1

                elif item_type == 'SPARE_PIECES':
                    piece_count = item.get('piece_count')
                    piece_length = item.get('piece_length_meters')

                    if not piece_count or not piece_length:
                        raise ValueError('SPARE_PIECES requires piece_count and piece_length_meters')

                    cursor.execute("""
                        INSERT INTO return_items (
                            return_id, product_variant_id, item_type,
                            quantity, piece_count, piece_length_meters, notes
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                    """, (return_id, product_variant_id, item_type, 1,
                          piece_count, piece_length, item_notes))

                    return_item = cursor.fetchone()
                    return_item_id = return_item['id']

                    # Create stock entry with quantity=0 (auto_update trigger will set correct value)
                    # Piece records are the source of truth for SPARE stock
                    cursor.execute("""
                        INSERT INTO inventory_stock (
                            batch_id, product_variant_id, status, stock_type,
                            quantity, piece_length_meters, notes
                        )
                        VALUES (%s, %s, 'IN_STOCK', 'SPARE', 0, %s, %s)
                        RETURNING id
                    """, (batch_id, product_variant_id, piece_length,
                          f'{piece_count} spare pieces from return {return_number}'))

                    stock = cursor.fetchone()
                    stock_id = stock['id']

                    # Store spare pieces info for later creation (after transaction exists)
                    spare_pieces_to_create.append({
                        'stock_id': stock_id,
                        'piece_count': piece_count,
                        'piece_length': piece_length,
                        'product_type_name': product_type_name,
                        'batch_id': batch_id,
                        'product_variant_id': product_variant_id
                    })

            # Create transactions with correct quantity_change for each variant
            variant_transactions = {}  # {product_variant_id: transaction_id}
            for product_variant_id, batch_id in variant_batches.items():
                # Get all return items for this variant
                cursor.execute("""
                    SELECT item_type, quantity, piece_count
                    FROM return_items
                    WHERE return_id = %s AND product_variant_id = %s
                """, (return_id, product_variant_id))

                variant_items = cursor.fetchall()

                # Build aggregated counts
                full_rolls = sum(item['quantity'] for item in variant_items if item['item_type'] == 'FULL_ROLL')
                cut_rolls = sum(item['quantity'] for item in variant_items if item['item_type'] == 'CUT_ROLL')
                bundles = sum(item['quantity'] for item in variant_items if item['item_type'] == 'BUNDLE')
                spares = sum(item['piece_count'] or 0 for item in variant_items if item['item_type'] == 'SPARE_PIECES')

                # Build breakdown list
                breakdown = []
                if full_rolls > 0:
                    breakdown.append(f"{full_rolls}R")
                if cut_rolls > 0:
                    breakdown.append(f"{cut_rolls}C")
                if bundles > 0:
                    breakdown.append(f"{bundles}B")
                if spares > 0:
                    breakdown.append(f"{spares}S")

                breakdown_str = " + ".join(breakdown) if breakdown else "0"
                total_quantity = full_rolls + cut_rolls + bundles + spares

                # Build roll_snapshot
                roll_snapshot = {
                    'item_breakdown': breakdown_str,
                    'full_rolls': full_rolls,
                    'cut_rolls': cut_rolls,
                    'bundles': bundles,
                    'spare_pieces': spares
                }

                # Create transaction with quantity_change
                cursor.execute("""
                    INSERT INTO inventory_transactions (
                        transaction_type, notes, created_by
                    )
                    VALUES ('RETURN', %s, %s)
                    RETURNING id
                """, (f"Return {return_number}: {breakdown_str}", user_id))

                txn = cursor.fetchone()
                transaction_id = txn['id']

                # Store transaction_id for piece creation
                variant_transactions[product_variant_id] = transaction_id

            # Now create all pieces with proper transaction_id
            # Create cut pieces
            for piece_info in cut_pieces_to_create:
                # Get transaction_id for this variant
                txn_id = variant_transactions.get(piece_info['product_variant_id'])
                if txn_id:
                    cursor.execute("""
                        INSERT INTO hdpe_cut_pieces (
                            stock_id, length_meters, status, notes, created_by_transaction_id, original_stock_id
                        )
                        VALUES (%s, %s, 'IN_STOCK', %s, %s, %s)
                    """, (piece_info['stock_id'], piece_info['length'],
                          f'From return {return_number}', txn_id, piece_info['stock_id']))

            # Create spare pieces - ONE RECORD PER PHYSICAL PIECE
            for piece_info in spare_pieces_to_create:
                # Get transaction_id for this variant
                txn_id = variant_transactions.get(piece_info['product_variant_id'])
                if txn_id:
                    if piece_info['product_type_name'] == 'Sprinkler Pipe':
                        # Create one record per physical piece (foundational event sourcing)
                        for piece_num in range(1, piece_info['piece_count'] + 1):
                            cursor.execute("""
                                INSERT INTO sprinkler_spare_pieces (
                                    stock_id, piece_count, status, notes, created_by_transaction_id, original_stock_id
                                )
                                VALUES (%s, 1, 'IN_STOCK', %s, %s, %s)
                            """, (piece_info['stock_id'],
                                  f'Piece {piece_num} from return {return_number}',
                                  txn_id, piece_info['stock_id']))
                    elif piece_info['product_type_name'] == 'HDPE Pipe':
                        # For HDPE, spare pieces go into hdpe_cut_pieces as individual pieces
                        for piece_num in range(1, piece_info['piece_count'] + 1):
                            cursor.execute("""
                                INSERT INTO hdpe_cut_pieces (
                                    stock_id, length_meters, status, notes, created_by_transaction_id, original_stock_id
                                )
                                VALUES (%s, %s, 'IN_STOCK', %s, %s, %s)
                            """, (piece_info['stock_id'], piece_info['piece_length'],
                                  f'Piece {piece_num} from return {return_number}', txn_id, piece_info['stock_id']))

            # CRITICAL FIX: Update batches.current_quantity for all created batches
            # This ensures returned items are reflected in total inventory
            for product_variant_id, batch_id in variant_batches.items():
                # Triggers have updated inventory_stock.quantity for CUT_ROLL/SPARE
                # Now calculate total and update batch
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
                                    WHERE cp.stock_id = s.id AND cp.status = 'IN_STOCK' AND cp.deleted_at IS NULL
                                )
                                WHEN s.stock_type = 'BUNDLE' THEN s.quantity * s.pieces_per_bundle
                                WHEN s.stock_type = 'SPARE' THEN (
                                    SELECT COALESCE(SUM(sp.piece_count), 0)
                                    FROM sprinkler_spare_pieces sp
                                    WHERE sp.stock_id = s.id AND sp.status = 'IN_STOCK' AND sp.deleted_at IS NULL
                                )
                                ELSE 0
                            END), 0)
                        FROM inventory_stock s
                        WHERE s.batch_id = b.id AND s.deleted_at IS NULL
                    ),
                    updated_at = NOW()
                    WHERE id = %s
                """, (batch_id,))

            # Commit transaction
            cursor.connection.commit()

            # Get the first transaction_id for the response (there may be multiple if multiple variants)
            first_transaction_id = list(variant_transactions.values())[0] if variant_transactions else None

            return jsonify({
                'success': True,
                'message': 'Return created successfully and items added to inventory',
                'return_id': return_id,
                'return_number': return_number,
                'transaction_id': first_transaction_id
            }), 201

    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400
    except Exception as e:
        print(f"Error creating return: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to create return: {str(e)}'}), 500


@return_bp.route('/history', methods=['GET'])
@jwt_required()
def get_return_history():
    """
    Get return history with filters.
    Query params:
    - customer_id: UUID (optional)
    - start_date: YYYY-MM-DD (optional)
    - end_date: YYYY-MM-DD (optional)
    - status: string (optional)
    - search: string (optional) - searches return_number, customer name
    """
    try:
        customer_id = request.args.get('customer_id')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        status = request.args.get('status')
        search = request.args.get('search', '').strip()

        query = """
            SELECT
                r.id,
                r.return_number,
                r.return_date,
                r.status,
                r.notes,
                r.total_amount,
                r.created_at,
                r.updated_at,
                c.id as customer_id,
                c.name as customer_name,
                c.city as customer_city,
                c.phone as customer_phone,
                u.email as created_by_email,
                COUNT(DISTINCT ri.id) as item_count,
                SUM(ri.quantity) as total_quantity
            FROM returns r
            LEFT JOIN customers c ON r.customer_id = c.id
            LEFT JOIN return_items ri ON ri.return_id = r.id
            LEFT JOIN users u ON r.created_by = u.id
            WHERE r.deleted_at IS NULL
        """
        params = []

        if customer_id:
            query += " AND r.customer_id = %s"
            params.append(customer_id)

        if start_date:
            query += " AND r.return_date >= %s"
            params.append(start_date)

        if end_date:
            query += " AND r.return_date <= %s"
            params.append(end_date)

        if status:
            query += " AND r.status = %s"
            params.append(status)

        if search:
            query += " AND (r.return_number ILIKE %s OR c.name ILIKE %s)"
            search_pattern = f"%{search}%"
            params.extend([search_pattern, search_pattern])

        query += """
            GROUP BY r.id, r.return_number, r.return_date, r.status, r.notes,
                     r.total_amount, r.created_at, r.updated_at,
                     c.id, c.name, c.city, c.phone, u.email
            ORDER BY r.return_date DESC, r.created_at DESC
        """

        returns = execute_query(query, tuple(params))

        # Convert to serializable format
        returns_list = []
        for ret in returns:
            returns_list.append({
                'id': str(ret['id']),
                'return_number': ret['return_number'],
                'return_date': ret['return_date'].isoformat() if ret['return_date'] else None,
                'status': ret['status'],
                'notes': ret['notes'],
                'total_amount': float(ret['total_amount']) if ret['total_amount'] else None,
                'customer_id': str(ret['customer_id']),
                'customer_name': ret['customer_name'],
                'customer_city': ret['customer_city'],
                'customer_phone': ret['customer_phone'],
                'created_by_email': ret['created_by_email'],
                'item_count': ret['item_count'],
                'total_quantity': ret['total_quantity'],
                'created_at': ret['created_at'].isoformat() if ret['created_at'] else None,
                'updated_at': ret['updated_at'].isoformat() if ret['updated_at'] else None
            })

        return jsonify({'returns': returns_list}), 200

    except Exception as e:
        print(f"Error fetching return history: {e}")
        return jsonify({'error': f'Failed to fetch return history: {str(e)}'}), 500


@return_bp.route('/<return_id>', methods=['GET'])
@jwt_required()
def get_return_details(return_id):
    """Get detailed information about a specific return including all items"""
    try:
        # Get return header
        return_query = """
            SELECT
                r.id,
                r.return_number,
                r.return_date,
                r.status,
                r.notes,
                r.total_amount,
                r.created_at,
                r.updated_at,
                c.id as customer_id,
                c.name as customer_name,
                c.city as customer_city,
                c.phone as customer_phone,
                c.address as customer_address,
                u.email as created_by_email
            FROM returns r
            LEFT JOIN customers c ON r.customer_id = c.id
            LEFT JOIN users u ON r.created_by = u.id
            WHERE r.id = %s AND r.deleted_at IS NULL
        """

        return_record = execute_query(return_query, (return_id,), fetch_one=True)

        if not return_record:
            return jsonify({'error': 'Return not found'}), 404

        # Get return items
        items_query = """
            SELECT
                ri.id,
                ri.item_type,
                ri.quantity,
                ri.length_meters,
                ri.bundle_size,
                ri.piece_count,
                ri.piece_length_meters,
                ri.rate_per_unit,
                ri.amount,
                ri.notes,
                pv.id as product_variant_id,
                pt.name as product_type_name,
                pt.id as product_type_id,
                b.name as brand_name,
                b.id as brand_id,
                pv.parameters
            FROM return_items ri
            JOIN product_variants pv ON ri.product_variant_id = pv.id
            JOIN product_types pt ON pv.product_type_id = pt.id
            JOIN brands b ON pv.brand_id = b.id
            WHERE ri.return_id = %s
            ORDER BY ri.created_at
        """

        items = execute_query(items_query, (return_id,))

        # For each item, get rolls or bundles if applicable
        items_with_details = []
        for item in items:
            item_dict = dict(item)

            if item['item_type'] in ['FULL_ROLL', 'CUT_ROLL']:
                # Get rolls
                rolls_query = """
                    SELECT roll_number, length_meters, stock_id
                    FROM return_rolls
                    WHERE return_item_id = %s
                    ORDER BY roll_number
                """
                rolls = execute_query(rolls_query, (item['id'],))
                item_dict['rolls'] = [dict(r) for r in rolls]

            elif item['item_type'] == 'BUNDLE':
                # Get bundles
                bundles_query = """
                    SELECT bundle_number, bundle_size, piece_length_meters, stock_id
                    FROM return_bundles
                    WHERE return_item_id = %s
                    ORDER BY bundle_number
                """
                bundles = execute_query(bundles_query, (item['id'],))
                item_dict['bundles'] = [dict(b) for b in bundles]

            items_with_details.append(item_dict)

        # Format response
        response = {
            'id': str(return_record['id']),
            'return_number': return_record['return_number'],
            'return_date': return_record['return_date'].isoformat() if return_record['return_date'] else None,
            'status': return_record['status'],
            'notes': return_record['notes'],
            'total_amount': float(return_record['total_amount']) if return_record['total_amount'] else None,
            'customer': {
                'id': str(return_record['customer_id']),
                'name': return_record['customer_name'],
                'city': return_record['customer_city'],
                'phone': return_record['customer_phone'],
                'address': return_record['customer_address']
            },
            'created_by_email': return_record['created_by_email'],
            'created_at': return_record['created_at'].isoformat() if return_record['created_at'] else None,
            'updated_at': return_record['updated_at'].isoformat() if return_record['updated_at'] else None,
            'items': items_with_details
        }

        return jsonify(response), 200

    except Exception as e:
        print(f"Error fetching return details: {e}")
        return jsonify({'error': f'Failed to fetch return details: {str(e)}'}), 500


@return_bp.route('/<return_id>/revert', methods=['POST'])
@jwt_required()
def revert_return(return_id):
    """
    Revert/cancel a return.
    This will mark the return as CANCELLED and remove any restocked inventory.
    """
    try:
        user_id = get_jwt_identity()
        user_role = get_user_identity_details(user_id)

        with get_db_cursor() as cursor:
            # Check if return exists and is not already cancelled
            cursor.execute("""
                SELECT id, status, return_number
                FROM returns
                WHERE id = %s AND deleted_at IS NULL
            """, (return_id,))

            return_record = cursor.fetchone()

            if not return_record:
                return jsonify({'error': 'Return not found'}), 404

            if return_record['status'] == 'CANCELLED':
                return jsonify({'error': 'Return is already cancelled'}), 400

            # Remove inventory that was added from this return
            # Get all batches created for this return (batch_code starts with return_number)
            cursor.execute("""
                SELECT id FROM batches
                WHERE batch_code LIKE %s || '-%' AND deleted_at IS NULL
            """, (return_record['return_number'],))

            batch_ids = [row['id'] for row in cursor.fetchall()]

            if batch_ids:
                # Mark inventory stock as deleted (soft delete)
                cursor.execute("""
                    UPDATE inventory_stock
                    SET status = 'DELETED', deleted_at = NOW()
                    WHERE batch_id = ANY(%s::uuid[]) AND deleted_at IS NULL
                """, (batch_ids,))

                # Mark related cut pieces as deleted
                cursor.execute("""
                    UPDATE hdpe_cut_pieces
                    SET status = 'DELETED', deleted_at = NOW()
                    WHERE stock_id IN (
                        SELECT id FROM inventory_stock WHERE batch_id = ANY(%s::uuid[])
                    ) AND deleted_at IS NULL
                """, (batch_ids,))

                # Mark related spare pieces as deleted
                cursor.execute("""
                    UPDATE sprinkler_spare_pieces
                    SET status = 'DELETED', deleted_at = NOW()
                    WHERE stock_id IN (
                        SELECT id FROM inventory_stock WHERE batch_id = ANY(%s::uuid[])
                    ) AND deleted_at IS NULL
                """, (batch_ids,))

                # Soft delete the batches
                cursor.execute("""
                    UPDATE batches
                    SET deleted_at = NOW()
                    WHERE id = ANY(%s::uuid[])
                """, (batch_ids,))

            # Mark the return as cancelled
            cursor.execute("""
                UPDATE returns
                SET status = 'CANCELLED', updated_at = NOW()
                WHERE id = %s
            """, (return_id,))

            cursor.connection.commit()

            return jsonify({
                'success': True,
                'message': f'Return {return_record["return_number"]} cancelled successfully'
            }), 200

    except Exception as e:
        print(f"Error reverting return: {e}")
        return jsonify({'error': f'Failed to revert return: {str(e)}'}), 500


@return_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_return_stats():
    """Get return statistics"""
    try:
        stats_query = """
            SELECT
                COUNT(*) as total_returns,
                COUNT(CASE WHEN status = 'RECEIVED' THEN 1 END) as received_count,
                COUNT(CASE WHEN status = 'INSPECTED' THEN 1 END) as inspected_count,
                COUNT(CASE WHEN status = 'RESTOCKED' THEN 1 END) as restocked_count,
                COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled_count,
                COUNT(CASE WHEN return_date >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as last_30_days,
                COUNT(CASE WHEN return_date >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as last_7_days
            FROM returns
            WHERE deleted_at IS NULL
        """

        stats = execute_query(stats_query, fetch_one=True)

        return jsonify({
            'total_returns': stats['total_returns'],
            'by_status': {
                'received': stats['received_count'],
                'inspected': stats['inspected_count'],
                'restocked': stats['restocked_count'],
                'cancelled': stats['cancelled_count']
            },
            'last_30_days': stats['last_30_days'],
            'last_7_days': stats['last_7_days']
        }), 200

    except Exception as e:
        print(f"Error fetching return stats: {e}")
        return jsonify({'error': f'Failed to fetch return stats: {str(e)}'}), 500
