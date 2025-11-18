from flask import Blueprint, request, jsonify
from database import execute_insert, execute_query, get_db_cursor
from auth import jwt_required_with_role

parameter_bp = Blueprint('parameter', __name__, url_prefix='/api/parameters')

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
    except Exception as e:
        print(f"Error fetching parameter options: {e}")
        return jsonify({'error': str(e)}), 500

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
    except Exception as e:
        print(f"Error fetching parameter options: {e}")
        return jsonify({'error': str(e)}), 500

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
        print(f"Error adding parameter option: {e}")
        return jsonify({'error': str(e)}), 500

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
    except Exception as e:
        print(f"Error deleting parameter option: {e}")
        return jsonify({'error': str(e)}), 500
