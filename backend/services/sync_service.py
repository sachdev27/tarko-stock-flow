"""
Sync service for continuous backup to NAS (rsync) or cloud storage (R2/S3)
"""
import os
import subprocess
import logging
from datetime import datetime
from pathlib import Path
import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


class SyncService:
    """Handle syncing data to NAS or cloud storage"""

    def __init__(self, config):
        self.config = config
        self.sync_type = config.get('sync_type')
        self.name = config.get('name', 'Unnamed Sync')

    def sync(self):
        """Execute sync based on configuration type"""
        if self.sync_type == 'network':
            return self._sync_network()
        elif self.sync_type == 'rsync':
            return self._sync_rsync()
        elif self.sync_type in ['r2', 's3']:
            return self._sync_cloud()
        else:
            raise ValueError(f"Unsupported sync type: {self.sync_type}")

    def _sync_network(self):
        """Sync to network-mounted storage (SMB/NFS)"""
        try:
            import shutil
            mount_path = self.config.get('network_mount_path')

            if not mount_path:
                return {
                    'success': False,
                    'error': 'Network mount path is required',
                    'files_synced': 0,
                    'bytes_transferred': 0
                }

            if not os.path.exists(mount_path):
                return {
                    'success': False,
                    'error': f'Network path not accessible: {mount_path}. Please mount your NAS first.',
                    'files_synced': 0,
                    'bytes_transferred': 0
                }

            # Build source paths
            # Only sync PostgreSQL data directory - single source of truth
            backup_method = self.config.get('backup_method', 'pg_dump')
            pg_backup_result = self._create_postgres_backup(backup_method)

            if not pg_backup_result['success']:
                return {
                    'success': False,
                    'error': f"PostgreSQL backup failed: {pg_backup_result['error']}",
                    'files_synced': 0,
                    'bytes_transferred': 0
                }

            postgres_data_dir = pg_backup_result['backup_path']
            dest_path = os.path.join(mount_path, 'postgres-data')

            # Initialize counters
            files_synced = 0
            bytes_transferred = 0

            try:
                # Use rsync for efficient incremental mirroring (--delete removes files that no longer exist)
                cmd = ['rsync', '-avz', '--delete', f'{postgres_data_dir}/', f'{dest_path}/']
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

                if result.returncode != 0:
                    logger.warning(f"rsync failed, using shutil")
                    # Fallback to shutil if rsync not available
                    import shutil
                    if os.path.exists(dest_path):
                        shutil.rmtree(dest_path)
                    shutil.copytree(postgres_data_dir, dest_path)

                # Count files and bytes
                for root, dirs, files in os.walk(postgres_data_dir):
                    files_synced += len(files)
                    for file in files:
                        file_path = os.path.join(root, file)
                        bytes_transferred += os.path.getsize(file_path)

                logger.info(f"Synced {files_synced} files ({bytes_transferred / 1024 / 1024:.2f} MB) to {dest_path}")

            except Exception as e:
                logger.error(f"Failed to sync postgres-data: {e}")
                return {
                    'success': False,
                    'error': f'Failed to sync: {str(e)}',
                    'files_synced': 0,
                    'bytes_transferred': 0
                }

            return {
                'success': True,
                'files_synced': files_synced,
                'bytes_transferred': bytes_transferred,
                'error': None
            }

        except Exception as e:
            logger.error(f"Network sync failed: {e}", exc_info=True)
            return {
                'success': False,
                'error': str(e),
                'files_synced': 0,
                'bytes_transferred': 0
            }

    def _sync_rsync(self):
        """Sync using rsync to NAS or remote server"""
        try:
            destination = self.config.get('rsync_destination')
            user = self.config.get('rsync_user')
            host = self.config.get('rsync_host')
            port = self.config.get('rsync_port', 22)
            ssh_key = self.config.get('ssh_key_path')

            # Build source paths - sync entire directories
            sources = []

            # Only sync PostgreSQL data directory
            backup_method = self.config.get('backup_method', 'pg_dump')
            pg_backup_result = self._create_postgres_backup(backup_method)

            if not pg_backup_result['success']:
                return {
                    'success': False,
                    'error': f"PostgreSQL backup failed: {pg_backup_result['error']}",
                    'files_synced': 0,
                    'bytes_transferred': 0
                }

            postgres_data_dir = pg_backup_result['backup_path']

            # Build rsync command with --delete for mirroring
            rsync_cmd = ['rsync', '-avz', '--delete', '--stats']

            # Add SSH options if remote sync
            if host:
                if ssh_key:
                    rsync_cmd.extend(['-e', f'ssh -i {ssh_key} -p {port}'])
                else:
                    rsync_cmd.extend(['-e', f'ssh -p {port}'])

                # Remote destination - mirror postgres-data directory
                remote_dest = f"{user}@{host}:{destination}/postgres-data/" if user else f"{host}:{destination}/postgres-data/"

                cmd = rsync_cmd + [f'{postgres_data_dir}/', remote_dest]
                logger.info(f"Mirroring PostgreSQL data: {' '.join(cmd)}")
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

                if result.returncode != 0:
                    return {
                        'success': False,
                        'error': result.stderr or result.stdout,
                        'files_synced': 0,
                        'bytes_transferred': 0
                    }
            else:
                # Local destination - mirror postgres-data directory
                local_dest = os.path.join(destination, 'postgres-data')
                Path(local_dest).mkdir(parents=True, exist_ok=True)

                cmd = rsync_cmd + [f'{postgres_data_dir}/', f"{local_dest}/"]
                logger.info(f"Mirroring PostgreSQL data: {' '.join(cmd)}")
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

                if result.returncode != 0:
                    return {
                        'success': False,
                        'error': result.stderr or result.stdout,
                        'files_synced': 0,
                        'bytes_transferred': 0
                    }

            # Parse rsync stats
            stats = self._parse_rsync_stats(result.stdout)

            return {
                'success': True,
                'files_synced': stats.get('files_transferred', 0),
                'bytes_transferred': stats.get('bytes_sent', 0),
                'error': None
            }

        except subprocess.TimeoutExpired:
            return {
                'success': False,
                'error': 'Rsync operation timed out after 5 minutes',
                'files_synced': 0,
                'bytes_transferred': 0
            }
        except Exception as e:
            logger.error(f"Rsync sync failed: {e}", exc_info=True)
            return {
                'success': False,
                'error': str(e),
                'files_synced': 0,
                'bytes_transferred': 0
            }

    def _sync_cloud(self):
        """Sync to R2 or S3 - only uploads changed files (incremental)"""
        try:
            from datetime import datetime, timezone

            provider = self.config.get('cloud_provider', 'r2')
            bucket_name = self.config.get('cloud_bucket')
            access_key = self.config.get('cloud_access_key')
            secret_key = self.config.get('cloud_secret_key')
            endpoint = self.config.get('cloud_endpoint')
            region = self.config.get('cloud_region', 'auto')

            # Initialize S3 client
            if provider == 'r2':
                s3_client = boto3.client(
                    's3',
                    endpoint_url=endpoint,
                    aws_access_key_id=access_key,
                    aws_secret_access_key=secret_key,
                    config=BotoConfig(signature_version='s3v4'),
                    region_name='auto'
                )
            else:  # S3
                s3_client = boto3.client(
                    's3',
                    aws_access_key_id=access_key,
                    aws_secret_access_key=secret_key,
                    region_name=region
                )

            # Collect files to sync
            files_synced = 0
            bytes_transferred = 0
            files_skipped = 0

            # Only sync PostgreSQL data directory
            backup_method = self.config.get('backup_method', 'pg_dump')
            pg_backup_result = self._create_postgres_backup(backup_method)

            if not pg_backup_result['success']:
                return {
                    'success': False,
                    'error': f"PostgreSQL backup failed: {pg_backup_result['error']}",
                    'files_synced': 0,
                    'bytes_transferred': 0
                }

            postgres_data_dir = pg_backup_result['backup_path']
            logger.info(f"Syncing PostgreSQL data to cloud: {postgres_data_dir}")

            # Walk through postgres-data directory
            for root, dirs, files in os.walk(postgres_data_dir):
                for file in files:
                    local_path = Path(root) / file
                    relative_path = local_path.relative_to(postgres_data_dir)
                    s3_key = f"postgres-data/{relative_path}"

                    # Check if file needs uploading (incremental sync)
                    needs_upload = True
                    try:
                        response = s3_client.head_object(Bucket=bucket_name, Key=s3_key)
                        remote_size = response['ContentLength']
                        remote_modified = response.get('LastModified')

                        local_size = local_path.stat().st_size
                        local_modified = datetime.fromtimestamp(local_path.stat().st_mtime, tz=timezone.utc)

                        # Skip if size matches and local file isn't newer
                        if remote_size == local_size and remote_modified and local_modified <= remote_modified:
                            needs_upload = False
                            files_skipped += 1
                            logger.debug(f"Skipping unchanged file: {s3_key}")
                    except ClientError:
                        # File doesn't exist in cloud, upload it
                        pass

                    if needs_upload:
                        # Upload file
                        file_size = local_path.stat().st_size
                        logger.info(f"Uploading: {s3_key} ({file_size} bytes)")
                        s3_client.upload_file(
                            str(local_path),
                            bucket_name,
                            s3_key
                        )
                        files_synced += 1
                        bytes_transferred += file_size

            logger.info(f"Cloud sync complete: {files_synced} uploaded, {files_skipped} skipped (unchanged)")
            return {
                'success': True,
                'files_synced': files_synced,
                'bytes_transferred': bytes_transferred,
                'error': None
            }

        except Exception as e:
            logger.error(f"Cloud sync failed: {e}", exc_info=True)
            return {
                'success': False,
                'error': str(e),
                'files_synced': 0,
                'bytes_transferred': 0
            }

    def _create_postgres_backup(self, backup_method='pg_dump'):
        """Create PostgreSQL backup based on configured method"""
        backup_base = os.getenv('SNAPSHOT_STORAGE_PATH', './snapshots')
        backup_dir = os.path.join(backup_base, 'postgres-data')

        if backup_method == 'both':
            # Create both pg_dump and pg_basebackup
            logger.info("Creating both pg_dump and pg_basebackup")

            # Try pg_basebackup first
            basebackup_result = self._create_pg_basebackup()
            dump_result = self._create_pg_dump_backup()

            # If either succeeds, consider it a success
            if basebackup_result['success'] or dump_result['success']:
                return {
                    'success': True,
                    'backup_path': backup_dir,
                    'error': None
                }
            else:
                return {
                    'success': False,
                    'error': f"Both backups failed. pg_basebackup: {basebackup_result.get('error')}; pg_dump: {dump_result.get('error')}",
                    'backup_path': None
                }

        elif backup_method == 'pg_basebackup':
            # Only pg_basebackup, no fallback
            result = self._create_pg_basebackup(fallback=False)
            return result

        else:  # backup_method == 'pg_dump' (default)
            return self._create_pg_dump_backup()

    def _create_pg_basebackup(self, fallback=True):
        """Create PostgreSQL base backup - full data directory copy for mirroring"""
        try:
            from config import Config
            from urllib.parse import urlparse

            # Parse database URL
            db_url = os.getenv('DATABASE_URL', Config.DATABASE_URL)
            parsed = urlparse(db_url)

            db_user = parsed.username or 'postgres'
            db_host = parsed.hostname or 'localhost'
            db_port = parsed.port or 5432
            db_password = parsed.password

            # Create a single 'postgres-data' directory that gets continuously synced
            backup_base = os.getenv('SNAPSHOT_STORAGE_PATH', './snapshots')
            Path(backup_base).mkdir(parents=True, exist_ok=True)

            # Use fixed directory name for incremental sync
            backup_dir = os.path.join(backup_base, 'postgres-data')

            # Remove old backup if exists (we'll recreate it)
            if os.path.exists(backup_dir):
                import shutil
                shutil.rmtree(backup_dir)

            Path(backup_dir).mkdir(parents=True, exist_ok=True)

            # pg_basebackup command - creates full data directory copy
            pg_backup_cmd = [
                'pg_basebackup',
                '-h', db_host,
                '-p', str(db_port),
                '-U', db_user,
                '-D', backup_dir,
                '-Fp',  # plain format (actual data files, not tar)
                '-P',   # progress reporting
                '-v',   # verbose
                '--no-password'  # use password from environment
            ]

            logger.info(f"Creating PostgreSQL base backup to: {backup_dir}")

            # Set password in environment
            env = os.environ.copy()
            if db_password:
                env['PGPASSWORD'] = db_password

            # Run pg_basebackup
            result = subprocess.run(
                pg_backup_cmd,
                capture_output=True,
                text=True,
                timeout=600,  # 10 minute timeout
                env=env
            )

            if result.returncode != 0:
                error_msg = result.stderr or result.stdout or "Unknown error"
                logger.error(f"pg_basebackup failed: {error_msg}")

                # If replication not configured and fallback enabled, fall back to pg_dump
                if fallback and ('replication' in error_msg.lower() or 'pg_hba' in error_msg.lower()):
                    logger.warning("Replication not configured, falling back to pg_dump")
                    return self._create_pg_dump_backup()

                return {
                    'success': False,
                    'error': f"pg_basebackup failed: {error_msg}",
                    'backup_path': None
                }

            # Calculate size
            total_size = sum(
                os.path.getsize(os.path.join(dirpath, filename))
                for dirpath, dirnames, filenames in os.walk(backup_dir)
                for filename in filenames
            )

            logger.info(f"PostgreSQL base backup created: {total_size / 1024 / 1024:.2f} MB")
            return {
                'success': True,
                'backup_path': backup_dir,
                'error': None
            }

        except subprocess.TimeoutExpired:
            return {
                'success': False,
                'error': 'pg_basebackup timed out after 10 minutes',
                'backup_path': None
            }
        except Exception as e:
            logger.error(f"Failed to create pg_basebackup: {e}", exc_info=True)
            return {
                'success': False,
                'error': str(e),
                'backup_path': None
            }

    def _create_pg_dump_backup(self):
        """Fallback: Create pg_dump backup if pg_basebackup fails"""
        try:
            from config import Config
            from urllib.parse import urlparse

            db_url = os.getenv('DATABASE_URL', Config.DATABASE_URL)
            parsed = urlparse(db_url)

            db_user = parsed.username or 'postgres'
            db_host = parsed.hostname or 'localhost'
            db_port = parsed.port or 5432
            db_name = parsed.path.lstrip('/') or 'tarko_inventory'
            db_password = parsed.password

            backup_base = os.getenv('SNAPSHOT_STORAGE_PATH', './snapshots')
            Path(backup_base).mkdir(parents=True, exist_ok=True)

            # Use fixed filename for sync
            backup_file = os.path.join(backup_base, 'postgres-data', 'database.dump')
            Path(os.path.dirname(backup_file)).mkdir(parents=True, exist_ok=True)

            pg_dump_cmd = [
                'pg_dump',
                '-h', db_host,
                '-p', str(db_port),
                '-U', db_user,
                '-d', db_name,
                '-F', 'c',
                '-f', backup_file,
                '-v'
            ]

            env = os.environ.copy()
            if db_password:
                env['PGPASSWORD'] = db_password

            result = subprocess.run(pg_dump_cmd, capture_output=True, text=True, timeout=600, env=env)

            if result.returncode != 0:
                return {
                    'success': False,
                    'error': f"pg_dump failed: {result.stderr}",
                    'backup_path': None
                }

            logger.info(f"PostgreSQL dump created: {os.path.getsize(backup_file) / 1024 / 1024:.2f} MB")
            return {
                'success': True,
                'backup_path': os.path.dirname(backup_file),
                'error': None
            }

        except subprocess.TimeoutExpired:
            return {
                'success': False,
                'error': 'pg_basebackup timed out after 10 minutes',
                'backup_path': None
            }
        except Exception as e:
            logger.error(f"Failed to create PostgreSQL base backup: {e}", exc_info=True)
            return {
                'success': False,
                'error': str(e),
                'backup_path': None
            }

    def _parse_rsync_stats(self, output):
        """Parse rsync stats from output"""
        stats = {
            'files_transferred': 0,
            'bytes_sent': 0,
            'total_size': 0
        }

        for line in output.split('\n'):
            if 'Number of files transferred:' in line:
                try:
                    stats['files_transferred'] = int(line.split(':')[1].strip())
                except:
                    pass
            elif 'Total transferred file size:' in line:
                try:
                    size_str = line.split(':')[1].strip().split()[0].replace(',', '')
                    stats['total_size'] = int(size_str)
                except:
                    pass
            elif 'sent' in line.lower() and 'bytes' in line.lower():
                try:
                    # Parse "sent 1,234 bytes  received 456 bytes"
                    parts = line.split('sent')[1].split('bytes')[0].replace(',', '').strip()
                    stats['bytes_sent'] = int(parts)
                except:
                    pass

        return stats


def test_sync_connection(config):
    """Test sync connection without actually syncing"""
    sync_type = config.get('sync_type')

    if sync_type == 'network':
        return _test_network_connection(config)
    elif sync_type == 'rsync':
        return _test_rsync_connection(config)
    elif sync_type in ['r2', 's3']:
        return _test_cloud_connection(config)
    else:
        return (False, f"Unsupported sync type: {sync_type}")


def _test_network_connection(config):
    """Test network mount path accessibility"""
    try:
        mount_path = config.get('network_mount_path')

        if not mount_path:
            return (False, "Network mount path is required")

        if not os.path.exists(mount_path):
            return (False, f"Mount path not accessible: {mount_path}. Please mount your NAS first.")

        # Test write access
        test_file = os.path.join(mount_path, '.tarko_test_write')
        try:
            with open(test_file, 'w') as f:
                f.write('test')
            os.remove(test_file)
            return (True, f"Network storage accessible and writable: {mount_path}")
        except Exception as e:
            return (False, f"Mount path not writable: {str(e)}")

    except Exception as e:
        return (False, str(e))


def _test_rsync_connection(config):
    """Test rsync connection"""
    try:
        host = config.get('rsync_host')
        user = config.get('rsync_user')
        port = config.get('rsync_port', 22)
        destination = config.get('rsync_destination')

        if not host:
            # Test local path
            if not destination:
                return (False, "Destination path is required")

            dest_path = Path(destination)
            if not dest_path.exists():
                try:
                    dest_path.mkdir(parents=True, exist_ok=True)
                    return (True, f"Local destination accessible: {destination}")
                except Exception as e:
                    return (False, f"Cannot create destination: {e}")
            return (True, f"Local destination accessible: {destination}")

        # Test remote connection
        ssh_cmd = ['ssh', '-p', str(port), '-o', 'ConnectTimeout=5']

        if config.get('ssh_key_path'):
            ssh_cmd.extend(['-i', config['ssh_key_path']])

        target = f"{user}@{host}" if user else host
        ssh_cmd.extend([target, 'echo', 'connection_test'])

        result = subprocess.run(ssh_cmd, capture_output=True, text=True, timeout=10)

        if result.returncode == 0:
            return (True, f"Successfully connected to {target}")
        else:
            return (False, f"Connection failed: {result.stderr}")

    except subprocess.TimeoutExpired:
        return (False, "Connection timed out")
    except Exception as e:
        return (False, str(e))


def _test_cloud_connection(config):
    """Test R2/S3 connection"""
    try:
        provider = config.get('cloud_provider', 'r2')
        bucket_name = config.get('cloud_bucket')
        access_key = config.get('cloud_access_key')
        secret_key = config.get('cloud_secret_key')
        endpoint = config.get('cloud_endpoint')
        region = config.get('cloud_region', 'auto')

        if not all([bucket_name, access_key, secret_key]):
            return (False, "Missing required credentials")

        # Initialize S3 client
        if provider == 'r2':
            s3_client = boto3.client(
                's3',
                endpoint_url=endpoint,
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                config=BotoConfig(signature_version='s3v4'),
                region_name='auto'
            )
        else:
            s3_client = boto3.client(
                's3',
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                region_name=region
            )

        # Test bucket access
        s3_client.head_bucket(Bucket=bucket_name)

        return (True, f"Successfully connected to {provider.upper()} bucket: {bucket_name}")

    except ClientError as e:
        error_code = e.response['Error']['Code']
        if error_code == '403':
            return (False, "Access denied. Check credentials and bucket permissions.")
        elif error_code == '404':
            return (False, "Bucket not found. Check bucket name.")
        else:
            return (False, f"Connection error: {str(e)}")
    except Exception as e:
        return (False, str(e))
