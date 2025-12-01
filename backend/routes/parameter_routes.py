from flask import Blueprint, request, jsonify
from database import execute_insert, execute_query, get_db_cursor
from services.auth import jwt_required_with_role
from flask_jwt_extended import jwt_required

parameter_bp = Blueprint('parameters', __name__, url_prefix='/api/parameters')

@parameter_bp.route('/product-types', methods=['GET', 'OPTIONS'])
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
        return jsonify({'error': str(e)}), 500

@parameter_bp.route('/options', methods=['GET'])
@jwt_required_with_role()
def get_parameter_options():
    """Get all parameter options grouped by parameter name"""
    try:
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT id, parameter_name, option_value, created_at
                FROM parameter_options
                ORDER BY parameter_name, option_value
            """)
            options = cursor.fetchall()

            # Group by parameter_name
            grouped = {}
            for opt in options:
                param_name = opt['parameter_name']
                if param_name not in grouped:
                    grouped[param_name] = []
                grouped[param_name].append({
                    'id': opt['id'],
                    'value': opt['option_value'],
                    'created_at': opt['created_at'].isoformat() if opt['created_at'] else None
                })

            return jsonify(grouped), 200
    except Exception as e:return jsonify({'error': str(e)}), 500

@parameter_bp.route('/options/<parameter_name>', methods=['GET'])
@jwt_required_with_role()
def get_parameter_options_by_name(parameter_name):
    """Get options for a specific parameter"""
    try:
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT id, option_value, created_at
                FROM parameter_options
                WHERE parameter_name = %s
                ORDER BY option_value
            """, (parameter_name,))
            options = cursor.fetchall()

            return jsonify([{
                'id': opt['id'],
                'value': opt['option_value'],
                'created_at': opt['created_at'].isoformat() if opt['created_at'] else None
            } for opt in options]), 200
    except Exception as e:return jsonify({'error': str(e)}), 500

@parameter_bp.route('/options', methods=['POST'])
@jwt_required_with_role(['admin'])
def add_parameter_option():
    """Add a new parameter option"""
    try:
        data = request.get_json()
        parameter_name = data.get('parameter_name')
        option_value = data.get('option_value')

        if not parameter_name or not option_value:
            return jsonify({'error': 'parameter_name and option_value are required'}), 400

        with get_db_cursor() as cursor:
            cursor.execute("""
                INSERT INTO parameter_options (parameter_name, option_value)
                VALUES (%s, %s)
                RETURNING id, parameter_name, option_value, created_at
            """, (parameter_name, option_value))

            new_option = cursor.fetchone()

            return jsonify({
                'id': new_option['id'],
                'parameter_name': new_option['parameter_name'],
                'value': new_option['option_value'],
                'created_at': new_option['created_at'].isoformat() if new_option['created_at'] else None,
                'message': 'Parameter option added successfully'
            }), 201
    except Exception as e:
        if 'duplicate key value' in str(e):
            return jsonify({'error': 'This option already exists'}), 400
        return jsonify({'error': str(e)}), 500

@parameter_bp.route('/options/<int:option_id>', methods=['PUT'])
@jwt_required_with_role(['admin'])
def update_parameter_option(option_id):
    """Update a parameter option"""
    try:
        data = request.get_json()
        parameter_name = data.get('parameter_name')
        option_value = data.get('option_value')

        if not parameter_name or not option_value:
            return jsonify({'error': 'Parameter name and value are required'}), 400

        with get_db_cursor() as cursor:
            # Check if option exists
            cursor.execute("""
                SELECT id FROM parameter_options WHERE id = %s
            """, (option_id,))

            if not cursor.fetchone():
                return jsonify({'error': 'Parameter option not found'}), 404

            # Check if updated value already exists for this parameter (excluding current id)
            cursor.execute("""
                SELECT id FROM parameter_options
                WHERE parameter_name = %s AND option_value = %s AND id != %s
            """, (parameter_name, option_value, option_id))

            if cursor.fetchone():
                return jsonify({'error': 'This option value already exists for this parameter'}), 400

            # Update the option
            cursor.execute("""
                UPDATE parameter_options
                SET parameter_name = %s, option_value = %s
                WHERE id = %s
                RETURNING id, parameter_name, option_value
            """, (parameter_name, option_value, option_id))

            updated = cursor.fetchone()

            return jsonify({
                'message': 'Parameter option updated successfully',
                'option': {
                    'id': updated['id'],
                    'parameter_name': updated['parameter_name'],
                    'value': updated['option_value']
                }
            }), 200
    except Exception as e:return jsonify({'error': str(e)}), 500

@parameter_bp.route('/options/<int:option_id>', methods=['DELETE'])
@jwt_required_with_role(['admin'])
def delete_parameter_option(option_id):
    """Delete a parameter option"""
    try:
        with get_db_cursor() as cursor:
            cursor.execute("""
                DELETE FROM parameter_options
                WHERE id = %s
                RETURNING parameter_name, option_value
            """, (option_id,))

            deleted = cursor.fetchone()

            if not deleted:
                return jsonify({'error': 'Parameter option not found'}), 404

            return jsonify({
                'message': f"Deleted {deleted['parameter_name']}: {deleted['option_value']}"
            }), 200
    except Exception as e:return jsonify({'error': str(e)}), 500

@parameter_bp.route('/brands', methods=['GET'])
@jwt_required()
def get_brands():
    """Get all brands"""
    try:
        query = """
            SELECT id, name
            FROM brands
            WHERE deleted_at IS NULL
            ORDER BY name
        """
        brands = execute_query(query)
        return jsonify(brands), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@parameter_bp.route('/product-variants', methods=['GET'])
@jwt_required()
def get_product_variants():
    """Get product variants by product_type_id and brand_id"""
    try:
        product_type_id = request.args.get('product_type_id')
        brand_id = request.args.get('brand_id')

        if not product_type_id or not brand_id:
            return jsonify({'error': 'product_type_id and brand_id are required'}), 400

        query = """
            SELECT pv.id, pv.product_type_id, pv.brand_id, pv.parameters,
                   pt.name as product_type_name,
                   b.name as brand_name
            FROM product_variants pv
            JOIN product_types pt ON pv.product_type_id = pt.id
            JOIN brands b ON pv.brand_id = b.id
            WHERE pv.product_type_id = %s
            AND pv.brand_id = %s
            AND pv.deleted_at IS NULL
            ORDER BY pv.created_at DESC
        """
        variants = execute_query(query, (product_type_id, brand_id))
        return jsonify(variants), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
