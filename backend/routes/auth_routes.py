from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from auth import create_user, get_user_by_email, check_password, get_user_role

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

@auth_bp.route('/signup', methods=['POST'])
def signup():
    """Register a new user"""
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400

    # Check if user exists
    existing_user = get_user_by_email(email)
    if existing_user:
        return jsonify({'error': 'User already exists'}), 400

    # Create user
    user = create_user(email, password)

    # Create token
    access_token = create_access_token(identity=str(user['id']))

    return jsonify({
        'user': {
            'id': user['id'],
            'email': user['email']
        },
        'access_token': access_token
    }), 201

@auth_bp.route('/login', methods=['POST'])
def login():
    """Login user"""
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400

    # Get user
    user = get_user_by_email(email)
    if not user:
        return jsonify({'error': 'Invalid credentials'}), 401

    # Check password
    if not check_password(password, user['password_hash']):
        return jsonify({'error': 'Invalid credentials'}), 401

    # Get role
    role = get_user_role(user['id'])

    # Create token
    access_token = create_access_token(identity=str(user['id']))

    return jsonify({
        'user': {
            'id': user['id'],
            'email': user['email'],
            'role': role
        },
        'access_token': access_token
    }), 200

@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get current user info"""
    user_id = get_jwt_identity()

    from database import execute_query
    query = "SELECT id, email, created_at FROM users WHERE id = %s"
    user = execute_query(query, (user_id,), fetch_one=True)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    role = get_user_role(user_id)

    return jsonify({
        'id': user['id'],
        'email': user['email'],
        'role': role,
        'created_at': user['created_at'].isoformat() if user['created_at'] else None
    }), 200
