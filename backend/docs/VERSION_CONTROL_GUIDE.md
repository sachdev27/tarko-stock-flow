# Version Control & Automated Backup System

This document explains the complete version control and automated backup system for Tarko Inventory.

## Features Overview

### 1. Database Snapshots
- **Manual Snapshots**: Create snapshots on-demand via Admin panel
- **Automatic Snapshots**: Daily snapshots at 2:00 AM automatically
- **Snapshot Content**: Complete database state including:
  - Batches and Rolls
  - Transactions
  - Product information (types, variants, brands)
  - Customer data
  - Parameter options
  - All configuration settings

### 2. Rollback Functionality
- **Rollback to Any Snapshot**: Restore database to any previous snapshot
- **Safety Features**:
  - Confirmation dialog with warnings
  - Audit logging of all rollback operations
  - History tracking with timestamps and user info
- **Rollback Process**:
  - Soft deletes existing data (sets is_deleted=true)
  - Restores data from snapshot
  - Maintains data integrity across all tables

### 3. Google Drive Integration
- **Automatic Sync**: Every daily snapshot automatically synced to Google Drive
- **Manual Sync**: Sync any snapshot manually via Admin panel
- **Bulk Sync**: Sync all recent snapshots (last 7 days)
- **Storage**: Backups stored in "Tarko Inventory Backups" folder
- **Retention**: 30-day automatic cleanup (both local and Drive)

### 4. Admin Panel Features
- **Version Control Tab**: Complete management interface
- **Drive Status**: Real-time connection status indicator
- **Snapshot List**: View all snapshots with metadata
- **Rollback History**: Audit trail of all rollback operations
- **Quick Actions**: Create, delete, sync, and rollback buttons

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
./setup_backup_system.sh
```

Or manually:
```bash
pip install -r requirements.txt
```

### 2. Run Database Migration

```bash
psql -U your_user -d tarko_inventory -f migrations/add_version_control.sql
```

### 3. Configure Google Drive (Optional)

See `GOOGLE_DRIVE_SETUP.md` for detailed instructions.

**Quick setup:**
1. Create Google Cloud project
2. Enable Google Drive API
3. Create service account
4. Download credentials JSON
5. Save as `google_drive_credentials.json` in backend directory

### 4. Start Application

The scheduler will start automatically with the Flask app:

```bash
python app.py
```

You should see:
```
INFO:scheduler:Daily snapshot scheduler initialized
INFO:app:Background scheduler started successfully
```

## Usage Guide

### Creating Manual Snapshots

1. Navigate to **Admin Panel** → **Version Control** tab
2. Click **Create Snapshot** button
3. Fill in:
   - **Snapshot Name**: Descriptive name (required)
   - **Description**: Optional details
   - **Tags**: Optional labels (comma-separated)
4. Click **Create Snapshot**
5. Snapshot will be created and synced to Drive (if configured)

### Rolling Back to a Snapshot

⚠️ **Warning**: This will replace current data with snapshot data

1. In Version Control tab, find the snapshot
2. Click **Rollback** button
3. Review the warning message
4. Type the snapshot name to confirm
5. Click **Confirm Rollback**
6. Database will be restored to that snapshot state

### Syncing to Google Drive

**Test Connection:**
1. Click **Test Connection** button
2. Status badge will update

**Sync Single Snapshot:**
1. Find snapshot without "google-drive-synced" badge
2. Click **Sync** button on that snapshot
3. Wait for confirmation

**Sync All Recent:**
1. Click **Sync All Recent** button
2. Last 7 days of snapshots will sync

### Viewing Rollback History

1. Scroll to **Rollback History** section in Version Control tab
2. View all past rollback operations with:
   - Snapshot name that was restored
   - User who performed rollback
   - Timestamp
   - Success/failure status
   - Affected tables

## Automated Operations

### Daily Snapshots (2:00 AM)

The system automatically:
1. Creates snapshot named "Daily_Backup_YYYYMMDD"
2. Captures complete database state
3. Syncs to Google Drive (if configured)
4. Logs operation details
5. Cleans up snapshots older than 30 days

**System User**: `system@tarko.local` (created automatically)

### Cleanup Process

Every day during snapshot creation:
- Local: Deletes snapshots older than 30 days
- Google Drive: Deletes backups older than 30 days

**Retention Configuration**: Edit in `scheduler.py` and `google_drive_sync.py`

## File Structure

```
backend/
├── scheduler.py                      # Background task scheduler
├── google_drive_sync.py              # Google Drive integration
├── routes/
│   └── version_control_routes.py    # API endpoints
├── migrations/
│   └── add_version_control.sql      # Database schema
├── google_drive_credentials.json    # Drive credentials (not in git)
├── GOOGLE_DRIVE_SETUP.md            # Drive setup guide
├── setup_backup_system.sh           # Setup script
└── VERSION_CONTROL_GUIDE.md         # This file

frontend/src/
├── pages/
│   └── Admin.tsx                    # Admin panel with Version Control UI
└── lib/
    └── api.ts                       # API client with versionControl methods
```

## API Endpoints

### Snapshots

**List Snapshots**
```
GET /api/version-control/snapshots
```

**Create Snapshot**
```
POST /api/version-control/snapshots
Body: {
  "snapshot_name": "My Snapshot",
  "description": "Optional description",
  "tags": ["tag1", "tag2"]
}
```

**Delete Snapshot**
```
DELETE /api/version-control/snapshots/:id
```

### Rollback

**Rollback to Snapshot**
```
POST /api/version-control/rollback/:id
Body: {
  "confirm": true
}
```

**Get Rollback History**
```
GET /api/version-control/rollback-history
```

### Google Drive

**Test Connection**
```
GET /api/version-control/drive/test
```

**Sync Snapshot**
```
POST /api/version-control/drive/sync/:id
```

**Sync All Recent**
```
POST /api/version-control/drive/sync-all
Body: {
  "days": 7
}
```

## Security & Permissions

### Access Control
- All endpoints require **admin role**
- JWT authentication enforced
- Audit logging for all operations

### Data Safety
- Rollback uses soft delete (preserves original data)
- Confirmation required for destructive operations
- Complete audit trail maintained

### Google Drive Security
- Service account authentication
- Credentials stored locally (not in git)
- Encrypted API communication
- Restricted access scope

## Monitoring & Logs

### Application Logs

Check logs for scheduler activity:
```bash
tail -f logs/app.log
```

Look for:
- `Daily snapshot created successfully`
- `Successfully synced to Google Drive`
- `Cleanup complete: X old backups removed`

### Google Cloud Console

Monitor API usage:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** → **Dashboard**
4. View Drive API usage and quota

### Audit Logs

All operations recorded in database:
- Snapshot creation/deletion
- Rollback operations
- User actions with timestamps

View in **Admin Panel** → **Audit Logs** tab

## Troubleshooting

### Scheduler Not Starting

**Symptoms**: No daily snapshots created

**Solutions**:
1. Check APScheduler installed: `pip show APScheduler`
2. Verify app.py has scheduler import and initialization
3. Check logs for scheduler errors
4. Restart Flask application

### Google Drive Sync Failing

**Symptoms**: "Failed to sync to Google Drive" errors

**Solutions**:
1. Verify credentials file exists: `ls google_drive_credentials.json`
2. Test connection in Admin panel
3. Check credentials are valid (not expired/revoked)
4. Verify Drive API is enabled in Google Cloud Console
5. Check internet connectivity

### Rollback Failed

**Symptoms**: "Rollback failed" error

**Solutions**:
1. Check database connection
2. Verify snapshot data integrity
3. Review error logs for specific table issues
4. Ensure sufficient disk space
5. Check database user permissions

### Snapshots Not Appearing

**Symptoms**: No snapshots in Admin panel

**Solutions**:
1. Verify migration was run: Check `database_snapshots` table exists
2. Check user has admin role
3. Refresh the page
4. Check browser console for API errors

## Performance Considerations

### Snapshot Size

- Typical size: 5-50 MB depending on data volume
- Large databases (>10k transactions): May take 30-60 seconds
- Snapshots compressed automatically by PostgreSQL JSONB

### Impact on System

- **Daily Snapshot**: Runs at 2 AM to minimize impact
- **Database Load**: Minimal (SELECT queries only)
- **Drive Sync**: Asynchronous (doesn't block other operations)
- **Storage**: 30 snapshots × ~20 MB = ~600 MB average

### Optimization Tips

1. **Adjust retention**: Reduce from 30 to 14 days if storage is limited
2. **Schedule timing**: Change from 2 AM to off-peak hours
3. **Selective tables**: Remove less critical tables from `SNAPSHOT_TABLES`
4. **Compression**: Already enabled via JSONB storage

## Best Practices

### When to Create Manual Snapshots

1. **Before major changes**: New feature deployment, bulk imports
2. **Before data migrations**: Schema changes, data transformations
3. **Critical operations**: Mass deletions, complex updates
4. **Regular intervals**: Weekly backups during high-activity periods

### Naming Conventions

- **Daily Auto**: `Daily_Backup_20231215` (automatic)
- **Pre-deployment**: `Pre_Deploy_v2.3.0`
- **Before migration**: `Before_Schema_Update_2023Q4`
- **Manual backup**: `Manual_Backup_AfterBigOrder`

### Testing Recovery

Periodically test rollback:
1. Create test snapshot
2. Make some test changes
3. Rollback to test snapshot
4. Verify data restored correctly
5. Delete test snapshot

## FAQ

**Q: What happens if Google Drive is not configured?**
A: Snapshots still work normally, stored only in local database. Drive sync is optional.

**Q: Can I download a snapshot for offline backup?**
A: Yes, download from Google Drive or export from database using pgAdmin/SQL.

**Q: How do I restore from a very old snapshot?**
A: Manual snapshots are kept indefinitely (only automatic ones are cleaned up).

**Q: Will rollback affect user accounts?**
A: No, user accounts and auth data are excluded from snapshots for security.

**Q: Can I change the 2 AM schedule?**
A: Yes, edit `scheduler.py` line with `CronTrigger(hour=2, minute=0)`.

**Q: What if snapshot creation fails?**
A: Error is logged, notification sent (if configured), system continues normally.

**Q: How much does Google Drive cost?**
A: Free for most usage. Standard Drive storage costs apply if quota exceeded.

## Support

For issues or questions:
1. Check logs: `backend/logs/`
2. Review this guide and GOOGLE_DRIVE_SETUP.md
3. Check database connectivity
4. Verify permissions and credentials
5. Contact system administrator

## Version History

- **v1.0.0** (Current): Initial release with full functionality
  - Database snapshots
  - Rollback capability
  - Google Drive sync
  - Automated daily backups
  - Admin panel UI
