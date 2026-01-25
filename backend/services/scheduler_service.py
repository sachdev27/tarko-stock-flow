"""
Auto-Snapshot Scheduler Service

Provides background scheduling for automatic snapshots based on UI settings.
Uses APScheduler to run jobs in the Flask application context.
"""

import logging
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

# Global scheduler instance
_scheduler = None
_app = None

def init_scheduler(app):
    """
    Initialize the APScheduler with Flask app context.
    Should be called once during app startup.
    """
    global _scheduler, _app
    _app = app

    if _scheduler is not None:
        logger.warning("Scheduler already initialized")
        return _scheduler

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
    logger.info("APScheduler started successfully")

    # Load initial settings and schedule if enabled
    with app.app_context():
        _load_and_schedule_auto_snapshot()

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
    if interval == 'hourly':
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
                    None,  # Don't store in DB, use file storage
                    json.dumps(table_counts),
                    None,  # System generated
                    round(file_size_mb, 2),
                    True,
                    json.dumps(['auto', interval]),
                    str(snapshot_storage.storage_path)
                ))

                snapshot = cursor.fetchone()

                # Save to file storage
                snapshot_storage.save_snapshot(
                    snapshot_id=str(snapshot['id']),
                    snapshot_data=snapshot_data,
                    metadata={
                        'snapshot_name': snapshot_name,
                        'table_counts': table_counts,
                        'created_at': snapshot['created_at'].isoformat(),
                        'is_automatic': True
                    }
                )

                logger.info(f"✅ Auto-snapshot created: {snapshot_name} ({file_size_mb:.2f} MB)")

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


def shutdown_scheduler():
    """Shutdown the scheduler gracefully"""
    global _scheduler

    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler shutdown complete")
        _scheduler = None


def get_next_run_time():
    """Get the next scheduled run time for auto-snapshot"""
    global _scheduler

    if _scheduler is None:
        return None

    job = _scheduler.get_job('auto_snapshot')
    if job:
        return job.next_run_time
    return None
