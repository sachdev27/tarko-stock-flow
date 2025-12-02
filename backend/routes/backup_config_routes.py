"""
Backup configuration routes - Manage cloud credentials, retention policies, and archives
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import get_db_connection
from psycopg2.extras import RealDictCursor
from services.auth import jwt_required_with_role
from services.encryption_service import get_encryption_service

backup_config_bp = Blueprint('backup_config', __name__, url_prefix='/api/backup-config')
encryption_service = get_encryption_service()

# ==================== Cloud Credentials ====================

@backup_config_bp.route('/cloud-credentials', methods=['GET'])
@jwt_required_with_role("admin")
def get_cloud_credentials():
    """Get all cloud credentials (secrets masked)"""
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT
                id, provider, account_id, bucket_name, region,
                endpoint_url, is_active, created_at, updated_at,
                CONCAT(LEFT(access_key_id, 4), '...', RIGHT(access_key_id, 4)) as access_key_id_masked
            FROM cloud_credentials
            ORDER BY created_at DESC
        """)
        credentials = cursor.fetchall()
        return jsonify([dict(c) for c in credentials])

@backup_config_bp.route('/cloud-credentials', methods=['POST'])
@jwt_required_with_role("admin")
def create_cloud_credentials():
    """Create new cloud storage credentials"""
    data = request.json

    required = ['provider', 'access_key_id', 'secret_access_key', 'bucket_name']
    if not all(k in data for k in required):
        return jsonify({'error': 'Missing required fields'}), 400

    # Encrypt secret access key
    encrypted_secret = encryption_service.encrypt(data['secret_access_key'])

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        try:
            cursor.execute("""
                INSERT INTO cloud_credentials
                (provider, account_id, access_key_id, secret_access_key,
                 bucket_name, region, endpoint_url, created_by_user_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, provider, bucket_name, is_active, created_at
            """, (
                data['provider'],
                data.get('account_id'),
                data['access_key_id'],
                encrypted_secret,
                data['bucket_name'],
                data.get('region'),
                data.get('endpoint_url'),
                get_jwt_identity()
            ))

            result = cursor.fetchone()
            return jsonify(dict(result)), 201

        except Exception as e:
            return jsonify({'error': str(e)}), 500

@backup_config_bp.route('/cloud-credentials/<credential_id>', methods=['PUT'])
@jwt_required_with_role("admin")
def update_cloud_credentials(credential_id):
    """Update cloud credentials"""
    data = request.json

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        # Build dynamic update query
        update_fields = []
        values = []

        if 'access_key_id' in data:
            update_fields.append('access_key_id = %s')
            values.append(data['access_key_id'])

        if 'secret_access_key' in data:
            encrypted_secret = encryption_service.encrypt(data['secret_access_key'])
            update_fields.append('secret_access_key = %s')
            values.append(encrypted_secret)

        if 'bucket_name' in data:
            update_fields.append('bucket_name = %s')
            values.append(data['bucket_name'])

        if 'is_active' in data:
            update_fields.append('is_active = %s')
            values.append(data['is_active'])

        if not update_fields:
            return jsonify({'error': 'No fields to update'}), 400

        values.append(credential_id)

        cursor.execute(f"""
            UPDATE cloud_credentials
            SET {', '.join(update_fields)}, updated_at = now()
            WHERE id = %s
            RETURNING id, provider, bucket_name, is_active, updated_at
        """, values)

        result = cursor.fetchone()
        if not result:
            return jsonify({'error': 'Credentials not found'}), 404

        return jsonify(dict(result))

@backup_config_bp.route('/cloud-credentials/<credential_id>', methods=['DELETE'])
@jwt_required_with_role("admin")
def delete_cloud_credentials(credential_id):
    """Delete cloud credentials"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM cloud_credentials WHERE id = %s', (credential_id,))

        if cursor.rowcount == 0:
            return jsonify({'error': 'Credentials not found'}), 404

        return jsonify({'message': 'Credentials deleted successfully'})

@backup_config_bp.route('/cloud-credentials/<credential_id>/decrypt', methods=['POST'])
@jwt_required_with_role("admin")
def get_decrypted_credentials(credential_id):
    """Get decrypted credentials (use with caution, log access)"""
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        # Log access for audit
        cursor.execute("""
            INSERT INTO audit_logs (user_id, action_type, entity_type, entity_id, description)
            VALUES (%s, 'decrypt_credentials', 'cloud_credentials', %s, %s)
        """, (get_jwt_identity(), credential_id, f'Admin decrypted cloud credentials'))

        cursor.execute("""
            SELECT id, provider, account_id, access_key_id,
                   secret_access_key, bucket_name, region, endpoint_url
            FROM cloud_credentials
            WHERE id = %s AND is_active = true
        """, (credential_id,))

        cred = cursor.fetchone()
        if not cred:
            return jsonify({'error': 'Credentials not found'}), 404

        result = dict(cred)
        result['secret_access_key'] = encryption_service.decrypt(result['secret_access_key'])

        return jsonify(result)

@backup_config_bp.route('/cloud-credentials/<credential_id>/test', methods=['POST'])
@jwt_required_with_role("admin")
def test_cloud_credentials(credential_id):
    """Test cloud credentials connection"""
    try:
        import boto3
        from botocore.config import Config as BotoConfig
        from botocore.exceptions import ClientError

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT provider, account_id, access_key_id, secret_access_key,
                       bucket_name, region, endpoint_url
                FROM cloud_credentials
                WHERE id = %s
            """, (credential_id,))

            cred = cursor.fetchone()
            if not cred:
                return jsonify({'success': False, 'error': 'Credentials not found'}), 404

            # Decrypt secret
            secret_key = encryption_service.decrypt(cred['secret_access_key'])

            # Test connection based on provider
            if cred['provider'] == 'r2':
                endpoint_url = cred['endpoint_url'] or f"https://{cred['account_id']}.r2.cloudflarestorage.com"
                s3_client = boto3.client(
                    's3',
                    endpoint_url=endpoint_url,
                    aws_access_key_id=cred['access_key_id'],
                    aws_secret_access_key=secret_key,
                    config=BotoConfig(signature_version='s3v4'),
                    region_name='auto'
                )
            elif cred['provider'] == 's3':
                s3_client = boto3.client(
                    's3',
                    aws_access_key_id=cred['access_key_id'],
                    aws_secret_access_key=secret_key,
                    region_name=cred['region'] or 'us-east-1'
                )
            else:
                return jsonify({'success': False, 'error': 'Unsupported provider'}), 400

            # Try to access the bucket
            s3_client.head_bucket(Bucket=cred['bucket_name'])

            return jsonify({
                'success': True,
                'message': f'Successfully connected to {cred["provider"].upper()} bucket: {cred["bucket_name"]}'
            })

    except ClientError as e:
        error_code = e.response['Error']['Code']
        if error_code == '403':
            return jsonify({
                'success': False,
                'error': 'Access denied. Check credentials and bucket permissions.'
            }), 200
        elif error_code == '404':
            return jsonify({
                'success': False,
                'error': 'Bucket not found. Check bucket name.'
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': f'Connection error: {str(e)}'
            }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Test failed: {str(e)}'
        }), 200

# ==================== Retention Policies ====================

@backup_config_bp.route('/retention-policies', methods=['GET'])
@jwt_required_with_role("admin")
def get_retention_policies():
    """Get all backup retention policies"""
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT * FROM backup_retention_policies
            ORDER BY backup_type, policy_name
        """)
        policies = cursor.fetchall()
        return jsonify([dict(p) for p in policies])

@backup_config_bp.route('/retention-policies', methods=['POST'])
@jwt_required_with_role("admin")
def create_retention_policy():
    """Create new retention policy"""
    data = request.json

    required = ['policy_name', 'backup_type', 'retention_days']
    if not all(k in data for k in required):
        return jsonify({'error': 'Missing required fields'}), 400

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        try:
            cursor.execute("""
                INSERT INTO backup_retention_policies
                (policy_name, backup_type, retention_days, auto_delete_enabled,
                 keep_weekly, keep_monthly, max_backups, created_by_user_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            """, (
                data['policy_name'],
                data['backup_type'],
                data['retention_days'],
                data.get('auto_delete_enabled', True),
                data.get('keep_weekly', True),
                data.get('keep_monthly', False),
                data.get('max_backups'),
                get_jwt_identity()
            ))

            result = cursor.fetchone()
            return jsonify(dict(result)), 201

        except Exception as e:
            return jsonify({'error': str(e)}), 500

@backup_config_bp.route('/retention-policies/<policy_id>', methods=['PUT'])
@jwt_required_with_role("admin")
def update_retention_policy(policy_id):
    """Update retention policy"""
    data = request.json

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        update_fields = []
        values = []

        allowed_fields = ['retention_days', 'auto_delete_enabled', 'keep_weekly',
                         'keep_monthly', 'max_backups', 'is_active']

        for field in allowed_fields:
            if field in data:
                update_fields.append(f'{field} = %s')
                values.append(data[field])

        if not update_fields:
            return jsonify({'error': 'No fields to update'}), 400

        values.append(policy_id)

        cursor.execute(f"""
            UPDATE backup_retention_policies
            SET {', '.join(update_fields)}, updated_at = now()
            WHERE id = %s
            RETURNING *
        """, values)

        result = cursor.fetchone()
        if not result:
            return jsonify({'error': 'Policy not found'}), 404

        return jsonify(dict(result))

# ==================== Archive Buckets ====================

@backup_config_bp.route('/archive-buckets', methods=['GET'])
@jwt_required_with_role("admin")
def get_archive_buckets():
    """Get all archive buckets"""
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT ab.*, cc.provider as credential_provider
            FROM archive_buckets ab
            LEFT JOIN cloud_credentials cc ON ab.credentials_id = cc.id
            ORDER BY ab.created_at DESC
        """)
        buckets = cursor.fetchall()
        return jsonify([dict(b) for b in buckets])

@backup_config_bp.route('/archive-buckets', methods=['POST'])
@jwt_required_with_role("admin")
def create_archive_bucket():
    """Create new archive bucket"""
    data = request.json

    required = ['bucket_name', 'provider', 'credentials_id']
    if not all(k in data for k in required):
        return jsonify({'error': 'Missing required fields'}), 400

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute("""
            INSERT INTO archive_buckets
            (bucket_name, provider, credentials_id, description, created_by_user_id)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
        """, (
            data['bucket_name'],
            data['provider'],
            data['credentials_id'],
            data.get('description'),
            get_jwt_identity()
        ))

        result = cursor.fetchone()
        return jsonify(dict(result)), 201

@backup_config_bp.route('/archive-buckets/<bucket_id>/archive', methods=['POST'])
@jwt_required_with_role("admin")
def archive_backup(bucket_id):
    """Archive a backup (cherry-pick) to archive bucket"""
    data = request.json

    required = ['backup_id', 'backup_type']
    if not all(k in data for k in required):
        return jsonify({'error': 'Missing required fields'}), 400

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute("""
            INSERT INTO archived_backups
            (original_backup_id, backup_type, archive_bucket_id,
             archive_path, archive_size_bytes, archived_by_user_id, notes, tags)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """, (
            data['backup_id'],
            data['backup_type'],
            bucket_id,
            data.get('archive_path', ''),
            data.get('archive_size_bytes'),
            get_jwt_identity(),
            data.get('notes'),
            data.get('tags', [])
        ))

        result = cursor.fetchone()
        return jsonify(dict(result)), 201

@backup_config_bp.route('/archived-backups', methods=['GET'])
@jwt_required_with_role("admin")
def get_archived_backups():
    """Get all archived backups"""
    backup_type = request.args.get('backup_type')

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        query = """
            SELECT ab.*, arb.bucket_name
            FROM archived_backups ab
            JOIN archive_buckets arb ON ab.archive_bucket_id = arb.id
        """
        params = []

        if backup_type:
            query += " WHERE ab.backup_type = %s"
            params.append(backup_type)

        query += " ORDER BY ab.archived_at DESC"

        cursor.execute(query, params)
        archives = cursor.fetchall()
        return jsonify([dict(a) for a in archives])

# ==================== Deletion Log ====================

@backup_config_bp.route('/deletion-log', methods=['GET'])
@jwt_required_with_role("admin")
def get_deletion_log():
    """Get backup deletion log"""
    limit = request.args.get('limit', 100, type=int)
    backup_type = request.args.get('backup_type')

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        query = """
            SELECT dl.*, u.email as deleted_by_email
            FROM backup_deletion_log dl
            LEFT JOIN users u ON dl.deleted_by_user_id = u.id
        """
        params = []

        if backup_type:
            query += " WHERE dl.backup_type = %s"
            params.append(backup_type)

        query += " ORDER BY dl.deleted_at DESC LIMIT %s"
        params.append(limit)

        cursor.execute(query, params)
        logs = cursor.fetchall()
        return jsonify([dict(log) for log in logs])
