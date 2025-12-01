# Production Configuration Guide

## Cloud Backup Configuration (Without .env files)

In production, environment variables should be set through your hosting platform, not `.env` files. Here's how to configure for different platforms:

### Docker / Docker Compose

Add environment variables to your `docker-compose.yml`:

```yaml
services:
  backend:
    image: tarko-backend
    environment:
      # Cloud Storage - Cloudflare R2 (Recommended)
      ENABLE_CLOUD_BACKUP: "true"
      CLOUD_STORAGE_PROVIDER: "r2"
      R2_ACCOUNT_ID: "your_account_id"
      R2_ACCESS_KEY_ID: "your_access_key"
      R2_SECRET_ACCESS_KEY: "your_secret_key"
      R2_BUCKET_NAME: "tarko-inventory-backups"

      # Alternative: AWS S3
      # CLOUD_STORAGE_PROVIDER: "s3"
      # AWS_ACCESS_KEY_ID: "your_aws_key"
      # AWS_SECRET_ACCESS_KEY: "your_aws_secret"
      # AWS_REGION: "us-east-1"
      # S3_BUCKET_NAME: "tarko-inventory-backups"
```

Or use Docker secrets for sensitive data:

```yaml
services:
  backend:
    secrets:
      - r2_access_key
      - r2_secret_key
    environment:
      R2_ACCESS_KEY_ID_FILE: /run/secrets/r2_access_key
      R2_SECRET_ACCESS_KEY_FILE: /run/secrets/r2_secret_key

secrets:
  r2_access_key:
    external: true
  r2_secret_key:
    external: true
```

### Kubernetes

Create a Secret:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: tarko-cloud-credentials
type: Opaque
stringData:
  r2-account-id: "your_account_id"
  r2-access-key: "your_access_key"
  r2-secret-key: "your_secret_key"
```

Reference in Deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tarko-backend
spec:
  template:
    spec:
      containers:
      - name: backend
        env:
        - name: ENABLE_CLOUD_BACKUP
          value: "true"
        - name: CLOUD_STORAGE_PROVIDER
          value: "r2"
        - name: R2_ACCOUNT_ID
          valueFrom:
            secretKeyRef:
              name: tarko-cloud-credentials
              key: r2-account-id
        - name: R2_ACCESS_KEY_ID
          valueFrom:
            secretKeyRef:
              name: tarko-cloud-credentials
              key: r2-access-key
        - name: R2_SECRET_ACCESS_KEY
          valueFrom:
            secretKeyRef:
              name: tarko-cloud-credentials
              key: r2-secret-key
        - name: R2_BUCKET_NAME
          value: "tarko-inventory-backups"
```

### AWS ECS / Fargate

Add to Task Definition:

```json
{
  "containerDefinitions": [{
    "name": "tarko-backend",
    "environment": [
      {"name": "ENABLE_CLOUD_BACKUP", "value": "true"},
      {"name": "CLOUD_STORAGE_PROVIDER", "value": "r2"},
      {"name": "R2_BUCKET_NAME", "value": "tarko-inventory-backups"}
    ],
    "secrets": [
      {
        "name": "R2_ACCOUNT_ID",
        "valueFrom": "arn:aws:secretsmanager:region:account:secret:tarko/r2/account-id"
      },
      {
        "name": "R2_ACCESS_KEY_ID",
        "valueFrom": "arn:aws:secretsmanager:region:account:secret:tarko/r2/access-key"
      },
      {
        "name": "R2_SECRET_ACCESS_KEY",
        "valueFrom": "arn:aws:secretsmanager:region:account:secret:tarko/r2/secret-key"
      }
    ]
  }]
}
```

### Heroku

```bash
heroku config:set ENABLE_CLOUD_BACKUP=true
heroku config:set CLOUD_STORAGE_PROVIDER=r2
heroku config:set R2_ACCOUNT_ID=your_account_id
heroku config:set R2_ACCESS_KEY_ID=your_access_key
heroku config:set R2_SECRET_ACCESS_KEY=your_secret_key
heroku config:set R2_BUCKET_NAME=tarko-inventory-backups
```

### DigitalOcean App Platform

In the App Spec:

```yaml
services:
- name: backend
  envs:
  - key: ENABLE_CLOUD_BACKUP
    value: "true"
  - key: CLOUD_STORAGE_PROVIDER
    value: "r2"
  - key: R2_ACCOUNT_ID
    scope: RUN_TIME
    type: SECRET
    value: your_account_id
  - key: R2_ACCESS_KEY_ID
    scope: RUN_TIME
    type: SECRET
    value: your_access_key
  - key: R2_SECRET_ACCESS_KEY
    scope: RUN_TIME
    type: SECRET
    value: your_secret_key
  - key: R2_BUCKET_NAME
    value: "tarko-inventory-backups"
```

### Traditional VPS / Bare Metal

Set system environment variables:

```bash
# Add to /etc/environment or ~/.bashrc (for the service user)
export ENABLE_CLOUD_BACKUP=true
export CLOUD_STORAGE_PROVIDER=r2
export R2_ACCOUNT_ID=your_account_id
export R2_ACCESS_KEY_ID=your_access_key
export R2_SECRET_ACCESS_KEY=your_secret_key
export R2_BUCKET_NAME=tarko-inventory-backups
```

Or create a systemd service file:

```ini
[Unit]
Description=Tarko Inventory Backend
After=network.target postgresql.service

[Service]
Type=simple
User=tarko
WorkingDirectory=/opt/tarko-backend
Environment="ENABLE_CLOUD_BACKUP=true"
Environment="CLOUD_STORAGE_PROVIDER=r2"
Environment="R2_ACCOUNT_ID=your_account_id"
Environment="R2_ACCESS_KEY_ID=your_access_key"
Environment="R2_SECRET_ACCESS_KEY=your_secret_key"
Environment="R2_BUCKET_NAME=tarko-inventory-backups"
ExecStart=/opt/tarko-backend/venv/bin/python app.py
Restart=always

[Install]
WantedBy=multi-user.target
```

## Verification

After setting environment variables, verify they're loaded:

```bash
# SSH into your production server
python3 -c "from backend.config import Config; print(f'Cloud enabled: {Config.ENABLE_CLOUD_BACKUP}')"
```

## Security Best Practices

1. **Never commit credentials to git**
2. **Use secrets management** (AWS Secrets Manager, HashiCorp Vault, etc.)
3. **Rotate credentials** regularly
4. **Use IAM roles** when possible (AWS ECS/EC2)
5. **Encrypt secrets at rest**
6. **Audit access logs** for cloud storage buckets
7. **Set bucket policies** to restrict access

## Cloud Provider Setup

### Cloudflare R2 (Recommended - Lower Cost)

1. Go to https://dash.cloudflare.com/r2
2. Create bucket: `tarko-inventory-backups`
3. Click "Manage R2 API Tokens"
4. Create API Token with "Edit" permissions
5. Copy Account ID, Access Key, and Secret Key
6. Set as environment variables in your deployment platform

**Pricing**: ~$0.015/GB/month storage, no egress fees

### AWS S3

1. Go to AWS Console → S3
2. Create bucket: `tarko-inventory-backups`
3. Go to IAM → Users → Create user
4. Attach policy: `AmazonS3FullAccess` (or create custom limited policy)
5. Create access key
6. Copy Access Key and Secret Key
7. Set as environment variables

**Pricing**: ~$0.023/GB/month storage + egress fees

## Monitoring

Monitor cloud backup status via application logs:

```bash
# View recent backup activity
tail -f /var/log/tarko-backend.log | grep -i "cloud"

# Check backend health endpoint
curl http://localhost:5000/api/version-control/cloud/status
```
