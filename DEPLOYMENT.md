# Tarko Inventory - Production Deployment Guide

## Quick Start with Docker Compose

### Prerequisites
- Docker Engine 20.10+
- Docker Compose 2.0+
- At least 2GB free disk space
- Open ports: 80, 5432, 5500

### Initial Setup

1. **Clone and navigate to project**
```bash
cd tarko-stock-flow
```

2. **Create environment file**
```bash
cp .env.production .env
```

3. **Edit .env with secure values**
```bash
nano .env
```

Update these critical values:
- `DB_PASSWORD`: Strong database password
- `JWT_SECRET_KEY`: Long random string (32+ characters)
- `VITE_API_URL`: Your domain or IP (e.g., http://192.168.1.100)

4. **Build and start services**
```bash
docker-compose up -d
```

5. **Verify services are running**
```bash
docker-compose ps
```

All services should show "Up" status.

6. **Check logs**
```bash
docker-compose logs -f
```

### Access the Application

- **Frontend**: http://localhost (or your configured domain)
- **Backend API**: http://localhost:5500
- **Health Check**: http://localhost:5500/api/health

### Default Admin Login
- Username: `admin`
- Password: (as configured during initial setup)

---

## Architecture Overview

```
┌─────────────────┐
│   Nginx (80)    │  ← Frontend (React + Vite)
└────────┬────────┘
         │
         ├─ Serves static files
         └─ Proxies /api/* to backend
                     │
         ┌───────────▼─────────┐
         │  Flask API (5500)   │  ← Backend
         └───────────┬─────────┘
                     │
         ┌───────────▼─────────────┐
         │  PostgreSQL (5432)      │  ← Database
         └─────────────────────────┘
                     │
         ┌───────────▼─────────────┐
         │  Backup Scheduler       │  ← Daily snapshots
         └─────────────────────────┘
```

---

## Volume Management

### Data Volumes

All data is persisted in Docker volumes and local directories:

```
./snapshots/          # Database snapshots
./backups/            # SQL backups
./backend/uploads/    # Uploaded files (batch attachments)
postgres_data/        # PostgreSQL data (Docker volume)
```

### Backup Locations

1. **Database Snapshots**: `./snapshots/`
   - Format: JSON files per table
   - Daily automated backups at 2 AM
   - Retention: 30 days (configurable)

2. **SQL Dumps**: `./backups/`
   - Complete SQL dumps for disaster recovery
   - Created with each snapshot

### External Storage

To use external storage (USB drive, NAS):

1. **Mount external drive**
```bash
mkdir -p /mnt/external-backup
mount /dev/sdb1 /mnt/external-backup
```

2. **Update docker-compose.yml**
```yaml
services:
  backend:
    volumes:
      - /mnt/external-backup/snapshots:/app/snapshots
      - /mnt/external-backup/backups:/backups
```

3. **Restart services**
```bash
docker-compose restart
```

---

## Snapshot Management

### Automated Daily Snapshots

Snapshots run automatically at 2 AM daily. Configure schedule in `docker-compose.yml`:

```yaml
environment:
  BACKUP_SCHEDULE: "0 2 * * *"  # Cron format
```

### Manual Snapshot Creation

Via Admin UI:
1. Login as admin
2. Navigate to Admin → Version Control
3. Click "Create Snapshot"

Via API:
```bash
curl -X POST http://localhost:5500/api/version-control/snapshots \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"snapshot_name": "Manual Backup", "description": "Before major update"}'
```

### Restore from Snapshot

⚠️ **Warning**: Rollback will overwrite current data!

Via Admin UI:
1. Admin → Version Control
2. Select snapshot
3. Click "Rollback"
4. Confirm action

Via API:
```bash
curl -X POST http://localhost:5500/api/version-control/rollback/SNAPSHOT_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"confirm": true}'
```

### Export Snapshot

Copy snapshot to external location:
```bash
docker exec tarko-backend python -c "
from snapshot_storage import snapshot_storage
snapshot_storage.export_snapshot('SNAPSHOT_ID', '/backups/manual/snapshot_export')
"
```

Then copy from container:
```bash
docker cp tarko-backend:/backups/manual/snapshot_export ./exported_snapshot
```

---

## Common Operations

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f postgres
docker-compose logs -f backup-scheduler
```

### Restart Services

```bash
# All services
docker-compose restart

# Specific service
docker-compose restart backend
```

### Stop Services

```bash
docker-compose down
```

### Update Application

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Database Access

```bash
# Connect to PostgreSQL
docker exec -it tarko-postgres psql -U tarko_user -d tarko_inventory

# Backup database manually
docker exec tarko-postgres pg_dump -U tarko_user tarko_inventory > backup.sql

# Restore database
docker exec -i tarko-postgres psql -U tarko_user tarko_inventory < backup.sql
```

---

## Monitoring

### Health Checks

```bash
# Backend health
curl http://localhost:5500/api/health

# Check all container health
docker-compose ps
```

### Disk Usage

```bash
# Check volume sizes
docker system df -v

# Check snapshot storage
du -sh ./snapshots/*
```

### Resource Usage

```bash
# Real-time stats
docker stats

# Specific container
docker stats tarko-backend
```

---

## Security Considerations

### Production Checklist

- [ ] Change default passwords
- [ ] Use strong JWT secret (32+ characters)
- [ ] Enable HTTPS (add SSL certificates to nginx)
- [ ] Configure firewall (allow only 80, 443)
- [ ] Regular backups to external storage
- [ ] Monitor disk space
- [ ] Set up log rotation
- [ ] Restrict database port (remove 5432 from docker-compose.yml)

### SSL/HTTPS Setup

1. **Get SSL certificates** (Let's Encrypt recommended)
```bash
certbot certonly --standalone -d your-domain.com
```

2. **Update nginx.conf**
```nginx
server {
    listen 443 ssl;
    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;
    # ... rest of config
}
```

3. **Mount certificates in docker-compose.yml**
```yaml
frontend:
  volumes:
    - /etc/letsencrypt:/etc/ssl:ro
```

---

## Troubleshooting

### Services won't start

```bash
# Check logs
docker-compose logs

# Verify ports are not in use
sudo lsof -i :80
sudo lsof -i :5432
sudo lsof -i :5500
```

### Database connection errors

```bash
# Check postgres is healthy
docker-compose ps postgres

# Verify connection
docker exec tarko-postgres psql -U tarko_user -d tarko_inventory -c "SELECT 1"
```

### Out of disk space

```bash
# Check available space
df -h

# Clean old snapshots manually
rm -rf ./snapshots/daily_backup_20240101*

# Clean Docker system
docker system prune -a
```

### Frontend can't connect to backend

1. Check VITE_API_URL in .env
2. Verify backend is running: `curl http://localhost:5500/api/health`
3. Check nginx proxy config in nginx.conf

---

## Maintenance

### Daily Tasks
- Monitor disk space
- Check backup logs
- Verify snapshot creation

### Weekly Tasks
- Review application logs
- Test snapshot restore (on staging)
- Update Docker images

### Monthly Tasks
- Export critical snapshots to external storage
- Security updates
- Performance review

---

## Support

For issues or questions:
1. Check logs: `docker-compose logs -f`
2. Review this documentation
3. Check container health: `docker-compose ps`

---

## Uninstall

To completely remove the application:

```bash
# Stop and remove containers
docker-compose down -v

# Remove data (CAUTION: This deletes all data!)
rm -rf ./snapshots ./backups ./backend/uploads
docker volume rm tarko-stock-flow_postgres_data
```
