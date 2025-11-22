from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import execute_query, execute_insert, get_db_cursor
from inventory_helpers_aggregate import AggregateInventoryHelper as InventoryHelper
from auth import jwt_required_with_role, get_user_identity_details

inventory_bp = Blueprint('inventory', __name__, url_prefix='/api/inventory')

print("DEBUG: Inventory blueprint loaded, registering routes...")

@inventory_bp.route('/batches', methods=['GET'])
@jwt_required()
def get_batches():
    """Get all batches with aggregate inventory stock"""
    try:
        with get_db_cursor() as cursor:
            # Get all batches that have available stock
            cursor.execute("""
                SELECT DISTINCT
                    b.id, b.batch_code, b.batch_no, b.current_quantity,
                    b.production_date, b.attachment_url, b.created_at,
                    b.product_variant_id,
                    pv.parameters,
                    pt.id as product_type_id,
                    pt.name as product_type_name,
                    br.id as brand_id,
                    br.name as brand_name
                FROM batches b
                JOIN product_variants pv ON b.product_variant_id = pv.id
                JOIN product_types pt ON pv.product_type_id = pt.id
                JOIN brands br ON pv.brand_id = br.id
                WHERE b.deleted_at IS NULL
                AND EXISTS (
                    SELECT 1 FROM inventory_stock s
                    WHERE s.batch_id = b.id
                    AND s.deleted_at IS NULL
                    AND s.status = 'IN_STOCK'
                    AND s.quantity > 0
                )
                ORDER BY b.created_at DESC
            """)

            batches = cursor.fetchall()

            # Get stock entries for each batch
            for batch in batches:
                batch_id = str(batch['id']) if batch['id'] else None
                if not batch_id:
                    batch['stock_entries'] = []
                    continue

                cursor.execute("""
                    SELECT
                        s.id::text as stock_id,
                        s.stock_type,
                        s.quantity,
                        s.status,
                        s.length_per_unit,
                        s.pieces_per_bundle,
                        s.piece_length_meters,
                        pt.name as product_type_name,
                        CASE
                            WHEN s.stock_type = 'FULL_ROLL' THEN s.quantity * s.length_per_unit
                            WHEN s.stock_type = 'CUT_ROLL' THEN (
                                SELECT COALESCE(SUM(cp.length_meters), 0)
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
                        END as total_available
                    FROM inventory_stock s
                    JOIN product_variants pv ON s.product_variant_id = pv.id
                    JOIN product_types pt ON pv.product_type_id = pt.id
                    WHERE s.batch_id = %s::uuid
                    AND s.deleted_at IS NULL
                    AND s.status = 'IN_STOCK'
                    AND s.quantity > 0
                    AND s.stock_type NOT IN ('CUT_ROLL', 'SPARE')
                    ORDER BY s.stock_type, s.pieces_per_bundle, s.created_at
                """, (batch_id,))

                stock_entries = list(cursor.fetchall())

                # For CUT_ROLL, fetch individual pieces as separate entries
                cursor.execute("""
                    SELECT s.id::text as stock_id
                    FROM inventory_stock s
                    WHERE s.batch_id = %s::uuid
                    AND s.deleted_at IS NULL
                    AND s.status = 'IN_STOCK'
                    AND s.quantity > 0
                    AND s.stock_type = 'CUT_ROLL'
                """, (batch_id,))

                cut_roll_stocks = cursor.fetchall()

                for cut_stock in cut_roll_stocks:
                    cursor.execute("""
                        SELECT
                            cp.id::text as piece_id,
                            cp.length_meters,
                            s.id::text as stock_id,
                            pt.name as product_type_name
                        FROM hdpe_cut_pieces cp
                        JOIN inventory_stock s ON cp.stock_id = s.id
                        JOIN product_variants pv ON s.product_variant_id = pv.id
                        JOIN product_types pt ON pv.product_type_id = pt.id
                        WHERE s.id = %s::uuid AND cp.status = 'IN_STOCK'
                        ORDER BY cp.length_meters DESC
                    """, (cut_stock['stock_id'],))

                    cut_pieces = cursor.fetchall()

                    # Add each cut piece as a separate entry
                    for piece in cut_pieces:
                        stock_entries.append({
                            'stock_id': cut_stock['stock_id'],
                            'piece_id': piece['piece_id'],
                            'stock_type': 'CUT_ROLL',
                            'quantity': 1,
                            'status': 'IN_STOCK',
                            'length_per_unit': piece['length_meters'],
                            'pieces_per_bundle': None,
                            'piece_length_meters': None,
                            'total_available': piece['length_meters'],
                            'product_type_name': piece['product_type_name']
                        })

                # For SPARE, fetch individual spare groups as separate entries
                cursor.execute("""
                    SELECT s.id::text as stock_id
                    FROM inventory_stock s
                    WHERE s.batch_id = %s::uuid
                    AND s.deleted_at IS NULL
                    AND s.status = 'IN_STOCK'
                    AND s.stock_type = 'SPARE'
                """, (batch_id,))

                spare_stocks = cursor.fetchall()

                for spare_stock in spare_stocks:
                    cursor.execute("""
                        SELECT
                            sp.id::text as spare_id,
                            sp.piece_count,
                            s.id::text as stock_id,
                            s.piece_length_meters,
                            pt.name as product_type_name
                        FROM sprinkler_spare_pieces sp
                        JOIN inventory_stock s ON sp.stock_id = s.id
                        JOIN product_variants pv ON s.product_variant_id = pv.id
                        JOIN product_types pt ON pv.product_type_id = pt.id
                        WHERE s.id = %s::uuid AND sp.status = 'IN_STOCK'
                        ORDER BY sp.piece_count DESC
                    """, (spare_stock['stock_id'],))

                    spare_groups = cursor.fetchall()

                    # Add each spare group as a separate entry
                    for spare_group in spare_groups:
                        stock_entries.append({
                            'stock_id': spare_stock['stock_id'],
                            'spare_id': spare_group['spare_id'],
                            'stock_type': 'SPARE',
                            'quantity': 1,
                            'status': 'IN_STOCK',
                            'length_per_unit': None,
                            'pieces_per_bundle': None,
                            'piece_length_meters': spare_group['piece_length_meters'],
                            'piece_count': spare_group['piece_count'],
                            'total_available': spare_group['piece_count'],
                            'product_type_name': spare_group['product_type_name']
                        })

                batch['stock_entries'] = stock_entries

        return jsonify(batches), 200
    except Exception as e:
        return jsonify({'error': 'Failed to fetch batches', 'details': str(e)}), 500

@inventory_bp.route('/product-types', methods=['GET'])
@jwt_required()
def get_product_types():
    """Get all product types"""
    try:
        query = """
            SELECT pt.*, u.name as unit_name, u.abbreviation as unit_abbr
            FROM product_types pt
            JOIN units u ON pt.unit_id = u.id
            WHERE pt.deleted_at IS NULL
            ORDER BY pt.name
        """
        product_types = execute_query(query)
        return jsonify(product_types), 200
    except Exception as e:
        return jsonify({'error': 'Failed to fetch product types', 'details': str(e)}), 500

@inventory_bp.route('/brands', methods=['GET'])
@jwt_required()
def get_brands():
    """Get all brands"""
    try:
        query = "SELECT * FROM brands WHERE deleted_at IS NULL ORDER BY name"
        brands = execute_query(query)
        return jsonify(brands), 200
    except Exception as e:
        return jsonify({'error': 'Failed to fetch brands', 'details': str(e)}), 500

@inventory_bp.route('/batches/<uuid:batch_id>', methods=['PUT'])
@jwt_required_with_role('admin')
def update_batch(batch_id):
    """Update batch details (admin only)"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        actor = get_user_identity_details(user_id)

        allowed_fields = ['batch_no', 'batch_code', 'notes']
        updates = []
        params = []

        for field in allowed_fields:
            if field in data:
                updates.append(f"{field} = %s")
                params.append(data[field])

        if not updates:
            return jsonify({'error': 'No valid fields to update'}), 400

        updates.append("updated_at = NOW()")
        params.append(str(batch_id))

        query = f"UPDATE batches SET {', '.join(updates)} WHERE id = %s"
        execute_query(query, params, fetch_all=False)

        # Audit log
        execute_query("""
            INSERT INTO audit_logs (
                user_id, action_type, entity_type, entity_id,
                description, created_at
            ) VALUES (%s, 'UPDATE_BATCH', 'BATCH', %s, %s, NOW())
        """, (
            user_id,
            str(batch_id),
            f"{actor['name']} ({actor['role']}) updated batch fields: {', '.join(allowed_fields)}"
        ), fetch_all=False)

        return jsonify({'message': 'Batch updated successfully'}), 200
    except Exception as e:
        return jsonify({'error': 'Failed to update batch', 'details': str(e)}), 500

@inventory_bp.route('/stock/<uuid:stock_id>', methods=['PUT'])
@jwt_required_with_role('admin')
def update_stock(stock_id):
    """Update stock entry details (admin only)"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        actor = get_user_identity_details(user_id)

        quantity = data.get('quantity')
        status = data.get('status')
        notes = data.get('notes')

        # Get the current stock data before update
        current_stock = execute_query("""
            SELECT s.*, b.batch_code, b.batch_no
            FROM inventory_stock s
            JOIN batches b ON s.batch_id = b.id
            WHERE s.id = %s
        """, (str(stock_id),))

        if not current_stock:
            return jsonify({'error': 'Stock entry not found'}), 404

        current_stock = current_stock[0]
        old_status = current_stock['status']
        old_quantity = current_stock['quantity']

        updates = []
        params = []

        if quantity is not None:
            updates.append("quantity = %s")
            params.append(int(quantity))

        if status and status in ['IN_STOCK', 'DISPATCHED', 'RESERVED']:
            updates.append("status = %s")
            params.append(status)

        if notes is not None:
            updates.append("notes = %s")
            params.append(notes)

        if not updates:
            return jsonify({'error': 'No valid fields to update'}), 400

        updates.append("updated_at = NOW()")
        params.append(str(stock_id))

        query = f"UPDATE inventory_stock SET {', '.join(updates)} WHERE id = %s"
        execute_query(query, params, fetch_all=False)

        # Update batch current_quantity from aggregate stock
        execute_query("""
            UPDATE batches b
            SET current_quantity = (
                SELECT COALESCE(
                    SUM(CASE
                        WHEN s.stock_type = 'FULL_ROLL' THEN s.quantity * s.length_per_unit
                        WHEN s.stock_type = 'CUT_ROLL' THEN (
                            SELECT COALESCE(SUM(cp.length_meters), 0)
                            FROM hdpe_cut_pieces cp
                            WHERE cp.stock_id = s.id
                        )
                        WHEN s.stock_type = 'BUNDLE' THEN s.quantity * s.pieces_per_bundle
                        WHEN s.stock_type = 'SPARE' THEN (
                            SELECT COALESCE(SUM(sp.piece_count), 0)
                            FROM sprinkler_spare_pieces sp
                            WHERE sp.stock_id = s.id
                        )
                        ELSE s.quantity
                    END), 0)
                FROM inventory_stock s
                WHERE s.batch_id = b.id
            ),
            updated_at = NOW()
            WHERE id = (
                SELECT batch_id FROM inventory_stock WHERE id = %s
            )
        """, (str(stock_id),), fetch_all=False)

        # Audit log
        log_description = f"{actor['name']} ({actor['role']}) updated stock entry {current_stock['stock_type']}"
        if old_status != status:
            log_description += f" (status: {old_status} → {status})"
        if quantity is not None and old_quantity != quantity:
            log_description += f" (quantity: {old_quantity} → {quantity})"

        execute_query("""
            INSERT INTO audit_logs (
                user_id, action_type, entity_type, entity_id,
                description, created_at
            ) VALUES (%s, 'UPDATE_STOCK', 'STOCK', %s, %s, NOW())
        """, (
            user_id,
            str(stock_id),
            log_description
        ), fetch_all=False)

        return jsonify({'message': 'Roll updated successfully'}), 200
    except Exception as e:
        return jsonify({'error': 'Failed to update roll', 'details': str(e)}), 500

@inventory_bp.route('/cut-roll', methods=['POST', 'OPTIONS'])
def cut_roll():
    """Cut a full roll or cut roll into smaller pieces"""
    print(f"DEBUG: cut_roll endpoint called, method={request.method}")

    if request.method == 'OPTIONS':
        return jsonify({}), 200

    # Apply JWT check only for POST
    try:
        from flask_jwt_extended import verify_jwt_in_request
        verify_jwt_in_request()
    except Exception as e:
        return jsonify({'error': 'Unauthorized', 'details': str(e)}), 401

    user_id = get_jwt_identity()

    # Check role
    actor = get_user_identity_details(user_id)
    if not actor or actor.get('role') not in ['admin', 'user']:
        return jsonify({'error': 'Insufficient permissions'}), 403

    try:
        data = request.get_json()

        stock_id = data.get('stock_id')
        piece_id = data.get('piece_id')  # Optional: specific piece to cut for CUT_ROLL
        cut_lengths = data.get('cut_lengths', [])

        if not stock_id or not cut_lengths:
            return jsonify({'error': 'stock_id and cut_lengths are required'}), 400

        # Validate cut_lengths are positive numbers
        cut_lengths = [float(l) for l in cut_lengths if float(l) > 0]
        if not cut_lengths:
            return jsonify({'error': 'At least one valid cut length is required'}), 400

        with get_db_cursor() as cursor:
            # Get the stock entry
            cursor.execute("""
                SELECT s.*, s.batch_id, pv.product_type_id
                FROM inventory_stock s
                JOIN product_variants pv ON s.product_variant_id = pv.id
                WHERE s.id = %s AND s.status = 'IN_STOCK' AND s.deleted_at IS NULL
            """, (stock_id,))

            stock = cursor.fetchone()
            if not stock:
                return jsonify({'error': 'Stock not found or not available'}), 404

            stock_type = stock['stock_type']

            if stock_type == 'FULL_ROLL':
                # Cutting a full roll
                if stock['quantity'] < 1:
                    return jsonify({'error': 'No rolls available to cut'}), 400

                total_cut_length = sum(cut_lengths)
                length_per_unit = float(stock['length_per_unit'] or 0)

                if total_cut_length > length_per_unit:
                    return jsonify({'error': f'Total cut length ({total_cut_length}m) exceeds roll length ({length_per_unit}m)'}), 400

                # Get actor details for audit log
                actor = get_user_identity_details(user_id)

                # Reduce full roll quantity by 1
                cursor.execute("""
                    UPDATE inventory_stock
                    SET quantity = quantity - 1, updated_at = NOW()
                    WHERE id = %s
                    RETURNING quantity
                """, (stock_id,))

                # Check if quantity is now 0 and soft delete if needed
                updated_quantity = cursor.fetchone()
                if updated_quantity and updated_quantity['quantity'] <= 0:
                    cursor.execute("""
                        UPDATE inventory_stock
                        SET deleted_at = NOW(), status = 'SOLD_OUT'
                        WHERE id = %s
                    """, (stock_id,))

                # Create or update CUT_ROLL stock for this batch
                cursor.execute("""
                    SELECT id FROM inventory_stock
                    WHERE batch_id = %s
                    AND product_variant_id = %s
                    AND stock_type = 'CUT_ROLL'
                    AND status = 'IN_STOCK'
                    AND deleted_at IS NULL
                """, (stock['batch_id'], stock['product_variant_id']))

                cut_stock = cursor.fetchone()

                if cut_stock:
                    cut_stock_id = cut_stock['id']
                    cursor.execute("""
                        UPDATE inventory_stock
                        SET quantity = quantity + %s, updated_at = NOW()
                        WHERE id = %s
                    """, (len(cut_lengths), cut_stock_id))
                else:
                    import uuid
                    cut_stock_id = str(uuid.uuid4())
                    cursor.execute("""
                        INSERT INTO inventory_stock (
                            id, batch_id, product_variant_id, status, stock_type,
                            quantity, notes, created_at, updated_at
                        ) VALUES (%s, %s, %s, 'IN_STOCK', 'CUT_ROLL', %s, %s, NOW(), NOW())
                    """, (cut_stock_id, stock['batch_id'], stock['product_variant_id'],
                          len(cut_lengths), f'Cut from full roll'))

                # Add individual cut pieces
                pieces_created = []
                cut_piece_details = []
                for length in cut_lengths:
                    cursor.execute("""
                        INSERT INTO hdpe_cut_pieces (
                            stock_id, length_meters, status, notes, created_at
                        ) VALUES (%s, %s, 'IN_STOCK', %s, NOW())
                        RETURNING id
                    """, (cut_stock_id, length, f'Cut {length}m from {length_per_unit}m roll'))
                    piece_id = cursor.fetchone()['id']
                    pieces_created.append(length)
                    cut_piece_details.append({"length": float(length), "piece_id": str(piece_id)})

                # Add remainder piece if there's leftover length
                remainder = length_per_unit - total_cut_length
                if remainder > 0:
                    cursor.execute("""
                        INSERT INTO hdpe_cut_pieces (
                            stock_id, length_meters, status, notes, created_at
                        ) VALUES (%s, %s, 'IN_STOCK', %s, NOW())
                        RETURNING id
                    """, (cut_stock_id, remainder, f'Remainder {remainder}m from {length_per_unit}m roll'))
                    piece_id = cursor.fetchone()['id']
                    pieces_created.append(remainder)
                    cut_piece_details.append({"length": float(remainder), "piece_id": str(piece_id), "is_remainder": True})

                # Update the quantity to reflect all pieces (cut + remainder)
                cursor.execute("""
                    UPDATE inventory_stock
                    SET quantity = %s, updated_at = NOW()
                    WHERE id = %s
                """, (len(pieces_created), cut_stock_id))

                # Create transaction with complete information
                import json
                all_pieces_str = ", ".join([f"{l}m" for l in cut_lengths])
                notes = f'Cut {length_per_unit}m roll into {len(cut_lengths)} pieces: {all_pieces_str}'
                if remainder > 0:
                    notes += f'. Remainder: {remainder}m'

                cursor.execute("""
                    INSERT INTO inventory_transactions (
                        transaction_type, from_stock_id, from_quantity, from_length,
                        to_stock_id, to_quantity, cut_piece_details, notes, created_at
                    ) VALUES ('CUT_ROLL', %s, 1, %s, %s, %s, %s, %s, NOW())
                """, (stock_id, length_per_unit, cut_stock_id, len(pieces_created),
                      json.dumps(cut_piece_details), notes))

                # Audit log
                cursor.execute("""
                    INSERT INTO audit_logs (
                        user_id, action_type, entity_type, entity_id,
                        description, created_at
                    ) VALUES (%s, 'CUT_ROLL', 'STOCK', %s, %s, NOW())
                """, (user_id, str(stock_id),
                      f"{actor['name']} cut 1 full roll into {len(cut_lengths)} pieces"))

            elif stock_type == 'CUT_ROLL':
                # Cutting existing cut pieces further
                # Get actor details for audit log
                actor = get_user_identity_details(user_id)

                # If piece_id is provided, cut that specific piece
                # Otherwise, cut from available pieces (legacy behavior)
                if piece_id:
                    # Get the specific piece
                    cursor.execute("""
                        SELECT id, length_meters
                        FROM hdpe_cut_pieces
                        WHERE id = %s AND stock_id = %s AND status = 'IN_STOCK'
                    """, (piece_id, stock_id))

                    piece = cursor.fetchone()
                    if not piece:
                        return jsonify({'error': 'Cut piece not found or not available'}), 404

                    piece_length = float(piece['length_meters'])
                    total_cut_length = sum(cut_lengths)

                    if total_cut_length > piece_length:
                        return jsonify({'error': f'Total cut length ({total_cut_length}m) exceeds piece length ({piece_length}m)'}), 400

                    # Mark the original piece as dispatched
                    cursor.execute("""
                        UPDATE hdpe_cut_pieces
                        SET status = 'DISPATCHED', updated_at = NOW()
                        WHERE id = %s
                    """, (piece_id,))

                    # Create the cut piece(s)
                    pieces_created = []
                    cut_piece_details = []
                    for length in cut_lengths:
                        cursor.execute("""
                            INSERT INTO hdpe_cut_pieces (
                                stock_id, length_meters, status, notes, created_at
                            ) VALUES (%s, %s, 'IN_STOCK', %s, NOW())
                            RETURNING id
                        """, (stock_id, length, f'Cut {length}m from {piece_length}m piece'))
                        new_piece_id = cursor.fetchone()['id']
                        pieces_created.append(length)
                        cut_piece_details.append({"length": float(length), "piece_id": str(new_piece_id)})

                    # Create remainder piece if there's leftover
                    remainder = piece_length - total_cut_length
                    if remainder > 0:
                        cursor.execute("""
                            INSERT INTO hdpe_cut_pieces (
                                stock_id, length_meters, status, notes, created_at
                            ) VALUES (%s, %s, 'IN_STOCK', %s, NOW())
                            RETURNING id
                        """, (stock_id, remainder, f'Remainder {remainder}m from {piece_length}m piece'))
                        new_piece_id = cursor.fetchone()['id']
                        pieces_created.append(remainder)
                        cut_piece_details.append({"length": float(remainder), "piece_id": str(new_piece_id), "is_remainder": True})

                    # Update quantity
                    cursor.execute("""
                        UPDATE inventory_stock
                        SET quantity = (
                            SELECT COUNT(*) FROM hdpe_cut_pieces
                            WHERE stock_id = %s AND status = 'IN_STOCK'
                        ), updated_at = NOW()
                        WHERE id = %s
                    """, (stock_id, stock_id))

                    # Create transaction with complete information
                    import json
                    all_pieces_str = ", ".join([f"{l}m" for l in cut_lengths])
                    notes = f'Cut {piece_length}m piece into {len(cut_lengths)} pieces: {all_pieces_str}'
                    if remainder > 0:
                        notes += f'. Remainder: {remainder}m'

                    cursor.execute("""
                        INSERT INTO inventory_transactions (
                            transaction_type, from_stock_id, from_quantity, from_length,
                            to_stock_id, to_quantity, cut_piece_details, notes, created_at
                        ) VALUES ('CUT_ROLL', %s, 1, %s, %s, %s, %s, %s, NOW())
                    """, (stock_id, piece_length, stock_id, len(pieces_created),
                          json.dumps(cut_piece_details), notes))

                    # Audit log
                    cursor.execute("""
                        INSERT INTO audit_logs (
                            user_id, action_type, entity_type, entity_id,
                            description, created_at
                        ) VALUES (%s, 'CUT_ROLL', 'STOCK', %s, %s, NOW())
                    """, (user_id, str(stock_id),
                          f"{actor['name']} cut {piece_length}m piece into {len(pieces_created)} pieces"))

                else:
                    # Legacy: cut from available pieces (when no specific piece_id provided)
                    # Get available cut pieces
                    cursor.execute("""
                        SELECT id, length_meters
                        FROM hdpe_cut_pieces
                        WHERE stock_id = %s AND status = 'IN_STOCK'
                        ORDER BY length_meters DESC
                    """, (stock_id,))

                    available_pieces = cursor.fetchall()
                    total_available = sum(p['length_meters'] for p in available_pieces)
                    total_cut_length = sum(cut_lengths)

                    if total_cut_length > total_available:
                        return jsonify({'error': f'Total cut length ({total_cut_length}m) exceeds available length ({total_available}m)'}), 400

                    # Mark old pieces as cut/removed and create new pieces
                    remaining_to_cut = total_cut_length
                    pieces_to_remove = []

                    for piece in available_pieces:
                        if remaining_to_cut <= 0:
                            break
                        if piece['length_meters'] <= remaining_to_cut:
                            pieces_to_remove.append(piece['id'])
                            remaining_to_cut -= float(piece['length_meters'])
                        else:
                            # Partial cut from this piece
                            pieces_to_remove.append(piece['id'])
                            # Keep the remainder as a new piece
                            remainder = float(piece['length_meters']) - remaining_to_cut
                            cut_lengths.append(remainder)
                            remaining_to_cut = 0

                    # Mark old pieces as dispatched (they've been cut further)
                    if pieces_to_remove:
                        cursor.execute("""
                            UPDATE hdpe_cut_pieces
                            SET status = 'DISPATCHED', updated_at = NOW()
                            WHERE id = ANY(%s::uuid[])
                        """, (pieces_to_remove,))

                    # Add new cut pieces
                    for length in cut_lengths:
                        cursor.execute("""
                            INSERT INTO hdpe_cut_pieces (
                                stock_id, length_meters, status, notes, created_at
                            ) VALUES (%s, %s, 'IN_STOCK', %s, NOW())
                        """, (stock_id, length, f'Further cut to {length}m'))

                    # Update quantity
                    cursor.execute("""
                        UPDATE inventory_stock
                        SET quantity = (
                            SELECT COUNT(*) FROM hdpe_cut_pieces
                            WHERE stock_id = %s AND status = 'IN_STOCK'
                        ), updated_at = NOW()
                        WHERE id = %s
                    """, (stock_id, stock_id))

                    # Audit log
                    cursor.execute("""
                        INSERT INTO audit_logs (
                            user_id, action_type, entity_type, entity_id,
                            description, created_at
                        ) VALUES (%s, 'CUT_ROLL', 'STOCK', %s, %s, NOW())
                    """, (user_id, str(stock_id),
                          f"{actor['name']} cut existing pieces into {len(cut_lengths)} new pieces"))
            else:
                return jsonify({'error': 'Only FULL_ROLL and CUT_ROLL can be cut'}), 400

        return jsonify({
            'message': f'Successfully cut into {len(cut_lengths)} pieces',
            'cut_pieces': cut_lengths
        }), 200

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error cutting roll: {error_trace}")
        return jsonify({'error': 'Failed to cut roll', 'details': str(e)}), 500

@inventory_bp.route('/customers', methods=['GET', 'OPTIONS'])
@jwt_required()
def get_customers():
    """Get all customers"""
    try:
        query = "SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY name"
        customers = execute_query(query)
        return jsonify(customers), 200
    except Exception as e:
        return jsonify({'error': 'Failed to fetch customers', 'details': str(e)}), 500

@inventory_bp.route('/search', methods=['POST', 'OPTIONS'])
def search_inventory():
    """Search for available stock by product type, brand, and parameters"""
    if request.method == 'OPTIONS':
        return jsonify({}), 200

    from flask_jwt_extended import verify_jwt_in_request
    verify_jwt_in_request()

    try:
        data = request.json or {}
        product_type_id = data.get('product_type_id')
        brand_id = data.get('brand_id')
        parameters = data.get('parameters', {})

        if not product_type_id:
            return jsonify([]), 200

        with get_db_cursor() as cursor:
            # Get product type name to determine category
            cursor.execute("SELECT name FROM product_types WHERE id = %s", (product_type_id,))
            pt_result = cursor.fetchone()
            if not pt_result:
                return jsonify([]), 200

            product_type_name = pt_result['name']
            is_hdpe = product_type_name == 'HDPE Pipe'

            # Query inventory_stock directly with necessary joins
            query = """
                SELECT
                    s.id,
                    s.batch_id,
                    s.status,
                    s.stock_type,
                    s.quantity,
                    s.length_per_unit as length_meters,
                    s.pieces_per_bundle as bundle_size,
                    s.piece_length_meters,
                    s.product_variant_id,
                    s.created_at,
                    b.batch_code,
                    b.batch_no,
                    pt.name as product_type_name,
                    br.name as brand_name,
                    pt.name as product_category,
                    pv.parameters,
                    CASE WHEN s.stock_type = 'CUT_ROLL' THEN TRUE ELSE FALSE END as is_cut_roll,
                    CASE
                        WHEN s.stock_type = 'BUNDLE' THEN 'bundle'
                        WHEN s.stock_type = 'SPARE' THEN 'spare'
                        ELSE NULL
                    END as bundle_type,
                    CASE
                        WHEN s.stock_type = 'BUNDLE' THEN s.pieces_per_bundle * s.quantity
                        WHEN s.stock_type = 'SPARE' THEN (
                            SELECT COALESCE(SUM(piece_count), 0)
                            FROM sprinkler_spare_pieces
                            WHERE stock_id = s.id AND status = 'IN_STOCK'
                        )
                        ELSE NULL
                    END as piece_count
                FROM inventory_stock s
                JOIN batches b ON s.batch_id = b.id
                JOIN product_variants pv ON s.product_variant_id = pv.id
                JOIN product_types pt ON pv.product_type_id = pt.id
                JOIN brands br ON pv.brand_id = br.id
                WHERE s.deleted_at IS NULL
                AND s.status = 'IN_STOCK'
                AND s.quantity > 0
                AND pv.product_type_id = %s
            """

            params = [product_type_id]

            # Optional: filter by brand
            if brand_id:
                query += " AND pv.brand_id = %s"
                params.append(brand_id)

            # Optional: filter by parameters
            if parameters:
                for key, value in parameters.items():
                    if value:
                        query += f" AND pv.parameters->>%s = %s"
                        params.extend([key, str(value)])

            # Sort by batch and type
            query += " ORDER BY b.batch_code, s.stock_type, s.created_at DESC"

            cursor.execute(query, tuple(params))
            results = cursor.fetchall()

            # Expand CUT_ROLL and SPARE entries to show individual pieces
            expanded_results = []
            for row in results:
                if row['stock_type'] == 'CUT_ROLL':
                    # Fetch individual cut pieces for this stock
                    cursor.execute("""
                        SELECT id::text as piece_id, length_meters
                        FROM hdpe_cut_pieces
                        WHERE stock_id = %s AND status = 'IN_STOCK'
                        ORDER BY length_meters DESC
                    """, (row['id'],))
                    cut_pieces = cursor.fetchall()

                    # Add each cut piece as a separate entry
                    for piece in cut_pieces:
                        piece_entry = dict(row)
                        piece_entry['piece_id'] = piece['piece_id']
                        piece_entry['length_meters'] = piece['length_meters']
                        expanded_results.append(piece_entry)
                elif row['stock_type'] == 'SPARE':
                    # Fetch individual spare pieces for this stock
                    cursor.execute("""
                        SELECT id::text as spare_id, piece_count
                        FROM sprinkler_spare_pieces
                        WHERE stock_id = %s AND status = 'IN_STOCK'
                        ORDER BY piece_count DESC
                    """, (row['id'],))
                    spare_pieces = cursor.fetchall()

                    # Add each spare piece group as a separate entry
                    for piece in spare_pieces:
                        piece_entry = dict(row)
                        piece_entry['spare_id'] = piece['spare_id']
                        piece_entry['piece_count'] = piece['piece_count']
                        # piece_length_meters is already in row from the parent stock
                        expanded_results.append(piece_entry)
                else:
                    expanded_results.append(dict(row))

        return jsonify(expanded_results), 200

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error in search_inventory: {error_trace}")
        return jsonify({'error': 'Failed to search inventory', 'details': str(e)}), 500

@inventory_bp.route('/product-variants/search', methods=['GET', 'OPTIONS'])
@jwt_required()
def search_product_variants():
    """Search product variants by batch code or parameters"""
    try:
        product_type_id = request.args.get('product_type_id')
        brand_id = request.args.get('brand_id')
        search = request.args.get('search', '').strip()

        if not product_type_id or not brand_id:
            return jsonify({'error': 'product_type_id and brand_id are required'}), 400

        if len(search) < 2:
            return jsonify([]), 200

        # Search in batches with matching product variants
        query = """
            SELECT DISTINCT
                pv.id as variant_id,
                pv.parameters,
                pt.name as product_type,
                br.name as brand,
                b.batch_code,
                b.current_quantity
            FROM product_variants pv
            JOIN product_types pt ON pv.product_type_id = pt.id
            JOIN brands br ON pv.brand_id = br.id
            LEFT JOIN batches b ON b.product_variant_id = pv.id AND b.deleted_at IS NULL
            WHERE pv.product_type_id = %s
            AND pv.brand_id = %s
            AND b.current_quantity > 0
            AND (
                b.batch_code ILIKE %s
                OR CAST(pv.parameters AS TEXT) ILIKE %s
            )
            ORDER BY b.batch_code
            LIMIT 10
        """

        search_pattern = f'%{search}%'
        variants = execute_query(query, (product_type_id, brand_id, search_pattern, search_pattern))

        return jsonify(variants), 200
    except Exception as e:
        return jsonify({'error': 'Failed to search variants', 'details': str(e)}), 500

@inventory_bp.route('/split-bundle', methods=['POST', 'OPTIONS'])
def split_bundle():
    """Split a bundle into spare pieces"""
    if request.method == 'OPTIONS':
        return jsonify({}), 200

    print("DEBUG: split_bundle endpoint called, method={}".format(request.method))

    try:
        from flask_jwt_extended import verify_jwt_in_request
        verify_jwt_in_request()
    except Exception as e:
        return jsonify({'error': 'Unauthorized', 'details': str(e)}), 401

    user_id = get_jwt_identity()

    # Check role
    actor = get_user_identity_details(user_id)
    if not actor or actor.get('role') not in ['admin', 'user']:
        return jsonify({'error': 'Insufficient permissions'}), 403

    try:
        data = request.get_json()

        stock_id = data.get('stock_id')
        pieces_to_split = data.get('pieces_to_split', [])  # Array of piece counts to split

        if not stock_id or not pieces_to_split:
            return jsonify({'error': 'stock_id and pieces_to_split are required'}), 400

        # Validate pieces_to_split are positive integers
        pieces_to_split = [int(p) for p in pieces_to_split if int(p) > 0]
        if not pieces_to_split:
            return jsonify({'error': 'At least one valid piece count required'}), 400

        with get_db_cursor() as cursor:
            # Get stock details
            cursor.execute("""
                SELECT s.*, s.batch_id, pv.product_type_id
                FROM inventory_stock s
                JOIN product_variants pv ON s.product_variant_id = pv.id
                WHERE s.id = %s AND s.status = 'IN_STOCK' AND s.deleted_at IS NULL
            """, (stock_id,))

            stock = cursor.fetchone()
            if not stock:
                return jsonify({'error': 'Stock not found or not available'}), 404

            stock_type = stock['stock_type']

            if stock_type != 'BUNDLE':
                return jsonify({'error': 'Only BUNDLE stock can be split'}), 400

            if stock['quantity'] < 1:
                return jsonify({'error': 'No bundles available to split'}), 400

            pieces_per_bundle = int(stock['pieces_per_bundle'] or 0)
            total_pieces_needed = sum(pieces_to_split)

            if total_pieces_needed > pieces_per_bundle:
                return jsonify({'error': f'Total pieces ({total_pieces_needed}) exceeds bundle size ({pieces_per_bundle})'}), 400

            # Reduce bundle quantity by 1
            cursor.execute("""
                UPDATE inventory_stock
                SET quantity = quantity - 1, updated_at = NOW()
                WHERE id = %s
            """, (stock_id,))

            # Check if bundle quantity is now 0 and soft delete it
            cursor.execute("""
                SELECT quantity FROM inventory_stock WHERE id = %s
            """, (stock_id,))
            updated_stock = cursor.fetchone()
            if updated_stock and updated_stock['quantity'] <= 0:
                cursor.execute("""
                    UPDATE inventory_stock
                    SET deleted_at = NOW()
                    WHERE id = %s
                """, (stock_id,))

            # Create or update SPARE stock entry for this batch/variant
            cursor.execute("""
                SELECT id FROM inventory_stock
                WHERE batch_id = %s
                AND product_variant_id = %s
                AND stock_type = 'SPARE'
                AND piece_length_meters = %s
                AND status = 'IN_STOCK'
                AND deleted_at IS NULL
            """, (stock['batch_id'], stock['product_variant_id'], stock['piece_length_meters']))

            spare_stock = cursor.fetchone()

            if spare_stock:
                spare_stock_id = spare_stock['id']
            else:
                # Create new SPARE stock entry
                cursor.execute("""
                    INSERT INTO inventory_stock (
                        batch_id, product_variant_id, stock_type, quantity,
                        piece_length_meters, status, created_at, updated_at
                    ) VALUES (%s, %s, 'SPARE', 0, %s, 'IN_STOCK', NOW(), NOW())
                    RETURNING id
                """, (stock['batch_id'], stock['product_variant_id'], stock['piece_length_meters']))
                spare_stock_id = cursor.fetchone()['id']

            # Create individual spare piece entries
            pieces_created = []
            for piece_count in pieces_to_split:
                cursor.execute("""
                    INSERT INTO sprinkler_spare_pieces (
                        stock_id, piece_count, status, notes, created_at
                    ) VALUES (%s, %s, 'IN_STOCK', %s, NOW())
                """, (spare_stock_id, piece_count, f'Split from bundle: {piece_count} pieces'))
                pieces_created.append(piece_count)

            # Add remainder if any
            remainder = pieces_per_bundle - total_pieces_needed
            if remainder > 0:
                cursor.execute("""
                    INSERT INTO sprinkler_spare_pieces (
                        stock_id, piece_count, status, notes, created_at
                    ) VALUES (%s, %s, 'IN_STOCK', %s, NOW())
                """, (spare_stock_id, remainder, f'Remainder from bundle split: {remainder} pieces'))
                pieces_created.append(remainder)

            # Update SPARE stock quantity
            cursor.execute("""
                UPDATE inventory_stock
                SET quantity = (
                    SELECT COUNT(*) FROM sprinkler_spare_pieces
                    WHERE stock_id = %s AND status = 'IN_STOCK'
                ), updated_at = NOW()
                WHERE id = %s
            """, (spare_stock_id, spare_stock_id))

            # Create transaction record
            cursor.execute("""
                INSERT INTO inventory_transactions (
                    transaction_type, from_stock_id, from_quantity,
                    to_stock_id, to_quantity, notes, created_at
                ) VALUES ('SPLIT_BUNDLE', %s, 1, %s, %s, %s, NOW())
            """, (stock_id, spare_stock_id, len(pieces_created),
                  f'Split 1 bundle into {len(pieces_created)} spare groups: {", ".join([f"{p} pcs" for p in pieces_created])}'))

            # Audit log
            cursor.execute("""
                INSERT INTO audit_logs (
                    user_id, action_type, entity_type, entity_id,
                    description, created_at
                ) VALUES (%s, 'SPLIT_BUNDLE', 'STOCK', %s, %s, NOW())
            """, (user_id, str(stock_id),
                  f"{actor['name']} split 1 bundle into {len(pieces_created)} spare groups"))

        return jsonify({
            'message': f'Successfully split bundle into {len(pieces_created)} spare groups',
            'spare_groups': pieces_created
        }), 200

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error splitting bundle: {error_trace}")
        return jsonify({'error': 'Failed to split bundle', 'details': str(e)}), 500

print("DEBUG: Registering /combine-spares route...")
@inventory_bp.route('/combine-spares', methods=['POST', 'OPTIONS'])
def combine_spares():
    """Combine spare pieces into a bundle"""
    print("=" * 80)
    print("DEBUG: combine_spares endpoint HIT!")
    print(f"Request method: {request.method}")
    print(f"Request path: {request.path}")
    print(f"Request headers: {dict(request.headers)}")
    print("=" * 80)

    if request.method == 'OPTIONS':
        return jsonify({}), 200

    print("DEBUG: combine_spares endpoint called, method={}".format(request.method))

    try:
        from flask_jwt_extended import verify_jwt_in_request
        verify_jwt_in_request()
        print("DEBUG: JWT verification successful")
    except Exception as e:
        print(f"DEBUG: JWT verification failed: {e}")
        return jsonify({'error': 'Unauthorized', 'details': str(e)}), 401

    user_id = get_jwt_identity()
    print(f"DEBUG: user_id: {user_id}")

    # Check role
    actor = get_user_identity_details(user_id)
    print(f"DEBUG: actor: {actor}")
    if not actor or actor.get('role') not in ['admin', 'user']:
        print(f"DEBUG: Insufficient permissions for role: {actor.get('role') if actor else None}")
        return jsonify({'error': 'Insufficient permissions'}), 403

    try:
        data = request.get_json()
        print(f"DEBUG: Request data: {data}")

        stock_id = data.get('stock_id')
        spare_piece_ids = data.get('spare_piece_ids', [])  # Array of specific spare piece IDs to combine
        bundle_size = data.get('bundle_size')  # Custom bundle size
        number_of_bundles = data.get('number_of_bundles', 1)  # Number of bundles to create

        print(f"DEBUG: stock_id={stock_id}, spare_piece_ids={spare_piece_ids}, bundle_size={bundle_size}, number_of_bundles={number_of_bundles}")

        if not stock_id or not spare_piece_ids or not bundle_size:
            print("DEBUG: Missing required fields")
            return jsonify({'error': 'stock_id, spare_piece_ids, and bundle_size are required'}), 400

        bundle_size = int(bundle_size)
        number_of_bundles = int(number_of_bundles)

        if bundle_size <= 0:
            return jsonify({'error': 'Bundle size must be positive'}), 400

        if number_of_bundles <= 0:
            return jsonify({'error': 'Number of bundles must be positive'}), 400

        total_pieces_needed = bundle_size * number_of_bundles

        with get_db_cursor() as cursor:
            # Get stock details
            cursor.execute("""
                SELECT s.*, s.batch_id, pv.product_type_id
                FROM inventory_stock s
                JOIN product_variants pv ON s.product_variant_id = pv.id
                WHERE s.id = %s AND s.status = 'IN_STOCK' AND s.deleted_at IS NULL
            """, (stock_id,))

            stock = cursor.fetchone()
            if not stock:
                return jsonify({'error': 'Stock not found or not available'}), 404

            stock_type = stock['stock_type']

            if stock_type != 'SPARE':
                return jsonify({'error': 'Only SPARE stock can be combined'}), 400

            # Get the specific spare pieces by their spare_id (primary key of sprinkler_spare_pieces)
            print(f"DEBUG: Querying for spare pieces with spare_ids: {spare_piece_ids}")
            cursor.execute("""
                SELECT ssp.id as spare_piece_id, ssp.piece_count, ssp.stock_id
                FROM sprinkler_spare_pieces ssp
                WHERE ssp.id = ANY(%s::uuid[]) AND ssp.status = 'IN_STOCK'
            """, (spare_piece_ids,))

            spare_pieces = cursor.fetchall()
            print(f"DEBUG: Found {len(spare_pieces)} spare pieces: {spare_pieces}")

            if not spare_pieces:
                print(f"DEBUG: No spare pieces found for spare_ids: {spare_piece_ids}")
                return jsonify({'error': 'Some spare pieces not found or not available'}), 404

            total_pieces = sum(int(p['piece_count']) for p in spare_pieces)

            if total_pieces < total_pieces_needed:
                return jsonify({'error': f'Total pieces ({total_pieces}) is less than required ({total_pieces_needed})'}), 400

            # Extract the actual spare_piece IDs from the query results
            actual_spare_piece_ids = [p['spare_piece_id'] for p in spare_pieces]
            print(f"DEBUG: Actual spare_piece_ids to mark as dispatched: {actual_spare_piece_ids}")

            # Mark spare pieces as dispatched
            cursor.execute("""
                UPDATE sprinkler_spare_pieces
                SET status = 'DISPATCHED', updated_at = NOW()
                WHERE id = ANY(%s::uuid[])
            """, (actual_spare_piece_ids,))

            # Create or update BUNDLE stock entry with this bundle size
            cursor.execute("""
                SELECT id FROM inventory_stock
                WHERE batch_id = %s
                AND product_variant_id = %s
                AND stock_type = 'BUNDLE'
                AND pieces_per_bundle = %s
                AND piece_length_meters = %s
                AND status = 'IN_STOCK'
                AND deleted_at IS NULL
            """, (stock['batch_id'], stock['product_variant_id'], bundle_size, stock['piece_length_meters']))

            bundle_stock = cursor.fetchone()

            if bundle_stock:
                # Increment existing bundle stock by number of bundles
                cursor.execute("""
                    UPDATE inventory_stock
                    SET quantity = quantity + %s, updated_at = NOW()
                    WHERE id = %s
                """, (number_of_bundles, bundle_stock['id']))
                bundle_stock_id = bundle_stock['id']
            else:
                # Create new BUNDLE stock entry with custom size
                cursor.execute("""
                    INSERT INTO inventory_stock (
                        batch_id, product_variant_id, stock_type, quantity,
                        pieces_per_bundle, piece_length_meters, status, created_at, updated_at
                    ) VALUES (%s, %s, 'BUNDLE', %s, %s, %s, 'IN_STOCK', NOW(), NOW())
                    RETURNING id
                """, (stock['batch_id'], stock['product_variant_id'], number_of_bundles, bundle_size, stock['piece_length_meters']))
                result = cursor.fetchone()
                bundle_stock_id = result['id'] if result else None

            # Handle remainder pieces
            remainder = total_pieces - total_pieces_needed
            if remainder > 0:
                cursor.execute("""
                    INSERT INTO sprinkler_spare_pieces (
                        stock_id, piece_count, status, notes, created_at
                    ) VALUES (%s, %s, 'IN_STOCK', %s, NOW())
                """, (stock_id, remainder, f'Remainder from combining: {remainder} pieces'))

            # Update SPARE stock quantity
            cursor.execute("""
                UPDATE inventory_stock
                SET quantity = (
                    SELECT COUNT(*) FROM sprinkler_spare_pieces
                    WHERE stock_id = %s AND status = 'IN_STOCK'
                ), updated_at = NOW()
                WHERE id = %s
            """, (stock_id, stock_id))

            # Check if SPARE quantity is now 0 and soft delete it
            cursor.execute("""
                SELECT quantity FROM inventory_stock WHERE id = %s
            """, (stock_id,))
            updated_spare = cursor.fetchone()
            if updated_spare and updated_spare['quantity'] <= 0:
                cursor.execute("""
                    UPDATE inventory_stock
                    SET deleted_at = NOW()
                    WHERE id = %s
                """, (stock_id,))

            # Create transaction record
            cursor.execute("""
                INSERT INTO inventory_transactions (
                    transaction_type, from_stock_id, from_quantity,
                    to_stock_id, to_quantity, notes, created_at
                ) VALUES ('COMBINE_SPARES', %s, %s, %s, %s, %s, NOW())
            """, (stock_id, total_pieces, bundle_stock_id, number_of_bundles,
                  f'Combined {total_pieces} spare pieces into {number_of_bundles} bundle(s) of {bundle_size} pieces each'))

            # Audit log
            cursor.execute("""
                INSERT INTO audit_logs (
                    user_id, action_type, entity_type, entity_id,
                    description, created_at
                ) VALUES (%s, 'COMBINE_SPARES', 'STOCK', %s, %s, NOW())
            """, (user_id, str(stock_id),
                  f"{actor['name']} combined {total_pieces} spare pieces into {number_of_bundles} bundle(s) of {bundle_size} pieces"))

        return jsonify({
            'message': f'Successfully created {number_of_bundles} bundle(s) of {bundle_size} pieces',
            'bundles_created': number_of_bundles,
            'bundle_size': bundle_size,
            'remainder': remainder
        }), 200

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"DEBUG: Exception caught in combine_spares!")
        print(f"Error combining spares: {error_trace}")
        return jsonify({'error': 'Failed to combine spares', 'details': str(e)}), 500
