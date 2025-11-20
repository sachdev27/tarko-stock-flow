#!/usr/bin/env python3
"""
Automated backup scheduler for Tarko Inventory System
Creates daily database snapshots and manages retention
"""

import os
import sys
import json
import logging
from datetime import datetime, timedelta
import subprocess
from pathlib import Path
import psycopg2
from psycopg2.extras import RealDictCursor

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/backup.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Configuration from environment
DATABASE_URL = os.getenv('DATABASE_URL')
SNAPSHOT_STORAGE_PATH = os.getenv('SNAPSHOT_STORAGE_PATH', '/app/snapshots')
BACKUP_RETENTION_DAYS = int(os.getenv('BACKUP_RETENTION_DAYS', '30'))

def get_db_connection():
    """Get database connection"""
    try:
        return psycopg2.connect(DATABASE_URL)
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        raise

def create_snapshot():
    """Create a full database snapshot"""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    snapshot_name = f"daily_backup_{timestamp}"
    snapshot_dir = Path(SNAPSHOT_STORAGE_PATH) / snapshot_name
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    
    logger.info(f"Creating snapshot: {snapshot_name}")
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get database info
        cursor.execute("SELECT version() as version")
        db_version = cursor.fetchone()['version']
        
        # Tables to backup
        tables = [
            'users', 'brands', 'product_types', 'customers', 'units',
            'products', 'rolls', 'bundles', 'spare_pieces', 'batches',
            'production_entries', 'dispatch_entries', 'dispatch_items',
            'transactions', 'transaction_items', 'audit_logs',
            'customer_ledger', 'customer_ledger_items'
        ]
        
        snapshot_data = {
            'snapshot_name': snapshot_name,
            'created_at': datetime.now().isoformat(),
            'description': 'Automated daily backup',
            'db_version': db_version,
            'tables': {},
            'stats': {}
        }
        
        # Backup each table
        for table in tables:
            try:
                cursor.execute(f"SELECT * FROM {table}")
                rows = cursor.fetchall()
                
                # Convert to list of dicts
                table_data = [dict(row) for row in rows]
                
                # Save table data
                table_file = snapshot_dir / f"{table}.json"
                with open(table_file, 'w') as f:
                    json.dump(table_data, f, indent=2, default=str)
                
                snapshot_data['tables'][table] = len(table_data)
                snapshot_data['stats'][table] = {
                    'row_count': len(table_data),
                    'file_size': table_file.stat().st_size
                }
                
                logger.info(f"  Backed up {table}: {len(table_data)} rows")
                
            except Exception as e:
                logger.error(f"  Failed to backup {table}: {e}")
                snapshot_data['tables'][table] = f"ERROR: {str(e)}"
        
        # Save metadata
        metadata_file = snapshot_dir / 'metadata.json'
        with open(metadata_file, 'w') as f:
            json.dump(snapshot_data, f, indent=2, default=str)
        
        # Create SQL dump as well
        sql_dump_file = snapshot_dir / f"{snapshot_name}.sql"
        dump_command = f"pg_dump {DATABASE_URL} > {sql_dump_file}"
        subprocess.run(dump_command, shell=True, check=True)
        
        logger.info(f"✅ Snapshot created successfully: {snapshot_name}")
        logger.info(f"   Location: {snapshot_dir}")
        logger.info(f"   Total tables: {len(tables)}")
        logger.info(f"   Total size: {sum(s['file_size'] for s in snapshot_data['stats'].values()) / 1024 / 1024:.2f} MB")
        
        # Record in database
        cursor.execute("""
            INSERT INTO snapshots (snapshot_name, description, created_at, created_by, status, metadata)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            snapshot_name,
            'Automated daily backup',
            datetime.now(),
            'system',
            'completed',
            json.dumps(snapshot_data['stats'])
        ))
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return snapshot_name
        
    except Exception as e:
        logger.error(f"❌ Failed to create snapshot: {e}")
        raise

def cleanup_old_snapshots():
    """Remove snapshots older than retention period"""
    logger.info(f"Cleaning up snapshots older than {BACKUP_RETENTION_DAYS} days")
    
    try:
        snapshot_path = Path(SNAPSHOT_STORAGE_PATH)
        cutoff_date = datetime.now() - timedelta(days=BACKUP_RETENTION_DAYS)
        
        deleted_count = 0
        for snapshot_dir in snapshot_path.iterdir():
            if snapshot_dir.is_dir():
                # Get directory creation time
                dir_mtime = datetime.fromtimestamp(snapshot_dir.stat().st_mtime)
                
                if dir_mtime < cutoff_date:
                    logger.info(f"  Deleting old snapshot: {snapshot_dir.name}")
                    import shutil
                    shutil.rmtree(snapshot_dir)
                    deleted_count += 1
        
        logger.info(f"✅ Cleaned up {deleted_count} old snapshots")
        
        # Also clean up database records
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            DELETE FROM snapshots 
            WHERE created_at < %s 
            AND created_by = 'system'
        """, (cutoff_date,))
        conn.commit()
        cursor.close()
        conn.close()
        
    except Exception as e:
        logger.error(f"❌ Failed to cleanup old snapshots: {e}")

def verify_snapshot(snapshot_name):
    """Verify snapshot integrity"""
    snapshot_dir = Path(SNAPSHOT_STORAGE_PATH) / snapshot_name
    metadata_file = snapshot_dir / 'metadata.json'
    
    if not metadata_file.exists():
        logger.error(f"Snapshot metadata not found: {snapshot_name}")
        return False
    
    try:
        with open(metadata_file, 'r') as f:
            metadata = json.load(f)
        
        # Verify all table files exist
        for table in metadata['tables'].keys():
            table_file = snapshot_dir / f"{table}.json"
            if not table_file.exists():
                logger.error(f"Table file missing: {table}")
                return False
        
        logger.info(f"✅ Snapshot verification passed: {snapshot_name}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Snapshot verification failed: {e}")
        return False

def main():
    """Main backup routine"""
    logger.info("=" * 60)
    logger.info("Starting automated backup process")
    logger.info("=" * 60)
    
    try:
        # Create snapshot
        snapshot_name = create_snapshot()
        
        # Verify snapshot
        if verify_snapshot(snapshot_name):
            logger.info("Snapshot verified successfully")
        else:
            logger.error("Snapshot verification failed")
            sys.exit(1)
        
        # Cleanup old snapshots
        cleanup_old_snapshots()
        
        logger.info("=" * 60)
        logger.info("✅ Backup process completed successfully")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"❌ Backup process failed: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
