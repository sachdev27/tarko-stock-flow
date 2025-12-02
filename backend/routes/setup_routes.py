"""
Setup routes for initial admin creation
One-time setup page to create the first admin user
"""
from flask import Blueprint, request, jsonify
from database import get_db_connection
from psycopg2.extras import RealDictCursor
import bcrypt

setup_bp = Blueprint('setup', __name__, url_prefix='/api/setup')

@setup_bp.route('/check', methods=['GET'])
def check_admin_exists():
    """Check if any admin user exists (excluding soft-deleted)"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT COUNT(DISTINCT u.id) as admin_count
                FROM users u
                JOIN user_roles ur ON u.id = ur.user_id
                WHERE ur.role = 'admin'
                AND u.deleted_at IS NULL
            """)
            result = cursor.fetchone()

            admin_exists = result['admin_count'] > 0

            return jsonify({
                'admin_exists': admin_exists,
                'setup_required': not admin_exists
            }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@setup_bp.route('/admin', methods=['POST'])
def create_admin():
    """Create the first admin user - one-time setup"""
    try:
        # Check if admin already exists
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT COUNT(DISTINCT u.id) as admin_count
                FROM users u
                JOIN user_roles ur ON u.id = ur.user_id
                WHERE ur.role = 'admin'
                AND u.deleted_at IS NULL
            """)
            result = cursor.fetchone()

            if result['admin_count'] > 0:
                return jsonify({'error': 'Admin user already exists'}), 400

            # Get admin details from request
            data = request.get_json()
            email = data.get('email')
            password = data.get('password')

            if not email or not password:
                return jsonify({'error': 'Email and password are required'}), 400

            # Check if user exists
            cursor.execute("""
                SELECT id, deleted_at
                FROM users
                WHERE email = %s
            """, (email,))
            existing_user = cursor.fetchone()

            if existing_user and existing_user['deleted_at'] is None:
                return jsonify({'error': 'User already exists'}), 400

            # Hash password
            password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

            user_id = None

            if existing_user and existing_user['deleted_at'] is not None:
                # Restore soft-deleted user
                cursor.execute("""
                    UPDATE users
                    SET deleted_at = NULL,
                        password_hash = %s,
                        updated_at = now()
                    WHERE id = %s
                    RETURNING id, email
                """, (password_hash, existing_user['id']))
                user = cursor.fetchone()
                user_id = user['id']
            else:
                # Create new user
                cursor.execute("""
                    INSERT INTO users (email, password_hash)
                    VALUES (%s, %s)
                    RETURNING id, email
                """, (email, password_hash))
                user = cursor.fetchone()
                user_id = user['id']

            # Add admin role
            cursor.execute("""
                INSERT INTO user_roles (user_id, role)
                VALUES (%s, 'admin')
                ON CONFLICT (user_id, role) DO NOTHING
            """, (user_id,))

            conn.commit()

            return jsonify({
                'message': 'Admin user created successfully',
                'user': {'id': str(user_id), 'email': email}
            }), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500
