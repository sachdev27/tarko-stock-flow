"""
Sync routes for continuous backup to NAS or cloud storage
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from database import get_db_connection
from psycopg2.extras import RealDictCursor
from services.auth import jwt_required_with_role
from services.sync_service import SyncService, test_sync_connection
from services.encryption_service import get_encryption_service
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

sync_bp = Blueprint('sync', __name__, url_prefix='/api/sync')
encryption_service = get_encryption_service()

# In-memory state for auto-sync (will be moved to background scheduler)
auto_sync_state = {
    'running': False,
    'last_check': None
}


@sync_bp.route('/config', methods=['GET'])
@jwt_required_with_role('admin')
def get_sync_configs():
    """Get all sync configurations"""
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT id, name, sync_type, rsync_destination, rsync_host, rsync_user,
                   network_mount_path, cloud_provider, cloud_bucket, cloud_endpoint,
                   is_enabled, auto_sync_enabled, sync_interval_seconds,
                   sync_postgres_data, sync_database_snapshots, sync_uploads, sync_backups,
                   last_sync_at, last_sync_status, last_sync_error,
                   last_sync_files_count, last_sync_bytes_transferred,
                   created_at
            FROM sync_config
            ORDER BY created_at DESC
        """)
        configs = cursor.fetchall()
        return jsonify([dict(c) for c in configs])


@sync_bp.route('/config', methods=['POST'])
@jwt_required_with_role('admin')
def create_sync_config():
    """Create new sync configuration"""
    user_id = get_jwt_identity()
    data = request.json

    sync_type = data.get('sync_type')  # 'rsync', 'r2', 's3'

    if sync_type not in ['rsync', 'r2', 's3']:
        return jsonify({'error': 'Invalid sync_type'}), 400

    # Encrypt cloud secret key if provided
    cloud_secret_key = data.get('cloud_secret_key')
    if cloud_secret_key:
        cloud_secret_key = encryption_service.encrypt(cloud_secret_key)

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            INSERT INTO sync_config (
                name, sync_type,
                rsync_destination, rsync_user, rsync_host, rsync_port, ssh_key_path,
                network_mount_path,
                cloud_provider, cloud_bucket, cloud_access_key, cloud_secret_key,
                cloud_endpoint, cloud_region,
                is_enabled, auto_sync_enabled, sync_interval_seconds,
                sync_postgres_data, sync_database_snapshots, sync_uploads, sync_backups,
                created_by, created_at, updated_at
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW()
            ) RETURNING id, name
        """, (
            data.get('name'), sync_type,
            data.get('rsync_destination'), data.get('rsync_user'),
            data.get('rsync_host'), data.get('rsync_port', 22),
            data.get('ssh_key_path'),
            data.get('network_mount_path'),
            data.get('cloud_provider'), data.get('cloud_bucket'),
            data.get('cloud_access_key'), cloud_secret_key,
            data.get('cloud_endpoint'), data.get('cloud_region'),
            data.get('is_enabled', True), data.get('auto_sync_enabled', False),
            data.get('sync_interval_seconds', 60),
            data.get('sync_postgres_data', False),
            data.get('sync_database_snapshots', True),
            data.get('sync_uploads', True), data.get('sync_backups', True),
            user_id
        ))

        result = cursor.fetchone()
        conn.commit()

        return jsonify({
            'success': True,
            'id': result['id'],
            'name': result['name']
        }), 201


@sync_bp.route('/config/<config_id>', methods=['PUT'])
@jwt_required_with_role('admin')
def update_sync_config(config_id):
    """Update sync configuration"""
    data = request.json

    # Encrypt cloud secret key if provided
    cloud_secret_key = data.get('cloud_secret_key')
    if cloud_secret_key and not cloud_secret_key.startswith('***'):
        cloud_secret_key = encryption_service.encrypt(cloud_secret_key)
    else:
        cloud_secret_key = None  # Don't update if masked

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        update_fields = []
        values = []

        field_mappings = {
            'name': 'name',
            'rsync_destination': 'rsync_destination',
            'rsync_user': 'rsync_user',
            'rsync_host': 'rsync_host',
            'rsync_port': 'rsync_port',
            'ssh_key_path': 'ssh_key_path',
            'network_mount_path': 'network_mount_path',
            'cloud_provider': 'cloud_provider',
            'cloud_bucket': 'cloud_bucket',
            'cloud_access_key': 'cloud_access_key',
            'cloud_endpoint': 'cloud_endpoint',
            'cloud_region': 'cloud_region',
            'is_enabled': 'is_enabled',
            'auto_sync_enabled': 'auto_sync_enabled',
            'sync_interval_seconds': 'sync_interval_seconds',
            'sync_postgres_data': 'sync_postgres_data',
            'sync_database_snapshots': 'sync_database_snapshots',
            'sync_uploads': 'sync_uploads',
            'sync_backups': 'sync_backups'
        }

        for json_field, db_field in field_mappings.items():
            if json_field in data:
                update_fields.append(f"{db_field} = %s")
                values.append(data[json_field])

        if cloud_secret_key:
            update_fields.append("cloud_secret_key = %s")
            values.append(cloud_secret_key)

        if not update_fields:
            return jsonify({'error': 'No fields to update'}), 400

        update_fields.append("updated_at = NOW()")
        values.append(config_id)

        query = f"UPDATE sync_config SET {', '.join(update_fields)} WHERE id = %s"
        cursor.execute(query, values)
        conn.commit()

        return jsonify({'success': True})


@sync_bp.route('/config/<config_id>', methods=['DELETE'])
@jwt_required_with_role('admin')
def delete_sync_config(config_id):
    """Delete sync configuration"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sync_config WHERE id = %s", (config_id,))
        conn.commit()
        return jsonify({'success': True})


@sync_bp.route('/config/test', methods=['POST'])
@jwt_required_with_role('admin')
def test_sync_config_data():
    """Test sync configuration connection with provided data (before saving)"""
    data = request.json

    if not data:
        return jsonify({'error': 'Configuration data required'}), 400

    # Don't require encryption for test
    success, message = test_sync_connection(data)

    return jsonify({
        'success': success,
        'message': message
    })


@sync_bp.route('/config/<config_id>/test', methods=['POST'])
@jwt_required_with_role('admin')
def test_sync_config(config_id):
    """Test existing sync configuration connection"""
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM sync_config WHERE id = %s", (config_id,))
        config = cursor.fetchone()

        if not config:
            return jsonify({'error': 'Configuration not found'}), 404

        # Decrypt cloud secret if exists
        if config['cloud_secret_key']:
            config['cloud_secret_key'] = encryption_service.decrypt(config['cloud_secret_key'])

        success, message = test_sync_connection(dict(config))

        return jsonify({
            'success': success,
            'message': message
        })


@sync_bp.route('/trigger', methods=['POST'])
@jwt_required_with_role('admin')
def trigger_sync():
    """Manually trigger sync for a configuration"""
    data = request.json
    config_id = data.get('config_id')

    if not config_id:
        return jsonify({'error': 'config_id is required'}), 400

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM sync_config WHERE id = %s AND is_enabled = TRUE", (config_id,))
        config = cursor.fetchone()

        if not config:
            return jsonify({'error': 'Configuration not found or disabled'}), 404

        # Decrypt cloud secret if exists
        if config['cloud_secret_key']:
            config['cloud_secret_key'] = encryption_service.decrypt(config['cloud_secret_key'])

        # Create sync history entry
        cursor.execute("""
            INSERT INTO sync_history (
                sync_config_id, sync_type, started_at, status, triggered_by
            ) VALUES (%s, %s, NOW(), 'in_progress', 'manual')
            RETURNING id
        """, (config_id, config['sync_type']))

        history_id = cursor.fetchone()['id']
        conn.commit()

        # Execute sync
        try:
            sync_service = SyncService(dict(config))
            result = sync_service.sync()

            status = 'success' if result['success'] else 'failed'

            # Update sync history
            cursor.execute("""
                UPDATE sync_history
                SET completed_at = NOW(),
                    status = %s,
                    files_synced = %s,
                    bytes_transferred = %s,
                    duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at)),
                    error_message = %s
                WHERE id = %s
            """, (
                status,
                result.get('files_synced', 0),
                result.get('bytes_transferred', 0),
                result.get('error'),
                history_id
            ))

            # Update sync_config with last sync info
            cursor.execute("""
                UPDATE sync_config
                SET last_sync_at = NOW(),
                    last_sync_status = %s,
                    last_sync_error = %s,
                    last_sync_files_count = %s,
                    last_sync_bytes_transferred = %s
                WHERE id = %s
            """, (
                status,
                result.get('error'),
                result.get('files_synced', 0),
                result.get('bytes_transferred', 0),
                config_id
            ))

            conn.commit()

            return jsonify({
                'success': result['success'],
                'files_synced': result.get('files_synced', 0),
                'bytes_transferred': result.get('bytes_transferred', 0),
                'error': result.get('error')
            })

        except Exception as e:
            logger.error(f"Sync execution failed: {e}", exc_info=True)

            cursor.execute("""
                UPDATE sync_history
                SET completed_at = NOW(),
                    status = 'failed',
                    error_message = %s
                WHERE id = %s
            """, (str(e), history_id))
            conn.commit()

            return jsonify({
                'success': False,
                'error': str(e)
            }), 500


@sync_bp.route('/status', methods=['GET'])
@jwt_required_with_role('admin')
def get_sync_status():
    """Get current sync status for all enabled configs"""
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT id, name, sync_type, auto_sync_enabled, sync_interval_seconds,
                   last_sync_at, last_sync_status, last_sync_files_count,
                   last_sync_bytes_transferred
            FROM sync_config
            WHERE is_enabled = TRUE
            ORDER BY auto_sync_enabled DESC, last_sync_at DESC
        """)

        configs = cursor.fetchall()

        status_list = []
        all_synced = True
        any_auto_sync_enabled = False

        for config in configs:
            if config['auto_sync_enabled']:
                any_auto_sync_enabled = True

                # Check if sync is due
                last_sync = config['last_sync_at']
                interval = config['sync_interval_seconds']

                if last_sync:
                    next_sync = last_sync + timedelta(seconds=interval)
                    is_synced = datetime.now() <= next_sync
                else:
                    is_synced = False

                if not is_synced:
                    all_synced = False
            else:
                is_synced = config['last_sync_status'] == 'success'

            status_list.append({
                'id': str(config['id']),
                'name': config['name'],
                'sync_type': config['sync_type'],
                'auto_sync_enabled': config['auto_sync_enabled'],
                'last_sync_at': config['last_sync_at'].isoformat() if config['last_sync_at'] else None,
                'last_sync_status': config['last_sync_status'],
                'last_sync_files_count': config['last_sync_files_count'],
                'last_sync_bytes_transferred': config['last_sync_bytes_transferred'],
                'is_synced': is_synced
            })

        return jsonify({
            'configs': status_list,
            'all_synced': all_synced,
            'any_auto_sync_enabled': any_auto_sync_enabled,
            'last_check': auto_sync_state.get('last_check')
        })


@sync_bp.route('/history', methods=['GET'])
@jwt_required_with_role('admin')
def get_sync_history():
    """Get sync history"""
    limit = request.args.get('limit', 50, type=int)
    config_id = request.args.get('config_id')

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        if config_id:
            cursor.execute("""
                SELECT h.*, c.name as config_name
                FROM sync_history h
                JOIN sync_config c ON h.sync_config_id = c.id
                WHERE h.sync_config_id = %s
                ORDER BY h.started_at DESC
                LIMIT %s
            """, (config_id, limit))
        else:
            cursor.execute("""
                SELECT h.*, c.name as config_name
                FROM sync_history h
                JOIN sync_config c ON h.sync_config_id = c.id
                ORDER BY h.started_at DESC
                LIMIT %s
            """, (limit,))

        history = cursor.fetchall()

        return jsonify([{
            'id': str(h['id']),
            'config_name': h['config_name'],
            'sync_type': h['sync_type'],
            'started_at': h['started_at'].isoformat(),
            'completed_at': h['completed_at'].isoformat() if h['completed_at'] else None,
            'status': h['status'],
            'files_synced': h['files_synced'],
            'bytes_transferred': h['bytes_transferred'],
            'duration_seconds': float(h['duration_seconds']) if h['duration_seconds'] else None,
            'error_message': h['error_message'],
            'triggered_by': h['triggered_by']
        } for h in history])
