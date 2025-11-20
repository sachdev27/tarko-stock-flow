from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import execute_query, execute_insert, get_db_cursor
from inventory_helpers_aggregate import AggregateInventoryHelper as InventoryHelper
from auth import jwt_required_with_role, get_user_identity_details

inventory_bp = Blueprint('inventory', __name__, url_prefix='/api/inventory')

@inventory_bp.route('/batches', methods=['GET'])
@jwt_required()
def get_batches():
    """Get all batches with aggregate inventory stock"""
    try:
        with get_db_cursor() as cursor:
            # Get all batches
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
                AND b.current_quantity > 0
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
                    ORDER BY s.stock_type, s.created_at
                """, (batch_id,))

                batch['stock_entries'] = cursor.fetchall()

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

@inventory_bp.route('/cut-roll', methods=['POST'])
@jwt_required_with_role('user')
def cut_roll():
    """Cut a full roll or cut roll into smaller pieces"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()

        stock_id = data.get('stock_id')
        cut_lengths = data.get('cut_lengths', [])

        if not stock_id or not cut_lengths:
            return jsonify({'error': 'stock_id and cut_lengths are required'}), 400

        # Validate cut_lengths are positive numbers
        cut_lengths = [float(l) for l in cut_lengths if float(l) > 0]
        if not cut_lengths:
            return jsonify({'error': 'At least one valid cut length is required'}), 400

        actor = get_user_identity_details(user_id)

        with get_db_cursor() as cursor:
            # Get the stock entry
            cursor.execute("""
                SELECT s.*, b.batch_id, pv.product_type_id
                FROM inventory_stock s
                JOIN batches b ON s.batch_id = b.id
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
                length_per_unit = stock['length_per_unit'] or 0

                if total_cut_length > length_per_unit:
                    return jsonify({'error': f'Total cut length ({total_cut_length}m) exceeds roll length ({length_per_unit}m)'}), 400

                # Reduce full roll quantity by 1
                cursor.execute("""
                    UPDATE inventory_stock
                    SET quantity = quantity - 1, updated_at = NOW()
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
                for length in cut_lengths:
                    cursor.execute("""
                        INSERT INTO hdpe_cut_pieces (
                            stock_id, length_meters, status, notes, created_at
                        ) VALUES (%s, %s, 'IN_STOCK', %s, NOW())
                    """, (cut_stock_id, length, f'Cut {length}m from full roll'))

                # Create transaction
                cursor.execute("""
                    INSERT INTO inventory_transactions (
                        transaction_type, from_stock_id, from_quantity,
                        to_stock_id, to_quantity, notes, created_at
                    ) VALUES ('CUT', %s, 1, %s, %s, %s, NOW())
                """, (stock_id, cut_stock_id, len(cut_lengths),
                      f'Cut 1 full roll into {len(cut_lengths)} pieces: {", ".join([f"{l}m" for l in cut_lengths])}'))

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
                        remaining_to_cut -= piece['length_meters']
                    else:
                        # Partial cut from this piece
                        pieces_to_remove.append(piece['id'])
                        # Keep the remainder as a new piece
                        remainder = piece['length_meters'] - remaining_to_cut
                        cut_lengths.append(remainder)
                        remaining_to_cut = 0

                # Mark old pieces as dispatched/used
                if pieces_to_remove:
                    cursor.execute("""
                        UPDATE hdpe_cut_pieces
                        SET status = 'CUT_FURTHER', updated_at = NOW()
                        WHERE id = ANY(%s)
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

            product_type_name = pt_result[0]
            is_hdpe = product_type_name == 'HDPE Pipe'

            # Use inventory_unified view for compatibility
            query = """
                SELECT
                    iu.id,
                    iu.batch_id,
                    iu.batch_code,
                    iu.status,
                    iu.stock_type,
                    iu.quantity,
                    iu.product_variant_id,
                    iu.parameters,
                    iu.product_type_name,
                    iu.brand_name,
                    iu.product_category,
                    iu.length_meters,
                    iu.is_cut_roll,
                    iu.bundle_type,
                    iu.bundle_size,
                    iu.piece_count,
                    iu.piece_length_meters
                FROM inventory_unified iu
                JOIN product_variants pv ON iu.product_variant_id = pv.id
                WHERE iu.deleted_at IS NULL
                AND iu.status = 'IN_STOCK'
                AND pv.product_type_id = %s
            """

            params = [product_type_id]

            # Filter by quantity/availability
            if is_hdpe:
                query += " AND iu.quantity > 0"
            else:
                query += " AND iu.quantity > 0"

            # Optional: filter by brand
            if brand_id:
                query += " AND pv.brand_id = %s"
                params.append(brand_id)

            # Optional: filter by parameters
            if parameters:
                for key, value in parameters.items():
                    if value:
                        query += f" AND iu.parameters->>%s = %s"
                        params.extend([key, str(value)])

            # Sort by batch and type
            query += " ORDER BY iu.batch_code, iu.stock_type, iu.created_at DESC"

            cursor.execute(query, tuple(params))
            columns = [desc[0] for desc in cursor.description]
            rolls = [dict(zip(columns, row)) for row in cursor.fetchall()]

        return jsonify(rolls), 200

    except Exception as e:
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
