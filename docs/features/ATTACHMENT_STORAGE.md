# Attachment Storage System

## Overview
Production batch attachments (images, PDFs) are stored in the file system with support for both local and external/cloud storage paths.

## Current Implementation

### Local Storage (Default)
- **Development**: `./uploads/batches/`
- **Production (Docker)**: `/app/uploads/batches/` (mounted volume)
- **File Types**: PNG, JPG, JPEG, PDF
- **Max Size**: 10MB (configurable via `MAX_UPLOAD_SIZE_MB`)
- **Naming**: `{uuid}_{original_filename}` for uniqueness

### Configuration

#### Environment Variables
```bash
# Upload storage path (default: ./uploads)
UPLOAD_STORAGE_PATH=/path/to/uploads

# Maximum upload size in MB (default: 10)
MAX_UPLOAD_SIZE_MB=10
```

#### Docker Compose
```yaml
environment:
  UPLOAD_STORAGE_PATH: /app/uploads
volumes:
  - ./backend/uploads:/app/uploads  # Maps to host directory
```

### Directory Structure
```
backend/
├── uploads/
│   └── batches/
│       ├── {uuid}_document1.pdf
│       ├── {uuid}_image1.jpg
│       └── ...
```

## Why Not Cloud Storage Yet?

### Current Approach: Mounted Volumes
1. **Simplicity**: No cloud credentials needed
2. **Speed**: Local file access is faster
3. **Cost**: No cloud storage fees
4. **Control**: Complete ownership of data

### When to Use Cloud Storage
Consider migrating to cloud storage when:
- **Scale**: Managing 100+ GB of attachments
- **Multi-server**: Running multiple backend instances
- **Disaster Recovery**: Need offsite backups
- **CDN**: Want global distribution
- **Compliance**: Regulatory requirements for specific storage

## Migration to Cloud Storage

### Option 1: Cloudflare R2 (Recommended)
**Pros**: S3-compatible, no egress fees, fast global CDN

#### Setup Steps
1. **Install boto3** (already in requirements.txt)
   ```bash
   pip install boto3
   ```

2. **Get R2 Credentials**
   - Go to https://dash.cloudflare.com/
   - Navigate to R2 → Create bucket: `tarko-production-attachments`
   - Create API Token with read/write permissions
   - Note: Account ID, Access Key ID, Secret Key

3. **Configure Environment**
   ```bash
   ENABLE_ATTACHMENT_CLOUD_STORAGE=true
   ATTACHMENT_STORAGE_PROVIDER=r2
   R2_ACCOUNT_ID=your_account_id
   R2_ACCESS_KEY_ID=your_access_key
   R2_SECRET_ACCESS_KEY=your_secret_key
   R2_ATTACHMENTS_BUCKET=tarko-production-attachments
   ```

4. **Create Storage Service** (`backend/storage/attachment_storage.py`)
   ```python
   import boto3
   from botocore.client import Config

   class AttachmentStorage:
       def __init__(self):
           self.enabled = os.getenv('ENABLE_ATTACHMENT_CLOUD_STORAGE', 'false') == 'true'
           if self.enabled:
               account_id = os.getenv('R2_ACCOUNT_ID')
               self.s3_client = boto3.client(
                   's3',
                   endpoint_url=f'https://{account_id}.r2.cloudflarestorage.com',
                   aws_access_key_id=os.getenv('R2_ACCESS_KEY_ID'),
                   aws_secret_access_key=os.getenv('R2_SECRET_ACCESS_KEY'),
                   config=Config(signature_version='s3v4')
               )
               self.bucket = os.getenv('R2_ATTACHMENTS_BUCKET')

       def upload(self, file_path, file_key):
           if self.enabled:
               self.s3_client.upload_file(file_path, self.bucket, file_key)
               return f"https://{self.bucket}.r2.dev/{file_key}"
           return None

       def download_url(self, file_key, expires_in=3600):
           if self.enabled:
               return self.s3_client.generate_presigned_url(
                   'get_object',
                   Params={'Bucket': self.bucket, 'Key': file_key},
                   ExpiresIn=expires_in
               )
           return None
   ```

5. **Update Production Routes**
   ```python
   from storage.attachment_storage import AttachmentStorage

   attachment_storage = AttachmentStorage()

   # In create_batch():
   if file and allowed_file(file.filename):
       # Save locally first
       filepath = os.path.join(UPLOAD_FOLDER, unique_filename)
       file.save(filepath)

       # Upload to cloud if enabled
       if attachment_storage.enabled:
           cloud_url = attachment_storage.upload(filepath, f"batches/{unique_filename}")
           attachment_url = cloud_url
       else:
           attachment_url = f"/api/production/attachment/{unique_filename}"
   ```

### Option 2: AWS S3
Similar to R2 but uses standard S3 endpoint:
```bash
ENABLE_ATTACHMENT_CLOUD_STORAGE=true
ATTACHMENT_STORAGE_PROVIDER=s3
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
S3_ATTACHMENTS_BUCKET=tarko-attachments
```

### Option 3: External NFS/SAN Storage
For on-premise deployments:
```bash
UPLOAD_STORAGE_PATH=/mnt/nfs/tarko-uploads
```

Mount external storage:
```bash
# Mount NFS
mount -t nfs nas-server:/exports/tarko-uploads /mnt/nfs/tarko-uploads

# Update docker-compose.yml
volumes:
  - /mnt/nfs/tarko-uploads:/app/uploads
```

## Hybrid Approach (Recommended)

Store attachments locally AND sync to cloud for backup:

```python
# Save locally for fast access
file.save(filepath)
attachment_url = f"/api/production/attachment/{unique_filename}"

# Background sync to cloud for backup (non-blocking)
if attachment_storage.enabled:
    threading.Thread(
        target=attachment_storage.upload,
        args=(filepath, f"batches/{unique_filename}")
    ).start()
```

Benefits:
- Fast local access for UI
- Cloud backup for disaster recovery
- No dependency on cloud availability
- Cost-effective (only backup, not primary storage)

## Security Considerations

### Current Setup
- ✅ Files stored outside web root
- ✅ Secure filename generation (UUID prefix)
- ✅ File type validation
- ✅ Size limits
- ❌ No authentication on file access (anyone with URL can download)

### Recommended Improvements

1. **Add Authentication to File Downloads**
   ```python
   @production_bp.route('/attachment/<filename>', methods=['GET'])
   @jwt_required()  # Add authentication
   def get_attachment(filename):
       # Verify user has permission to access this batch
       return send_from_directory(UPLOAD_FOLDER, filename)
   ```

2. **Signed URLs for Cloud Storage**
   ```python
   # Generate temporary URLs that expire
   url = attachment_storage.download_url(file_key, expires_in=3600)
   ```

3. **Virus Scanning** (for production)
   - Use ClamAV or cloud service
   - Scan before saving

## Monitoring & Maintenance

### Check Storage Usage
```bash
# Local storage
du -sh ./backend/uploads/batches/

# Docker volume
docker exec tarko-backend du -sh /app/uploads/batches/
```

### Cleanup Old Attachments
Create a cleanup script for attachments of deleted batches:
```python
# backend/scripts/cleanup_orphaned_attachments.py
# Find attachments where batch no longer exists
# Delete files older than retention period
```

### Backup Strategy
1. **Included in Docker volumes**: Attachments are in `./backend/uploads`
2. **Regular backups**: Include in your backup strategy
3. **Cloud sync**: Use R2/S3 for automatic offsite backup

## Migration Path

### Phase 1: Fix Current Issues (DONE)
- ✅ Ensure directory creation
- ✅ Add proper error handling
- ✅ Environment variable configuration
- ✅ Docker volume mapping

### Phase 2: Add Cloud Backup (Optional)
- Implement attachment_storage service
- Background sync to R2/S3
- Keep local storage as primary

### Phase 3: Full Cloud Migration (If Needed)
- Migrate existing files to cloud
- Use cloud as primary storage
- Implement signed URLs
- Add CDN for global access

## Troubleshooting

### "Permission denied" error
```bash
# Fix permissions
chmod 755 ./backend/uploads
chmod 755 ./backend/uploads/batches
```

### "Directory not found" error
The code now automatically creates directories. If it fails:
```bash
mkdir -p ./backend/uploads/batches
```

### Docker volume issues
```bash
# Check volume mapping
docker inspect tarko-backend | grep -A 5 Mounts

# Ensure host directory exists
mkdir -p ./backend/uploads/batches
```

### File not accessible in production
```bash
# Check if file exists in Docker
docker exec tarko-backend ls -lh /app/uploads/batches/

# Check environment variable
docker exec tarko-backend env | grep UPLOAD
```

## Cost Analysis

### Local Storage (Current)
- **Cost**: Minimal (server disk space)
- **Scaling**: Limited by disk size
- **Backup**: Manual or script-based
- **Access Speed**: Very fast (local)

### Cloud Storage (R2)
- **Storage**: ~$0.015/GB/month
- **Operations**: $0.36 per million operations
- **Egress**: FREE (main advantage)
- **Example**: 100GB + 10k monthly downloads = ~$1.50/month

### Cloud Storage (S3)
- **Storage**: ~$0.023/GB/month
- **Egress**: $0.09/GB after free tier
- **Example**: 100GB + 10k downloads (1GB each) = ~$92/month
- **Note**: R2 is significantly cheaper for high egress

## Recommendation

**For Now**: Keep local storage with proper configuration
- Simple, fast, and cost-effective
- Your current scale doesn't justify cloud storage
- Docker volumes provide adequate isolation

**Future**: Consider R2 backup when:
- Uploads exceed 50GB
- Running multiple backend instances
- Need disaster recovery/offsite backup
- Want to implement CDN for global users

The current fix ensures reliable local storage. Cloud migration can be implemented later when scale demands it.
