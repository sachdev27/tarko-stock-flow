import bcrypt
from functools import wraps
from flask import jsonify, request
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from database import execute_query, execute_insert

def hash_password(password):
    """Hash a password using bcrypt"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def check_password(password, hashed):
    """Check if password matches hash"""
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def get_user_by_email(email):
    """Get user by email"""
    query = "SELECT * FROM users WHERE email = %s AND deleted_at IS NULL"
    return execute_query(query, (email,), fetch_one=True)

def get_user_by_id(user_id):
    """Get user by ID"""
    query = "SELECT * FROM users WHERE id = %s AND deleted_at IS NULL"
    return execute_query(query, (user_id,), fetch_one=True)

def get_user_role(user_id):
    """Get user role"""
    query = "SELECT role FROM user_roles WHERE user_id = %s"
    result = execute_query(query, (user_id,), fetch_one=True)
    return result['role'] if result else 'reader'

def get_user_identity_details(user_id):
    """Get user identifying information for audit logs"""
    query = """
        SELECT u.email,
               COALESCE(u.full_name, u.username, u.email) AS display_name,
               COALESCE(ur.role, 'reader') AS role
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        WHERE u.id = %s AND u.deleted_at IS NULL
        ORDER BY ur.created_at DESC
        LIMIT 1
    """
    result = execute_query(query, (user_id,), fetch_one=True)
    if not result:
        return {
            'email': None,
            'name': 'Unknown User',
            'role': 'unknown'
        }

    return {
        'email': result.get('email'),
        'name': result.get('display_name') or result.get('email') or 'Unknown User',
        'role': result.get('role') or 'reader'
    }

def create_user(email, password):
    """Create a new user"""
    hashed_password = hash_password(password)

    # Insert user
    query = """
        INSERT INTO users (email, password_hash, created_at)
        VALUES (%s, %s, NOW())
        RETURNING id, email, created_at
    """
    user = execute_insert(query, (email, hashed_password))

    # Assign default role
    role_query = """
        INSERT INTO user_roles (user_id, role, created_at, updated_at)
        VALUES (%s, 'user', NOW(), NOW())
    """
    execute_insert(role_query, (user['id'],), returning=False)

    return user

def jwt_required_with_role(required_role=None):
    """Decorator to require JWT and optionally check role"""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user_id = get_jwt_identity()

            if required_role:
                user_role = get_user_role(user_id)

                if required_role == 'admin' and user_role != 'admin':
                    return jsonify({'error': 'Admin access required'}), 403
                elif required_role == 'user' and user_role not in ['admin', 'user']:
                    return jsonify({'error': 'User access required'}), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator
