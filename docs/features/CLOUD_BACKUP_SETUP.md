# Cloud Backup & External Storage Setup Guide

Complete guide for setting up cloud backup (Cloudflare R2 / AWS S3) and external storage features for Tarko Inventory System.

---

## 🌥️ Cloud Storage Options

### Option 1: Cloudflare R2 (Recommended)
**Advantages:**
- ✅ S3-compatible API
- ✅ Zero egress fees (free data transfer out)
- ✅ $0.015/GB/month storage
- ✅ Simple setup
- ✅ Global edge network

**Pricing:** ~$1.50/month for 100GB of backups

### Option 2: AWS S3
**Advantages:**
- ✅ Industry standard
- ✅ Advanced features
- ✅ Multiple storage tiers

**Pricing:** ~$2.30/month for 100GB + egress fees

---

## 📋 Setup Instructions

### 1. Cloudflare R2 Setup

#### Step 1: Create R2 Account
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **R2** in the sidebar
3. Click **"Purchase R2"** (free to start, pay as you go)

#### Step 2: Create API Token
1. In R2 dashboard, click **"Manage R2 API Tokens"**
2. Click **"Create API Token"**
3. Configure permissions:
   - **Token name:** `tarko-inventory-backup`
   - **Permissions:** Object Read & Write
   - **TTL:** Never expire (or set custom)
4. Click **"Create API Token"**
5. **Save these values** (you won't see them again):
   - Access Key ID
   - Secret Access Key
   - Account ID (from R2 dashboard URL)

#### Step 3: Create Bucket
1. Go to R2 dashboard
2. Click **"Create bucket"**
3. **Bucket name:** `tarko-inventory-backups`
4. **Location:** Auto (Cloudflare automatically distributes)
5. Click **"Create bucket"**

#### Step 4: Configure Environment Variables
Add to your `.env` file:

```bash
# Enable cloud backup
ENABLE_CLOUD_BACKUP=true
CLOUD_STORAGE_PROVIDER=r2

# Cloudflare R2 credentials
R2_ACCOUNT_ID=your_account_id_here
R2_ACCESS_KEY_ID=your_access_key_id_here
R2_SECRET_ACCESS_KEY=your_secret_key_here
R2_BUCKET_NAME=tarko-inventory-backups
```

### 2. AWS S3 Setup (Alternative)

#### Step 1: Create S3 Bucket
1. Go to [AWS S3 Console](https://console.aws.amazon.com/s3/)
2. Click **"Create bucket"**
3. **Bucket name:** `tarko-inventory-backups`
4. **Region:** Choose closest to you (e.g., `us-east-1`)
5. **Block Public Access:** Keep enabled (recommended)
6. Click **"Create bucket"**

#### Step 2: Create IAM User
1. Go to [IAM Console](https://console.aws.amazon.com/iam/)
2. Click **"Users"** → **"Add user"**
3. **User name:** `tarko-backup-service`
4. **Access type:** Programmatic access
5. **Permissions:** Attach policy `AmazonS3FullAccess` (or custom policy)
6. Save **Access Key ID** and **Secret Access Key**

#### Step 3: Configure Environment Variables
Add to your `.env` file:

```bash
# Enable cloud backup
ENABLE_CLOUD_BACKUP=true
CLOUD_STORAGE_PROVIDER=s3

# AWS S3 credentials
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-east-1
S3_BUCKET_NAME=tarko-inventory-backups
```

---

## 🔧 Installation

### Install Dependencies
```bash
cd backend
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

This installs:
- `boto3` - AWS SDK for Python (works with R2)
- `botocore` - Low-level interface

### Verify Installation
```bash
python -c "import boto3; print('boto3 installed:', boto3.__version__)"
```

---

## 🚀 Usage

### Automatic Cloud Sync
When cloud backup is enabled, snapshots are **automatically synced** to cloud storage:

1. Create snapshot in admin panel
2. Snapshot saves locally first (fast)
3. Background upload to cloud begins (non-blocking)
4. Verify upload in cloud storage provider

### Manual Cloud Operations

#### Check Cloud Status
```bash
GET /api/version-control/cloud/status
```

Response:
```json
{
  "enabled": true,
  "provider": "r2",
  "stats": {
    "total_size_gb": 2.5,
    "file_count": 150,
    "bucket": "tarko-inventory-backups"
  }
}
```

#### List Cloud Snapshots
```bash
GET /api/version-control/cloud/snapshots
```

#### Upload Local Snapshot to Cloud
```bash
POST /api/version-control/cloud/snapshots/{snapshot_id}/upload
```

#### Download Snapshot from Cloud
```bash
POST /api/version-control/cloud/snapshots/{snapshot_id}/download
```

#### Restore Database from Cloud
```bash
POST /api/version-control/cloud/snapshots/{snapshot_id}/restore
```

This will:
1. Download snapshot from cloud
2. Restore database to that snapshot
3. Log the rollback action

---

## 💾 External Storage (USB/Pendrive)

### Features
- Export snapshots to USB drives, external HDDs, network shares
- Import snapshots from external devices
- Automatic device detection (macOS, Linux, Windows)
- Compressed archives to save space
- Integrity verification

### Usage

#### 1. Detect Available Devices
```bash
GET /api/version-control/external/devices
```

Response:
```json
{
  "devices": [
    {
      "name": "USB Drive",
      "path": "/Volumes/USB_DRIVE",
      "type": "external",
      "total_space_gb": 128,
      "free_space_gb": 95.3,
      "writable": true
    }
  ]
}
```

#### 2. Export Snapshot to External Device
```bash
POST /api/version-control/external/export
{
  "snapshot_id": "123e4567-e89b-12d3-a456-426614174000",
  "destination_path": "/Volumes/USB_DRIVE",
  "compress": true
}
```

Creates:
```
/Volumes/USB_DRIVE/
  └── TarkoInventoryBackups/
      ├── README.txt
      ├── {snapshot_id}.tar.gz
      └── {snapshot_id}_manifest.json
```

#### 3. List Snapshots on External Device
```bash
POST /api/version-control/external/snapshots
{
  "device_path": "/Volumes/USB_DRIVE"
}
```

#### 4. Import Snapshot from External Device
```bash
POST /api/version-control/external/import
{
  "source_path": "/Volumes/USB_DRIVE/TarkoInventoryBackups/snapshot_20250130.tar.gz"
}
```

#### 5. Verify External Snapshot Integrity
```bash
POST /api/version-control/external/verify
{
  "snapshot_path": "/Volumes/USB_DRIVE/TarkoInventoryBackups/snapshot_20250130.tar.gz"
}
```

---

## 🔐 Security Features

### Cloud Storage
- ✅ **Server-side encryption (AES-256)** - Data encrypted at rest
- ✅ **TLS/HTTPS** - Encrypted data transfer
- ✅ **Access control** - Only admin users can manage backups
- ✅ **Audit logging** - All operations logged
- ✅ **File integrity** - SHA-256 checksums

### External Storage
- ✅ **Integrity verification** - Checksums for all files
- ✅ **Compressed archives** - Saves space, prevents tampering
- ✅ **Space verification** - Checks available space before export
- ✅ **Read-only imports** - Original files never modified

---

## 📊 Backup Strategy Recommendations

### Three-Tier Approach
```
┌─────────────┬─────────────┬──────────────┬─────────────┐
│ Tier        │ Location    │ Retention    │ Purpose     │
├─────────────┼─────────────┼──────────────┼─────────────┤
│ HOT         │ Local       │ 7 days       │ Quick access│
│ WARM        │ Cloud (R2)  │ 90 days      │ DR recovery │
│ COLD        │ External HD │ 1 year       │ Compliance  │
└─────────────┴─────────────┴──────────────┴─────────────┘
```

### Automated Schedule
1. **Daily** - Automatic snapshot creation (local + cloud)
2. **Weekly** - Export to external drive (Sunday night)
3. **Monthly** - Verify all backups, rotate external drives

### Recovery Time Objectives (RTO)
- Local rollback: **< 5 minutes**
- Cloud rollback: **< 30 minutes** (depends on download speed)
- External rollback: **< 15 minutes** (physical access required)

---

## 🧪 Testing

### Test Cloud Backup
```bash
# 1. Create test snapshot
POST /api/version-control/snapshots
{
  "snapshot_name": "test_cloud_backup",
  "description": "Testing cloud sync"
}

# 2. Verify upload (check logs or cloud dashboard)
GET /api/version-control/cloud/snapshots

# 3. Delete local copy (simulate data loss)
rm -rf ./snapshots/test_snapshot_id

# 4. Restore from cloud
POST /api/version-control/cloud/snapshots/{snapshot_id}/restore
```

### Test External Backup
```bash
# 1. Plug in USB drive
# 2. Detect devices
GET /api/version-control/external/devices

# 3. Export snapshot
POST /api/version-control/external/export
{
  "snapshot_id": "...",
  "destination_path": "/Volumes/USB_DRIVE"
}

# 4. Verify on USB
ls -la /Volumes/USB_DRIVE/TarkoInventoryBackups/

# 5. Import back
POST /api/version-control/external/import
{
  "source_path": "/Volumes/USB_DRIVE/TarkoInventoryBackups/..."
}
```

---

## 🐛 Troubleshooting

### Cloud Storage Issues

**Problem:** "Cloud credentials not found"
```bash
# Check environment variables are set
env | grep R2
env | grep AWS

# Restart backend after setting variables
```

**Problem:** "Failed to upload to cloud"
```bash
# Check network connectivity
ping <your_r2_endpoint>.r2.cloudflarestorage.com

# Check credentials validity
# View logs for detailed error
tail -f backend/logs/app.log
```

**Problem:** "Bucket does not exist"
```bash
# Verify bucket name matches .env
# Create bucket in cloud provider dashboard
```

### External Storage Issues

**Problem:** "Device not detected"
```bash
# macOS - Check Volumes
ls /Volumes/

# Linux - Check media/mnt
ls /media/$USER/
ls /mnt/

# Ensure drive is mounted and readable
```

**Problem:** "Insufficient space"
```bash
# Check available space
df -h /path/to/device

# Free up space or use compression
# compress=true reduces size by ~70%
```

---

## 💰 Cost Estimates

### Cloudflare R2
```
Storage: 100GB × $0.015/GB = $1.50/month
Egress: Unlimited FREE
Operations: ~$0.01/month (1000 ops)
Total: ~$1.50/month
```

### AWS S3 (Standard)
```
Storage: 100GB × $0.023/GB = $2.30/month
Egress: 100GB × $0.09/GB = $9.00/month
Operations: ~$0.01/month
Total: ~$11.30/month
```

### External Storage
```
USB Drive: $20-50 one-time
External HDD: $50-100 one-time
Ongoing cost: $0
```

---

## 📚 Additional Resources

- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [boto3 Documentation](https://boto3.amazonaws.com/v1/documentation/api/latest/index.html)

---

## 🆘 Support

For issues or questions:
1. Check logs: `backend/logs/app.log`
2. Verify configuration: `backend/config.py`
3. Test connectivity: Use provided test scripts
4. Contact system administrator

---

**Last Updated:** November 30, 2025
**Version:** 1.0.0
