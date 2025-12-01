"""
Snapshot Storage Service
Handles saving and loading snapshots to/from local file system
"""

import os
import json
import shutil
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)

class SnapshotStorage:
    """Manages snapshot storage in local file system"""

    def __init__(self, storage_path: str = None):
        # Use local snapshots directory for development, /app/snapshots for Docker
        default_path = os.getenv('SNAPSHOT_STORAGE_PATH', './snapshots')
        self.storage_path = Path(storage_path or default_path)

        # Create directory with proper error handling
        try:
            self.storage_path.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            logger.warning(f"Could not create snapshot directory at {self.storage_path}: {e}")
            # Fallback to current directory
            self.storage_path = Path('./snapshots')
            self.storage_path.mkdir(parents=True, exist_ok=True)

    def save_snapshot(self, snapshot_id: str, snapshot_data: Dict, metadata: Dict) -> bool:
        """
        Save snapshot to local storage

        Args:
            snapshot_id: Unique snapshot identifier
            snapshot_data: Dictionary of table data
            metadata: Snapshot metadata (name, description, etc.)

        Returns:
            bool: Success status
        """
        try:
            # Ensure base storage path exists
            self.storage_path.mkdir(parents=True, exist_ok=True)
            
            snapshot_dir = self.storage_path / snapshot_id
            snapshot_dir.mkdir(parents=True, exist_ok=True)
            
            snapshot_dir = self.storage_path / snapshot_id
            snapshot_dir.mkdir(parents=True, exist_ok=True)

            # Save metadata
            metadata_file = snapshot_dir / 'metadata.json'
            with open(metadata_file, 'w') as f:
                json.dump(metadata, f, indent=2, default=str)

            # Save each table's data separately for better performance
            for table_name, table_data in snapshot_data.items():
                table_file = snapshot_dir / f"{table_name}.json"
                with open(table_file, 'w') as f:
                    json.dump(table_data, f, indent=2, default=str)

            # Save complete snapshot as single file for quick restore
            complete_file = snapshot_dir / 'complete.json'
            with open(complete_file, 'w') as f:
                json.dump(snapshot_data, f, default=str)

            logger.info(f"Snapshot saved to {snapshot_dir}")
            return True

        except Exception as e:
            logger.error(f"Failed to save snapshot {snapshot_id}: {e}")
            return False

    def load_snapshot(self, snapshot_id: str) -> Optional[Dict]:
        """
        Load snapshot from local storage

        Args:
            snapshot_id: Unique snapshot identifier

        Returns:
            Dict: Snapshot data or None if not found
        """
        try:
            snapshot_dir = self.storage_path / snapshot_id
            complete_file = snapshot_dir / 'complete.json'

            if not complete_file.exists():
                logger.error(f"Snapshot not found: {snapshot_id}")
                return None

            with open(complete_file, 'r') as f:
                snapshot_data = json.load(f)

            logger.info(f"Snapshot loaded from {snapshot_dir}")
            return snapshot_data

        except Exception as e:
            logger.error(f"Failed to load snapshot {snapshot_id}: {e}")
            return None

    def load_metadata(self, snapshot_id: str) -> Optional[Dict]:
        """Load snapshot metadata"""
        try:
            snapshot_dir = self.storage_path / snapshot_id
            metadata_file = snapshot_dir / 'metadata.json'

            if not metadata_file.exists():
                return None

            with open(metadata_file, 'r') as f:
                return json.load(f)

        except Exception as e:
            logger.error(f"Failed to load metadata for {snapshot_id}: {e}")
            return None

    def delete_snapshot(self, snapshot_id: str) -> bool:
        """Delete snapshot from local storage"""
        try:
            snapshot_dir = self.storage_path / snapshot_id

            if snapshot_dir.exists():
                shutil.rmtree(snapshot_dir)
                logger.info(f"Snapshot deleted: {snapshot_id}")
                return True
            else:
                logger.warning(f"Snapshot directory not found: {snapshot_id}")
                return False

        except Exception as e:
            logger.error(f"Failed to delete snapshot {snapshot_id}: {e}")
            return False

    def list_snapshots(self) -> List[Dict]:
        """List all available snapshots"""
        snapshots = []

        try:
            for snapshot_dir in self.storage_path.iterdir():
                if snapshot_dir.is_dir():
                    metadata = self.load_metadata(snapshot_dir.name)
                    if metadata:
                        snapshots.append({
                            'id': snapshot_dir.name,
                            'metadata': metadata,
                            'size_mb': self._get_dir_size(snapshot_dir) / (1024 * 1024)
                        })

            return sorted(snapshots, key=lambda x: x['metadata'].get('created_at', ''), reverse=True)

        except Exception as e:
            logger.error(f"Failed to list snapshots: {e}")
            return []

    def _get_dir_size(self, path: Path) -> int:
        """Calculate total size of directory"""
        total = 0
        for entry in path.rglob('*'):
            if entry.is_file():
                total += entry.stat().st_size
        return total

    def export_snapshot(self, snapshot_id: str, export_path: str) -> bool:
        """Export snapshot to external location"""
        try:
            snapshot_dir = self.storage_path / snapshot_id
            if not snapshot_dir.exists():
                logger.error(f"Snapshot directory not found: {snapshot_dir}")
                return False

            export_dest = Path(export_path)
            
            # If export_dest already includes the snapshot_id, use it directly
            # Otherwise, append the snapshot_id
            if export_dest.name != snapshot_id:
                export_dest = export_dest / snapshot_id
            
            # Create parent directory if it doesn't exist
            export_dest.parent.mkdir(parents=True, exist_ok=True)
            
            # Copy the snapshot directory
            if export_dest.exists():
                shutil.rmtree(export_dest)
            shutil.copytree(snapshot_dir, export_dest, dirs_exist_ok=True)
            
            logger.info(f"Snapshot exported to {export_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to export snapshot {snapshot_id}: {e}")
            return False

    def import_snapshot(self, import_path: str, snapshot_id: str = None) -> Optional[str]:
        """Import snapshot from external location"""
        try:
            import_src = Path(import_path)
            if not import_src.exists():
                return None

            # Use provided ID or generate new one
            if not snapshot_id:
                snapshot_id = f"imported_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

            snapshot_dir = self.storage_path / snapshot_id
            shutil.copytree(import_src, snapshot_dir, dirs_exist_ok=True)
            logger.info(f"Snapshot imported from {import_path}")
            return snapshot_id

        except Exception as e:
            logger.error(f"Failed to import snapshot: {e}")
            return None

# Global instance
snapshot_storage = SnapshotStorage()
