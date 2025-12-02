from flask import Blueprint, request, jsonify
from database import get_db_connection
import bcrypt
from psycopg2.extras import RealDictCursor
import re

setup_bp = Blueprint('setup', __name__)

def is_valid_email(email):
    """Validate email format"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def check_system_initialized():
    """Check if system has any admin users (excluding soft-deleted users)"""
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        try:
            cursor.execute("""
                SELECT COUNT(*) as admin_count
                FROM users u
                JOIN user_roles ur ON u.id = ur.user_id
                WHERE ur.role = 'admin' AND u.deleted_at IS NULL
            """)
            result = cursor.fetchone()
            return result['admin_count'] > 0
        finally:
            cursor.close()

@setup_bp.route('/check', methods=['GET'])
def check_setup():
    """Check if initial setup is required"""
    try:
        is_initialized = check_system_initialized()
        return jsonify({
            'setup_required': not is_initialized,
            'message': 'System is ready' if is_initialized else 'Initial setup required'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@setup_bp.route('/admin', methods=['POST'])
def create_admin():
    """Create the first admin user (only works if no admin exists)"""
    try:
        # Check if system is already initialized
        if check_system_initialized():
            return jsonify({'error': 'System already initialized. Admin user already exists.'}), 403

        data = request.get_json()

        # Validate required fields
        email = data.get('email', '').strip()
        password = data.get('password', '')
        full_name = data.get('full_name', '').strip()
        username = data.get('username', '').strip()

        if not email or not password or not full_name or not username:
            return jsonify({'error': 'Email, password, full name, and username are required'}), 400

        # Validate username (alphanumeric, underscore, hyphen, 3-30 chars)
        if not re.match(r'^[a-zA-Z0-9_-]{3,30}$', username):
            return jsonify({'error': 'Username must be 3-30 characters and contain only letters, numbers, underscores, or hyphens'}), 400

        # Validate email format
        if not is_valid_email(email):
            return jsonify({'error': 'Invalid email format'}), 400

        # Validate password strength
        if len(password) < 8:
            return jsonify({'error': 'Password must be at least 8 characters long'}), 400

        # Hash password
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            try:
                # Check if email already exists (excluding soft-deleted)
                cursor.execute(
                    "SELECT id, deleted_at FROM users WHERE email = %s",
                    (email,)
                )
                existing_user = cursor.fetchone()

                if existing_user:
                    # If user exists and is soft-deleted, restore and update
                    if existing_user['deleted_at'] is not None:
                        cursor.execute("""
                            UPDATE users
                            SET password_hash = %s,
                                deleted_at = NULL,
                                username = %s,
                                full_name = %s,
                                updated_at = now()
                            WHERE id = %s
                            RETURNING id, email, username, created_at
                        """, (password_hash, username, full_name, existing_user['id']))
                        user = cursor.fetchone()
                        user_id = user['id']

                        # Check if admin role exists, if not add it
                        cursor.execute(
                            "SELECT id FROM user_roles WHERE user_id = %s AND role = 'admin'",
                            (user_id,)
                        )
                        if not cursor.fetchone():
                            cursor.execute("""
                                INSERT INTO user_roles (user_id, role)
                                VALUES (%s, 'admin')
                            """, (user_id,))
                    else:
                        return jsonify({'error': 'Email already exists'}), 409
                else:
                    # Check if username already exists (excluding soft-deleted)
                    cursor.execute(
                        "SELECT id FROM users WHERE username = %s AND deleted_at IS NULL",
                        (username,)
                    )
                    if cursor.fetchone():
                        return jsonify({'error': 'Username already exists'}), 409

                    # Create new user
                    cursor.execute("""
                        INSERT INTO users (email, password_hash, username, full_name)
                        VALUES (%s, %s, %s, %s)
                        RETURNING id, email, username, created_at
                    """, (email, password_hash, username, full_name))
                    user = cursor.fetchone()
                    user_id = user['id']

                    # Assign admin role
                    cursor.execute("""
                        INSERT INTO user_roles (user_id, role)
                        VALUES (%s, 'admin')
                    """, (user_id,))

                # Commit is handled by context manager

                return jsonify({
                    'success': True,
                    'message': 'Admin account created successfully',
                    'user': {
                        'id': user['id'],
                        'email': user['email'],
                        'username': user.get('username'),
                        'role': 'admin',
                        'created_at': user['created_at'].isoformat() if user['created_at'] else None
                    }
                }), 201

            except Exception as e:
                # Rollback is handled by context manager
                raise e
            finally:
                cursor.close()

    except Exception as e:
        print(f"Error creating admin: {str(e)}")
        return jsonify({'error': f'Failed to create admin account: {str(e)}'}), 500
