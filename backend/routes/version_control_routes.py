from flask import Blueprint, request, jsonify, send_file, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from database import execute_query, execute_insert, get_db_cursor, get_db_connection
from services.auth import jwt_required_with_role, get_user_identity_details
from storage.snapshot_storage import snapshot_storage, SnapshotStorage
from storage.cloud_storage import cloud_storage
from storage.external_storage import external_storage
from psycopg2.extras import Json
import json
from datetime import datetime
import os
import threading
from pathlib import Path
import traceback
import tempfile
import shutil
import zipfile

version_control_bp = Blueprint('version_control', __name__, url_prefix='/api/version-control')

# Tables to include in snapshots (excluding sensitive auth data)
# Order matters for rollback - parent tables first to avoid FK violations
SNAPSHOT_TABLES = [
    # System configuration (no FK dependencies)
    'smtp_config',
    'cloud_credentials',
    'backup_retention_policies',
    'archive_buckets',
    'cloud_backup_config',

    # Core configuration (no FK dependencies on operational tables)
    'brands',
    'locations',
    'units',
    'customers',
    'bill_to',
    'vehicles',
    'transports',
    'product_types',
    'parameter_options',
    'product_variants',
    'product_aliases',

    # Production - batches (depends on product_variants)
    'batches',

    # Inventory stock (depends on batches)
    'inventory_stock',

    # Transactions (depends on batches)
    'transactions',

    # Dispatches (depends on customers, bill_to, transport, vehicle)
    'dispatches',

    # Inventory transactions (depends on batches, inventory_stock, dispatch_items)
    # Has circular refs with cut pieces and dispatch_items, but we handle NULLs
    'inventory_transactions',

    # Cut pieces (depend on inventory_stock, inventory_transactions)
    'hdpe_cut_pieces',
    'sprinkler_spare_pieces',

    # Dispatch items (depends on dispatches, inventory_stock, hdpe_cut_pieces)
    'dispatch_items',

    # Returns (depends on customers)
    'returns',

    # Return items (depends on returns, product_variants)
    'return_items',

    # Return bundles/rolls (depend on return_items, inventory_stock)
    'return_bundles',
    'return_rolls',

    # Scraps (parent)
    'scraps',

    # Scrap items (depend on scraps, batches, inventory_stock)
    'scrap_items',

    # Scrap pieces (depend on scrap_items)
    'scrap_pieces',

    # Lifecycle events (depend on inventory_transactions)
    'piece_lifecycle_events',

    # System tracking and logs
    'archived_backups',  # depends on archive_buckets
    'backup_deletion_log',  # depends on backup_retention_policies
    'password_reset_tokens',  # system security tracking
    'audit_logs'  # general system tracking
]

# Tables that have soft delete (deleted_at column)
SOFT_DELETE_TABLES = [
    'batches',
    'inventory_stock',
    'transactions',
    'dispatches',
    'returns',
    'scraps',
    'product_types',
    'product_variants',
    'brands',
    'customers',
    'locations',
    'hdpe_cut_pieces',
    'sprinkler_spare_pieces',
    'bill_to',
    'transports',
    'vehicles'
]

# Tables without updated_at column
TABLES_WITHOUT_UPDATED_AT = [
    'parameter_options',
    'dispatch_items',
    'return_items',
    'return_bundles',
    'return_rolls',
    'scrap_items',
    'scrap_pieces',
    'piece_lifecycle_events',
    'product_aliases',
    'inventory_transactions',
    'audit_logs'
]

# Columns that are UUID arrays (need explicit casting)
UUID_ARRAY_COLUMNS = {
    'dispatch_items': ['spare_piece_ids']
}

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
            ds.storage_path,
            u.username as created_by_username,
            u.full_name as created_by_name
        FROM database_snapshots ds
        LEFT JOIN users u ON ds.created_by = u.id
        ORDER BY ds.created_at DESC
    """
    snapshots = execute_query(query)

    # Check if snapshot files actually exist on disk and resolve path
    for snapshot in snapshots:
        # Use custom storage path if set, otherwise use default
        storage_base = Path(snapshot.get('storage_path') or snapshot_storage.storage_path)
        snapshot_path = storage_base / str(snapshot['id'])
        snapshot['files_exist'] = snapshot_path.exists()
        snapshot['resolved_storage_path'] = str(storage_base.resolve())

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
    storage_path = data.get('storage_path')  # User-specified storage path

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
                    created_by, file_size_mb, is_automatic, tags, storage_path
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, snapshot_name, created_at, table_counts
            """, (
                snapshot_name,
                description,
                json.dumps(snapshot_data),
                json.dumps(table_counts),
                user_id,
                file_size_mb,
                is_automatic,
                tags,
                str(storage_path) if storage_path else str(snapshot_storage.storage_path)
            ))

            snapshot = cursor.fetchone()
            snapshot_id = str(snapshot['id'])

            # Save snapshot to local storage
            metadata = {
                'snapshot_id': snapshot_id,
                'snapshot_name': snapshot_name,
                'description': description,
                'created_at': snapshot['created_at'].isoformat() if snapshot['created_at'] else None,
                'created_by': user_id,
                'table_counts': table_counts,
                'file_size_mb': file_size_mb,
                'is_automatic': is_automatic,
                'tags': tags,
                'storage_path': storage_path
            }

            # Use custom storage path if provided
            if storage_path:
                custom_storage = SnapshotStorage(storage_path)
                storage_success = custom_storage.save_snapshot(snapshot_id, snapshot_data, metadata)
            else:
                storage_success = snapshot_storage.save_snapshot(snapshot_id, snapshot_data, metadata)

            if not storage_success:
                # Log warning but don't fail the operation
                import logging
                logging.warning(f"Failed to save snapshot {snapshot_id} to local storage")

            # Sync to cloud storage in background (non-blocking)
            from storage.cloud_storage import get_cloud_storage
            cloud_storage_instance = get_cloud_storage()
            if cloud_storage_instance.enabled and storage_success:
                def sync_to_cloud():
                    try:
                        # Use custom path if provided, otherwise use default
                        if storage_path:
                            local_path = Path(storage_path) / snapshot_id
                        else:
                            local_path = Path(snapshot_storage.storage_path) / snapshot_id
                        cloud_storage_instance.upload_snapshot(snapshot_id, local_path, encrypt=True)
                    except Exception as e:
                        import logging
                        logging.error(f"Failed to sync snapshot {snapshot_id} to cloud: {e}")

                sync_thread = threading.Thread(target=sync_to_cloud, daemon=True)
                sync_thread.start()

            # Create audit log
            actor = get_user_identity_details(user_id)
            cursor.execute("""
                INSERT INTO audit_logs (
                    user_id, action_type, entity_type, entity_id,
                    description, created_at
                ) VALUES (%s, 'CREATE_SNAPSHOT', 'SNAPSHOT', %s, %s, NOW())
            """, (
                user_id,
                snapshot_id,
                f"{actor['name']} created snapshot '{snapshot_name}'"
            ))

            return jsonify({
                'message': 'Snapshot created successfully',
                'snapshot': dict(snapshot),
                'storage_saved': storage_success
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
    """Delete a snapshot from database and filesystem"""
    user_id = get_jwt_identity()

    try:
        with get_db_cursor() as cursor:
            # Check if snapshot exists
            cursor.execute("""
                SELECT snapshot_name, storage_path FROM database_snapshots WHERE id = %s
            """, (str(snapshot_id),))

            snapshot = cursor.fetchone()
            if not snapshot:
                return jsonify({'error': 'Snapshot not found'}), 404

            # Delete files from filesystem
            try:
                storage_base = Path(snapshot.get('storage_path') or snapshot_storage.storage_path)
                snapshot_path = storage_base / str(snapshot_id)
                if snapshot_path.exists():
                    shutil.rmtree(snapshot_path)
                    current_app.logger.info(f"Deleted snapshot files from: {snapshot_path}")
            except Exception as fs_error:
                current_app.logger.error(f"Failed to delete snapshot files: {fs_error}")
                # Continue with database deletion even if file deletion fails

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

            return jsonify({'message': 'Snapshot deleted successfully from database and filesystem'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@version_control_bp.route('/snapshots/bulk-delete', methods=['POST'])
@jwt_required_with_role('admin')
def bulk_delete_snapshots():
    """Delete multiple snapshots at once"""
    user_id = get_jwt_identity()
    data = request.json or {}
    snapshot_ids = data.get('snapshot_ids', [])

    if not snapshot_ids:
        return jsonify({'error': 'No snapshot IDs provided'}), 400

    deleted_count = 0
    failed_count = 0
    errors = []

    try:
        with get_db_cursor() as cursor:
            for snapshot_id in snapshot_ids:
                try:
                    # Check if snapshot exists
                    cursor.execute("""
                        SELECT snapshot_name, storage_path FROM database_snapshots WHERE id = %s
                    """, (str(snapshot_id),))

                    snapshot = cursor.fetchone()
                    if not snapshot:
                        failed_count += 1
                        errors.append(f"Snapshot {snapshot_id} not found")
                        continue

                    # Delete files from filesystem
                    try:
                        storage_base = Path(snapshot.get('storage_path') or snapshot_storage.storage_path)
                        snapshot_path = storage_base / str(snapshot_id)
                        if snapshot_path.exists():
                            shutil.rmtree(snapshot_path)
                    except Exception as fs_error:
                        current_app.logger.error(f"Failed to delete snapshot files for {snapshot_id}: {fs_error}")

                    # Delete rollback history
                    cursor.execute("""
                        DELETE FROM rollback_history WHERE snapshot_id = %s
                    """, (str(snapshot_id),))

                    # Delete snapshot
                    cursor.execute("""
                        DELETE FROM database_snapshots WHERE id = %s
                    """, (str(snapshot_id),))

                    deleted_count += 1

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
                        f"{actor['name']} bulk deleted snapshot '{snapshot['snapshot_name']}'"
                    ))

                except Exception as e:
                    failed_count += 1
                    errors.append(f"Failed to delete {snapshot_id}: {str(e)}")
                    current_app.logger.error(f"Error deleting snapshot {snapshot_id}: {str(e)}")

            return jsonify({
                'message': f'Bulk delete completed: {deleted_count} deleted, {failed_count} failed',
                'deleted_count': deleted_count,
                'failed_count': failed_count,
                'errors': errors if errors else None
            }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@version_control_bp.route('/snapshots/cleanup-old', methods=['POST'])
@jwt_required_with_role('admin')
def cleanup_old_snapshots():
    """Delete snapshots older than specified days"""
    user_id = get_jwt_identity()
    data = request.json or {}
    days = data.get('days', 7)  # Default to 7 days

    try:
        with get_db_cursor() as cursor:
            # Find old snapshots
            cursor.execute("""
                SELECT id, snapshot_name, storage_path, created_at
                FROM database_snapshots
                WHERE created_at < NOW() - INTERVAL '%s days'
                AND is_automatic = true
                ORDER BY created_at ASC
            """, (days,))

            old_snapshots = cursor.fetchall()

            if not old_snapshots:
                return jsonify({
                    'message': f'No automatic snapshots older than {days} days found',
                    'deleted_count': 0
                }), 200

            deleted_count = 0
            failed_count = 0
            errors = []

            for snapshot in old_snapshots:
                try:
                    snapshot_id = snapshot['id']

                    # Delete files from filesystem
                    try:
                        storage_base = Path(snapshot.get('storage_path') or snapshot_storage.storage_path)
                        snapshot_path = storage_base / str(snapshot_id)
                        if snapshot_path.exists():
                            shutil.rmtree(snapshot_path)
                    except Exception as fs_error:
                        current_app.logger.error(f"Failed to delete snapshot files for {snapshot_id}: {fs_error}")

                    # Delete rollback history
                    cursor.execute("""
                        DELETE FROM rollback_history WHERE snapshot_id = %s
                    """, (str(snapshot_id),))

                    # Delete snapshot
                    cursor.execute("""
                        DELETE FROM database_snapshots WHERE id = %s
                    """, (str(snapshot_id),))

                    deleted_count += 1

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
                        f"{actor['name']} auto-cleaned old snapshot '{snapshot['snapshot_name']}' (older than {days} days)"
                    ))

                except Exception as e:
                    failed_count += 1
                    errors.append(f"Failed to delete {snapshot_id}: {str(e)}")
                    current_app.logger.error(f"Error deleting snapshot {snapshot_id}: {str(e)}")

            return jsonify({
                'message': f'Cleanup completed: {deleted_count} snapshots deleted (older than {days} days)',
                'deleted_count': deleted_count,
                'failed_count': failed_count,
                'days': days,
                'errors': errors if errors else None
            }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@version_control_bp.route('/rollback/<uuid:snapshot_id>', methods=['POST'])
@jwt_required_with_role('admin')
def rollback_to_snapshot(snapshot_id):
    """Rollback database to a specific snapshot"""
    user_id = get_jwt_identity()
    data = request.json or {}
    confirm = data.get('confirm', False)
    selective_tables = data.get('tables', None)  # Optional: restore only specific tables

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

            # Temporarily disable FK constraint checks to handle circular dependencies
            cursor.execute("SET session_replication_role = 'replica'")

            # Determine which tables to restore
            tables_to_restore = selective_tables if selective_tables else SNAPSHOT_TABLES

            # If selective restore, validate table names
            if selective_tables:
                invalid_tables = [t for t in selective_tables if t not in SNAPSHOT_TABLES]
                if invalid_tables:
                    return jsonify({'error': f'Invalid table names: {", ".join(invalid_tables)}'}), 400

            # Perform rollback for each table in correct order (parent tables first)
            for table in SNAPSHOT_TABLES:
                # Skip if selective restore and table not selected
                if selective_tables and table not in selective_tables:
                    continue

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
                        # Build placeholders with proper type casting for UUID arrays
                        placeholders = []
                        uuid_array_cols = UUID_ARRAY_COLUMNS.get(table, [])

                        for i, col in enumerate(columns):
                            if col in uuid_array_cols:
                                # Cast text array to uuid array
                                placeholders.append(f'%s::uuid[]')
                            else:
                                placeholders.append('%s')

                        placeholders_str = ', '.join(placeholders)
                        cols_str = ', '.join(columns)

                        # Prepare values - snapshot data from row_to_json needs proper handling
                        values = []
                        for col in columns:
                            val = record.get(col)
                            # For dict values (JSONB columns), use psycopg2's Json adapter
                            if isinstance(val, dict):
                                values.append(Json(val))
                            # For list values, check if it looks like a UUID array or JSONB array
                            elif isinstance(val, list):
                                # If list is empty, keep as list (will be empty array in DB)
                                # If list contains dicts, treat as JSONB
                                # Otherwise keep as list (for UUID arrays, text arrays, etc.)
                                if val and len(val) > 0 and isinstance(val[0], dict):
                                    values.append(Json(val))
                                else:
                                    # For UUID arrays, we'll cast in SQL (see placeholders above)
                                    values.append(val)
                            else:
                                values.append(val)

                        if table in SOFT_DELETE_TABLES:
                            # For soft-delete tables, restore with deleted_at = NULL
                            update_set = ', '.join([f"{col} = EXCLUDED.{col}" for col in columns if col not in ('id', 'updated_at')])
                            if table in TABLES_WITHOUT_UPDATED_AT:
                                cursor.execute(f"""
                                    INSERT INTO {table} ({cols_str})
                                    VALUES ({placeholders_str})
                                    ON CONFLICT (id) DO UPDATE SET
                                        {update_set},
                                        deleted_at = NULL
                                """, values)
                            else:
                                cursor.execute(f"""
                                    INSERT INTO {table} ({cols_str})
                                    VALUES ({placeholders_str})
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
                                    VALUES ({placeholders_str})
                                    ON CONFLICT (id) DO UPDATE SET
                                        {update_set}
                                """, values)
                            else:
                                cursor.execute(f"""
                                    INSERT INTO {table} ({cols_str})
                                    VALUES ({placeholders_str})
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

            # Re-enable FK constraint checks
            cursor.execute("SET session_replication_role = 'origin'")

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
        # Re-enable FK constraints in case of error
        try:
            with get_db_cursor() as cursor:
                cursor.execute("SET session_replication_role = 'origin'")
        except:
            pass

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
    """Manually sync a snapshot to Google Drive - Feature not configured"""
    return jsonify({
        'error': 'Google Drive sync not configured',
        'message': 'Google Drive integration has been disabled'
    }), 501

@version_control_bp.route('/drive/sync-all', methods=['POST'])
@jwt_required_with_role(['admin'])
def sync_all_to_drive():
    """Sync all recent snapshots to Google Drive - Feature not configured"""
    return jsonify({
        'error': 'Google Drive sync not configured',
        'message': 'Google Drive integration has been disabled'
    }), 501

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
        return jsonify({
            'error': 'Google Drive sync not configured',
            'message': 'Google Drive integration has been disabled'
        }), 501

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@version_control_bp.route('/snapshots/local', methods=['GET'])
@jwt_required_with_role(['admin'])
def list_local_snapshots():
    """List all snapshots available in local storage"""
    try:
        local_snapshots = snapshot_storage.list_snapshots()
        return jsonify({
            'snapshots': local_snapshots,
            'storage_path': str(snapshot_storage.storage_path),
            'total_count': len(local_snapshots)
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@version_control_bp.route('/snapshots/<snapshot_id>/download', methods=['GET'])
@jwt_required_with_role(['admin'])
def download_snapshot(snapshot_id):
    """Download a snapshot as zip or tar.gz file"""
    try:
        import tarfile

        current_app.logger.info(f"Download request for snapshot {snapshot_id}")

        # Get format from query parameter (default: zip)
        format_type = request.args.get('format', 'zip')
        current_app.logger.info(f"Format requested: {format_type}")
        if format_type not in ['zip', 'tar.gz']:
            return jsonify({'error': 'Invalid format. Use zip or tar.gz'}), 400

        # Get storage_path from database
        snapshot_info = execute_query(
            'SELECT storage_path FROM database_snapshots WHERE id = %s',
            (snapshot_id,)
        )
        if not snapshot_info:
            current_app.logger.error(f"Snapshot {snapshot_id} not found in database")
            return jsonify({'error': 'Snapshot not found in database'}), 404

        storage_base = Path(snapshot_info[0].get('storage_path') or snapshot_storage.storage_path)
        snapshot_dir = storage_base / snapshot_id
        current_app.logger.info(f"Storage base: {storage_base}")
        current_app.logger.info(f"Snapshot dir: {snapshot_dir}")
        current_app.logger.info(f"Snapshot dir exists: {snapshot_dir.exists()}")

        if not snapshot_dir.exists():
            current_app.logger.error(f"Snapshot directory not found: {snapshot_dir}")
            return jsonify({
                'error': 'Snapshot files not found in storage',
                'expected_path': str(snapshot_dir),
                'storage_base': str(storage_base)
            }), 404

        # Create temporary archive file
        temp_dir = Path(tempfile.mkdtemp())
        current_app.logger.info(f"Temp dir created: {temp_dir}")

        if format_type == 'zip':
            archive_filename = f"snapshot_{snapshot_id}.zip"
            archive_path = temp_dir / archive_filename

            # Use zipfile module for maximum compatibility
            file_count = 0
            with zipfile.ZipFile(str(archive_path), 'w', zipfile.ZIP_DEFLATED) as zipf:
                for file_path in snapshot_dir.rglob('*'):
                    if file_path.is_file():
                        arcname = snapshot_id + '/' + str(file_path.relative_to(snapshot_dir))
                        zipf.write(file_path, arcname)
                        file_count += 1

            current_app.logger.info(f"Created zip with {file_count} files")
            mimetype = 'application/zip'
        else:  # tar.gz
            archive_filename = f"snapshot_{snapshot_id}.tar.gz"
            archive_path = temp_dir / archive_filename

            # Create tar.gz archive
            with tarfile.open(str(archive_path), 'w:gz') as tarf:
                tarf.add(snapshot_dir, arcname=snapshot_id)

            current_app.logger.info(f"Created tar.gz archive")
            mimetype = 'application/gzip'

        # Check archive size
        import os
        archive_size = os.path.getsize(archive_path)
        current_app.logger.info(f"Archive created: {archive_path}")
        current_app.logger.info(f"Archive size: {archive_size} bytes ({archive_size/1024:.2f} KB)")

        if archive_size < 1000:
            current_app.logger.error(f"Archive suspiciously small: {archive_size} bytes")

        return send_file(
            str(archive_path),
            as_attachment=True,
            download_name=archive_filename,
            mimetype=mimetype
        )

    except Exception as e:
        current_app.logger.error(f"Download error: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@version_control_bp.route('/snapshots/<snapshot_id>/export', methods=['POST'])
@jwt_required_with_role(['admin'])
def export_snapshot_to_path(snapshot_id):
    """Export snapshot to external path"""
    try:
        data = request.json
        export_path = data.get('export_path')

        if not export_path:
            return jsonify({'error': 'export_path is required'}), 400

        # Get storage_path and snapshot details from database
        snapshot_info = execute_query(
            'SELECT storage_path, snapshot_name, description, file_size_mb FROM database_snapshots WHERE id = %s',
            (snapshot_id,)
        )
        if not snapshot_info:
            return jsonify({'error': 'Snapshot not found in database'}), 404

        storage_base = Path(snapshot_info[0].get('storage_path') or snapshot_storage.storage_path)
        snapshot_dir = storage_base / snapshot_id

        if not snapshot_dir.exists():
            return jsonify({
                'error': 'Snapshot files not found in storage',
                'expected_path': str(snapshot_dir)
            }), 404

        # Create base export directory if it doesn't exist
        export_base = Path(export_path)
        export_base.mkdir(parents=True, exist_ok=True)

        # Create TarkoInventoryBackups subdirectory
        backup_dir = export_base / 'TarkoInventoryBackups'
        backup_dir.mkdir(parents=True, exist_ok=True)

        # Export to the backup directory (copy from actual storage location)
        final_export_path = backup_dir / snapshot_id

        try:
            if final_export_path.exists():
                shutil.rmtree(final_export_path)
            shutil.copytree(snapshot_dir, final_export_path, dirs_exist_ok=True)

            # Create/update manifest file with snapshot details
            manifest = {
                'snapshot_id': snapshot_id,
                'snapshot_name': snapshot_info[0].get('snapshot_name', snapshot_id),
                'description': snapshot_info[0].get('description', ''),
                'exported_at': datetime.now().isoformat(),
                'source_size_bytes': int(snapshot_info[0].get('file_size_mb', 0) * 1024 * 1024),
                'compressed': False,
                'export_path': str(final_export_path)
            }

            manifest_file = backup_dir / f"{snapshot_id}_manifest.json"
            with open(manifest_file, 'w') as f:
                json.dump(manifest, f, indent=2)

            return jsonify({
                'message': 'Snapshot exported successfully',
                'export_path': str(final_export_path),
                'source_path': str(snapshot_dir)
            }), 200
        except Exception as copy_error:
            current_app.logger.error(f"Copy error: {copy_error}")
            return jsonify({
                'error': f'Failed to copy snapshot: {str(copy_error)}',
                'source': str(snapshot_dir),
                'destination': str(final_export_path)
            }), 500

    except Exception as e:
        current_app.logger.error(f"Export error: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


@version_control_bp.route('/storage/local/stats', methods=['GET'])
@jwt_required_with_role('admin')
def get_local_storage_stats():
    """Get local storage statistics"""
    try:
        snapshots = snapshot_storage.list_snapshots()

        total_size = 0
        for snap in snapshots:
            total_size += snap.get('size_mb', 0)

        actual_path = snapshot_storage.storage_path.resolve()
        current_app.logger.info(f"Storage stats - Path: {actual_path}, Snapshots: {len(snapshots)}, Size: {total_size} MB")

        return jsonify({
            'storage_path': str(actual_path),
            'snapshot_count': len(snapshots),
            'total_size_mb': round(total_size, 2),
            'total_size_gb': round(total_size / 1024, 2)
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@version_control_bp.route('/settings/auto-snapshot', methods=['GET', 'POST'])
@jwt_required_with_role('admin')
def auto_snapshot_settings():
    """Get or update auto-snapshot settings"""
    if request.method == 'GET':
        try:
            with get_db_cursor() as cursor:
                cursor.execute("""
                    SELECT setting_value FROM system_settings
                    WHERE setting_key = 'auto_snapshot_enabled'
                """)
                result = cursor.fetchone()
                enabled = result['setting_value'] == 'true' if result else False

                cursor.execute("""
                    SELECT setting_value FROM system_settings
                    WHERE setting_key = 'auto_snapshot_time'
                """)
                result = cursor.fetchone()
                time = result['setting_value'] if result else '00:00'

                return jsonify({
                    'enabled': enabled,
                    'time': time
                }), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    else:  # POST
        data = request.json or {}
        enabled = data.get('enabled', False)
        time = data.get('time', '00:00')

        try:
            with get_db_cursor() as cursor:
                # Create system_settings table if it doesn't exist
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS system_settings (
                        id SERIAL PRIMARY KEY,
                        setting_key VARCHAR(100) UNIQUE NOT NULL,
                        setting_value TEXT,
                        updated_at TIMESTAMP DEFAULT NOW()
                    )
                """)

                # Update or insert auto_snapshot_enabled
                cursor.execute("""
                    INSERT INTO system_settings (setting_key, setting_value, updated_at)
                    VALUES ('auto_snapshot_enabled', %s, NOW())
                    ON CONFLICT (setting_key)
                    DO UPDATE SET setting_value = %s, updated_at = NOW()
                """, (str(enabled).lower(), str(enabled).lower()))

                # Update or insert auto_snapshot_time
                cursor.execute("""
                    INSERT INTO system_settings (setting_key, setting_value, updated_at)
                    VALUES ('auto_snapshot_time', %s, NOW())
                    ON CONFLICT (setting_key)
                    DO UPDATE SET setting_value = %s, updated_at = NOW()
                """, (time, time))

                return jsonify({
                    'message': 'Auto-snapshot settings updated',
                    'enabled': enabled,
                    'time': time
                }), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500


# ==================== CLOUD STORAGE ROUTES ====================

@version_control_bp.route('/cloud/status', methods=['GET'])
@jwt_required_with_role('admin')
def get_cloud_status():
    """Get cloud storage status and statistics"""
    try:
        from psycopg2.extras import RealDictCursor

        # Always read fresh config from database first
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT provider, bucket_name, is_enabled
                FROM cloud_backup_config
                WHERE is_active = TRUE
                ORDER BY created_at DESC
                LIMIT 1
            """)

            db_config = cursor.fetchone()

        # If database config exists and is enabled, use it
        if db_config and db_config['is_enabled']:
            enabled = True
            provider = db_config['provider']
            bucket_name = db_config['bucket_name']
        else:
            # Fallback to checking environment variables
            import os
            enabled = os.getenv('ENABLE_CLOUD_BACKUP', 'false').lower() == 'true'
            provider = os.getenv('CLOUD_STORAGE_PROVIDER', 'r2').lower() if enabled else None
            bucket_name = (os.getenv('R2_BUCKET_NAME') or os.getenv('S3_BUCKET_NAME')) if enabled else None

        # Try to get stats from cloud_storage object if available
        stats = None
        try:
            from storage.cloud_storage import get_cloud_storage
            cloud_storage = get_cloud_storage()
            if cloud_storage and cloud_storage.enabled:
                stats = cloud_storage.get_storage_stats()
        except Exception as stats_error:
            current_app.logger.warning(f"Could not get cloud storage stats: {stats_error}")

        return jsonify({
            'enabled': enabled,
            'provider': provider,
            'bucket_name': bucket_name,
            'stats': stats
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@version_control_bp.route('/cloud/configure', methods=['POST'])
@jwt_required_with_role('admin')
def configure_cloud_storage():
    """Configure cloud storage credentials (saves to database with encryption)"""
    try:
        from services.encryption_service import get_encryption_service
        from psycopg2.extras import RealDictCursor

        data = request.get_json()
        provider = data.get('provider', 'r2')
        credential_id = data.get('credential_id')  # Use existing credential if provided

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Deactivate all existing configs
            cursor.execute("UPDATE cloud_backup_config SET is_active = FALSE WHERE is_active = TRUE")

            # If credential_id is provided, use those credentials
            if credential_id:
                cursor.execute("""
                    SELECT provider, account_id, access_key_id, secret_access_key,
                           bucket_name, region, endpoint_url
                    FROM cloud_credentials
                    WHERE id = %s AND is_active = TRUE
                """, (credential_id,))

                cred = cursor.fetchone()
                if not cred:
                    return jsonify({'error': 'Credential not found'}), 404

                # Use credentials from cloud_credentials table
                provider = cred['provider']
                account_id = cred['account_id']
                access_key_id = cred['access_key_id']
                encrypted_secret = cred['secret_access_key']  # Already encrypted
                bucket_name = cred['bucket_name']
                region = cred['region']
                endpoint_url = cred['endpoint_url']
            else:
                # Manual entry - prepare and encrypt
                if provider == 'r2':
                    account_id = data.get('r2_account_id', '')
                    access_key_id = data.get('r2_access_key_id', '')
                    secret_access_key = data.get('r2_secret_access_key', '')
                    bucket_name = data.get('r2_bucket_name', 'tarko-inventory-backups')
                    region = None
                    endpoint_url = f"https://{account_id}.r2.cloudflarestorage.com" if account_id else None
                elif provider == 's3':
                    account_id = None
                    access_key_id = data.get('aws_access_key_id', '')
                    secret_access_key = data.get('aws_secret_access_key', '')
                    bucket_name = data.get('s3_bucket_name', 'tarko-inventory-backups')
                    region = data.get('aws_region', 'us-east-1')
                    endpoint_url = None
                else:
                    return jsonify({'error': 'Invalid provider'}), 400

                # Encrypt secret access key
                encryption_service = get_encryption_service()
                encrypted_secret = encryption_service.encrypt(secret_access_key)

            # Insert new config
            cursor.execute("""
                INSERT INTO cloud_backup_config
                (provider, account_id, access_key_id, secret_access_key,
                 bucket_name, region, endpoint_url, is_enabled, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE, TRUE)
            """, (provider, account_id, access_key_id, encrypted_secret,
                  bucket_name, region, endpoint_url))

            conn.commit()

        # Invalidate cache so next request gets fresh config
        from storage.cloud_storage import CloudStorageManager
        CloudStorageManager.invalidate_cache()

        return jsonify({
            'success': True,
            'message': 'Cloud configuration saved and ready to use!',
            'restart_required': False
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@version_control_bp.route('/cloud/snapshots', methods=['GET'])
@jwt_required_with_role('admin')
def list_cloud_snapshots():
    """List all snapshots available in cloud storage"""
    try:
        from storage.cloud_storage import get_cloud_storage
        cloud_storage = get_cloud_storage()
        if not cloud_storage.enabled:
            return jsonify({'error': 'Cloud backup is not enabled'}), 400

        snapshots = cloud_storage.list_cloud_snapshots()
        return jsonify({'snapshots': snapshots}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@version_control_bp.route('/cloud/snapshots/<snapshot_id>/download', methods=['POST'])
@jwt_required_with_role('admin')
def download_cloud_snapshot(snapshot_id):
    """Download snapshot from cloud to local storage and register in database"""
    user_id = get_jwt_identity()

    try:
        from storage.cloud_storage import get_cloud_storage
        cloud_storage = get_cloud_storage()
        current_app.logger.info(f"Starting cloud download for snapshot: {snapshot_id}")

        if not cloud_storage.enabled:
            return jsonify({'error': 'Cloud backup is not enabled'}), 400

        # Check if snapshot already exists in database
        with get_db_cursor() as cursor:
            cursor.execute("SELECT id FROM database_snapshots WHERE id = %s", (snapshot_id,))
            existing_snapshot = cursor.fetchone()

        if existing_snapshot:
            current_app.logger.info(f"Snapshot {snapshot_id} already exists in database")
            return jsonify({
                'message': 'Snapshot already exists locally',
                'snapshot_id': snapshot_id
            }), 200

        # Download to local storage
        local_path = Path(snapshot_storage.storage_path) / snapshot_id

        if not local_path.exists():
            current_app.logger.info(f"Downloading snapshot from cloud...")
            success = cloud_storage.download_snapshot(snapshot_id, local_path)

            if not success:
                current_app.logger.error(f"Failed to download snapshot {snapshot_id} from cloud")
                return jsonify({'error': 'Failed to download snapshot from cloud'}), 500
            current_app.logger.info(f"Successfully downloaded snapshot to {local_path}")
        else:
            current_app.logger.info(f"Snapshot files already exist locally")

        # Read metadata
        metadata_file = local_path / 'metadata.json'
        if not metadata_file.exists():
            return jsonify({'error': 'Invalid snapshot - metadata.json not found'}), 400

        with open(metadata_file, 'r') as f:
            metadata = json.load(f)

        # Load all table data from JSON files
        snapshot_data = {}
        table_counts = {}
        total_size = 0

        for table in SNAPSHOT_TABLES:
            table_file = local_path / f"{table}.json"
            if table_file.exists():
                with open(table_file, 'r') as f:
                    table_data = json.load(f)
                    snapshot_data[table] = table_data
                    table_counts[table] = len(table_data)
                    total_size += table_file.stat().st_size

        # Register in database_snapshots table
        with get_db_cursor() as cursor:
            cursor.execute("""
                INSERT INTO database_snapshots (
                    id, snapshot_name, description, snapshot_data, table_counts,
                    created_by, created_at, file_size_mb, storage_path
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
            """, (
                snapshot_id,
                metadata.get('snapshot_name', f'Cloud Snapshot {snapshot_id[:8]}'),
                metadata.get('description', 'Downloaded from cloud storage'),
                Json(snapshot_data),
                Json(table_counts),
                user_id,
                metadata.get('created_at', 'NOW()'),
                round(total_size / (1024 * 1024), 2),
                str(snapshot_storage.storage_path)
            ))

        current_app.logger.info(f"Snapshot {snapshot_id} downloaded and registered in database")

        return jsonify({
            'message': 'Snapshot downloaded from cloud successfully',
            'snapshot_id': snapshot_id,
            'local_path': str(local_path)
        }), 200

    except Exception as e:
        current_app.logger.error(f"Cloud download failed for snapshot {snapshot_id}: {str(e)}")
        current_app.logger.error(f"Full traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


@version_control_bp.route('/cloud/snapshots/<snapshot_id>/restore', methods=['POST'])
@jwt_required_with_role('admin')
def restore_from_cloud(snapshot_id):
    """Download snapshot from cloud, register in database, and restore"""
    user_id = get_jwt_identity()

    try:
        from storage.cloud_storage import get_cloud_storage
        cloud_storage = get_cloud_storage()
        current_app.logger.info(f"Starting cloud restore for snapshot: {snapshot_id}")

        if not cloud_storage.enabled:
            current_app.logger.error("Cloud backup is not enabled")
            return jsonify({'error': 'Cloud backup is not enabled'}), 400

        # Check if snapshot already exists in database
        with get_db_cursor() as cursor:
            cursor.execute("SELECT id FROM database_snapshots WHERE id = %s", (snapshot_id,))
            existing_snapshot = cursor.fetchone()

        if existing_snapshot:
            current_app.logger.info(f"Snapshot {snapshot_id} already in database, proceeding to rollback")
            # Snapshot already imported, just rollback to it
            # We'll use an internal call pattern - create the request context
            from flask import request as flask_request

            with get_db_cursor() as cursor:
                cursor.execute("""
                    SELECT snapshot_name, snapshot_data, table_counts
                    FROM database_snapshots
                    WHERE id = %s
                """, (snapshot_id,))
                snapshot = cursor.fetchone()

                if not snapshot:
                    return jsonify({'error': 'Snapshot not found in database'}), 404

            # Perform the rollback (reusing the standard logic)
            # For now, return success and let frontend call rollback
            return jsonify({
                'message': 'Snapshot ready for restore',
                'snapshot_id': snapshot_id,
                'needs_rollback': True
            }), 200

        # Download snapshot from cloud to local storage
        local_path = Path(snapshot_storage.storage_path) / snapshot_id

        current_app.logger.info(f"Downloading snapshot to: {local_path}")

        if not local_path.exists():
            current_app.logger.info(f"Downloading snapshot from cloud...")
            download_success = cloud_storage.download_snapshot(snapshot_id, local_path)
            if not download_success:
                current_app.logger.error(f"Failed to download snapshot {snapshot_id} from cloud")
                return jsonify({'error': 'Failed to download snapshot from cloud'}), 500
            current_app.logger.info(f"Successfully downloaded snapshot to {local_path}")
        else:
            current_app.logger.info(f"Snapshot files already exist locally")

        # Read metadata
        metadata_file = local_path / 'metadata.json'
        if not metadata_file.exists():
            return jsonify({'error': 'Invalid snapshot - metadata.json not found'}), 400

        with open(metadata_file, 'r') as f:
            metadata = json.load(f)

        # Load all table data from JSON files
        snapshot_data = {}
        table_counts = {}
        total_size = 0

        for table in SNAPSHOT_TABLES:
            table_file = local_path / f"{table}.json"
            if table_file.exists():
                with open(table_file, 'r') as f:
                    table_data = json.load(f)
                    snapshot_data[table] = table_data
                    table_counts[table] = len(table_data)
                    total_size += table_file.stat().st_size

        # Register in database_snapshots table
        with get_db_cursor() as cursor:
            cursor.execute("""
                INSERT INTO database_snapshots (
                    id, snapshot_name, description, snapshot_data, table_counts,
                    created_by, created_at, file_size_mb, storage_path
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
            """, (
                snapshot_id,
                metadata.get('snapshot_name', f'Cloud Snapshot {snapshot_id[:8]}'),
                metadata.get('description', 'Downloaded from cloud storage'),
                Json(snapshot_data),
                Json(table_counts),
                user_id,
                metadata.get('created_at', 'NOW()'),
                round(total_size / (1024 * 1024), 2),
                str(snapshot_storage.storage_path)
            ))

        current_app.logger.info(f"Snapshot {snapshot_id} downloaded and registered in database")

        return jsonify({
            'message': 'Snapshot downloaded from cloud and ready for restore',
            'snapshot_id': snapshot_id,
            'needs_rollback': True
        }), 200

    except Exception as e:
        current_app.logger.error(f"Cloud restore failed for snapshot {snapshot_id}: {str(e)}")
        current_app.logger.error(f"Full traceback: {traceback.format_exc()}")
        return jsonify({
            'error': f'Failed to restore from cloud: {str(e)}'
        }), 500


@version_control_bp.route('/cloud/snapshots/<snapshot_id>/upload', methods=['POST'])
@jwt_required_with_role('admin')
def upload_to_cloud(snapshot_id):
    """Manually upload local snapshot to cloud"""
    try:
        from storage.cloud_storage import get_cloud_storage
        cloud_storage = get_cloud_storage()
        if not cloud_storage.enabled:
            return jsonify({'error': 'Cloud backup is not enabled'}), 400

        local_path = Path(snapshot_storage.storage_path) / snapshot_id

        if not local_path.exists():
            return jsonify({'error': 'Snapshot not found locally'}), 404

        success = cloud_storage.upload_snapshot(snapshot_id, local_path, encrypt=True)

        if success:
            return jsonify({
                'message': 'Snapshot uploaded to cloud successfully',
                'snapshot_id': snapshot_id
            }), 200
        else:
            return jsonify({'error': 'Failed to upload snapshot to cloud'}), 500

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@version_control_bp.route('/cloud/snapshots/<snapshot_id>', methods=['DELETE'])
@jwt_required_with_role('admin')
def delete_cloud_snapshot(snapshot_id):
    """Delete snapshot from cloud storage"""
    try:
        from storage.cloud_storage import get_cloud_storage
        cloud_storage = get_cloud_storage()
        if not cloud_storage.enabled:
            return jsonify({'error': 'Cloud backup is not enabled'}), 400

        success = cloud_storage.delete_cloud_snapshot(snapshot_id)

        if success:
            return jsonify({
                'message': 'Snapshot deleted from cloud successfully',
                'snapshot_id': snapshot_id
            }), 200
        else:
            return jsonify({'error': 'Failed to delete snapshot from cloud'}), 500

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@version_control_bp.route('/cloud/snapshots/bulk-delete', methods=['POST'])
@jwt_required_with_role('admin')
def bulk_delete_cloud_snapshots():
    """Delete multiple snapshots from cloud at once"""
    data = request.json or {}
    snapshot_ids = data.get('snapshot_ids', [])

    if not snapshot_ids:
        return jsonify({'error': 'No snapshot IDs provided'}), 400

    try:
        from storage.cloud_storage import get_cloud_storage
        cloud_storage = get_cloud_storage()
        if not cloud_storage.enabled:
            return jsonify({'error': 'Cloud backup is not enabled'}), 400

        deleted_count = 0
        failed_count = 0
        errors = []

        for snapshot_id in snapshot_ids:
            try:
                success = cloud_storage.delete_cloud_snapshot(snapshot_id)
                if success:
                    deleted_count += 1
                else:
                    failed_count += 1
                    errors.append(f"Failed to delete {snapshot_id} from cloud")
            except Exception as e:
                failed_count += 1
                errors.append(f"Error deleting {snapshot_id}: {str(e)}")
                current_app.logger.error(f"Error deleting cloud snapshot {snapshot_id}: {str(e)}")

        return jsonify({
            'message': f'Bulk delete completed: {deleted_count} deleted, {failed_count} failed',
            'deleted_count': deleted_count,
            'failed_count': failed_count,
            'errors': errors if errors else None
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@version_control_bp.route('/cloud/snapshots/cleanup-old', methods=['POST'])
@jwt_required_with_role('admin')
def cleanup_old_cloud_snapshots():
    """Delete cloud snapshots older than specified days"""
    data = request.json or {}
    days = data.get('days', 7)  # Default to 7 days

    try:
        from storage.cloud_storage import get_cloud_storage
        cloud_storage = get_cloud_storage()
        if not cloud_storage.enabled:
            return jsonify({'error': 'Cloud backup is not enabled'}), 400

        # List all cloud snapshots
        snapshots = cloud_storage.list_cloud_snapshots()

        # Filter snapshots older than specified days
        from datetime import datetime, timedelta
        cutoff_date = datetime.now() - timedelta(days=days)

        old_snapshots = []
        for snapshot in snapshots:
            try:
                uploaded_at = datetime.fromisoformat(snapshot.get('uploaded_at', '').replace('Z', '+00:00'))
                if uploaded_at < cutoff_date:
                    old_snapshots.append(snapshot)
            except Exception as e:
                current_app.logger.error(f"Error parsing date for snapshot {snapshot.get('id')}: {str(e)}")

        if not old_snapshots:
            return jsonify({
                'message': f'No cloud snapshots older than {days} days found',
                'deleted_count': 0
            }), 200

        deleted_count = 0
        failed_count = 0
        errors = []

        for snapshot in old_snapshots:
            try:
                snapshot_id = snapshot['id']
                success = cloud_storage.delete_cloud_snapshot(snapshot_id)
                if success:
                    deleted_count += 1
                else:
                    failed_count += 1
                    errors.append(f"Failed to delete {snapshot_id}")
            except Exception as e:
                failed_count += 1
                errors.append(f"Error deleting {snapshot_id}: {str(e)}")
                current_app.logger.error(f"Error deleting cloud snapshot {snapshot_id}: {str(e)}")

        return jsonify({
            'message': f'Cleanup completed: {deleted_count} cloud snapshots deleted (older than {days} days)',
            'deleted_count': deleted_count,
            'failed_count': failed_count,
            'days': days,
            'errors': errors if errors else None
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ==================== EXTERNAL STORAGE ROUTES ====================

@version_control_bp.route('/external/devices', methods=['GET'])
@jwt_required_with_role('admin')
def detect_external_devices():
    """Detect available external storage devices"""
    try:
        devices = external_storage.detect_external_devices()
        return jsonify({'devices': devices}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@version_control_bp.route('/external/export', methods=['POST'])
@jwt_required_with_role('admin')
def export_to_external():
    """Export snapshot to external storage device"""
    try:
        data = request.get_json()
        snapshot_id = data.get('snapshot_id')
        destination_path = data.get('destination_path')
        compress = data.get('compress', True)

        if not snapshot_id or not destination_path:
            return jsonify({'error': 'snapshot_id and destination_path are required'}), 400

        # Get local snapshot path
        local_path = Path(snapshot_storage.storage_path) / snapshot_id

        if not local_path.exists():
            current_app.logger.error(f"Snapshot directory not found: {local_path}")
            return jsonify({
                'error': f'Snapshot files not found on disk. The snapshot may have been deleted or not properly saved.',
                'snapshot_id': snapshot_id,
                'expected_path': str(local_path)
            }), 404

        current_app.logger.info(f"Exporting snapshot {snapshot_id} from {local_path} to {destination_path}")

        success, error = external_storage.export_snapshot(
            snapshot_id,
            local_path,
            destination_path,
            compress=compress
        )

        if success:
            return jsonify({
                'message': 'Snapshot exported to external storage successfully',
                'snapshot_id': snapshot_id,
                'destination': destination_path
            }), 200
        else:
            current_app.logger.error(f"Export failed: {error}")
            return jsonify({'error': error or 'Failed to export snapshot'}), 500

    except Exception as e:
        current_app.logger.error(f"Export error: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


@version_control_bp.route('/external/import', methods=['POST'])
@jwt_required_with_role('admin')
def import_from_external():
    """Import snapshot from external storage device and register in database"""
    user_id = get_jwt_identity()
    try:
        data = request.get_json()
        source_path = data.get('source_path')

        if not source_path:
            return jsonify({'error': 'source_path is required'}), 400

        source_path = Path(source_path)
        if not source_path.exists():
            return jsonify({'error': f'Source path does not exist: {source_path}'}), 400

        # Read metadata
        metadata_file = source_path / 'metadata.json'
        if not metadata_file.exists():
            return jsonify({'error': 'Invalid snapshot - metadata.json not found'}), 400

        with open(metadata_file, 'r') as f:
            metadata = json.load(f)

        snapshot_id = metadata.get('id') or source_path.name

        # Check if snapshot already exists in database
        with get_db_cursor() as cursor:
            cursor.execute("SELECT id FROM database_snapshots WHERE id = %s", (snapshot_id,))
            existing_snapshot = cursor.fetchone()

        if existing_snapshot:
            # Snapshot already imported, just return success so rollback can proceed
            current_app.logger.info(f"Snapshot {snapshot_id} already exists, skipping import")
            return jsonify({
                'message': 'Snapshot already exists in local storage',
                'snapshot_id': snapshot_id,
                'already_exists': True
            }), 200

        # Copy snapshot files to local storage
        destination_path = snapshot_storage.storage_path / snapshot_id

        if destination_path.exists():
            # Files exist but not in database - this shouldn't happen, but handle it
            current_app.logger.warning(f"Snapshot files exist but not in database: {snapshot_id}")
            # Continue to register in database

        if not destination_path.exists():
            shutil.copytree(source_path, destination_path)
            current_app.logger.info(f"Copied snapshot files to {destination_path}")

        # Load all table data from JSON files
        snapshot_data = {}
        table_counts = {}
        total_size = 0

        for table in SNAPSHOT_TABLES:
            table_file = destination_path / f"{table}.json"
            if table_file.exists():
                with open(table_file, 'r') as f:
                    table_data = json.load(f)
                    snapshot_data[table] = table_data
                    table_counts[table] = len(table_data)
                    total_size += table_file.stat().st_size

        # Register in database_snapshots table
        with get_db_cursor() as cursor:
            cursor.execute("""
                INSERT INTO database_snapshots (
                    id, snapshot_name, description, snapshot_data, table_counts,
                    created_by, created_at, file_size_mb, storage_path
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
            """, (
                snapshot_id,
                metadata.get('snapshot_name', f'Imported {snapshot_id[:8]}'),
                metadata.get('description', 'Imported from external storage'),
                Json(snapshot_data),
                Json(table_counts),
                user_id,
                metadata.get('created_at', 'NOW()'),
                round(total_size / (1024 * 1024), 2),
                str(snapshot_storage.storage_path)
            ))

        return jsonify({
            'message': 'Snapshot imported and registered successfully',
            'snapshot_id': snapshot_id
        }), 200

    except Exception as e:
        current_app.logger.error(f"Import error: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


@version_control_bp.route('/snapshots/upload', methods=['POST'])
@jwt_required_with_role(['admin'])
def upload_snapshot():
    """Upload a snapshot archive file (zip or tar.gz) and import it"""
    try:
        import tarfile

        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Determine file type
        filename = file.filename.lower()
        is_zip = filename.endswith('.zip')
        is_tar = filename.endswith(('.tar.gz', '.tar', '.tgz'))

        if not (is_zip or is_tar):
            return jsonify({'error': 'Invalid file format. Please upload .zip, .tar.gz, .tar, or .tgz file'}), 400

        # Create temporary directory for extraction
        temp_dir = Path(tempfile.mkdtemp())

        try:
            # Save uploaded file
            upload_path = temp_dir / file.filename
            file.save(str(upload_path))

            # Extract archive
            extract_dir = temp_dir / 'extracted'
            extract_dir.mkdir()

            if is_zip:
                with zipfile.ZipFile(str(upload_path), 'r') as zipf:
                    zipf.extractall(str(extract_dir))
            else:  # tar format
                with tarfile.open(str(upload_path), 'r:*') as tarf:
                    tarf.extractall(str(extract_dir))

            # Find the snapshot directory
            extracted_dirs = [d for d in extract_dir.iterdir() if d.is_dir()]
            if not extracted_dirs:
                return jsonify({'error': 'Invalid snapshot file - no directory found'}), 400

            snapshot_dir = extracted_dirs[0]

            # Verify it has metadata.json
            metadata_file = snapshot_dir / 'metadata.json'
            if not metadata_file.exists():
                return jsonify({'error': 'Invalid snapshot file - no metadata.json found'}), 400

            # Read metadata to get snapshot ID
            with open(metadata_file, 'r') as f:
                metadata = json.load(f)

            snapshot_id = metadata.get('id') or snapshot_dir.name
            user_id = get_jwt_identity()

            # Check if already exists in database
            with get_db_cursor() as cursor:
                cursor.execute("SELECT id FROM database_snapshots WHERE id = %s", (snapshot_id,))
                existing = cursor.fetchone()

            if existing:
                return jsonify({
                    'message': 'Snapshot already exists in database',
                    'snapshot_id': snapshot_id,
                    'already_exists': True
                }), 200

            # Copy to snapshots directory
            destination = snapshot_storage.storage_path / snapshot_id
            if not destination.exists():
                shutil.copytree(snapshot_dir, destination)

            # Load all table data and register in database
            snapshot_data = {}
            table_counts = {}
            total_size = 0

            for table in SNAPSHOT_TABLES:
                table_file = destination / f"{table}.json"
                if table_file.exists():
                    with open(table_file, 'r') as f:
                        table_data = json.load(f)
                        snapshot_data[table] = table_data
                        table_counts[table] = len(table_data)
                        total_size += table_file.stat().st_size

            # Register in database
            with get_db_cursor() as cursor:
                cursor.execute("""
                    INSERT INTO database_snapshots (
                        id, snapshot_name, description, snapshot_data, table_counts,
                        created_by, created_at, file_size_mb, storage_path
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                """, (
                    snapshot_id,
                    metadata.get('snapshot_name', f'Uploaded {snapshot_id[:8]}'),
                    metadata.get('description', 'Uploaded snapshot'),
                    Json(snapshot_data),
                    Json(table_counts),
                    user_id,
                    metadata.get('created_at', 'NOW()'),
                    round(total_size / (1024 * 1024), 2),
                    str(snapshot_storage.storage_path)
                ))

            return jsonify({
                'message': 'Snapshot uploaded and registered successfully',
                'snapshot_id': snapshot_id
            }), 200

        finally:
            # Cleanup temp directory
            shutil.rmtree(temp_dir, ignore_errors=True)

    except Exception as e:
        current_app.logger.error(f"Upload error: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


@version_control_bp.route('/external/snapshots', methods=['POST'])
@jwt_required_with_role(['admin'])
def list_external_snapshots():
    """List snapshots available on external device"""
    try:
        data = request.get_json()
        device_path = data.get('device_path')

        if not device_path:
            return jsonify({'error': 'device_path is required'}), 400

        # Resolve path and handle trailing slashes
        base_path = Path(device_path).expanduser().resolve()

        current_app.logger.info(f"Checking path: {device_path} -> {base_path}")

        if not base_path.exists():
            current_app.logger.error(f"Path does not exist: {base_path}")
            return jsonify({'error': f'Path does not exist: {device_path}'}), 400

        snapshots = []

        # Look in TarkoInventoryBackups subdirectory first
        backup_dir = base_path / 'TarkoInventoryBackups'

        # Check both TarkoInventoryBackups and base path
        search_paths = []
        if backup_dir.exists():
            search_paths.append(backup_dir)
        search_paths.append(base_path)  # Also check base path

        for search_path in search_paths:
            try:
                if not search_path.exists() or not search_path.is_dir():
                    continue

                # Try to list directory contents
                try:
                    items = list(search_path.iterdir())
                except PermissionError as pe:
                    current_app.logger.warning(f"Permission denied accessing {search_path}: {pe}")
                    continue

                for item in items:
                    try:
                        # Handle both directories and compressed archives
                        is_directory = item.is_dir()
                        is_archive = item.is_file() and (item.suffix == '.gz' and '.tar' in item.name)

                        if not (is_directory or is_archive):
                            continue

                        if is_archive:
                            # Compressed archive - read manifest
                            snapshot_id = item.stem.replace('.tar', '')
                            manifest_file = item.parent / f"{snapshot_id}_manifest.json"

                            if not manifest_file.exists():
                                current_app.logger.warning(f"No manifest for archive {item.name}")
                                continue

                            with open(manifest_file, 'r') as f:
                                manifest = json.load(f)

                            # Avoid duplicates
                            if not any(s['id'] == snapshot_id for s in snapshots):
                                snapshots.append({
                                    'id': snapshot_id,
                                    'exported_at': manifest.get('exported_at', ''),
                                    'size_mb': round(manifest.get('source_size_bytes', 0) / (1024 * 1024), 2),
                                    'snapshot_name': manifest.get('snapshot_name', snapshot_id),
                                    'description': 'Compressed backup',
                                    'location': 'external',
                                    'compressed': True,
                                    'path': str(item)
                                })
                        else:
                            # Uncompressed directory - check for metadata.json
                            metadata_file = item / 'metadata.json'
                            if not metadata_file.exists():
                                continue

                            with open(metadata_file, 'r') as f:
                                metadata = json.load(f)

                            # Calculate size
                            size_bytes = 0
                            try:
                                size_bytes = sum(f.stat().st_size for f in item.rglob('*') if f.is_file())
                            except:
                                size_bytes = 0

                            # Avoid duplicates
                            if not any(s['id'] == item.name for s in snapshots):
                                snapshots.append({
                                    'id': item.name,
                                    'exported_at': metadata.get('created_at', ''),
                                    'size_mb': round(size_bytes / (1024 * 1024), 2) if size_bytes > 0 else 0,
                                    'snapshot_name': metadata.get('snapshot_name', item.name),
                                    'description': metadata.get('description', ''),
                                    'location': 'external',
                                    'compressed': False,
                                    'path': str(item)
                                })
                    except Exception as e:
                        current_app.logger.warning(f"Could not read snapshot {item.name}: {e}")
                        continue
            except Exception as e:
                current_app.logger.warning(f"Error scanning {search_path}: {e}")
                continue

        # Sort by export date
        snapshots.sort(key=lambda x: x.get('exported_at', ''), reverse=True)

        current_app.logger.info(f"Found {len(snapshots)} snapshots in {device_path}")

        return jsonify({
            'snapshots': snapshots,
            'count': len(snapshots),
            'searched_paths': [str(p) for p in search_paths]
        }), 200

    except Exception as e:
        current_app.logger.error(f"List external snapshots error: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


@version_control_bp.route('/external/snapshots/download', methods=['POST'])
@jwt_required_with_role(['admin'])
def download_external_snapshot():
    """Download an external snapshot as zip or tar.gz file"""
    try:
        import tarfile

        data = request.get_json()
        snapshot_path = data.get('snapshot_path')
        format_type = data.get('format', 'zip')

        if not snapshot_path:
            return jsonify({'error': 'snapshot_path is required'}), 400

        if format_type not in ['zip', 'tar.gz']:
            return jsonify({'error': 'Invalid format. Use zip or tar.gz'}), 400

        snapshot_path_obj = Path(snapshot_path)
        if not snapshot_path_obj.exists():
            return jsonify({'error': f'Snapshot not found: {snapshot_path}'}), 404

        # Check if it's already a compressed file
        is_already_compressed = snapshot_path_obj.is_file() and (
            snapshot_path_obj.suffix == '.gz' and '.tar' in snapshot_path_obj.name
        )

        if is_already_compressed:
            # Already compressed - just send it directly
            snapshot_id = snapshot_path_obj.stem.replace('.tar', '')

            # If they want zip but we have tar.gz, or vice versa, just send what we have
            if snapshot_path_obj.name.endswith('.tar.gz'):
                mimetype = 'application/gzip'
                download_name = snapshot_path_obj.name
            else:
                mimetype = 'application/zip'
                download_name = snapshot_path_obj.name

            return send_file(
                str(snapshot_path_obj),
                as_attachment=True,
                download_name=download_name,
                mimetype=mimetype
            )

        # It's a directory - need to compress it
        snapshot_dir = snapshot_path_obj
        if not snapshot_dir.is_dir():
            return jsonify({'error': f'Invalid snapshot path: {snapshot_path}'}), 400

        # Read metadata for filename
        metadata_file = snapshot_dir / 'metadata.json'
        snapshot_id = snapshot_dir.name
        if metadata_file.exists():
            with open(metadata_file, 'r') as f:
                metadata = json.load(f)
                snapshot_id = metadata.get('id', snapshot_dir.name)

        # Create temporary archive
        temp_dir = Path(tempfile.mkdtemp())

        if format_type == 'zip':
            archive_filename = f"snapshot_{snapshot_id}.zip"
            archive_path = temp_dir / archive_filename

            with zipfile.ZipFile(str(archive_path), 'w', zipfile.ZIP_DEFLATED) as zipf:
                for file_path in snapshot_dir.rglob('*'):
                    if file_path.is_file():
                        arcname = snapshot_id + '/' + str(file_path.relative_to(snapshot_dir))
                        zipf.write(file_path, arcname)

            mimetype = 'application/zip'
        else:  # tar.gz
            archive_filename = f"snapshot_{snapshot_id}.tar.gz"
            archive_path = temp_dir / archive_filename

            with tarfile.open(str(archive_path), 'w:gz') as tarf:
                tarf.add(snapshot_dir, arcname=snapshot_id)

            mimetype = 'application/gzip'

        return send_file(
            str(archive_path),
            as_attachment=True,
            download_name=archive_filename,
            mimetype=mimetype
        )

    except Exception as e:
        current_app.logger.error(f"External download error: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


@version_control_bp.route('/external/verify', methods=['POST'])
@jwt_required_with_role('admin')
def verify_external_snapshot():
    """Verify integrity of snapshot on external device"""
    try:
        data = request.get_json()
        snapshot_path = data.get('snapshot_path')

        if not snapshot_path:
            return jsonify({'error': 'snapshot_path is required'}), 400

        valid, error = external_storage.verify_external_snapshot(snapshot_path)

        if valid:
            return jsonify({
                'message': 'Snapshot verified successfully',
                'valid': True
            }), 200
        else:
            return jsonify({
                'message': error or 'Snapshot verification failed',
                'valid': False
            }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@version_control_bp.route('/suggested-paths', methods=['GET'])
@jwt_required_with_role('admin')
def get_suggested_paths():
    """Get suggested backup paths based on user's OS and username"""
    try:
        user_id = get_jwt_identity()

        # Get user details
        from database import execute_query
        user = execute_query(
            "SELECT username, full_name FROM users WHERE id = %s",
            (user_id,)
        )

        username = user[0]['username'] if user else 'user'

        # Get system username and platform
        import platform
        import getpass
        system_user = getpass.getuser()
        system = platform.system()

        suggestions = []

        if system == 'Darwin':  # macOS
            # Downloads folder has access by default on macOS, Documents/Desktop require Full Disk Access
            suggestions = [
                f"/Users/{system_user}/Downloads/tarko-backups",
                f"/Users/{system_user}/Desktop/tarko-backups",
                f"/Users/{system_user}/Documents/tarko-backups"
            ]
        elif system == 'Windows':
            suggestions = [
                f"C:\\Users\\{system_user}\\Documents\\tarko-backups",
                f"C:\\Users\\{system_user}\\Desktop\\tarko-backups",
                f"C:\\Users\\{system_user}\\Downloads\\tarko-backups"
            ]
        elif system == 'Linux':
            suggestions = [
                f"/home/{system_user}/Documents/tarko-backups",
                f"/home/{system_user}/Desktop/tarko-backups",
                f"/home/{system_user}/Downloads/tarko-backups"
            ]

        return jsonify({
            'suggestions': suggestions,
            'system': system,
            'username': system_user
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
