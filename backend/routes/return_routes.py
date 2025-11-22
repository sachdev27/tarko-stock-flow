from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import execute_query, execute_insert, get_db_cursor
from auth import get_user_identity_details
from decimal import Decimal
import json
from datetime import datetime

return_bp = Blueprint('returns', __name__, url_prefix='/api/returns')

@return_bp.route('/create', methods=['POST'])
@jwt_required()
def create_return():
    """
    Create a new return from customer.
    Request body:
    {
        customer_id: UUID,
        return_date: YYYY-MM-DD (optional, defaults to today),
        notes: string (optional),
        items: [
            {
                product_variant_id: UUID,
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
        user_id, user_role = get_user_identity_details()

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

            # Process each item
            for item in items:
                product_variant_id = item.get('product_variant_id')
                item_type = item.get('item_type')
                quantity = item.get('quantity')
                item_notes = item.get('notes', '')

                if not all([product_variant_id, item_type, quantity]):
                    raise ValueError('Each item must have product_variant_id, item_type, and quantity')

                # Get product variant info
                cursor.execute("""
                    SELECT pv.id, pt.name as product_type_name, b.name as brand_name,
                           pt.id as product_type_id, pv.parameters
                    FROM product_variants pv
                    JOIN product_types pt ON pv.product_type_id = pt.id
                    JOIN brands b ON pv.brand_id = b.id
                    WHERE pv.id = %s AND pv.deleted_at IS NULL
                """, (product_variant_id,))

                variant = cursor.fetchone()
                if not variant:
                    raise ValueError(f'Product variant {product_variant_id} not found')

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

                    # Insert individual rolls
                    for idx, roll in enumerate(rolls, start=1):
                        cursor.execute("""
                            INSERT INTO return_rolls (
                                return_item_id, roll_number, length_meters
                            )
                            VALUES (%s, %s, %s)
                        """, (return_item_id, idx, roll['length_meters']))

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

                    # Insert individual bundles
                    for idx, bundle in enumerate(bundles, start=1):
                        cursor.execute("""
                            INSERT INTO return_bundles (
                                return_item_id, bundle_number, bundle_size, piece_length_meters
                            )
                            VALUES (%s, %s, %s, %s)
                        """, (return_item_id, idx, bundle['bundle_size'], bundle['piece_length_meters']))

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

            # Commit transaction
            cursor.connection.commit()

            return jsonify({
                'success': True,
                'message': 'Return created successfully',
                'return_id': return_id,
                'return_number': return_number
            }), 201

    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400
    except Exception as e:
        print(f"Error creating return: {e}")
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
        user_id, user_role = get_user_identity_details()

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

            # If return was restocked, we need to remove the inventory
            # For now, just mark as cancelled
            # TODO: Implement inventory removal if status is RESTOCKED

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
