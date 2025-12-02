"""
SMTP Configuration Routes
Manage SMTP server settings with encryption
"""
from flask import Blueprint, request, jsonify
from database import get_db_connection
from psycopg2.extras import RealDictCursor
from services.auth import jwt_required_with_role
from services.encryption_service import get_encryption_service
from services.email_service import test_smtp_connection
from datetime import datetime

smtp_config_bp = Blueprint('smtp_config', __name__, url_prefix='/api/admin/smtp-config')
encryption_service = get_encryption_service()

@smtp_config_bp.route('', methods=['GET'])
@jwt_required_with_role('admin')
def get_smtp_config():
    """Get current SMTP configuration (password masked)"""
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute("""
            SELECT
                id, smtp_server, smtp_port, smtp_email,
                use_tls, use_ssl, from_name, reply_to_email,
                is_active, test_email_sent_at, test_email_status,
                created_at, updated_at
            FROM smtp_config
            WHERE is_active = TRUE
            ORDER BY created_at DESC
            LIMIT 1
        """)

        config = cursor.fetchone()

        if not config:
            return jsonify({
                'config': None,
                'message': 'No SMTP configuration found. Using environment variables.'
            }), 200

        return jsonify({'config': dict(config)}), 200

@smtp_config_bp.route('', methods=['POST'])
@jwt_required_with_role('admin')
def create_smtp_config():
    """Create or update SMTP configuration"""
    from flask_jwt_extended import get_jwt_identity
    user_id = get_jwt_identity()
    data = request.json

    required_fields = ['smtp_email', 'smtp_password']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'smtp_email and smtp_password are required'}), 400

    smtp_server = data.get('smtp_server', 'smtp.gmail.com')
    smtp_port = data.get('smtp_port', 587)
    smtp_email = data['smtp_email']
    smtp_password = data['smtp_password']
    use_tls = data.get('use_tls', True)
    use_ssl = data.get('use_ssl', False)
    from_name = data.get('from_name', 'Tarko Inventory')
    reply_to_email = data.get('reply_to_email', smtp_email)

    try:
        # Encrypt password
        encrypted_password = encryption_service.encrypt(smtp_password)

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Deactivate all existing configs
            cursor.execute("""
                UPDATE smtp_config
                SET is_active = FALSE, updated_at = NOW()
            """)

            # Insert new config
            cursor.execute("""
                INSERT INTO smtp_config (
                    smtp_server, smtp_port, smtp_email, smtp_password_encrypted,
                    use_tls, use_ssl, from_name, reply_to_email,
                    is_active, created_by, updated_by
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, TRUE, %s, %s)
                RETURNING id, smtp_server, smtp_port, smtp_email,
                          use_tls, use_ssl, from_name, reply_to_email,
                          is_active, created_at
            """, (
                smtp_server, smtp_port, smtp_email, encrypted_password,
                use_tls, use_ssl, from_name, reply_to_email,
                user_id, user_id
            ))

            config = cursor.fetchone()

            return jsonify({
                'message': 'SMTP configuration saved successfully',
                'config': dict(config)
            }), 201

    except Exception as e:
        return jsonify({'error': f'Failed to save SMTP configuration: {str(e)}'}), 500

@smtp_config_bp.route('/<config_id>', methods=['PUT'])
@jwt_required_with_role('admin')
def update_smtp_config(config_id):
    """Update existing SMTP configuration"""
    from flask_jwt_extended import get_jwt_identity
    user_id = get_jwt_identity()
    data = request.json

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        # Check if config exists
        cursor.execute("SELECT id FROM smtp_config WHERE id = %s", (config_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'SMTP configuration not found'}), 404

        # Build update query dynamically
        update_fields = []
        params = []

        if 'smtp_server' in data:
            update_fields.append("smtp_server = %s")
            params.append(data['smtp_server'])

        if 'smtp_port' in data:
            update_fields.append("smtp_port = %s")
            params.append(data['smtp_port'])

        if 'smtp_email' in data:
            update_fields.append("smtp_email = %s")
            params.append(data['smtp_email'])

        if 'smtp_password' in data:
            encrypted_password = encryption_service.encrypt(data['smtp_password'])
            update_fields.append("smtp_password_encrypted = %s")
            params.append(encrypted_password)

        if 'use_tls' in data:
            update_fields.append("use_tls = %s")
            params.append(data['use_tls'])

        if 'use_ssl' in data:
            update_fields.append("use_ssl = %s")
            params.append(data['use_ssl'])

        if 'from_name' in data:
            update_fields.append("from_name = %s")
            params.append(data['from_name'])

        if 'reply_to_email' in data:
            update_fields.append("reply_to_email = %s")
            params.append(data['reply_to_email'])

        if 'is_active' in data:
            if data['is_active']:
                # Deactivate all other configs
                cursor.execute("""
                    UPDATE smtp_config
                    SET is_active = FALSE, updated_at = NOW()
                    WHERE id != %s
                """, (config_id,))
            update_fields.append("is_active = %s")
            params.append(data['is_active'])

        if not update_fields:
            return jsonify({'error': 'No fields to update'}), 400

        update_fields.append("updated_at = NOW()")
        update_fields.append("updated_by = %s")
        params.append(user_id)
        params.append(config_id)

        query = f"""
            UPDATE smtp_config
            SET {', '.join(update_fields)}
            WHERE id = %s
            RETURNING id, smtp_server, smtp_port, smtp_email,
                      use_tls, use_ssl, from_name, reply_to_email,
                      is_active, updated_at
        """

        cursor.execute(query, params)
        config = cursor.fetchone()

        return jsonify({
            'message': 'SMTP configuration updated successfully',
            'config': dict(config)
        }), 200

@smtp_config_bp.route('/<config_id>', methods=['DELETE'])
@jwt_required_with_role('admin')
def delete_smtp_config(config_id):
    """Delete SMTP configuration"""
    with get_db_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("DELETE FROM smtp_config WHERE id = %s RETURNING id", (config_id,))
        deleted = cursor.fetchone()

        if not deleted:
            return jsonify({'error': 'SMTP configuration not found'}), 404

        return jsonify({'message': 'SMTP configuration deleted successfully'}), 200

@smtp_config_bp.route('/test', methods=['POST'])
@jwt_required_with_role('admin')
def test_smtp():
    """Test SMTP configuration by sending a test email"""
    data = request.json
    test_email = data.get('test_email')
    config_id = data.get('config_id')

    if not test_email:
        return jsonify({'error': 'test_email is required'}), 400

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        if config_id:
            # Test specific config
            cursor.execute("""
                SELECT smtp_server, smtp_port, smtp_email, smtp_password_encrypted,
                       use_tls, use_ssl, from_name
                FROM smtp_config
                WHERE id = %s
            """, (config_id,))
        else:
            # Test active config
            cursor.execute("""
                SELECT smtp_server, smtp_port, smtp_email, smtp_password_encrypted,
                       use_tls, use_ssl, from_name
                FROM smtp_config
                WHERE is_active = TRUE
                ORDER BY created_at DESC
                LIMIT 1
            """)

        config = cursor.fetchone()

        if not config:
            return jsonify({'error': 'No SMTP configuration found'}), 404

        # Decrypt password
        try:
            smtp_password = encryption_service.decrypt(config['smtp_password_encrypted'])
        except Exception as e:
            return jsonify({'error': f'Failed to decrypt SMTP password: {str(e)}'}), 500

        # Test connection
        success, message = test_smtp_connection(
            smtp_server=config['smtp_server'],
            smtp_port=config['smtp_port'],
            smtp_email=config['smtp_email'],
            smtp_password=smtp_password,
            use_tls=config['use_tls'],
            use_ssl=config['use_ssl'],
            from_name=config['from_name'],
            test_email=test_email
        )

        # Update test status
        if config_id:
            cursor.execute("""
                UPDATE smtp_config
                SET test_email_sent_at = NOW(),
                    test_email_status = %s,
                    updated_at = NOW()
                WHERE id = %s
            """, ('success' if success else 'failed', config_id))

        if success:
            return jsonify({
                'success': True,
                'message': f'Test email sent successfully to {test_email}'
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': message
            }), 400

@smtp_config_bp.route('/all', methods=['GET'])
@jwt_required_with_role('admin')
def get_all_smtp_configs():
    """Get all SMTP configurations (for history/management)"""
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute("""
            SELECT
                id, smtp_server, smtp_port, smtp_email,
                use_tls, use_ssl, from_name, reply_to_email,
                is_active, test_email_sent_at, test_email_status,
                created_at, updated_at
            FROM smtp_config
            ORDER BY created_at DESC
        """)

        configs = cursor.fetchall()

        return jsonify({
            'configs': [dict(config) for config in configs]
        }), 200
