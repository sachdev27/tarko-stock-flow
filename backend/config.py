import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://localhost/tarko_inventory')
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'dev-secret-key-change-in-prod')
    JWT_ACCESS_TOKEN_EXPIRES = 86400  # 24 hours

    # Snapshot Storage Configuration
    SNAPSHOT_STORAGE_PATH = os.getenv('SNAPSHOT_STORAGE_PATH', './snapshots')
    BACKUP_RETENTION_DAYS = int(os.getenv('BACKUP_RETENTION_DAYS', '30'))

    # Google Drive Configuration
    ENABLE_GOOGLE_DRIVE_SYNC = os.getenv('ENABLE_GOOGLE_DRIVE_SYNC', 'false').lower() == 'true'
    GOOGLE_DRIVE_SHARED_DRIVE_ID = os.getenv('GOOGLE_DRIVE_SHARED_DRIVE_ID')  # Optional: for Shared Drive support
