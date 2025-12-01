from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import execute_query, execute_insert, get_db_cursor
from services.auth import get_user_identity_details, jwt_required_with_role
from decimal import Decimal
import json
from datetime import datetime

scrap_bp = Blueprint('scraps', __name__, url_prefix='/api/scraps')

@scrap_bp.route('/create', methods=['POST'])
@jwt_required_with_role('user')
def create_scrap():
    """
    Create a new scrap record and remove items from inventory.
    Request body:
    {
        scrap_date: YYYY-MM-DD (optional, defaults to today),
        reason: string (required),
        notes: string (optional),
        items: [
            {
                stock_id: UUID (required),
                quantity_to_scrap: number (required),
                piece_ids: [UUID] (for CUT_ROLL or SPARE items),
                estimated_value: number (optional),
                notes: string (optional)
            }
        ]
    }
    """
    try:
        data = request.json
        user_id = get_jwt_identity()
        user = get_user_identity_details(user_id)

        # Validate required fields
        reason = data.get('reason', '').strip()
        items = data.get('items', [])

        if not reason:
            return jsonify({'error': 'reason is required'}), 400

        if not items or len(items) == 0:
            return jsonify({'error': 'At least one item is required'}), 400

        scrap_date = data.get('scrap_date', datetime.now().date().isoformat())
        notes = data.get('notes', '')

        with get_db_cursor() as cursor:
            # Generate scrap number
            cursor.execute("""
                SELECT scrap_number FROM scraps
                WHERE scrap_number LIKE 'SCR-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%'
                ORDER BY scrap_number DESC
                LIMIT 1
            """)
            last_scrap = cursor.fetchone()

            if last_scrap:
                last_num = int(last_scrap['scrap_number'].split('-')[-1])
                scrap_number = f"SCR-{datetime.now().year}-{last_num + 1:03d}"
            else:
                scrap_number = f"SCR-{datetime.now().year}-001"

            # Create scrap record
            cursor.execute("""
                INSERT INTO scraps (
                    scrap_number, scrap_date, reason, notes,
                    status, created_by
                )
                VALUES (%s, %s, %s, %s, 'SCRAPPED', %s)
                RETURNING id, scrap_number
            """, (scrap_number, scrap_date, reason, notes, user_id))

            scrap_record = cursor.fetchone()
            scrap_id = scrap_record['id']
            scrap_number = scrap_record['scrap_number']

            total_quantity = Decimal(0)
            total_estimated_loss = Decimal(0)
            items_processed = []

            # Process each item
            for item in items:
                stock_id = item.get('stock_id')
                quantity_to_scrap = item.get('quantity_to_scrap')
                piece_ids = item.get('piece_ids', [])
                estimated_value = item.get('estimated_value')
                item_notes = item.get('notes', '')

                if not stock_id:
                    raise ValueError('stock_id is required for each item')

                if not quantity_to_scrap or quantity_to_scrap <= 0:
                    raise ValueError('quantity_to_scrap must be greater than 0')

                # Get stock details
                cursor.execute("""
                    SELECT
                        s.id, s.batch_id, s.product_variant_id, s.stock_type,
                        s.quantity, s.status, s.length_per_unit,
                        s.pieces_per_bundle, s.piece_length_meters,
                        b.batch_code, b.batch_no,
                        pt.name as product_type_name,
                        br.name as brand_name,
                        pv.parameters
                    FROM inventory_stock s
                    JOIN batches b ON s.batch_id = b.id
                    JOIN product_variants pv ON s.product_variant_id = pv.id
                    JOIN product_types pt ON pv.product_type_id = pt.id
                    JOIN brands br ON pv.brand_id = br.id
                    WHERE s.id = %s AND s.deleted_at IS NULL
                """, (stock_id,))

                stock = cursor.fetchone()
                if not stock:
                    raise ValueError(f'Stock {stock_id} not found')

                stock_type = stock['stock_type']
                original_quantity = stock['quantity']
                original_status = stock['status']

                # Validate quantity
                if stock_type in ['FULL_ROLL', 'BUNDLE']:
                    # For simple stock types
                    if quantity_to_scrap > original_quantity:
                        raise ValueError(f'Cannot scrap {quantity_to_scrap} items, only {original_quantity} available')

                    # Update stock quantity
                    new_quantity = original_quantity - quantity_to_scrap
                    if new_quantity == 0:
                        new_status = 'SOLD_OUT'
                    else:
                        new_status = original_status

                    cursor.execute("""
                        UPDATE inventory_stock
                        SET quantity = %s, status = %s, updated_at = NOW()
                        WHERE id = %s
                    """, (new_quantity, new_status, stock_id))

                    # Create scrap item
                    cursor.execute("""
                        INSERT INTO scrap_items (
                            scrap_id, stock_id, batch_id, product_variant_id,
                            stock_type, quantity_scrapped,
                            length_per_unit, pieces_per_bundle, piece_length_meters,
                            original_quantity, original_status,
                            estimated_value, notes
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                    """, (
                        scrap_id, stock_id, stock['batch_id'], stock['product_variant_id'],
                        stock_type, quantity_to_scrap,
                        stock.get('length_per_unit'), stock.get('pieces_per_bundle'),
                        stock.get('piece_length_meters'),
                        original_quantity, original_status,
                        estimated_value, item_notes
                    ))

                    scrap_item_id = cursor.fetchone()['id']
                    total_quantity += Decimal(quantity_to_scrap)

                elif stock_type == 'CUT_ROLL':
                    # Handle cut pieces
                    if not piece_ids or len(piece_ids) == 0:
                        raise ValueError('piece_ids required for CUT_ROLL items')

                    # Get pieces details
                    cursor.execute("""
                        SELECT id, length_meters, status
                        FROM hdpe_cut_pieces
                        WHERE id = ANY(%s::uuid[]) AND stock_id = %s AND status = 'IN_STOCK'
                    """, (piece_ids, stock_id))

                    pieces = cursor.fetchall()
                    if len(pieces) != len(piece_ids):
                        raise ValueError('Some pieces not found or not available')

                    # Create scrap item
                    cursor.execute("""
                        INSERT INTO scrap_items (
                            scrap_id, stock_id, batch_id, product_variant_id,
                            stock_type, quantity_scrapped,
                            original_quantity, original_status,
                            estimated_value, notes
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                    """, (
                        scrap_id, stock_id, stock['batch_id'], stock['product_variant_id'],
                        stock_type, len(pieces),
                        original_quantity, original_status,
                        estimated_value, item_notes
                    ))

                    scrap_item_id = cursor.fetchone()['id']

                    # Mark pieces as scrapped and create scrap_pieces records
                    for piece in pieces:
                        cursor.execute("""
                            UPDATE hdpe_cut_pieces
                            SET status = 'SCRAPPED', updated_at = NOW()
                            WHERE id = %s
                        """, (piece['id'],))

                        cursor.execute("""
                            INSERT INTO scrap_pieces (
                                scrap_item_id, original_piece_id, piece_type,
                                length_meters
                            )
                            VALUES (%s, %s, 'CUT_PIECE', %s)
                        """, (scrap_item_id, piece['id'], piece['length_meters']))

                    total_quantity += len(pieces)

                    # Note: stock quantity for CUT_ROLL is auto-updated by trigger

                elif stock_type == 'SPARE':
                    # Handle spare pieces
                    if not piece_ids or len(piece_ids) == 0:
                        raise ValueError('piece_ids required for SPARE items')

                    # Get spare pieces details
                    cursor.execute("""
                        SELECT id, piece_count, status, piece_length_meters
                        FROM sprinkler_spare_pieces
                        WHERE id = ANY(%s::uuid[]) AND stock_id = %s AND status = 'IN_STOCK'
                    """, (piece_ids, stock_id))

                    spare_pieces = cursor.fetchall()
                    if len(spare_pieces) != len(piece_ids):
                        raise ValueError('Some spare pieces not found or not available')

                    # Calculate total piece count
                    total_piece_count = sum(sp['piece_count'] for sp in spare_pieces)

                    # Create scrap item
                    cursor.execute("""
                        INSERT INTO scrap_items (
                            scrap_id, stock_id, batch_id, product_variant_id,
                            stock_type, quantity_scrapped,
                            piece_length_meters,
                            original_quantity, original_status,
                            estimated_value, notes
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                    """, (
                        scrap_id, stock_id, stock['batch_id'], stock['product_variant_id'],
                        stock_type, len(spare_pieces),
                        stock.get('piece_length_meters'),
                        original_quantity, original_status,
                        estimated_value, item_notes
                    ))

                    scrap_item_id = cursor.fetchone()['id']

                    # Mark spare pieces as scrapped and create scrap_pieces records
                    for spare_piece in spare_pieces:
                        cursor.execute("""
                            UPDATE sprinkler_spare_pieces
                            SET status = 'SCRAPPED', updated_at = NOW()
                            WHERE id = %s
                        """, (spare_piece['id'],))

                        cursor.execute("""
                            INSERT INTO scrap_pieces (
                                scrap_item_id, original_piece_id, piece_type,
                                piece_count, piece_length_meters
                            )
                            VALUES (%s, %s, 'SPARE_PIECE', %s, %s)
                        """, (scrap_item_id, spare_piece['id'], spare_piece['piece_count'],
                              spare_piece.get('piece_length_meters')))

                    total_quantity += len(spare_pieces)

                    # Note: stock quantity for SPARE is auto-updated by trigger

                if estimated_value:
                    total_estimated_loss += Decimal(estimated_value)

                items_processed.append({
                    'stock_id': stock_id,
                    'batch_code': stock['batch_code'],
                    'product_type': stock['product_type_name'],
                    'brand': stock['brand_name'],
                    'stock_type': stock_type,
                    'quantity_scrapped': quantity_to_scrap if stock_type in ['FULL_ROLL', 'BUNDLE'] else len(piece_ids)
                })

            # Update scrap totals
            cursor.execute("""
                UPDATE scraps
                SET total_quantity = %s, estimated_loss = %s
                WHERE id = %s
            """, (float(total_quantity), float(total_estimated_loss) if total_estimated_loss > 0 else None, scrap_id))

            # Create audit log
            cursor.execute("""
                INSERT INTO audit_logs (
                    user_id, action_type, entity_type, entity_id,
                    description, created_at
                )
                VALUES (%s, 'CREATE_SCRAP', 'SCRAP', %s, %s, NOW())
            """, (
                user_id,
                str(scrap_id),
                f"{user['name']} ({user['role']}) created scrap {scrap_number} with {len(items_processed)} items"
            ))

            return jsonify({
                'message': f'Scrap {scrap_number} created successfully',
                'scrap_id': str(scrap_id),
                'scrap_number': scrap_number,
                'total_quantity': float(total_quantity),
                'total_estimated_loss': float(total_estimated_loss) if total_estimated_loss > 0 else None,
                'items_processed': items_processed
            }), 201

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error creating scrap: {error_trace}")
        return jsonify({'error': 'Failed to create scrap', 'details': str(e)}), 500


@scrap_bp.route('/history', methods=['GET'])
@jwt_required()
def get_scrap_history():
    """Get scrap history with filters"""
    try:
        # Get query parameters
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        reason = request.args.get('reason')
        status = request.args.get('status')

        with get_db_cursor() as cursor:
            query = """
                SELECT
                    s.id,
                    s.scrap_number,
                    s.scrap_date,
                    s.reason,
                    s.status,
                    s.total_quantity,
                    s.estimated_loss,
                    s.notes,
                    u.email as created_by_email,
                    s.created_at,
                    s.updated_at,
                    COUNT(DISTINCT si.id) as total_items,
                    COUNT(DISTINCT si.batch_id) as total_batches
                FROM scraps s
                LEFT JOIN scrap_items si ON si.scrap_id = s.id
                LEFT JOIN users u ON s.created_by = u.id
                WHERE s.deleted_at IS NULL
            """

            params = []

            if start_date:
                query += " AND s.scrap_date >= %s"
                params.append(start_date)

            if end_date:
                query += " AND s.scrap_date <= %s"
                params.append(end_date)

            if reason:
                query += " AND s.reason ILIKE %s"
                params.append(f'%{reason}%')

            if status:
                query += " AND s.status = %s"
                params.append(status)

            query += """
                GROUP BY s.id, s.scrap_number, s.scrap_date, s.reason, s.status,
                         s.total_quantity, s.estimated_loss, s.notes, u.email,
                         s.created_at, s.updated_at
                ORDER BY s.scrap_date DESC, s.created_at DESC
            """

            cursor.execute(query, params)
            scraps = cursor.fetchall()

            result = []
            for scrap in scraps:
                result.append({
                    'id': str(scrap['id']),
                    'scrap_number': scrap['scrap_number'],
                    'scrap_date': scrap['scrap_date'].isoformat() if scrap['scrap_date'] else None,
                    'reason': scrap['reason'],
                    'status': scrap['status'],
                    'total_quantity': float(scrap['total_quantity']) if scrap['total_quantity'] else 0,
                    'estimated_loss': float(scrap['estimated_loss']) if scrap['estimated_loss'] else None,
                    'notes': scrap['notes'],
                    'total_items': scrap['total_items'],
                    'total_batches': scrap['total_batches'],
                    'created_by_email': scrap['created_by_email'],
                    'created_at': scrap['created_at'].isoformat() if scrap['created_at'] else None,
                    'updated_at': scrap['updated_at'].isoformat() if scrap['updated_at'] else None
                })

            return jsonify({'scraps': result}), 200

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error fetching scrap history: {error_trace}")
        return jsonify({'error': f'Failed to fetch scrap history: {str(e)}'}), 500


@scrap_bp.route('/history/<scrap_id>', methods=['GET'])
@jwt_required()
def get_scrap_details(scrap_id):
    """Get detailed information about a specific scrap"""
    try:
        with get_db_cursor() as cursor:
            # Get scrap details
            cursor.execute("""
                SELECT
                    s.id,
                    s.scrap_number,
                    s.scrap_date,
                    s.reason,
                    s.status,
                    s.total_quantity,
                    s.estimated_loss,
                    s.notes,
                    u.email as created_by_email,
                    s.created_at,
                    s.updated_at
                FROM scraps s
                LEFT JOIN users u ON s.created_by = u.id
                WHERE s.id = %s AND s.deleted_at IS NULL
            """, (scrap_id,))

            scrap = cursor.fetchone()
            if not scrap:
                return jsonify({'error': 'Scrap not found'}), 404

            # Get scrap items
            cursor.execute("""
                SELECT
                    si.id,
                    si.stock_id,
                    si.stock_type,
                    si.quantity_scrapped,
                    si.length_per_unit,
                    si.pieces_per_bundle,
                    si.piece_length_meters,
                    si.original_quantity,
                    si.original_status,
                    si.estimated_value,
                    si.notes as item_notes,
                    b.batch_code,
                    b.batch_no,
                    pt.name as product_type_name,
                    br.name as brand_name,
                    pv.parameters
                FROM scrap_items si
                JOIN batches b ON si.batch_id = b.id
                JOIN product_variants pv ON si.product_variant_id = pv.id
                JOIN product_types pt ON pv.product_type_id = pt.id
                JOIN brands br ON pv.brand_id = br.id
                WHERE si.scrap_id = %s
                ORDER BY si.created_at
            """, (scrap_id,))

            items = cursor.fetchall()

            # Get scrap pieces for each item
            items_with_pieces = []
            for item in items:
                item_dict = dict(item)
                item_dict['id'] = str(item_dict['id'])
                item_dict['stock_id'] = str(item_dict['stock_id'])
                item_dict['quantity_scrapped'] = float(item_dict['quantity_scrapped']) if item_dict['quantity_scrapped'] else 0
                item_dict['length_per_unit'] = float(item_dict['length_per_unit']) if item_dict['length_per_unit'] else None
                item_dict['piece_length_meters'] = float(item_dict['piece_length_meters']) if item_dict['piece_length_meters'] else None
                item_dict['original_quantity'] = float(item_dict['original_quantity']) if item_dict['original_quantity'] else 0
                item_dict['estimated_value'] = float(item_dict['estimated_value']) if item_dict['estimated_value'] else None

                # Get associated pieces if CUT_ROLL or SPARE
                if item['stock_type'] in ['CUT_ROLL', 'SPARE']:
                    cursor.execute("""
                        SELECT
                            id,
                            piece_type,
                            length_meters,
                            piece_count,
                            piece_length_meters
                        FROM scrap_pieces
                        WHERE scrap_item_id = %s
                        ORDER BY created_at
                    """, (item['id'],))

                    pieces = cursor.fetchall()
                    item_dict['pieces'] = [
                        {
                            'id': str(p['id']),
                            'piece_type': p['piece_type'],
                            'length_meters': float(p['length_meters']) if p['length_meters'] else None,
                            'piece_count': p['piece_count'],
                            'piece_length_meters': float(p['piece_length_meters']) if p['piece_length_meters'] else None
                        }
                        for p in pieces
                    ]
                else:
                    item_dict['pieces'] = []

                items_with_pieces.append(item_dict)

            result = {
                'id': str(scrap['id']),
                'scrap_number': scrap['scrap_number'],
                'scrap_date': scrap['scrap_date'].isoformat() if scrap['scrap_date'] else None,
                'reason': scrap['reason'],
                'status': scrap['status'],
                'total_quantity': float(scrap['total_quantity']) if scrap['total_quantity'] else 0,
                'estimated_loss': float(scrap['estimated_loss']) if scrap['estimated_loss'] else None,
                'notes': scrap['notes'],
                'created_by_email': scrap['created_by_email'],
                'created_at': scrap['created_at'].isoformat() if scrap['created_at'] else None,
                'updated_at': scrap['updated_at'].isoformat() if scrap['updated_at'] else None,
                'items': items_with_pieces
            }

            return jsonify(result), 200

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error fetching scrap details: {error_trace}")
        return jsonify({'error': f'Failed to fetch scrap details: {str(e)}'}), 500


@scrap_bp.route('/reasons', methods=['GET'])
@jwt_required()
def get_scrap_reasons():
    """Get common scrap reasons"""
    reasons = [
        'Damaged during handling',
        'Manufacturing defect',
        'Quality issue',
        'Expired/Old stock',
        'Customer return - defective',
        'Transportation damage',
        'Storage damage',
        'Incorrect specifications',
        'Other'
    ]
    return jsonify({'reasons': reasons}), 200


@scrap_bp.route('/<scrap_id>/revert', methods=['POST'])
@jwt_required_with_role('admin')
def revert_scrap(scrap_id):
    """
    Revert/cancel a scrap transaction.
    This will mark the scrap as CANCELLED and restore inventory.
    """
    try:
        user_id = get_jwt_identity()
        user = get_user_identity_details(user_id)

        with get_db_cursor() as cursor:
            # Check if scrap exists and is not already cancelled
            cursor.execute("""
                SELECT id, status, scrap_number
                FROM scraps
                WHERE id = %s AND deleted_at IS NULL
            """, (scrap_id,))

            scrap_record = cursor.fetchone()

            if not scrap_record:
                return jsonify({'error': 'Scrap record not found'}), 404

            if scrap_record['status'] == 'CANCELLED':
                return jsonify({'error': 'Scrap is already cancelled'}), 400

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
            """, (scrap_id,))

            scrap_items = cursor.fetchall()

            if not scrap_items:
                return jsonify({'error': 'No scrap items found'}), 404

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
            """, (scrap_id,))

            cursor.connection.commit()

            return jsonify({
                'success': True,
                'message': f'Scrap {scrap_record["scrap_number"]} cancelled successfully. Inventory restored.'
            }), 200

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error reverting scrap: {error_trace}")
        return jsonify({'error': f'Failed to revert scrap: {str(e)}'}), 500
