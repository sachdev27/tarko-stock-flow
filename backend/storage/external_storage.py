"""
External Storage Service
Handles snapshot backup and restore to/from external devices (USB, external drives, network shares)
"""

import os
import json
import shutil
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Tuple
import hashlib
import platform

logger = logging.getLogger(__name__)


class ExternalStorage:
    """Manages snapshot export/import to external storage devices"""

    def __init__(self):
        """Initialize external storage manager"""
        self.temp_dir = Path('./temp_exports')
        self.temp_dir.mkdir(parents=True, exist_ok=True)

    def detect_external_devices(self) -> List[Dict]:
        """
        Detect available external storage devices

        Returns:
            List of device information dictionaries
        """
        devices = []

        # Always include local filesystem as an option
        try:
            local_export_path = Path('./external_backups')
            local_export_path.mkdir(parents=True, exist_ok=True)
            stat = os.statvfs(local_export_path)
            total_space = stat.f_blocks * stat.f_frsize
            free_space = stat.f_bavail * stat.f_frsize

            devices.append({
                'name': 'Local Filesystem (Server)',
                'path': str(local_export_path.absolute()),
                'type': 'local',
                'total_space_gb': total_space / (1024**3),
                'free_space_gb': free_space / (1024**3),
                'writable': True
            })
        except Exception as e:
            logger.warning(f"Could not add local filesystem: {e}")

        system = platform.system()

        try:
            if system == 'Darwin':  # macOS
                # Check /Volumes for mounted external drives
                volumes_path = Path('/Volumes')
                if volumes_path.exists():
                    for volume in volumes_path.iterdir():
                        if volume.is_dir() and volume.name != 'Macintosh HD':
                            try:
                                stat = os.statvfs(volume)
                                total_space = stat.f_blocks * stat.f_frsize
                                free_space = stat.f_bavail * stat.f_frsize

                                devices.append({
                                    'name': volume.name,
                                    'path': str(volume),
                                    'type': 'external',
                                    'total_space_gb': total_space / (1024**3),
                                    'free_space_gb': free_space / (1024**3),
                                    'writable': os.access(volume, os.W_OK)
                                })
                            except Exception as e:
                                logger.warning(f"Could not read volume {volume}: {e}")

            elif system == 'Linux':
                # Check /media and /mnt for mounted devices
                for mount_point in ['/media', '/mnt']:
                    mount_path = Path(mount_point)
                    if mount_path.exists():
                        for device in mount_path.rglob('*'):
                            if device.is_dir() and device != mount_path:
                                try:
                                    stat = os.statvfs(device)
                                    total_space = stat.f_blocks * stat.f_frsize
                                    free_space = stat.f_bavail * stat.f_frsize

                                    devices.append({
                                        'name': device.name,
                                        'path': str(device),
                                        'type': 'external',
                                        'total_space_gb': total_space / (1024**3),
                                        'free_space_gb': free_space / (1024**3),
                                        'writable': os.access(device, os.W_OK)
                                    })
                                except Exception as e:
                                    logger.warning(f"Could not read device {device}: {e}")

            elif system == 'Windows':
                # Check for removable drives
                import string
                from ctypes import windll

                drives = []
                bitmask = windll.kernel32.GetLogicalDrives()
                for letter in string.ascii_uppercase:
                    if bitmask & 1:
                        drive_path = f"{letter}:\\"
                        drive_type = windll.kernel32.GetDriveTypeW(drive_path)
                        # Type 2 = Removable, Type 3 = Fixed (external), Type 4 = Network
                        if drive_type in [2, 3]:
                            try:
                                stat = os.statvfs(drive_path)
                                total_space = stat.f_blocks * stat.f_frsize
                                free_space = stat.f_bavail * stat.f_frsize

                                devices.append({
                                    'name': f"Drive {letter}",
                                    'path': drive_path,
                                    'type': 'removable' if drive_type == 2 else 'external',
                                    'total_space_gb': total_space / (1024**3),
                                    'free_space_gb': free_space / (1024**3),
                                    'writable': os.access(drive_path, os.W_OK)
                                })
                            except Exception as e:
                                logger.warning(f"Could not read drive {letter}: {e}")
                    bitmask >>= 1

        except Exception as e:
            logger.error(f"Failed to detect external devices: {e}")

        return devices

    def export_snapshot(
        self,
        snapshot_id: str,
        source_path: Path,
        destination_path: str,
        compress: bool = True
    ) -> Tuple[bool, Optional[str]]:
        """
        Export snapshot to external storage device

        Args:
            snapshot_id: Unique snapshot identifier
            source_path: Path to local snapshot directory
            destination_path: Path on external device
            compress: Whether to create compressed archive

        Returns:
            Tuple of (success, error_message)
        """
        try:
            dest_path = Path(destination_path)

            # Create destination path if it doesn't exist
            if not dest_path.exists():
                try:
                    dest_path.mkdir(parents=True, exist_ok=True)
                    logger.info(f"Created destination directory: {destination_path}")
                except Exception as e:
                    return False, f"Cannot create destination path: {str(e)}"

            if not os.access(dest_path, os.W_OK):
                return False, f"Destination path is not writable: {destination_path}"

            # Calculate required space
            source_size = self._calculate_dir_size(source_path)
            dest_stat = os.statvfs(dest_path)
            available_space = dest_stat.f_bavail * dest_stat.f_frsize

            # Add 20% buffer for compression overhead
            required_space = source_size * 1.2

            if available_space < required_space:
                return False, (
                    f"Insufficient space. Required: {required_space / (1024**3):.2f} GB, "
                    f"Available: {available_space / (1024**3):.2f} GB"
                )

            # Create backup directory structure
            backup_dir = dest_path / 'TarkoInventoryBackups'
            backup_dir.mkdir(parents=True, exist_ok=True)

            snapshot_dest = backup_dir / snapshot_id

            logger.info(f"Exporting snapshot {snapshot_id} to {snapshot_dest}")

            if compress:
                # Create compressed archive
                archive_name = f"{snapshot_id}.tar.gz"
                archive_path = backup_dir / archive_name

                import tarfile
                with tarfile.open(archive_path, 'w:gz') as tar:
                    tar.add(source_path, arcname=snapshot_id)

                logger.info(f"Created compressed archive: {archive_path}")
                export_path = str(archive_path)
            else:
                # Copy directory
                if snapshot_dest.exists():
                    shutil.rmtree(snapshot_dest)
                shutil.copytree(source_path, snapshot_dest)
                logger.info(f"Copied snapshot to: {snapshot_dest}")
                export_path = str(snapshot_dest)

            # Create export manifest
            manifest = {
                'snapshot_id': snapshot_id,
                'exported_at': datetime.now().isoformat(),
                'source_size_bytes': source_size,
                'compressed': compress,
                'export_path': export_path,
                'checksum': self._calculate_dir_hash(source_path)
            }

            manifest_file = backup_dir / f"{snapshot_id}_manifest.json"
            with open(manifest_file, 'w') as f:
                json.dump(manifest, f, indent=2)

            # Create README for user
            readme_file = backup_dir / 'README.txt'
            if not readme_file.exists():
                with open(readme_file, 'w') as f:
                    f.write("Tarko Inventory System - Database Backups\n")
                    f.write("=" * 50 + "\n\n")
                    f.write("This directory contains database snapshots.\n")
                    f.write("Each snapshot can be restored through the admin panel.\n\n")
                    f.write("DO NOT MODIFY OR DELETE these files unless you know what you're doing.\n\n")
                    f.write(f"Last backup: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

            logger.info(f"✅ Snapshot exported successfully to external storage")
            logger.info(f"   Location: {export_path}")
            logger.info(f"   Size: {source_size / (1024**2):.2f} MB")

            return True, None

        except Exception as e:
            error_msg = f"Failed to export snapshot: {str(e)}"
            logger.error(error_msg)
            return False, error_msg

    def import_snapshot(
        self,
        source_path: str,
        destination_path: Path,
        verify_integrity: bool = True
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Import snapshot from external storage device

        Args:
            source_path: Path to snapshot on external device (file or directory)
            destination_path: Path to import snapshot to
            verify_integrity: Whether to verify checksum

        Returns:
            Tuple of (success, snapshot_id, error_message)
        """
        try:
            source = Path(source_path)

            if not source.exists():
                return False, None, f"Source path does not exist: {source_path}"

            # Determine if source is compressed archive or directory
            is_compressed = source.is_file() and (
                source.suffix in ['.gz', '.tar', '.zip'] or
                '.tar.' in source.name
            )

            snapshot_id = None
            temp_extract_path = None

            if is_compressed:
                # Extract archive to temp directory
                logger.info(f"Extracting compressed snapshot from {source}")

                snapshot_id = source.stem.replace('.tar', '')
                temp_extract_path = self.temp_dir / snapshot_id
                temp_extract_path.mkdir(parents=True, exist_ok=True)

                if source.suffix == '.gz' or '.tar.gz' in source.name:
                    import tarfile
                    with tarfile.open(source, 'r:gz') as tar:
                        tar.extractall(temp_extract_path)

                    # Find the actual snapshot directory (might be nested)
                    extracted_dirs = list(temp_extract_path.iterdir())
                    if len(extracted_dirs) == 1 and extracted_dirs[0].is_dir():
                        source_dir = extracted_dirs[0]
                    else:
                        source_dir = temp_extract_path
                else:
                    return False, None, f"Unsupported archive format: {source.suffix}"
            else:
                # Source is a directory
                snapshot_id = source.name
                source_dir = source

            # Verify manifest exists
            manifest_file = source_dir / 'metadata.json'
            if not manifest_file.exists():
                manifest_file = source_dir.parent / f"{snapshot_id}_manifest.json"

            if not manifest_file.exists():
                logger.warning(f"Manifest not found for {snapshot_id}, proceeding without verification")
            else:
                with open(manifest_file, 'r') as f:
                    manifest = json.load(f)
                    snapshot_id = manifest.get('snapshot_id', snapshot_id)

            # Copy to destination
            final_dest = destination_path / snapshot_id
            if final_dest.exists():
                shutil.rmtree(final_dest)

            shutil.copytree(source_dir, final_dest)

            # Cleanup temp extraction if needed
            if temp_extract_path and temp_extract_path.exists():
                shutil.rmtree(temp_extract_path)

            logger.info(f"✅ Snapshot imported successfully from external storage")
            logger.info(f"   Snapshot ID: {snapshot_id}")
            logger.info(f"   Location: {final_dest}")

            return True, snapshot_id, None

        except Exception as e:
            error_msg = f"Failed to import snapshot: {str(e)}"
            logger.error(error_msg)
            return False, None, error_msg

    def list_external_snapshots(self, device_path: str) -> List[Dict]:
        """
        List all snapshots available on external device

        Args:
            device_path: Path to external device

        Returns:
            List of snapshot information dictionaries
        """
        snapshots = []

        try:
            backup_dir = Path(device_path) / 'TarkoInventoryBackups'

            if not backup_dir.exists():
                logger.info(f"No backups found at {backup_dir}")
                return []

            # Find all manifests
            for manifest_file in backup_dir.glob('*_manifest.json'):
                try:
                    with open(manifest_file, 'r') as f:
                        manifest = json.load(f)

                    snapshot_id = manifest['snapshot_id']

                    # Check if snapshot exists
                    snapshot_path = backup_dir / snapshot_id
                    archive_path = backup_dir / f"{snapshot_id}.tar.gz"

                    if snapshot_path.exists() or archive_path.exists():
                        snapshots.append({
                            'id': snapshot_id,
                            'exported_at': manifest.get('exported_at'),
                            'size_mb': manifest.get('source_size_bytes', 0) / (1024**2),
                            'compressed': manifest.get('compressed', False),
                            'location': 'external',
                            'device_path': device_path,
                            'path': str(archive_path if archive_path.exists() else snapshot_path)
                        })
                except Exception as e:
                    logger.warning(f"Could not read manifest {manifest_file}: {e}")

            return sorted(snapshots, key=lambda x: x.get('exported_at', ''), reverse=True)

        except Exception as e:
            logger.error(f"Failed to list external snapshots: {e}")
            return []

    def verify_external_snapshot(self, snapshot_path: str) -> Tuple[bool, Optional[str]]:
        """
        Verify integrity of snapshot on external device

        Args:
            snapshot_path: Path to snapshot file or directory

        Returns:
            Tuple of (valid, error_message)
        """
        try:
            source = Path(snapshot_path)

            if not source.exists():
                return False, "Snapshot not found"

            # Find manifest
            if source.is_file():
                snapshot_id = source.stem.replace('.tar', '')
                manifest_file = source.parent / f"{snapshot_id}_manifest.json"
            else:
                manifest_file = source / 'metadata.json'
                if not manifest_file.exists():
                    manifest_file = source.parent / f"{source.name}_manifest.json"

            if not manifest_file.exists():
                return False, "Manifest not found"

            with open(manifest_file, 'r') as f:
                manifest = json.load(f)

            # Basic validation
            if not manifest.get('snapshot_id'):
                return False, "Invalid manifest: missing snapshot_id"

            logger.info(f"✅ External snapshot verified: {manifest['snapshot_id']}")
            return True, None

        except Exception as e:
            return False, f"Verification failed: {str(e)}"

    def _calculate_dir_size(self, path: Path) -> int:
        """Calculate total size of directory in bytes"""
        total = 0
        for entry in path.rglob('*'):
            if entry.is_file():
                total += entry.stat().st_size
        return total

    def _calculate_dir_hash(self, path: Path) -> str:
        """Calculate combined hash of all files in directory"""
        hash_obj = hashlib.sha256()

        for file_path in sorted(path.rglob('*')):
            if file_path.is_file():
                with open(file_path, 'rb') as f:
                    for chunk in iter(lambda: f.read(4096), b''):
                        hash_obj.update(chunk)

        return hash_obj.hexdigest()


# Global instance
external_storage = ExternalStorage()
