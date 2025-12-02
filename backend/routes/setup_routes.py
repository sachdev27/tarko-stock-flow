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
                SELECT COUNT(*) as admin_count
                FROM users
                WHERE role = 'admin'
                AND deleted_at IS NULL
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
                SELECT COUNT(*) as admin_count
                FROM users
                WHERE role = 'admin'
                AND deleted_at IS NULL
            """)
            result = cursor.fetchone()

            if result['admin_count'] > 0:
                return jsonify({'error': 'Admin user already exists'}), 400

            # Get admin details from request
            data = request.get_json()
            username = data.get('username')
            email = data.get('email')
            password = data.get('password')
            full_name = data.get('full_name', 'Administrator')

            if not username or not email or not password:
                return jsonify({'error': 'Username, email, and password are required'}), 400

            # Check if user exists but is soft-deleted
            cursor.execute("""
                SELECT id, deleted_at
                FROM users
                WHERE email = %s OR username = %s
            """, (email, username))
            existing_user = cursor.fetchone()

            if existing_user:
                if existing_user['deleted_at'] is not None:
                    # Restore soft-deleted user as admin
                    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

                    cursor.execute("""
                        UPDATE users
                        SET deleted_at = NULL,
                            is_active = true,
                            role = 'admin',
                            password_hash = %s,
                            full_name = %s
                        WHERE id = %s
                        RETURNING id, username, email, full_name, role
                    """, (password_hash, full_name, existing_user['id']))

                    admin = cursor.fetchone()

                    return jsonify({
                        'message': 'Admin user restored and updated successfully',
                        'user': dict(admin)
                    }), 200
                else:
                    return jsonify({'error': 'User already exists'}), 400

            # Hash password
            password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

            # Create admin user
            cursor.execute("""
                INSERT INTO users (username, email, password_hash, full_name, role, is_active)
                VALUES (%s, %s, %s, %s, 'admin', true)
                RETURNING id, username, email, full_name, role
            """, (username, email, password_hash, full_name))

            admin = cursor.fetchone()

            return jsonify({
                'message': 'Admin user created successfully',
                'user': dict(admin)
            }), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500
