from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import execute_query, execute_insert, get_db_cursor
from auth import jwt_required_with_role, get_user_identity_details
import json
from datetime import datetime
from google_drive_sync import sync_snapshot_to_drive, test_drive_connection, sync_all_recent_snapshots

version_control_bp = Blueprint('version_control', __name__, url_prefix='/api/version-control')

# Tables to include in snapshots (excluding sensitive auth data)
# Order matters for rollback - parent tables first to avoid FK violations
SNAPSHOT_TABLES = [
    'brands',
    'customers',
    'product_types',
    'parameter_options',
    'product_variants',
    'batches',
    'rolls',
    'transactions'
]

# Tables that have soft delete (deleted_at column)
SOFT_DELETE_TABLES = [
    'batches',
    'rolls',
    'transactions'
]

# Tables without updated_at column
TABLES_WITHOUT_UPDATED_AT = [
    'parameter_options'
]

@version_control_bp.route('/snapshots', methods=['GET'])
@jwt_required_with_role('admin')
def get_snapshots():
    """Get all database snapshots"""
    query = """
        SELECT
            ds.id,
            ds.snapshot_name,
            ds.description,
            ds.table_counts,
            ds.created_by,
            ds.created_at,
            ds.file_size_mb,
            ds.is_automatic,
            ds.tags,
            u.username as created_by_username,
            u.full_name as created_by_name
        FROM database_snapshots ds
        LEFT JOIN users u ON ds.created_by = u.id
        ORDER BY ds.created_at DESC
    """
    snapshots = execute_query(query)
    return jsonify(snapshots), 200

@version_control_bp.route('/snapshots', methods=['POST'])
@jwt_required_with_role('admin')
def create_snapshot():
    """Create a new database snapshot"""
    user_id = get_jwt_identity()
    data = request.json

    snapshot_name = data.get('snapshot_name', f'Snapshot {datetime.now().strftime("%Y-%m-%d %H:%M")}')
    description = data.get('description', '')
    tags = data.get('tags', [])
    is_automatic = data.get('is_automatic', False)

    try:
        with get_db_cursor() as cursor:
            snapshot_data = {}
            table_counts = {}

            # Capture data from each table
            for table in SNAPSHOT_TABLES:
                # Add WHERE clause only for tables with soft delete
                where_clause = "WHERE deleted_at IS NULL" if table in SOFT_DELETE_TABLES else ""

                cursor.execute(f"""
                    SELECT json_agg(row_to_json(t.*)) as data
                    FROM {table} t
                    {where_clause}
                """)
                result = cursor.fetchone()
                table_data = result['data'] if result and result.get('data') else []
                snapshot_data[table] = table_data
                table_counts[table] = len(table_data) if table_data else 0

            # Calculate approximate size
            snapshot_json = json.dumps(snapshot_data)
            file_size_mb = len(snapshot_json.encode('utf-8')) / (1024 * 1024)

            # Insert snapshot
            cursor.execute("""
                INSERT INTO database_snapshots (
                    snapshot_name, description, snapshot_data, table_counts,
                    created_by, file_size_mb, is_automatic, tags
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, snapshot_name, created_at, table_counts
            """, (
                snapshot_name,
                description,
                json.dumps(snapshot_data),
                json.dumps(table_counts),
                user_id,
                file_size_mb,
                is_automatic,
                tags
            ))

            snapshot = cursor.fetchone()

            # Create audit log
            actor = get_user_identity_details(user_id)
            cursor.execute("""
                INSERT INTO audit_logs (
                    user_id, action_type, entity_type, entity_id,
                    description, created_at
                ) VALUES (%s, 'CREATE_SNAPSHOT', 'SNAPSHOT', %s, %s, NOW())
            """, (
                user_id,
                str(snapshot['id']),
                f"{actor['name']} created snapshot '{snapshot_name}'"
            ))

            return jsonify({
                'message': 'Snapshot created successfully',
                'snapshot': dict(snapshot)
            }), 201

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Snapshot creation error: {error_details}")
        return jsonify({
            'error': f'Failed to create snapshot: {str(e) or type(e).__name__}',
            'details': error_details
        }), 500

@version_control_bp.route('/snapshots/<uuid:snapshot_id>', methods=['DELETE'])
@jwt_required_with_role('admin')
def delete_snapshot(snapshot_id):
    """Delete a snapshot"""
    user_id = get_jwt_identity()

    try:
        with get_db_cursor() as cursor:
            # Check if snapshot exists
            cursor.execute("""
                SELECT snapshot_name FROM database_snapshots WHERE id = %s
            """, (str(snapshot_id),))

            snapshot = cursor.fetchone()
            if not snapshot:
                return jsonify({'error': 'Snapshot not found'}), 404

            # Delete rollback history first (FK constraint)
            cursor.execute("""
                DELETE FROM rollback_history WHERE snapshot_id = %s
            """, (str(snapshot_id),))

            # Delete the snapshot
            cursor.execute("""
                DELETE FROM database_snapshots WHERE id = %s
            """, (str(snapshot_id),))

            # Create audit log
            actor = get_user_identity_details(user_id)
            cursor.execute("""
                INSERT INTO audit_logs (
                    user_id, action_type, entity_type, entity_id,
                    description, created_at
                ) VALUES (%s, 'DELETE_SNAPSHOT', 'SNAPSHOT', %s, %s, NOW())
            """, (
                user_id,
                str(snapshot_id),
                f"{actor['name']} deleted snapshot '{snapshot['snapshot_name']}'"
            ))

            return jsonify({'message': 'Snapshot deleted successfully'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@version_control_bp.route('/rollback/<uuid:snapshot_id>', methods=['POST'])
@jwt_required_with_role('admin')
def rollback_to_snapshot(snapshot_id):
    """Rollback database to a specific snapshot"""
    user_id = get_jwt_identity()
    data = request.json or {}
    confirm = data.get('confirm', False)

    if not confirm:
        return jsonify({'error': 'Rollback must be confirmed with "confirm": true'}), 400

    try:
        with get_db_cursor() as cursor:
            # Get snapshot data
            cursor.execute("""
                SELECT snapshot_name, snapshot_data, table_counts
                FROM database_snapshots
                WHERE id = %s
            """, (str(snapshot_id),))

            snapshot = cursor.fetchone()
            if not snapshot:
                return jsonify({'error': 'Snapshot not found'}), 404

            snapshot_data = snapshot['snapshot_data']
            affected_tables = []

            # Capture current state summary before rollback
            current_state = {}
            for table in SNAPSHOT_TABLES:
                # Use WHERE clause only for soft-delete tables
                where_clause = "WHERE deleted_at IS NULL" if table in SOFT_DELETE_TABLES else ""
                cursor.execute(f"""
                    SELECT COUNT(*) as count FROM {table} {where_clause}
                """)
                result = cursor.fetchone()
                current_state[table] = result['count']

            # Perform rollback for each table in correct order (parent tables first)
            for table in SNAPSHOT_TABLES:
                # Skip if table not in snapshot data
                if table not in snapshot_data:
                    continue

                data = snapshot_data[table]
                affected_tables.append(table)

                # Restore snapshot data first
                if data and len(data) > 0:
                    # Get columns from first record
                    columns = list(data[0].keys())

                    # Filter out columns that might cause issues
                    exclude_cols = ['deleted_at']
                    columns = [c for c in columns if c not in exclude_cols]

                    # Collect all IDs from snapshot
                    snapshot_ids = [str(record.get('id')) for record in data]

                    # Insert/Update each record from snapshot
                    for record in data:
                        placeholders = ', '.join(['%s'] * len(columns))
                        cols_str = ', '.join(columns)

                        # Convert dict/list values to JSON strings for PostgreSQL
                        values = []
                        for col in columns:
                            val = record.get(col)
                            if isinstance(val, (dict, list)):
                                values.append(json.dumps(val))
                            else:
                                values.append(val)

                        if table in SOFT_DELETE_TABLES:
                            # For soft-delete tables, restore with deleted_at = NULL
                            update_set = ', '.join([f"{col} = EXCLUDED.{col}" for col in columns if col not in ('id', 'updated_at')])
                            if table in TABLES_WITHOUT_UPDATED_AT:
                                cursor.execute(f"""
                                    INSERT INTO {table} ({cols_str})
                                    VALUES ({placeholders})
                                    ON CONFLICT (id) DO UPDATE SET
                                        {update_set},
                                        deleted_at = NULL
                                """, values)
                            else:
                                cursor.execute(f"""
                                    INSERT INTO {table} ({cols_str})
                                    VALUES ({placeholders})
                                    ON CONFLICT (id) DO UPDATE SET
                                        {update_set},
                                        deleted_at = NULL,
                                        updated_at = NOW()
                                """, values)
                        else:
                            # For non-soft-delete tables, simple upsert
                            update_set = ', '.join([f"{col} = EXCLUDED.{col}" for col in columns if col not in ('id', 'updated_at')])
                            if table in TABLES_WITHOUT_UPDATED_AT:
                                cursor.execute(f"""
                                    INSERT INTO {table} ({cols_str})
                                    VALUES ({placeholders})
                                    ON CONFLICT (id) DO UPDATE SET
                                        {update_set}
                                """, values)
                            else:
                                cursor.execute(f"""
                                    INSERT INTO {table} ({cols_str})
                                    VALUES ({placeholders})
                                    ON CONFLICT (id) DO UPDATE SET
                                        {update_set},
                                        updated_at = NOW()
                                """, values)

                    # After restoring, soft-delete records NOT in snapshot
                    if table in SOFT_DELETE_TABLES:
                        # Soft delete records that aren't in the snapshot
                        # Cast snapshot_ids to UUID array for comparison
                        cursor.execute(f"""
                            UPDATE {table}
                            SET deleted_at = NOW()
                            WHERE deleted_at IS NULL
                            AND id::text != ALL(%s)
                        """, (snapshot_ids,))
                    else:
                        # For non-soft-delete tables, hard delete records not in snapshot
                        cursor.execute(f"""
                            DELETE FROM {table}
                            WHERE id::text != ALL(%s)
                        """, (snapshot_ids,))
                else:
                    # If snapshot has no data for this table, delete/soft-delete all
                    if table in SOFT_DELETE_TABLES:
                        cursor.execute(f"""
                            UPDATE {table}
                            SET deleted_at = NOW()
                            WHERE deleted_at IS NULL
                        """)
                    else:
                        cursor.execute(f"TRUNCATE TABLE {table} CASCADE")

            # Record rollback in history
            cursor.execute("""
                INSERT INTO rollback_history (
                    snapshot_id, snapshot_name, rolled_back_by,
                    previous_state_summary, success, affected_tables
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                str(snapshot_id),
                snapshot['snapshot_name'],
                user_id,
                json.dumps(current_state),
                True,
                affected_tables
            ))

            # Create audit log
            actor = get_user_identity_details(user_id)
            cursor.execute("""
                INSERT INTO audit_logs (
                    user_id, action_type, entity_type, entity_id,
                    description, created_at
                ) VALUES (%s, 'ROLLBACK', 'SNAPSHOT', %s, %s, NOW())
            """, (
                user_id,
                str(snapshot_id),
                f"{actor['name']} rolled back database to snapshot '{snapshot['snapshot_name']}'"
            ))

            return jsonify({
                'message': 'Rollback completed successfully',
                'snapshot_name': snapshot['snapshot_name'],
                'affected_tables': affected_tables,
                'previous_state': current_state
            }), 200

    except Exception as e:
        # Record failed rollback
        try:
            with get_db_cursor() as cursor:
                cursor.execute("""
                    INSERT INTO rollback_history (
                        snapshot_id, snapshot_name, rolled_back_by,
                        success, error_message
                    )
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    str(snapshot_id),
                    snapshot.get('snapshot_name', 'Unknown') if 'snapshot' in locals() else 'Unknown',
                    user_id,
                    False,
                    str(e)
                ))
        except:
            pass

        return jsonify({'error': f'Rollback failed: {str(e)}'}), 500

@version_control_bp.route('/rollback-history', methods=['GET'])
@jwt_required_with_role('admin')
def get_rollback_history():
    """Get rollback history"""
    query = """
        SELECT
            rh.id,
            rh.snapshot_id,
            rh.snapshot_name,
            rh.rolled_back_by,
            rh.rolled_back_at,
            rh.previous_state_summary,
            rh.success,
            rh.error_message,
            rh.affected_tables,
            u.username as rolled_back_by_username,
            u.full_name as rolled_back_by_name
        FROM rollback_history rh
        LEFT JOIN users u ON rh.rolled_back_by = u.id
        ORDER BY rh.rolled_back_at DESC
        LIMIT 100
    """
    history = execute_query(query)
    return jsonify(history), 200

@version_control_bp.route('/drive/sync/<snapshot_id>', methods=['POST'])
@jwt_required_with_role(['admin'])
def sync_to_drive(snapshot_id):
    """Manually sync a snapshot to Google Drive"""
    try:
        result = sync_snapshot_to_drive(snapshot_id)

        if result:
            return jsonify({
                'message': 'Snapshot synced to Google Drive successfully',
                'drive_info': result
            }), 200
        else:
            return jsonify({
                'error': 'Failed to sync to Google Drive',
                'message': 'Check if Google Drive credentials are configured'
            }), 500

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@version_control_bp.route('/drive/sync-all', methods=['POST'])
@jwt_required_with_role(['admin'])
def sync_all_to_drive():
    """Sync all recent snapshots to Google Drive"""
    try:
        days = request.json.get('days', 7) if request.json else 7
        result = sync_all_recent_snapshots(days=days)

        if result:
            return jsonify({
                'message': 'Sync completed',
                'synced': result['synced'],
                'failed': result['failed']
            }), 200
        else:
            return jsonify({
                'error': 'Failed to sync snapshots',
                'message': 'Check if Google Drive credentials are configured'
            }), 500

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@version_control_bp.route('/drive/test', methods=['GET'])
@jwt_required_with_role(['admin'])
def test_drive():
    """Test Google Drive connection"""
    try:
        connected = test_drive_connection()

        if connected:
            return jsonify({
                'status': 'connected',
                'message': 'Google Drive connection successful'
            }), 200
        else:
            return jsonify({
                'status': 'disconnected',
                'message': 'Google Drive credentials not configured or invalid'
            }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@version_control_bp.route('/drive/configure', methods=['POST'])
@jwt_required_with_role(['admin'])
def configure_drive():
    """Configure Google Drive credentials"""
    try:
        data = request.json
        credentials_json = data.get('credentials')

        if not credentials_json:
            return jsonify({'error': 'Credentials JSON is required'}), 400

        # Validate JSON format
        try:
            json.loads(credentials_json)
        except json.JSONDecodeError:
            return jsonify({'error': 'Invalid JSON format'}), 400

        # Save credentials to file
        import os
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        credentials_path = os.path.join(backend_dir, 'google_drive_credentials.json')

        with open(credentials_path, 'w') as f:
            f.write(credentials_json)

        # Set proper permissions (read/write for owner only)
        os.chmod(credentials_path, 0o600)

        return jsonify({
            'message': 'Google Drive credentials configured successfully',
            'path': credentials_path
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
