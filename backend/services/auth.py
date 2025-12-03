import bcrypt
from functools import wraps
from flask import jsonify, request
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from database import execute_query, execute_insert
from datetime import datetime, timedelta

# Account lockout settings
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 30

def hash_password(password):
    """Hash a password using bcrypt"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def check_password(password, hashed):
    """Check if password matches hash"""
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def is_account_locked(user):
    """Check if account is currently locked"""
    if not user.get('locked_until'):
        return False

    # Check if lockout period has expired
    locked_until = user['locked_until']
    if isinstance(locked_until, str):
        from dateutil import parser
        locked_until = parser.parse(locked_until)

    return datetime.now(locked_until.tzinfo) < locked_until

def record_failed_login(user_id):
    """Record a failed login attempt and lock account if threshold reached"""
    query = """
        UPDATE users
        SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
            last_failed_login_at = NOW()
        WHERE id = %s
        RETURNING failed_login_attempts
    """
    result = execute_query(query, (user_id,), fetch_one=True)

    if result and result['failed_login_attempts'] >= MAX_FAILED_ATTEMPTS:
        # Lock the account
        lock_query = """
            UPDATE users
            SET locked_until = NOW() + INTERVAL '%s minutes'
            WHERE id = %s
        """
        execute_query(lock_query, (LOCKOUT_DURATION_MINUTES, user_id), fetch_all=False)
        return True  # Account is now locked

    return False  # Account not locked yet

def reset_failed_login_attempts(user_id):
    """Reset failed login attempts after successful login"""
    query = """
        UPDATE users
        SET failed_login_attempts = 0,
            locked_until = NULL,
            last_failed_login_at = NULL
        WHERE id = %s
    """
    execute_query(query, (user_id,), fetch_all=False)

def get_lockout_info(user):
    """Get human-readable lockout information"""
    if not is_account_locked(user):
        return None

    locked_until = user['locked_until']
    if isinstance(locked_until, str):
        from dateutil import parser
        locked_until = parser.parse(locked_until)

    now = datetime.now(locked_until.tzinfo)
    time_remaining = locked_until - now
    minutes_remaining = int(time_remaining.total_seconds() / 60)

    return {
        'locked': True,
        'minutes_remaining': minutes_remaining,
        'locked_until': locked_until.isoformat()
    }

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
