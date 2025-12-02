"""
Password reset routes
Handles forgot password and reset password functionality
"""
from flask import Blueprint, request, jsonify
from database import get_db_connection
from psycopg2.extras import RealDictCursor
from services.email_service import send_password_reset_email, send_password_changed_notification
from services.auth import hash_password
import secrets
from datetime import datetime, timedelta

password_reset_bp = Blueprint('password_reset', __name__, url_prefix='/api/auth')

def generate_reset_token():
    """Generate a secure random token"""
    return secrets.token_urlsafe(32)

@password_reset_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    """
    Initiate password reset process
    Send reset email to user
    """
    data = request.json
    email = data.get('email')

    if not email:
        return jsonify({'error': 'Email is required'}), 400

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        # Check if user exists
        cursor.execute("""
            SELECT id, email, username, full_name, last_password_reset_request
            FROM users
            WHERE email = %s AND deleted_at IS NULL
        """, (email,))

        user = cursor.fetchone()

        # Always return success to prevent email enumeration
        if not user:
            return jsonify({
                'message': 'If an account with that email exists, a password reset link has been sent.'
            }), 200

        # Rate limiting: prevent spam (max 1 request per 5 minutes)
        if user['last_password_reset_request']:
            last_request = user['last_password_reset_request']
            if isinstance(last_request, str):
                from dateutil import parser
                last_request = parser.parse(last_request)

            time_since_last = datetime.now(last_request.tzinfo) - last_request
            if time_since_last.total_seconds() < 300:  # 5 minutes
                minutes_left = 5 - int(time_since_last.total_seconds() / 60)
                return jsonify({
                    'error': f'Please wait {minutes_left} more minute(s) before requesting another reset.'
                }), 429

        # Generate reset token
        reset_token = generate_reset_token()
        expires_at = datetime.now() + timedelta(hours=1)

        # Get client info
        ip_address = request.remote_addr
        user_agent = request.headers.get('User-Agent', '')

        # Store reset token
        cursor.execute("""
            INSERT INTO password_reset_tokens
            (user_id, token, expires_at, ip_address, user_agent)
            VALUES (%s, %s, %s, %s, %s)
        """, (user['id'], reset_token, expires_at, ip_address, user_agent))

        # Update last request time
        cursor.execute("""
            UPDATE users
            SET last_password_reset_request = NOW()
            WHERE id = %s
        """, (user['id'],))

        # Send email
        user_name = user['full_name'] or user['username'] or user['email'].split('@')[0]
        email_sent = send_password_reset_email(email, user_name, reset_token)

        if not email_sent:
            return jsonify({
                'error': 'Failed to send reset email. Please contact support.'
            }), 500

        return jsonify({
            'message': 'Password reset link has been sent to your email.'
        }), 200

@password_reset_bp.route('/verify-reset-token', methods=['POST'])
def verify_reset_token():
    """
    Verify if reset token is valid
    """
    data = request.json
    token = data.get('token')

    if not token:
        return jsonify({'error': 'Token is required'}), 400

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute("""
            SELECT rt.*, u.email, u.full_name, u.username
            FROM password_reset_tokens rt
            JOIN users u ON rt.user_id = u.id
            WHERE rt.token = %s AND rt.used = FALSE
        """, (token,))

        token_data = cursor.fetchone()

        if not token_data:
            return jsonify({
                'valid': False,
                'error': 'Invalid or expired reset token'
            }), 400

        # Check if expired
        expires_at = token_data['expires_at']
        if isinstance(expires_at, str):
            from dateutil import parser
            expires_at = parser.parse(expires_at)

        if datetime.now(expires_at.tzinfo) > expires_at:
            return jsonify({
                'valid': False,
                'error': 'Reset token has expired'
            }), 400

        return jsonify({
            'valid': True,
            'email': token_data['email']
        }), 200

@password_reset_bp.route('/reset-password', methods=['POST'])
def reset_password():
    """
    Reset password using valid token
    """
    data = request.json
    token = data.get('token')
    new_password = data.get('password')

    if not token or not new_password:
        return jsonify({'error': 'Token and new password are required'}), 400

    if len(new_password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters long'}), 400

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        # Verify token
        cursor.execute("""
            SELECT rt.*, u.id as user_id, u.email, u.full_name, u.username
            FROM password_reset_tokens rt
            JOIN users u ON rt.user_id = u.id
            WHERE rt.token = %s AND rt.used = FALSE AND u.deleted_at IS NULL
        """, (token,))

        token_data = cursor.fetchone()

        if not token_data:
            return jsonify({'error': 'Invalid reset token'}), 400

        # Check if expired
        expires_at = token_data['expires_at']
        if isinstance(expires_at, str):
            from dateutil import parser
            expires_at = parser.parse(expires_at)

        if datetime.now(expires_at.tzinfo) > expires_at:
            return jsonify({'error': 'Reset token has expired'}), 400

        # Hash new password
        password_hash = hash_password(new_password)

        # Update password
        cursor.execute("""
            UPDATE users
            SET password_hash = %s,
                password_changed_at = NOW(),
                failed_login_attempts = 0,
                locked_until = NULL
            WHERE id = %s
        """, (password_hash, token_data['user_id']))

        # Mark token as used
        cursor.execute("""
            UPDATE password_reset_tokens
            SET used = TRUE,
                used_at = NOW()
            WHERE token = %s
        """, (token,))

        # Send confirmation email
        user_name = token_data['full_name'] or token_data['username'] or token_data['email'].split('@')[0]
        send_password_changed_notification(token_data['email'], user_name)

        return jsonify({
            'message': 'Password reset successful. You can now login with your new password.'
        }), 200

@password_reset_bp.route('/change-password', methods=['POST'])
def change_password():
    """
    Change password for logged-in user (requires current password)
    """
    from flask_jwt_extended import jwt_required, get_jwt_identity
    from services.auth import check_password

    @jwt_required()
    def change_password_authenticated():
        user_id = get_jwt_identity()
        data = request.json

        current_password = data.get('current_password')
        new_password = data.get('new_password')

        if not current_password or not new_password:
            return jsonify({'error': 'Current and new password are required'}), 400

        if len(new_password) < 8:
            return jsonify({'error': 'Password must be at least 8 characters long'}), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Get user
            cursor.execute("""
                SELECT id, email, password_hash, full_name, username
                FROM users
                WHERE id = %s AND deleted_at IS NULL
            """, (user_id,))

            user = cursor.fetchone()

            if not user:
                return jsonify({'error': 'User not found'}), 404

            # Verify current password
            if not check_password(current_password, user['password_hash']):
                return jsonify({'error': 'Current password is incorrect'}), 401

            # Hash new password
            password_hash = hash_password(new_password)

            # Update password
            cursor.execute("""
                UPDATE users
                SET password_hash = %s,
                    password_changed_at = NOW()
                WHERE id = %s
            """, (password_hash, user_id))

            # Send confirmation email
            user_name = user['full_name'] or user['username'] or user['email'].split('@')[0]
            send_password_changed_notification(user['email'], user_name)

            return jsonify({
                'message': 'Password changed successfully'
            }), 200

    return change_password_authenticated()
