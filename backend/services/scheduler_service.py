"""
Auto-Snapshot Scheduler Service

Provides background scheduling for automatic snapshots based on UI settings.
Uses APScheduler to run jobs in the Flask application context.

Note: In multi-worker environments (e.g., Gunicorn with multiple workers),
this uses a file-based lock to ensure only one worker runs the scheduler.
"""

import logging
import os
import fcntl
from datetime import datetime, timedelta
import pytz
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

# Global scheduler instance
_scheduler = None
_app = None
_lock_file = None
_has_scheduler_lock = False

# Lock file path - use /tmp for Docker containers
SCHEDULER_LOCK_FILE = '/tmp/tarko_scheduler.lock'


def _acquire_scheduler_lock():
    """
    Try to acquire an exclusive lock for the scheduler.
    Returns True if lock acquired, False otherwise.
    Only one process across all workers will succeed.
    """
    global _lock_file, _has_scheduler_lock

    try:
        _lock_file = open(SCHEDULER_LOCK_FILE, 'w')
        fcntl.flock(_lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        _lock_file.write(f"{os.getpid()}\n")
        _lock_file.flush()
        _has_scheduler_lock = True
        logger.info(f"Scheduler lock acquired by PID {os.getpid()}")
        return True
    except (IOError, OSError) as e:
        # Another process has the lock
        if _lock_file:
            _lock_file.close()
            _lock_file = None
        _has_scheduler_lock = False
        logger.info(f"Scheduler lock not acquired (another worker has it): {e}")
        return False


def _release_scheduler_lock():
    """Release the scheduler lock if we hold it."""
    global _lock_file, _has_scheduler_lock

    if _lock_file and _has_scheduler_lock:
        try:
            fcntl.flock(_lock_file.fileno(), fcntl.LOCK_UN)
            _lock_file.close()
            _lock_file = None
            _has_scheduler_lock = False
            # Clean up lock file
            try:
                os.remove(SCHEDULER_LOCK_FILE)
            except OSError:
                pass
            logger.info("Scheduler lock released")
        except Exception as e:
            logger.warning(f"Error releasing scheduler lock: {e}")


def init_scheduler(app):
    """
    Initialize the APScheduler with Flask app context.
    Should be called once during app startup.

    In multi-worker environments, only the worker that acquires
    the lock will actually run the scheduler.
    """
    global _scheduler, _app
    _app = app

    if _scheduler is not None:
        logger.warning("Scheduler already initialized in this process")
        return _scheduler

    # Try to acquire the scheduler lock
    if not _acquire_scheduler_lock():
        logger.info("This worker will not run the scheduler (lock held by another worker)")
        return None

    _scheduler = BackgroundScheduler(
        timezone='Asia/Kolkata',  # IST timezone
        job_defaults={
            'coalesce': True,  # Combine missed runs into one
            'max_instances': 1,  # Only one instance at a time
            'misfire_grace_time': 3600  # Allow 1 hour grace period
        }
    )

    # Start the scheduler
    _scheduler.start()
    logger.info(f"APScheduler started successfully in worker PID {os.getpid()}")

    # Load initial settings and schedule if enabled
    with app.app_context():
        _load_and_schedule_auto_snapshot()
        _load_and_schedule_orphan_cleanup()

    return _scheduler


def get_scheduler():
    """Get the global scheduler instance"""
    return _scheduler


def _load_and_schedule_auto_snapshot():
    """Load settings from database and schedule the auto-snapshot job"""
    from database import get_db_cursor

    try:
        with get_db_cursor() as cursor:
            # Get enabled setting
            cursor.execute("""
                SELECT setting_value FROM system_settings
                WHERE setting_key = 'auto_snapshot_enabled'
            """)
            result = cursor.fetchone()
            enabled = result and result['setting_value'] == 'true'

            if not enabled:
                logger.info("Auto-snapshot is disabled")
                _remove_auto_snapshot_job()
                return

            # Get time setting
            cursor.execute("""
                SELECT setting_value FROM system_settings
                WHERE setting_key = 'auto_snapshot_time'
            """)
            result = cursor.fetchone()
            time_str = result['setting_value'] if result else '02:00'

            # Get interval setting
            cursor.execute("""
                SELECT setting_value FROM system_settings
                WHERE setting_key = 'auto_snapshot_interval'
            """)
            result = cursor.fetchone()
            interval = result['setting_value'] if result else 'daily'

            # Schedule the job
            _schedule_auto_snapshot_job(time_str, interval)

    except Exception as e:
        logger.error(f"Failed to load auto-snapshot settings: {e}")


def _schedule_auto_snapshot_job(time_str: str, interval: str):
    """
    Schedule or reschedule the auto-snapshot job.

    Args:
        time_str: Time in HH:MM format (e.g., "02:00")
        interval: One of "hourly", "daily", "weekly", "monthly"
    """
    global _scheduler

    if _scheduler is None:
        logger.error("Scheduler not initialized")
        return

    # Remove existing job if any
    _remove_auto_snapshot_job()

    try:
        hour, minute = map(int, time_str.split(':'))
    except ValueError:
        hour, minute = 2, 0  # Default to 2:00 AM

    # Create trigger based on interval
    # Support custom formats: "30m" (every 30 mins), "6h" (every 6 hours), "2d" (every 2 days)
    # and legacy formats: "hourly", "daily", "weekly", "monthly"
    if interval.endswith('m') and interval[:-1].isdigit():
        # Custom minutes format: "15m", "30m", etc.
        minutes = int(interval[:-1])
        minutes = max(5, min(59, minutes))  # Clamp between 5-59 minutes (min 5 to avoid overload)
        trigger = IntervalTrigger(minutes=minutes)
        logger.info(f"Using interval trigger: every {minutes} minutes")
    elif interval.endswith('h') and interval[:-1].isdigit():
        # Custom hours format: "6h", "12h", etc.
        hours = int(interval[:-1])
        hours = max(1, min(48, hours))  # Clamp between 1-48 hours
        trigger = IntervalTrigger(hours=hours)
        logger.info(f"Using interval trigger: every {hours} hours")
    elif interval.endswith('d') and interval[:-1].isdigit():
        # Custom days format: "2d", "7d", etc.
        days = int(interval[:-1])
        days = max(1, min(30, days))  # Clamp between 1-30 days
        trigger = IntervalTrigger(days=days)
        logger.info(f"Using interval trigger: every {days} days")
    elif interval == 'hourly':
        trigger = IntervalTrigger(hours=1)
    elif interval == 'weekly':
        trigger = CronTrigger(day_of_week='sun', hour=hour, minute=minute)
    elif interval == 'monthly':
        trigger = CronTrigger(day=1, hour=hour, minute=minute)
    else:  # daily (default)
        trigger = CronTrigger(hour=hour, minute=minute)

    # Add the job
    _scheduler.add_job(
        func=_run_auto_snapshot,
        trigger=trigger,
        id='auto_snapshot',
        name='Automatic Database Snapshot',
        replace_existing=True
    )

    next_run = _scheduler.get_job('auto_snapshot').next_run_time
    logger.info(f"Auto-snapshot scheduled: interval={interval}, time={time_str}, next_run={next_run}")


def _remove_auto_snapshot_job():
    """Remove the auto-snapshot job if it exists"""
    global _scheduler

    if _scheduler is None:
        return

    try:
        _scheduler.remove_job('auto_snapshot')
        logger.info("Auto-snapshot job removed")
    except Exception:
        pass  # Job doesn't exist


def _run_auto_snapshot():
    """Execute the auto-snapshot within Flask app context"""
    global _app

    if _app is None:
        logger.error("Flask app not available for auto-snapshot")
        return

    with _app.app_context():
        try:
            logger.info("Starting scheduled auto-snapshot...")

            from database import get_db_cursor
            import json

            # Import the snapshot creation logic
            from routes.version_control_routes import (
                SNAPSHOT_TABLES, SOFT_DELETE_TABLES, INCLUDE_DELETED_IN_BACKUP,
                snapshot_storage
            )

            with get_db_cursor() as cursor:
                # Get interval for naming
                cursor.execute("""
                    SELECT setting_value FROM system_settings
                    WHERE setting_key = 'auto_snapshot_interval'
                """)
                result = cursor.fetchone()
                interval = result['setting_value'] if result else 'daily'

                snapshot_name = f"Auto-Snapshot ({interval}) - {datetime.now().strftime('%Y-%m-%d %H:%M')}"

                snapshot_data = {}
                table_counts = {}

                # Capture data from each table
                for table in SNAPSHOT_TABLES:
                    # Include deleted records for historical tables
                    if table in INCLUDE_DELETED_IN_BACKUP:
                        where_clause = ""
                    elif table in SOFT_DELETE_TABLES:
                        where_clause = "WHERE deleted_at IS NULL"
                    else:
                        where_clause = ""

                    cursor.execute(f"""
                        SELECT json_agg(row_to_json(t.*)) as data
                        FROM {table} t
                        {where_clause}
                    """)
                    result = cursor.fetchone()
                    table_data = result['data'] if result and result.get('data') else []
                    snapshot_data[table] = table_data
                    table_counts[table] = len(table_data) if table_data else 0

                # Calculate size
                snapshot_json = json.dumps(snapshot_data)
                file_size_mb = len(snapshot_json.encode('utf-8')) / (1024 * 1024)

                # Use the dedicated system user for automated tasks
                # System user UUID is defined in migrations/add_system_seed_data.sql
                SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001'

                # Verify system user exists, fallback to first active user if not
                cursor.execute("""
                    SELECT id FROM users WHERE id = %s AND deleted_at IS NULL
                """, (SYSTEM_USER_ID,))
                system_user = cursor.fetchone()

                if system_user:
                    system_user_id = SYSTEM_USER_ID
                else:
                    # Fallback: get first active user (for backwards compatibility)
                    cursor.execute("""
                        SELECT id FROM users
                        WHERE deleted_at IS NULL AND is_active = true
                        ORDER BY created_at ASC
                        LIMIT 1
                    """)
                    user_result = cursor.fetchone()
                    system_user_id = user_result['id'] if user_result else None

                if not system_user_id:
                    raise Exception("No users found in database for auto-snapshot attribution")

                # Insert snapshot marked as automatic
                cursor.execute("""
                    INSERT INTO database_snapshots (
                        snapshot_name, description, snapshot_data, table_counts,
                        created_by, file_size_mb, is_automatic, tags, storage_path
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, snapshot_name, created_at
                """, (
                    snapshot_name,
                    f'Automatic {interval} backup',
                    '{}',  # Empty JSON - actual data stored in file storage
                    json.dumps(table_counts),
                    system_user_id,  # Use admin/system user for attribution
                    round(file_size_mb, 2),
                    True,
                    ['auto', interval],
                    str(snapshot_storage.storage_path)
                ))

                snapshot = cursor.fetchone()
                snapshot_id = str(snapshot['id'])

                # Save to file storage
                storage_success = snapshot_storage.save_snapshot(
                    snapshot_id=snapshot_id,
                    snapshot_data=snapshot_data,
                    metadata={
                        'snapshot_name': snapshot_name,
                        'table_counts': table_counts,
                        'created_at': snapshot['created_at'].isoformat(),
                        'is_automatic': True
                    }
                )

                logger.info(f"✅ Auto-snapshot created: {snapshot_name} ({file_size_mb:.2f} MB)")

                # Sync to cloud storage if enabled
                if storage_success:
                    try:
                        from storage.cloud_storage import get_cloud_storage
                        from pathlib import Path

                        cloud_storage = get_cloud_storage()
                        if cloud_storage.enabled:
                            logger.info(f"Syncing auto-snapshot {snapshot_id} to cloud...")
                            local_path = Path(snapshot_storage.storage_path) / snapshot_id
                            cloud_storage.upload_snapshot(snapshot_id, local_path, encrypt=True)
                            logger.info(f"✅ Auto-snapshot synced to cloud: {snapshot_id}")
                    except Exception as cloud_error:
                        logger.warning(f"Failed to sync auto-snapshot to cloud: {cloud_error}")
                        # Don't fail the auto-snapshot if cloud sync fails

        except Exception as e:
            logger.error(f"❌ Auto-snapshot failed: {e}", exc_info=True)


def update_auto_snapshot_schedule():
    """
    Called when UI settings change to reschedule the job.
    Should be called from the version_control_routes when settings are updated.
    """
    global _app

    if _app is None or _scheduler is None:
        logger.warning("Scheduler not available for schedule update")
        return

    with _app.app_context():
        _load_and_schedule_auto_snapshot()


def _load_and_schedule_orphan_cleanup():
    """Load settings from database and schedule the orphan cleanup job"""
    from database import get_db_cursor

    try:
        with get_db_cursor() as cursor:
            # Get enabled setting
            cursor.execute("""
                SELECT setting_value FROM system_settings
                WHERE setting_key = 'auto_cleanup_orphans_enabled'
            """)
            result = cursor.fetchone()
            enabled = result and result['setting_value'] == 'true'

            if not enabled:
                logger.info("Auto orphan cleanup is disabled")
                _remove_orphan_cleanup_job()
                return

            # Get interval setting
            cursor.execute("""
                SELECT setting_value FROM system_settings
                WHERE setting_key = 'auto_cleanup_orphans_interval'
            """)
            result = cursor.fetchone()
            interval = result['setting_value'] if result else 'weekly'

            # Schedule the job
            _schedule_orphan_cleanup_job(interval)

    except Exception as e:
        logger.error(f"Failed to load orphan cleanup settings: {e}")


def _schedule_orphan_cleanup_job(interval: str):
    """
    Schedule or reschedule the orphan cleanup job.

    Args:
        interval: One of "hourly", "daily", "weekly", "monthly", or custom formats like "6h", "2d"
    """
    global _scheduler

    if _scheduler is None:
        logger.error("Scheduler not initialized")
        return

    # Remove existing job if any
    _remove_orphan_cleanup_job()

    # Create trigger based on interval
    if interval == 'hourly':
        trigger = IntervalTrigger(hours=1)
    elif interval == 'daily':
        trigger = IntervalTrigger(hours=24)
    elif interval == 'weekly':
        trigger = CronTrigger(day_of_week='sun', hour=3, minute=0)  # Sunday at 3 AM
    elif interval == 'monthly':
        trigger = CronTrigger(day=1, hour=3, minute=0)  # 1st of month at 3 AM
    elif interval.endswith('m') and interval[:-1].isdigit():
        # Custom minutes format: "15m", "30m", etc.
        minutes = int(interval[:-1])
        minutes = max(5, min(59, minutes))  # Clamp between 5-59 minutes
        trigger = IntervalTrigger(minutes=minutes)
    elif interval.endswith('h') and interval[:-1].isdigit():
        # Custom hours format: "6h", "12h", etc.
        hours = int(interval[:-1])
        hours = max(1, min(48, hours))  # Clamp between 1-48 hours
        trigger = IntervalTrigger(hours=hours)
    elif interval.endswith('d') and interval[:-1].isdigit():
        # Custom days format: "2d", "7d", etc.
        days = int(interval[:-1])
        days = max(1, min(30, days))  # Clamp between 1-30 days
        trigger = IntervalTrigger(days=days)
    else:  # default to weekly
        trigger = CronTrigger(day_of_week='sun', hour=3, minute=0)

    # Add the job
    _scheduler.add_job(
        func=_run_orphan_cleanup,
        trigger=trigger,
        id='orphan_cleanup',
        name='Automatic Orphan Stock Cleanup',
        replace_existing=True
    )

    next_run = _scheduler.get_job('orphan_cleanup').next_run_time
    logger.info(f"Orphan cleanup scheduled: interval={interval}, next_run={next_run}")


def _remove_orphan_cleanup_job():
    """Remove the orphan cleanup job if it exists"""
    global _scheduler

    if _scheduler is None:
        return

    try:
        _scheduler.remove_job('orphan_cleanup')
        logger.info("Orphan cleanup job removed")
    except Exception:
        pass  # Job doesn't exist


def _run_orphan_cleanup():
    """Execute orphan cleanup within Flask app context"""
    global _app

    if _app is None:
        logger.error("Flask app not available for orphan cleanup")
        return

    with _app.app_context():
        try:
            logger.info("Starting scheduled orphan cleanup...")

            from database import get_db_cursor
            import uuid

            with get_db_cursor() as cursor:
                # Find orphaned rows
                cursor.execute("""
                    SELECT ist.id, ist.batch_id, ist.stock_type
                    FROM inventory_stock ist
                    JOIN batches b ON ist.batch_id = b.id
                    WHERE ist.quantity > 0
                    AND COALESCE(ist.status, 'IN_STOCK') = 'SOLD_OUT'
                    AND ist.deleted_at IS NULL
                    AND b.deleted_at IS NULL
                """)

                orphans = cursor.fetchall()

                if not orphans:
                    logger.info("✅ Orphan cleanup: No orphaned stock found")
                    return

                orphan_ids = [row['id'] for row in orphans]
                logger.info(f"Found {len(orphan_ids)} orphaned stock rows to clean up")

                # Cascade: soft-delete all child pieces
                cursor.execute("""
                    UPDATE hdpe_cut_pieces
                    SET deleted_at = NOW(), updated_at = NOW()
                    WHERE stock_id = ANY(%s::uuid[]) AND deleted_at IS NULL
                """, (orphan_ids,))
                cut_pieces_deleted = cursor.rowcount

                cursor.execute("""
                    UPDATE sprinkler_spare_pieces
                    SET deleted_at = NOW(), updated_at = NOW()
                    WHERE stock_id = ANY(%s::uuid[]) AND deleted_at IS NULL
                """, (orphan_ids,))
                spare_pieces_deleted = cursor.rowcount

                # Soft-delete the orphaned stock rows
                cursor.execute("""
                    UPDATE inventory_stock
                    SET deleted_at = NOW(), updated_at = NOW()
                    WHERE id = ANY(%s::uuid[])
                """, (orphan_ids,))
                stock_deleted = cursor.rowcount

                # Audit log (use system user)
                SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001'
                cursor.execute("""
                    INSERT INTO audit_logs (id, user_id, action, table_name, record_id, old_values, new_values, created_at)
                    VALUES (%s, %s, 'AUTO_CLEANUP_ORPHANED_STOCK', 'inventory_stock',
                            array_to_string(%s::uuid[], ','),
                            'status=SOLD_OUT deleted_at=NULL',
                            'deleted_at=NOW()',
                            NOW())
                """, (str(uuid.uuid4()), SYSTEM_USER_ID, orphan_ids))

                cursor.connection.commit()

                logger.info(f"✅ Orphan cleanup completed: {stock_deleted} orphaned rows + {cut_pieces_deleted + spare_pieces_deleted} child pieces deleted")

        except Exception as e:
            logger.error(f"❌ Orphan cleanup failed: {e}", exc_info=True)


def update_orphan_cleanup_schedule():
    """
    Called when UI settings change to reschedule the orphan cleanup job.
    Should be called from the version_control_routes when settings are updated.
    """
    global _app

    if _app is None or _scheduler is None:
        logger.warning("Scheduler not available for orphan cleanup update")
        return

    with _app.app_context():
        _load_and_schedule_orphan_cleanup()


def shutdown_scheduler():
    """Shutdown the scheduler gracefully and release the lock"""
    global _scheduler, _has_scheduler_lock

    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler shutdown complete")
        _scheduler = None

    # Release the scheduler lock
    if _has_scheduler_lock:
        _release_scheduler_lock()


def _get_scheduler_settings():
    """Get scheduler settings from database without app context"""
    try:
        from database import get_db_cursor
        with get_db_cursor() as cursor:
            # Get enabled setting
            cursor.execute("""
                SELECT setting_value FROM system_settings
                WHERE setting_key = 'auto_snapshot_enabled'
            """)
            enabled_result = cursor.fetchone()
            enabled = enabled_result and enabled_result['setting_value'] == 'true'

            # Get time setting
            cursor.execute("""
                SELECT setting_value FROM system_settings
                WHERE setting_key = 'auto_snapshot_time'
            """)
            time_result = cursor.fetchone()
            time_str = time_result['setting_value'] if time_result else '02:00'

            # Get interval setting
            cursor.execute("""
                SELECT setting_value FROM system_settings
                WHERE setting_key = 'auto_snapshot_interval'
            """)
            interval_result = cursor.fetchone()
            interval = interval_result['setting_value'] if interval_result else 'daily'

            return enabled, time_str, interval
    except Exception as e:
        logger.warning(f"Could not load scheduler settings: {e}")
        return False, '02:00', 'daily'


def get_next_run_time():
    """
    Get the next scheduled run time for auto-snapshot.

    This is calculated deterministically based on the scheduled settings
    and current time, NOT from APScheduler's dynamic calculation.
    This ensures the next run time doesn't shift when the server restarts.
    """
    try:
        enabled, time_str, interval = _get_scheduler_settings()

        if not enabled:
            return None

        # Parse the scheduled time
        try:
            hour, minute = map(int, time_str.split(':'))
        except ValueError:
            hour, minute = 2, 0

        # Use IST timezone as configured in scheduler
        tz = pytz.timezone('Asia/Kolkata')
        now = datetime.now(tz)

        # Calculate next run based on interval type
        if interval == 'hourly':
            # Next run is in 1 hour from now
            next_run = now + timedelta(hours=1)

        elif interval == 'daily':
            # Next run is at scheduled time (hour:minute) today or tomorrow
            next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if next_run <= now:
                # Scheduled time has passed today, schedule for tomorrow
                next_run += timedelta(days=1)

        elif interval == 'weekly':
            # Next run is on Sunday at scheduled time
            days_until_sunday = (6 - now.weekday()) % 7  # 0=Mon, 6=Sun
            next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            next_run += timedelta(days=days_until_sunday)
            if next_run <= now:
                # If we're already past that time on Sunday, schedule for next Sunday
                next_run += timedelta(days=7)

        elif interval == 'monthly':
            # Next run is on the 1st of the month at scheduled time
            next_run = now.replace(day=1, hour=hour, minute=minute, second=0, microsecond=0)
            if next_run <= now:
                # If we're already past that time on the 1st, schedule for next month
                if now.month == 12:
                    next_run = next_run.replace(year=now.year + 1, month=1)
                else:
                    next_run = next_run.replace(month=now.month + 1)

        elif interval.endswith('m') and interval[:-1].isdigit():
            # Custom minutes: next run is interval minutes from now
            minutes = int(interval[:-1])
            minutes = max(5, min(59, minutes))
            next_run = now + timedelta(minutes=minutes)

        elif interval.endswith('h') and interval[:-1].isdigit():
            # Custom hours: next run is interval hours from now
            hours = int(interval[:-1])
            hours = max(1, min(48, hours))
            next_run = now + timedelta(hours=hours)

        elif interval.endswith('d') and interval[:-1].isdigit():
            # Custom days: next run is interval days from now
            days = int(interval[:-1])
            days = max(1, min(30, days))
            next_run = now + timedelta(days=days)

        else:  # fallback to daily
            next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(days=1)

        # Return as UTC datetime for API response
        return next_run.astimezone(pytz.UTC)

    except Exception as e:
        logger.error(f"Error calculating next run time: {e}")
        return None

def get_orphan_cleanup_next_run_time():
    """
    Get the next scheduled run time for orphan cleanup.

    This is calculated deterministically based on the scheduled settings
    and current time, NOT from APScheduler's dynamic calculation.
    """
    try:
        from database import get_db_cursor

        with get_db_cursor() as cursor:
            # Get enabled setting
            cursor.execute("""
                SELECT setting_value FROM system_settings
                WHERE setting_key = 'auto_cleanup_orphans_enabled'
            """)
            enabled_result = cursor.fetchone()
            enabled = enabled_result and enabled_result['setting_value'] == 'true'

            if not enabled:
                return None

            # Get interval setting
            cursor.execute("""
                SELECT setting_value FROM system_settings
                WHERE setting_key = 'auto_cleanup_orphans_interval'
            """)
            interval_result = cursor.fetchone()
            interval = interval_result['setting_value'] if interval_result else 'weekly'

        # Use IST timezone
        tz = pytz.timezone('Asia/Kolkata')
        now = datetime.now(tz)

        # Calculate next run based on interval type
        if interval == 'hourly':
            next_run = now + timedelta(hours=1)

        elif interval == 'daily':
            # Default to 3 AM for daily cleanup
            next_run = now.replace(hour=3, minute=0, second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(days=1)

        elif interval == 'weekly':
            # Sunday at 3 AM
            days_until_sunday = (6 - now.weekday()) % 7
            next_run = now.replace(hour=3, minute=0, second=0, microsecond=0)
            next_run += timedelta(days=days_until_sunday)
            if next_run <= now:
                next_run += timedelta(days=7)

        elif interval == 'monthly':
            # 1st of month at 3 AM
            next_run = now.replace(day=1, hour=3, minute=0, second=0, microsecond=0)
            if next_run <= now:
                if now.month == 12:
                    next_run = next_run.replace(year=now.year + 1, month=1)
                else:
                    next_run = next_run.replace(month=now.month + 1)

        elif interval.endswith('m') and interval[:-1].isdigit():
            minutes = int(interval[:-1])
            minutes = max(5, min(59, minutes))
            next_run = now + timedelta(minutes=minutes)

        elif interval.endswith('h') and interval[:-1].isdigit():
            hours = int(interval[:-1])
            hours = max(1, min(48, hours))
            next_run = now + timedelta(hours=hours)

        elif interval.endswith('d') and interval[:-1].isdigit():
            days = int(interval[:-1])
            days = max(1, min(30, days))
            next_run = now + timedelta(days=days)

        else:  # default to weekly
            days_until_sunday = (6 - now.weekday()) % 7
            next_run = now.replace(hour=3, minute=0, second=0, microsecond=0)
            next_run += timedelta(days=days_until_sunday)
            if next_run <= now:
                next_run += timedelta(days=7)

        # Return as UTC datetime for API response
        return next_run.astimezone(pytz.UTC)

    except Exception as e:
        logger.error(f"Error calculating orphan cleanup next run time: {e}")
        return None