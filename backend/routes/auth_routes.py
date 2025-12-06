from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from services.auth import (
    create_user, get_user_by_email, check_password, get_user_role,
    is_account_locked, record_failed_login, reset_failed_login_attempts,
    get_lockout_info
)
from database import execute_query

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

@auth_bp.route('/signup', methods=['POST'])
def signup():
    """Public signup disabled - users must be created by admin"""
    return jsonify({'error': 'Public signup is disabled. Please contact your administrator for an account.'}), 403

@auth_bp.route('/login', methods=['POST'])
def login():
    """Login user with email or username - with account lockout protection"""
    try:
        data = request.get_json()
        login_input = data.get('email') or data.get('username')  # Support both
        password = data.get('password')

        if not login_input or not password:
            return jsonify({'error': 'Email/username and password required'}), 400

        # Get user by email or username (try email first, then username)
        user = get_user_by_email(login_input)
        if not user:
            # Try as username
            user = execute_query("SELECT * FROM users WHERE username = %s AND deleted_at IS NULL", (login_input,), fetch_one=True)

        if not user:
            return jsonify({'error': 'Invalid credentials'}), 401

        # Check if account is locked
        if is_account_locked(user):
            lockout_info = get_lockout_info(user)
            return jsonify({
                'error': f'Account is locked due to too many failed login attempts. Please try again in {lockout_info["minutes_remaining"]} minutes.',
                'locked_until': lockout_info['locked_until']
            }), 423  # 423 Locked status code

        # Check if user is active
        if not user.get('is_active', True):
            return jsonify({'error': 'Account is disabled'}), 403

        # Check password
        if not check_password(password, user['password_hash']):
            # Record failed login attempt
            is_now_locked = record_failed_login(user['id'])

            if is_now_locked:
                return jsonify({
                    'error': f'Too many failed login attempts. Account has been locked for 30 minutes.',
                    'locked': True
                }), 423

            # Get remaining attempts
            remaining_attempts = 5 - (user.get('failed_login_attempts', 0) + 1)
            if remaining_attempts > 0:
                return jsonify({
                    'error': f'Invalid credentials. {remaining_attempts} attempts remaining before account lockout.'
                }), 401
            else:
                return jsonify({'error': 'Invalid credentials'}), 401

        # Reset failed attempts on successful login
        reset_failed_login_attempts(user['id'])

        # Update last login
        execute_query("UPDATE users SET last_login_at = NOW() WHERE id = %s", (user['id'],), fetch_all=False)

        # Get role
        role = get_user_role(user['id'])

        # Create token
        access_token = create_access_token(identity=str(user['id']))

        return jsonify({
            'user': {
                'id': user['id'],
                'email': user['email'],
                'username': user.get('username'),
                'full_name': user.get('full_name'),
                'role': role
            },
            'access_token': access_token
        }), 200
    except Exception as e:
        return jsonify({'error': 'Login failed', 'details': str(e)}), 500

@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get current user info"""
    try:
        user_id = get_jwt_identity()

        query = "SELECT id, email, username, full_name, is_active, created_at, last_login_at FROM users WHERE id = %s"
        user = execute_query(query, (user_id,), fetch_one=True)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        role = get_user_role(user_id)

        return jsonify({
            'id': user['id'],
            'email': user['email'],
            'username': user.get('username'),
            'full_name': user.get('full_name'),
            'role': role,
            'is_active': user.get('is_active', True),
            'created_at': user['created_at'].isoformat() if user.get('created_at') else None,
            'last_login_at': user['last_login_at'].isoformat() if user.get('last_login_at') else None
        }), 200
    except Exception as e:
        return jsonify({'error': 'Failed to get user info', 'details': str(e)}), 500
