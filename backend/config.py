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

    # File Upload Configuration
    UPLOAD_STORAGE_PATH = os.getenv('UPLOAD_STORAGE_PATH', './uploads')
    MAX_UPLOAD_SIZE_MB = int(os.getenv('MAX_UPLOAD_SIZE_MB', '10'))

    # Cloud Storage Configuration (Cloudflare R2 / AWS S3)
    ENABLE_CLOUD_BACKUP = os.getenv('ENABLE_CLOUD_BACKUP', 'false').lower() == 'true'
    CLOUD_STORAGE_PROVIDER = os.getenv('CLOUD_STORAGE_PROVIDER', 'r2')  # 'r2' or 's3'

    # Cloudflare R2 Credentials
    R2_ACCOUNT_ID = os.getenv('R2_ACCOUNT_ID')
    R2_ACCESS_KEY_ID = os.getenv('R2_ACCESS_KEY_ID')
    R2_SECRET_ACCESS_KEY = os.getenv('R2_SECRET_ACCESS_KEY')
    R2_BUCKET_NAME = os.getenv('R2_BUCKET_NAME', 'tarko-inventory-backups')

    # AWS S3 Credentials (alternative to R2)
    AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID')
    AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
    AWS_REGION = os.getenv('AWS_REGION', 'us-east-1')
    S3_BUCKET_NAME = os.getenv('S3_BUCKET_NAME', 'tarko-inventory-backups')

    # Google Drive Configuration (deprecated in favor of R2/S3)
    ENABLE_GOOGLE_DRIVE_SYNC = os.getenv('ENABLE_GOOGLE_DRIVE_SYNC', 'false').lower() == 'true'
    GOOGLE_DRIVE_SHARED_DRIVE_ID = os.getenv('GOOGLE_DRIVE_SHARED_DRIVE_ID')  # Optional: for Shared Drive support
