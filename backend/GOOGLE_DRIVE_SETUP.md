# Google Drive Integration Setup

This guide will help you set up Google Drive integration for automatic backup syncing.

## Prerequisites

- Google account with Google Drive access
- Google Cloud Console access

## Setup Steps

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Enter project name (e.g., "Tarko Inventory Backups")
4. Click "Create"

### 2. Enable Google Drive API

1. In the Google Cloud Console, go to "APIs & Services" → "Library"
2. Search for "Google Drive API"
3. Click on it and press "Enable"

### 3. Create Service Account

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "Service Account"
3. Enter service account details:
   - Name: `tarko-backup-service`
   - Description: `Service account for automated backups`
4. Click "Create and Continue"
5. Grant the "Editor" role (or create a custom role with Drive access)
6. Click "Done"

### 4. Generate Service Account Key

1. Click on the created service account email
2. Go to the "Keys" tab
3. Click "Add Key" → "Create new key"
4. Select "JSON" format
5. Click "Create" - a JSON file will download

### 5. Configure Application

1. Rename the downloaded JSON file to `google_drive_credentials.json`
2. Move it to the backend directory:
   ```bash
   mv ~/Downloads/tarko-backup-service-*.json /path/to/backend/google_drive_credentials.json
   ```
3. Ensure file permissions are secure:
   ```bash
   chmod 600 google_drive_credentials.json
   ```

### 6. Alternative: Use Environment Variable

Instead of placing the file in the backend directory, you can set an environment variable:

```bash
export GOOGLE_DRIVE_CREDENTIALS_PATH=/path/to/google_drive_credentials.json
```

Add this to your `.env` file or shell profile for persistence.

### 7. Test Connection

After starting the server, test the Google Drive connection:

```bash
# From the backend directory
curl -X GET http://localhost:5500/api/version-control/drive/test \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Or use the Admin panel → Version Control → Test Drive Connection button (UI button to be added).

## Features

### Automatic Daily Sync

- Snapshots are automatically created at 2:00 AM daily
- Each snapshot is immediately synced to Google Drive
- Old backups (>30 days) are automatically cleaned up from both database and Drive

### Manual Sync

You can manually sync snapshots via the API:

```bash
# Sync a specific snapshot
curl -X POST http://localhost:5500/api/version-control/drive/sync/<snapshot_id> \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Sync all recent snapshots (last 7 days)
curl -X POST http://localhost:5500/api/version-control/drive/sync-all \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"days": 7}'
```

## Backup Location

Backups are stored in a folder named "Tarko Inventory Backups" in the service account's Drive. To access them:

1. Go to [Google Drive](https://drive.google.com)
2. Share the "Tarko Inventory Backups" folder with your personal email:
   - Right-click folder → Share
   - Add your email address
   - Grant "Viewer" or "Editor" access

## File Format

Each backup is saved as a JSON file with the naming format:
```
<snapshot_name>_YYYYMMDD_HHMMSS.json
```

Example: `Daily_Backup_20231215_020000.json`

## Security Considerations

1. **Keep credentials secure**: Never commit `google_drive_credentials.json` to version control
2. **Add to .gitignore**:
   ```
   echo "google_drive_credentials.json" >> .gitignore
   ```
3. **Restrict service account permissions**: Only grant necessary Drive access
4. **Rotate keys periodically**: Generate new keys every 90 days
5. **Monitor access logs**: Check Google Cloud Console for unusual activity

## Troubleshooting

### "Credentials not found" Error

- Ensure `google_drive_credentials.json` exists in the backend directory
- Check file permissions (should be readable by the app user)
- Verify `GOOGLE_DRIVE_CREDENTIALS_PATH` environment variable if using one

### "Permission denied" Error

- Ensure the service account has Drive API access
- Check that the API is enabled in Google Cloud Console
- Verify service account has appropriate IAM roles

### Backup Not Appearing in Drive

- Check server logs for upload errors
- Verify Drive API quota hasn't been exceeded
- Ensure service account has sufficient Drive storage

### Connection Test Fails

- Check internet connectivity
- Verify Google Cloud project is active
- Ensure Drive API is enabled
- Check service account credentials are valid

## Cost Considerations

- Google Drive API is **free** for most use cases
- Storage costs apply based on your Google Workspace plan
- Service account usage is included in your project's Drive quota
- Monitor usage in Google Cloud Console → APIs & Services → Dashboard

## Backup Retention

- **Local database**: 30 days of automatic snapshots
- **Google Drive**: 30 days of backups (automatically cleaned)
- Adjust retention in `scheduler.py` and `google_drive_sync.py` if needed

## Manual Backup Download

To download a backup from Google Drive:

1. Access the "Tarko Inventory Backups" folder
2. Find the desired backup file
3. Right-click → Download
4. The JSON file contains complete database state and can be used for manual restoration

## Recovery Process

To restore from a Google Drive backup:

1. Download the backup JSON file
2. Use the Version Control UI to create a new snapshot
3. Manually import the data or use rollback functionality
4. Verify data integrity after restoration
