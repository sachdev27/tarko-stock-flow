"""
Google Drive integration for backing up database snapshots
"""
from google.oauth2.credentials import Credentials
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseUpload
from googleapiclient.errors import HttpError
import os
import json
import io
import logging
from datetime import datetime
from database import execute_query, get_db_cursor
from config import Config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Google Drive configuration
SCOPES = ['https://www.googleapis.com/auth/drive.file']
DRIVE_FOLDER_NAME = 'Tarko Inventory Backups'
SHARED_DRIVE_ID = Config.GOOGLE_DRIVE_SHARED_DRIVE_ID

def get_drive_service():
    """Initialize and return Google Drive service"""
    # Check if Google Drive sync is enabled
    if not Config.ENABLE_GOOGLE_DRIVE_SYNC:
        logger.info("Google Drive sync is disabled")
        return None

    # Check for service account credentials
    creds_path = os.getenv('GOOGLE_DRIVE_CREDENTIALS_PATH', 'google_drive_credentials.json')

    if not os.path.exists(creds_path):
        logger.warning(f"Google Drive credentials not found at {creds_path}")
        return None

    try:
        creds = service_account.Credentials.from_service_account_file(
            creds_path, scopes=SCOPES
        )
        service = build('drive', 'v3', credentials=creds)
        logger.info("Google Drive service initialized successfully")
        return service
    except Exception as e:
        logger.error(f"Failed to initialize Google Drive service: {str(e)}")
        return None

def get_or_create_backup_folder(service):
    """Get or create the backup folder in Google Drive or Shared Drive"""
    try:
        # If Shared Drive ID is provided, use it directly
        if SHARED_DRIVE_ID:
            logger.info(f"Using Shared Drive: {SHARED_DRIVE_ID}")
            return SHARED_DRIVE_ID

        # Search for existing folder in My Drive
        query = f"name='{DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
        results = service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
        folders = results.get('files', [])

        if folders:
            folder_id = folders[0]['id']
            logger.info(f"Using existing backup folder: {folder_id}")
            return folder_id

        # Create new folder in My Drive
        file_metadata = {
            'name': DRIVE_FOLDER_NAME,
            'mimeType': 'application/vnd.google-apps.folder'
        }
        folder = service.files().create(body=file_metadata, fields='id').execute()
        folder_id = folder.get('id')
        logger.info(f"Created new backup folder: {folder_id}")
        return folder_id

    except HttpError as e:
        logger.error(f"Failed to get/create backup folder: {str(e)}")
        return None

def upload_snapshot_to_drive(snapshot_id, snapshot_data, snapshot_name):
    """Upload a snapshot to Google Drive"""
    service = get_drive_service()
    if not service:
        logger.warning("Google Drive service not available, skipping upload")
        return None

    try:
        folder_id = get_or_create_backup_folder(service)
        if not folder_id:
            return None

        # Prepare file metadata
        file_name = f"{snapshot_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        file_metadata = {
            'name': file_name,
            'parents': [folder_id],
            'description': f'Database snapshot created on {datetime.now().isoformat()}'
        }

        # Convert snapshot data to JSON bytes
        json_data = json.dumps(snapshot_data, indent=2)
        file_stream = io.BytesIO(json_data.encode('utf-8'))

        # Upload file
        media = MediaIoBaseUpload(
            file_stream,
            mimetype='application/json',
            resumable=True
        )

        # Add Shared Drive support
        create_params = {
            'body': file_metadata,
            'media_body': media,
            'fields': 'id, name, webViewLink, size'
        }
        if SHARED_DRIVE_ID:
            create_params['supportsAllDrives'] = True

        file = service.files().create(**create_params).execute()

        file_id = file.get('id')
        file_url = file.get('webViewLink')
        file_size = file.get('size')

        logger.info(f"Snapshot uploaded to Google Drive: {file_name}")
        logger.info(f"File ID: {file_id}, Size: {int(file_size)/1024/1024:.2f} MB")

        # Update snapshot record with Drive info
        with get_db_cursor() as cursor:
            cursor.execute("""
                UPDATE database_snapshots
                SET tags = array_append(tags, 'google-drive-synced')
                WHERE id = %s
            """, (str(snapshot_id),))

        return {
            'file_id': file_id,
            'file_url': file_url,
            'file_size': file_size,
            'file_name': file_name
        }

    except HttpError as e:
        logger.error(f"Failed to upload snapshot to Google Drive: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error during upload: {str(e)}")
        return None

def sync_snapshot_to_drive(snapshot_id):
    """Sync a specific snapshot to Google Drive"""
    try:
        # Get snapshot data
        query = """
            SELECT id, snapshot_name, snapshot_data, created_at
            FROM database_snapshots
            WHERE id = %s
        """
        result = execute_query(query, (str(snapshot_id),))

        if not result or len(result) == 0:
            logger.error(f"Snapshot not found: {snapshot_id}")
            return None

        snapshot = result[0]

        # Upload to Drive
        drive_result = upload_snapshot_to_drive(
            snapshot_id=snapshot['id'],
            snapshot_data=snapshot['snapshot_data'],
            snapshot_name=snapshot['snapshot_name']
        )

        return drive_result

    except Exception as e:
        logger.error(f"Failed to sync snapshot to Drive: {str(e)}")
        return None

def sync_all_recent_snapshots(days=7):
    """Sync all recent snapshots to Google Drive"""
    try:
        query = """
            SELECT id, snapshot_name
            FROM database_snapshots
            WHERE created_at >= NOW() - INTERVAL '%s days'
            AND NOT ('google-drive-synced' = ANY(tags))
            ORDER BY created_at DESC
        """
        snapshots = execute_query(query, (days,))

        synced_count = 0
        failed_count = 0

        for snapshot in snapshots:
            result = sync_snapshot_to_drive(snapshot['id'])
            if result:
                synced_count += 1
                logger.info(f"Synced: {snapshot['snapshot_name']}")
            else:
                failed_count += 1
                logger.warning(f"Failed to sync: {snapshot['snapshot_name']}")

        logger.info(f"Sync complete: {synced_count} succeeded, {failed_count} failed")
        return {'synced': synced_count, 'failed': failed_count}

    except Exception as e:
        logger.error(f"Failed to sync recent snapshots: {str(e)}")
        return None

def cleanup_old_drive_backups(days_to_keep=30):
    """Remove backups older than specified days from Google Drive"""
    service = get_drive_service()
    if not service:
        return None

    try:
        folder_id = get_or_create_backup_folder(service)
        if not folder_id:
            return None

        # Calculate cutoff date
        from datetime import timedelta
        cutoff_date = (datetime.now() - timedelta(days=days_to_keep)).isoformat()

        # Search for old files
        query = f"'{folder_id}' in parents and createdTime < '{cutoff_date}' and trashed=false"
        results = service.files().list(q=query, fields='files(id, name, createdTime)').execute()
        files = results.get('files', [])

        deleted_count = 0
        for file in files:
            try:
                service.files().delete(fileId=file['id']).execute()
                deleted_count += 1
                logger.info(f"Deleted old backup: {file['name']}")
            except HttpError as e:
                logger.error(f"Failed to delete {file['name']}: {str(e)}")

        logger.info(f"Cleanup complete: {deleted_count} old backups removed")
        return deleted_count

    except Exception as e:
        logger.error(f"Failed to cleanup old backups: {str(e)}")
        return None

def test_drive_connection():
    """Test Google Drive connection"""
    service = get_drive_service()
    if not service:
        return False

    try:
        about = service.about().get(fields='user, storageQuota').execute()
        user_email = about.get('user', {}).get('emailAddress', 'Unknown')
        quota = about.get('storageQuota', {})

        logger.info(f"Connected to Google Drive as: {user_email}")
        logger.info(f"Storage used: {int(quota.get('usage', 0))/1024/1024/1024:.2f} GB")
        logger.info(f"Storage limit: {int(quota.get('limit', 0))/1024/1024/1024:.2f} GB")

        return True
    except Exception as e:
        logger.error(f"Drive connection test failed: {str(e)}")
        return False
