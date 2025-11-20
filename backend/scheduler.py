"""
Background scheduler for automated tasks like daily snapshots
"""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime, timedelta
import logging
from database import get_db_cursor
import json
from google_drive_sync import sync_snapshot_to_drive, cleanup_old_drive_backups

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Tables to include in snapshots
SNAPSHOT_TABLES = [
    'batches',
    'rolls',
    'transactions',
    'product_variants',
    'product_types',
    'brands',
    'customers',
    'parameter_options'
]

def create_daily_snapshot():
    """Create automatic daily snapshot"""
    try:
        logger.info("Starting automatic daily snapshot...")

        with get_db_cursor() as cursor:
            snapshot_data = {}
            table_counts = {}

            # Capture data from each table
            for table in SNAPSHOT_TABLES:
                cursor.execute(f"""
                    SELECT json_agg(row_to_json(t.*))
                    FROM {table} t
                    WHERE deleted_at IS NULL
                """)
                result = cursor.fetchone()
                table_data = result[0] if result and result[0] else []
                snapshot_data[table] = table_data
                table_counts[table] = len(table_data) if table_data else 0

            # Calculate size
            snapshot_json = json.dumps(snapshot_data)
            file_size_mb = len(snapshot_json.encode('utf-8')) / (1024 * 1024)

            # Get system user ID for automated snapshots
            cursor.execute("""
                SELECT id FROM users WHERE email = 'system@tarko.local'
            """)
            system_user = cursor.fetchone()

            if not system_user:
                # Create system user if doesn't exist
                cursor.execute("""
                    INSERT INTO users (email, password_hash, created_at, updated_at)
                    VALUES ('system@tarko.local', '', NOW(), NOW())
                    RETURNING id
                """)
                system_user = cursor.fetchone()

            user_id = system_user['id']
            snapshot_name = f"Daily Backup - {datetime.now().strftime('%Y-%m-%d')}"

            # Insert snapshot
            cursor.execute("""
                INSERT INTO database_snapshots (
                    snapshot_name, description, snapshot_data, table_counts,
                    created_by, file_size_mb, is_automatic, tags
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                snapshot_name,
                'Automatic daily backup',
                snapshot_json,
                json.dumps(table_counts),
                user_id,
                file_size_mb,
                True,
                ['daily', 'automatic']
            ))

            snapshot_id = cursor.fetchone()['id']

            # Clean up old automatic snapshots (keep last 30 days)
            cursor.execute("""
                DELETE FROM database_snapshots
                WHERE is_automatic = TRUE
                AND created_at < NOW() - INTERVAL '30 days'
            """)

            deleted_count = cursor.rowcount

            logger.info(f"Daily snapshot created successfully: {snapshot_name} (ID: {snapshot_id})")
            logger.info(f"Snapshot size: {file_size_mb:.2f} MB")
            logger.info(f"Cleaned up {deleted_count} old snapshots")

            # Sync to Google Drive
            try:
                logger.info("Syncing snapshot to Google Drive...")
                drive_result = sync_snapshot_to_drive(snapshot_id)
                if drive_result:
                    logger.info(f"Successfully synced to Google Drive: {drive_result['file_name']}")
                else:
                    logger.warning("Google Drive sync skipped (credentials not configured)")
            except Exception as e:
                logger.error(f"Failed to sync to Google Drive: {str(e)}")
                # Continue even if Drive sync fails

            # Clean up old Drive backups
            try:
                cleanup_old_drive_backups(days_to_keep=30)
            except Exception as e:
                logger.error(f"Failed to cleanup old Drive backups: {str(e)}")

            return snapshot_id

    except Exception as e:
        logger.error(f"Failed to create daily snapshot: {str(e)}")
        raise

def init_scheduler(app):
    """Initialize the background scheduler"""
    scheduler = BackgroundScheduler()

    # Schedule daily snapshot at 2 AM
    scheduler.add_job(
        func=create_daily_snapshot,
        trigger=CronTrigger(hour=2, minute=0),
        id='daily_snapshot',
        name='Create daily database snapshot',
        replace_existing=True
    )

    logger.info("Scheduler initialized. Daily snapshots scheduled at 2:00 AM")

    # Store scheduler in app context
    app.config['SCHEDULER'] = scheduler

    return scheduler

def start_scheduler(app):
    """Start the scheduler"""
    scheduler = app.config.get('SCHEDULER')
    if scheduler:
        scheduler.start()
        logger.info("Scheduler started")
    else:
        logger.warning("Scheduler not initialized")

def shutdown_scheduler(app):
    """Shutdown the scheduler gracefully"""
    scheduler = app.config.get('SCHEDULER')
    if scheduler:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler shut down")
