"""
Cloud Storage Service
Supports Cloudflare R2 and AWS S3 for snapshot backup and sync
Uses S3-compatible API (boto3) for maximum compatibility
"""

import os
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, BinaryIO
import hashlib
import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from botocore.config import Config as BotoConfig

logger = logging.getLogger(__name__)


class CloudStorage:
    """
    Unified cloud storage client for R2/S3
    Cloudflare R2 uses S3-compatible API, so same code works for both
    """

    def __init__(self):
        """Initialize cloud storage client based on configuration"""
        # Try to get config from database first, fallback to environment variables
        config = self._get_cloud_config()

        self.provider = config.get('provider', 'r2').lower()
        self.enabled = config.get('enabled', False)

        if not self.enabled:
            logger.info("Cloud backup is disabled")
            return

        try:
            if self.provider == 'r2':
                self._init_r2(config)
            elif self.provider == 's3':
                self._init_s3(config)
            else:
                raise ValueError(f"Unsupported provider: {self.provider}")

            logger.info(f"Cloud storage initialized: {self.provider}")

        except Exception as e:
            logger.error(f"Failed to initialize cloud storage: {e}")
            self.enabled = False

    def _get_cloud_config(self):
        """Get cloud configuration from database, fallback to environment"""
        try:
            from database import get_db_connection
            from psycopg2.extras import RealDictCursor
            from services.encryption_service import get_encryption_service

            with get_db_connection() as conn:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute("""
                    SELECT provider, account_id, access_key_id, secret_access_key,
                           bucket_name, region, endpoint_url, is_enabled
                    FROM cloud_backup_config
                    WHERE is_active = TRUE
                    ORDER BY created_at DESC
                    LIMIT 1
                """)

                db_config = cursor.fetchone()

                if db_config and db_config['is_enabled']:
                    encryption_service = get_encryption_service()
                    logger.info(f"✅ Loading cloud config from database: {db_config['provider']} - {db_config['bucket_name']}")
                    return {
                        'enabled': True,
                        'provider': db_config['provider'],
                        'account_id': db_config['account_id'],
                        'access_key_id': db_config['access_key_id'],
                        'secret_access_key': encryption_service.decrypt(db_config['secret_access_key']),
                        'bucket_name': db_config['bucket_name'],
                        'region': db_config['region'],
                        'endpoint_url': db_config['endpoint_url']
                    }
        except Exception as e:
            logger.warning(f"Could not load cloud config from database: {e}")
            logger.info("Falling back to environment variables...")

        # Fallback to environment variables
        return {
            'enabled': os.getenv('ENABLE_CLOUD_BACKUP', 'false').lower() == 'true',
            'provider': os.getenv('CLOUD_STORAGE_PROVIDER', 'r2').lower(),
            'account_id': os.getenv('R2_ACCOUNT_ID') or None,
            'access_key_id': os.getenv('R2_ACCESS_KEY_ID') or os.getenv('AWS_ACCESS_KEY_ID'),
            'secret_access_key': os.getenv('R2_SECRET_ACCESS_KEY') or os.getenv('AWS_SECRET_ACCESS_KEY'),
            'bucket_name': os.getenv('R2_BUCKET_NAME') or os.getenv('S3_BUCKET_NAME', 'tarko-inventory-backups'),
            'region': os.getenv('AWS_REGION', 'us-east-1'),
            'endpoint_url': None
        }

    def _init_r2(self, config):
        """Initialize Cloudflare R2 client"""
        account_id = config.get('account_id')
        access_key = config.get('access_key_id')
        secret_key = config.get('secret_access_key')
        self.bucket_name = config.get('bucket_name', 'tarko-inventory-backups')

        if not all([account_id, access_key, secret_key]):
            raise ValueError("Missing R2 credentials (account_id, access_key_id, secret_access_key)")

        # R2 endpoint format: https://<account_id>.r2.cloudflarestorage.com
        endpoint_url = config.get('endpoint_url') or f"https://{account_id}.r2.cloudflarestorage.com"

        self.s3_client = boto3.client(
            's3',
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=BotoConfig(signature_version='s3v4'),
            region_name='auto'  # R2 uses 'auto' region
        )

        # Create bucket if it doesn't exist
        self._ensure_bucket_exists()

    def _init_s3(self, config):
        """Initialize AWS S3 client"""
        access_key = config.get('access_key_id')
        secret_key = config.get('secret_access_key')
        region = config.get('region', 'us-east-1')
        self.bucket_name = config.get('bucket_name', 'tarko-inventory-backups')

        if not all([access_key, secret_key]):
            raise ValueError("Missing AWS credentials (access_key_id, secret_access_key)")

        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region
        )

        # Create bucket if it doesn't exist
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self):
        """Create bucket if it doesn't exist"""
        try:
            self.s3_client.head_bucket(Bucket=self.bucket_name)
            logger.info(f"✅ Bucket accessible: {self.bucket_name}")
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == '404':
                try:
                    logger.info(f"Creating bucket: {self.bucket_name}")
                    if self.provider == 's3':
                        self.s3_client.create_bucket(Bucket=self.bucket_name)
                    else:
                        # R2 doesn't need location constraint
                        self.s3_client.create_bucket(Bucket=self.bucket_name)
                    logger.info(f"✅ Bucket created: {self.bucket_name}")
                except ClientError as create_error:
                    logger.error(f"❌ Failed to create bucket: {create_error}")
                    raise
            elif error_code == '403':
                logger.error(f"❌ Access denied to bucket '{self.bucket_name}'. Check credentials and permissions.")
                logger.error(f"   Provider: {self.provider}")
                logger.error(f"   Make sure the access key has read/write permissions for this bucket.")
                raise
            else:
                logger.error(f"❌ Error checking bucket: {e}")
                raise

    def upload_snapshot(self, snapshot_id: str, local_path: Path, encrypt: bool = True) -> bool:
        """
        Upload snapshot directory to cloud storage

        Args:
            snapshot_id: Unique snapshot identifier
            local_path: Path to local snapshot directory
            encrypt: Whether to enable server-side encryption

        Returns:
            bool: Success status
        """
        if not self.enabled:
            logger.warning("Cloud backup is disabled, skipping upload")
            return False

        try:
            # Upload all files in the snapshot directory
            uploaded_files = []
            total_size = 0

            for file_path in local_path.rglob('*'):
                if file_path.is_file():
                    # Create S3 key with snapshot_id prefix
                    relative_path = file_path.relative_to(local_path)
                    s3_key = f"snapshots/{snapshot_id}/{relative_path}"

                    # Calculate file hash for integrity
                    file_hash = self._calculate_file_hash(file_path)

                    # Upload with metadata
                    extra_args = {
                        'Metadata': {
                            'snapshot-id': snapshot_id,
                            'upload-timestamp': datetime.now().isoformat(),
                            'file-hash': file_hash
                        }
                    }

                    if encrypt:
                        extra_args['ServerSideEncryption'] = 'AES256'

                    logger.info(f"Uploading: {s3_key}")
                    self.s3_client.upload_file(
                        str(file_path),
                        self.bucket_name,
                        s3_key,
                        ExtraArgs=extra_args
                    )

                    uploaded_files.append(s3_key)
                    total_size += file_path.stat().st_size

            # Create manifest file with upload info
            manifest = {
                'snapshot_id': snapshot_id,
                'uploaded_at': datetime.now().isoformat(),
                'provider': self.provider,
                'files': uploaded_files,
                'total_size_bytes': total_size,
                'file_count': len(uploaded_files)
            }

            # Upload manifest
            manifest_key = f"snapshots/{snapshot_id}/manifest.json"
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=manifest_key,
                Body=json.dumps(manifest, indent=2),
                ContentType='application/json',
                Metadata={'snapshot-id': snapshot_id}
            )

            logger.info(f"✅ Snapshot uploaded to cloud: {snapshot_id}")
            logger.info(f"   Files: {len(uploaded_files)}, Size: {total_size / 1024 / 1024:.2f} MB")
            return True

        except NoCredentialsError:
            logger.error("Cloud credentials not found or invalid")
            return False
        except ClientError as e:
            logger.error(f"Failed to upload snapshot to cloud: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error uploading snapshot: {e}")
            return False

    def download_snapshot(self, snapshot_id: str, local_path: Path) -> bool:
        """
        Download snapshot from cloud storage

        Args:
            snapshot_id: Unique snapshot identifier
            local_path: Path to save snapshot locally

        Returns:
            bool: Success status
        """
        if not self.enabled:
            logger.warning("Cloud backup is disabled, skipping download")
            return False

        try:
            # Download manifest first to get file list
            manifest_key = f"snapshots/{snapshot_id}/manifest.json"
            manifest_obj = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=manifest_key
            )
            manifest = json.loads(manifest_obj['Body'].read())

            # Create local directory
            local_path.mkdir(parents=True, exist_ok=True)

            # Download all files
            downloaded_files = 0
            for s3_key in manifest['files']:
                # Extract relative path from S3 key
                relative_path = s3_key.replace(f"snapshots/{snapshot_id}/", "")
                file_path = local_path / relative_path

                # Create parent directories
                file_path.parent.mkdir(parents=True, exist_ok=True)

                # Download file
                logger.info(f"Downloading: {s3_key}")
                self.s3_client.download_file(
                    self.bucket_name,
                    s3_key,
                    str(file_path)
                )
                downloaded_files += 1

            logger.info(f"✅ Snapshot downloaded from cloud: {snapshot_id}")
            logger.info(f"   Files: {downloaded_files}, Location: {local_path}")
            return True

        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'NoSuchKey':
                logger.error(f"Snapshot not found in cloud: {snapshot_id}")
            else:
                logger.error(f"Failed to download snapshot from cloud: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error downloading snapshot: {e}")
            return False

    def list_cloud_snapshots(self) -> List[Dict]:
        """
        List all snapshots available in cloud storage

        Returns:
            List of snapshot metadata dictionaries
        """
        if not self.enabled:
            logger.warning("Cloud backup is disabled")
            return []

        try:
            snapshots = []

            # List all manifest files
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix='snapshots/',
                Delimiter='/'
            )

            # Get common prefixes (snapshot directories)
            if 'CommonPrefixes' in response:
                for prefix in response['CommonPrefixes']:
                    snapshot_dir = prefix['Prefix']
                    snapshot_id = snapshot_dir.split('/')[-2]

                    # Get manifest for this snapshot
                    try:
                        manifest_key = f"{snapshot_dir}manifest.json"
                        manifest_obj = self.s3_client.get_object(
                            Bucket=self.bucket_name,
                            Key=manifest_key
                        )
                        manifest = json.loads(manifest_obj['Body'].read())

                        snapshots.append({
                            'id': snapshot_id,
                            'uploaded_at': manifest.get('uploaded_at'),
                            'provider': manifest.get('provider', self.provider),
                            'file_count': manifest.get('file_count', 0),
                            'total_size_mb': manifest.get('total_size_bytes', 0) / 1024 / 1024,
                            'location': 'cloud'
                        })
                    except ClientError:
                        logger.warning(f"Could not read manifest for {snapshot_id}")
                        continue

            return sorted(snapshots, key=lambda x: x.get('uploaded_at', ''), reverse=True)

        except ClientError as e:
            logger.error(f"Failed to list cloud snapshots: {e}")
            return []
        except Exception as e:
            logger.error(f"Unexpected error listing snapshots: {e}")
            return []

    def delete_cloud_snapshot(self, snapshot_id: str) -> bool:
        """
        Delete snapshot from cloud storage

        Args:
            snapshot_id: Unique snapshot identifier

        Returns:
            bool: Success status
        """
        if not self.enabled:
            logger.warning("Cloud backup is disabled")
            return False

        try:
            # List all objects with this snapshot prefix
            prefix = f"snapshots/{snapshot_id}/"
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=prefix
            )

            if 'Contents' not in response:
                logger.warning(f"Snapshot not found in cloud: {snapshot_id}")
                return False

            # Delete all objects
            objects_to_delete = [{'Key': obj['Key']} for obj in response['Contents']]

            self.s3_client.delete_objects(
                Bucket=self.bucket_name,
                Delete={'Objects': objects_to_delete}
            )

            logger.info(f"✅ Snapshot deleted from cloud: {snapshot_id}")
            return True

        except ClientError as e:
            logger.error(f"Failed to delete cloud snapshot: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error deleting snapshot: {e}")
            return False

    def verify_cloud_snapshot(self, snapshot_id: str) -> bool:
        """
        Verify snapshot exists and is intact in cloud storage

        Args:
            snapshot_id: Unique snapshot identifier

        Returns:
            bool: True if snapshot is valid
        """
        if not self.enabled:
            return False

        try:
            # Check if manifest exists
            manifest_key = f"snapshots/{snapshot_id}/manifest.json"
            manifest_obj = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=manifest_key
            )
            manifest = json.loads(manifest_obj['Body'].read())

            # Verify all files exist
            for s3_key in manifest['files']:
                self.s3_client.head_object(
                    Bucket=self.bucket_name,
                    Key=s3_key
                )

            logger.info(f"✅ Cloud snapshot verified: {snapshot_id}")
            return True

        except ClientError:
            logger.error(f"Cloud snapshot verification failed: {snapshot_id}")
            return False

    def _calculate_file_hash(self, file_path: Path) -> str:
        """Calculate SHA256 hash of file for integrity verification"""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    def get_storage_stats(self) -> Dict:
        """Get cloud storage usage statistics"""
        if not self.enabled:
            return {'enabled': False}

        try:
            # List all objects
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix='snapshots/'
            )

            total_size = 0
            file_count = 0

            if 'Contents' in response:
                for obj in response['Contents']:
                    total_size += obj['Size']
                    file_count += 1

            return {
                'enabled': True,
                'provider': self.provider,
                'bucket': self.bucket_name,
                'total_size_mb': total_size / 1024 / 1024,
                'total_size_gb': total_size / 1024 / 1024 / 1024,
                'file_count': file_count
            }

        except Exception as e:
            logger.error(f"Failed to get storage stats: {e}")
            return {'enabled': True, 'error': str(e)}


# Global instance
cloud_storage = CloudStorage()
