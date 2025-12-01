# 🚀 Quick Start: Cloud Backup & External Storage

Get your backup system running in 5 minutes!

---

## Step 1: Install Dependencies

```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
```

This installs `boto3` for cloud storage support.

---

## Step 2: Choose Your Setup

### Option A: Cloud Backup Only (Cloudflare R2)

**Best for:** Automatic offsite backups, disaster recovery

1. **Get R2 credentials** (2 minutes):
   - Go to https://dash.cloudflare.com/
   - Navigate to R2 → Create/Select bucket
   - Click "Manage R2 API Tokens" → "Create API Token"
   - Save: Account ID, Access Key ID, Secret Key

2. **Configure `.env`**:
   ```bash
   ENABLE_CLOUD_BACKUP=true
   CLOUD_STORAGE_PROVIDER=r2
   R2_ACCOUNT_ID=your_account_id
   R2_ACCESS_KEY_ID=your_access_key
   R2_SECRET_ACCESS_KEY=your_secret_key
   R2_BUCKET_NAME=tarko-inventory-backups
   ```

3. **Restart backend**:
   ```bash
   ./backend/venv/bin/python backend/app.py
   ```

### Option B: External Storage Only

**Best for:** Physical backups, offline storage, no cloud costs

No configuration needed! Just use the API:
- Plug in USB drive
- Export snapshots via admin panel
- Store offsite

### Option C: Both (Recommended)

Combine cloud + external for maximum protection:
- Cloud: Automatic daily backups
- External: Weekly physical backups

---

## Step 3: Test Installation

```bash
cd backend
python test_backup_system.py
```

Expected output:
```
🧪 TARKO INVENTORY - BACKUP SYSTEM TEST

Testing Imports...
✅ boto3 imported successfully
✅ cloud_storage module imported
✅ external_storage module imported

Testing Cloud Storage Configuration...
Cloud Backup Enabled: True
Provider: r2
✅ Cloud storage initialized successfully

🎉 All tests passed! Backup system is ready to use.
```

---

## Step 4: Create Your First Backup

### Via Admin Panel (UI)
1. Go to Admin → Version Control
2. Click "Create Snapshot"
3. Fill in name and description
4. Click "Create"
5. ✅ Snapshot auto-syncs to cloud!

### Via API
```bash
curl -X POST http://localhost:5000/api/version-control/snapshots \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot_name": "first_backup",
    "description": "Testing cloud backup"
  }'
```

---

## Step 5: Verify Cloud Backup

Check that your snapshot is in the cloud:

```bash
curl http://localhost:5000/api/version-control/cloud/snapshots \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Or check your R2/S3 dashboard directly.

---

## 🔥 Common Use Cases

### Daily Automatic Backups
Already configured! Snapshots auto-sync to cloud after creation.

### Export to USB Drive
```bash
# 1. Plug in USB drive
# 2. Detect devices
GET /api/version-control/external/devices

# 3. Export
POST /api/version-control/external/export
{
  "snapshot_id": "your-snapshot-id",
  "destination_path": "/Volumes/USB_DRIVE",
  "compress": true
}
```

### Restore from Cloud
```bash
POST /api/version-control/cloud/snapshots/{snapshot_id}/restore
```

### Disaster Recovery
If server crashes:
1. Setup new server
2. Configure cloud credentials
3. List cloud snapshots
4. Restore latest snapshot
5. Back in business! ✅

---

## 💰 Costs

### Cloudflare R2 (Per Month)
- 10GB: **$0.15**
- 50GB: **$0.75**
- 100GB: **$1.50**
- Egress: **FREE**

### AWS S3 (Per Month)
- 10GB: **$0.23** + egress
- 50GB: **$1.15** + egress
- 100GB: **$2.30** + egress
- Egress: **$0.09/GB**

### External Storage
- USB Drive: **$20-50** (one-time)
- Ongoing: **$0**

---

## 📊 Monitoring

Check backup status anytime:

```bash
# Cloud status
GET /api/version-control/cloud/status

# Response:
{
  "enabled": true,
  "provider": "r2",
  "stats": {
    "total_size_gb": 2.5,
    "file_count": 150
  }
}
```

---

## 🆘 Troubleshooting

### "Cloud credentials not found"
- Check `.env` file has correct variables
- Restart backend after changing `.env`
- Run `python test_backup_system.py` to verify

### "Failed to upload to cloud"
- Check internet connection
- Verify credentials are correct
- Check bucket name matches

### "Device not detected"
- Make sure USB drive is plugged in
- Check drive is mounted (`ls /Volumes/` on macOS)
- Try unplugging and replugging

---

## 📚 Next Steps

✅ Read full documentation: `CLOUD_BACKUP_SETUP.md`
✅ Set up automated backups schedule
✅ Test disaster recovery procedure
✅ Configure backup retention policies

---

## 🎯 API Endpoints Quick Reference

```
Cloud Storage:
  GET    /api/version-control/cloud/status
  GET    /api/version-control/cloud/snapshots
  POST   /api/version-control/cloud/snapshots/{id}/download
  POST   /api/version-control/cloud/snapshots/{id}/restore
  POST   /api/version-control/cloud/snapshots/{id}/upload
  DELETE /api/version-control/cloud/snapshots/{id}

External Storage:
  GET    /api/version-control/external/devices
  POST   /api/version-control/external/export
  POST   /api/version-control/external/import
  POST   /api/version-control/external/snapshots
  POST   /api/version-control/external/verify
```

---

**You're all set! 🎉**

Questions? Check `CLOUD_BACKUP_SETUP.md` for detailed docs.
