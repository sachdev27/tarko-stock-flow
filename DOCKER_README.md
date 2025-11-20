# Tarko Inventory - Production Docker Setup

Complete production-ready deployment with Docker Compose, automated backups, and snapshot management.

## 🚀 Quick Start

### Prerequisites
- Docker Engine 20.10+
- Docker Compose 2.0+
- 2GB free disk space
- Ports 80, 5432, 5500 available

### One-Command Deploy

```bash
./deploy.sh
```

This script will:
1. Check Docker installation
2. Generate secure passwords
3. Build Docker images
4. Start all services
5. Verify deployment

### Manual Deploy

```bash
# 1. Copy and configure environment
cp .env.production .env
nano .env  # Edit with your settings

# 2. Build and start
docker-compose up -d

# 3. Check status
docker-compose ps
docker-compose logs -f
```

## 📦 What's Included

### Services

1. **Frontend (Nginx + React)**
   - Port: 80
   - Production optimized build
   - Gzip compression
   - API proxy to backend

2. **Backend (Flask + Python)**
   - Port: 5500
   - REST API
   - JWT authentication
   - Health checks

3. **Database (PostgreSQL)**
   - Port: 5432 (internal)
   - Persistent volume
   - Automated schema initialization

4. **Backup Scheduler**
   - Daily snapshots at 2 AM
   - 30-day retention
   - Local file storage

### Data Volumes

```
./snapshots/          # JSON snapshots (local storage)
./backups/            # SQL dumps (disaster recovery)
./backend/uploads/    # User uploads
postgres_data/        # Database files (Docker volume)
```

## 💾 Snapshot & Backup System

### Automated Daily Backups

Snapshots are created automatically at 2 AM every day:
- Full database dump in JSON format
- Table-by-table files for selective restore
- Complete SQL dump for disaster recovery
- 30-day automatic retention

### Manual Snapshots

**Via Admin UI:**
1. Login as admin
2. Navigate to Admin → Version Control
3. Click "Create Snapshot"

**Via API:**
```bash
curl -X POST http://localhost:5500/api/version-control/snapshots \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"snapshot_name": "Before Update", "description": "Manual backup"}'
```

### Restore from Snapshot

**Via Admin UI:**
1. Admin → Version Control
2. Select snapshot
3. Click "Rollback"
4. Confirm (⚠️ overwrites current data)

**Via API:**
```bash
curl -X POST http://localhost:5500/api/version-control/rollback/SNAPSHOT_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"confirm": true}'
```

### Download Snapshot

```bash
# Via API
curl -X GET http://localhost:5500/api/version-control/snapshots/SNAPSHOT_ID/download \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o snapshot.zip

# Direct file access
cp -r ./snapshots/SNAPSHOT_ID /path/to/external/storage
```

### External Storage

Mount external drive for backups:

```bash
# Mount USB drive
sudo mkdir -p /mnt/backup-drive
sudo mount /dev/sdb1 /mnt/backup-drive

# Update docker-compose.yml
volumes:
  - /mnt/backup-drive/snapshots:/app/snapshots
  - /mnt/backup-drive/backups:/backups

# Restart
docker-compose restart
```

## 🔧 Configuration

### Environment Variables (.env)

```bash
# Database
DB_PASSWORD=your-secure-password

# JWT (32+ characters)
JWT_SECRET_KEY=your-long-random-secret

# Frontend
VITE_API_URL=http://your-domain.com

# Backups
BACKUP_RETENTION_DAYS=30
SNAPSHOT_STORAGE_PATH=/app/snapshots
```

### Backup Schedule

Edit `docker-compose.yml` to change schedule:

```yaml
backup-scheduler:
  environment:
    BACKUP_SCHEDULE: "0 2 * * *"  # 2 AM daily
    # "0 */6 * * *"  # Every 6 hours
    # "0 0 * * 0"    # Weekly (Sunday midnight)
```

## 📊 Monitoring

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f backup-scheduler

# Last 100 lines
docker-compose logs --tail=100
```

### Check Health

```bash
# Service status
docker-compose ps

# Health endpoints
curl http://localhost:5500/api/health

# Resource usage
docker stats
```

### Disk Usage

```bash
# Check volumes
du -sh ./snapshots ./backups ./backend/uploads

# Docker system
docker system df

# Cleanup old snapshots (manual)
find ./snapshots -type d -mtime +30 -exec rm -rf {} \;
```

## 🔒 Security

### Production Checklist

- [ ] Change default passwords in .env
- [ ] Use strong JWT secret (32+ characters)
- [ ] Enable HTTPS (add SSL to nginx)
- [ ] Configure firewall (allow only 80, 443)
- [ ] Regular external backups
- [ ] Monitor disk space
- [ ] Restrict database port (remove from docker-compose.yml)
- [ ] Set up log rotation

### Enable HTTPS

1. Get SSL certificate:
```bash
certbot certonly --standalone -d your-domain.com
```

2. Update `nginx.conf`:
```nginx
server {
    listen 443 ssl;
    ssl_certificate /etc/ssl/certs/fullchain.pem;
    ssl_certificate_key /etc/ssl/private/privkey.pem;
    # ... rest of config
}
```

3. Mount certificates:
```yaml
frontend:
  volumes:
    - /etc/letsencrypt:/etc/ssl:ro
  ports:
    - "443:443"
```

## 🛠️ Common Operations

### Update Application

```bash
git pull origin main
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Database Backup/Restore

```bash
# Backup
docker exec tarko-postgres pg_dump -U tarko_user tarko_inventory > backup.sql

# Restore
docker exec -i tarko-postgres psql -U tarko_user tarko_inventory < backup.sql
```

### Scale Services

```bash
# Multiple backend instances
docker-compose up -d --scale backend=3
```

## 🐛 Troubleshooting

### Services won't start

```bash
# Check logs
docker-compose logs

# Verify ports
sudo lsof -i :80
sudo lsof -i :5432
sudo lsof -i :5500

# Restart individual service
docker-compose restart backend
```

### Database connection errors

```bash
# Check postgres health
docker-compose ps postgres

# Test connection
docker exec tarko-postgres psql -U tarko_user -d tarko_inventory -c "SELECT 1"

# Reset database
docker-compose down -v
docker-compose up -d
```

### Out of disk space

```bash
# Check space
df -h

# Clean old snapshots
find ./snapshots -mtime +30 -delete

# Clean Docker
docker system prune -a
docker volume prune
```

### Frontend can't connect

1. Check `VITE_API_URL` in .env
2. Verify backend: `curl http://localhost:5500/api/health`
3. Check nginx proxy in `nginx.conf`
4. View frontend logs: `docker-compose logs frontend`

## 📈 Maintenance

### Daily
- Monitor disk space
- Check backup logs
- Verify snapshot creation

### Weekly
- Review application logs
- Test snapshot restore (staging)
- Update Docker images

### Monthly
- Export critical snapshots
- Security updates
- Performance review

## 📚 Additional Resources

- **Full Documentation**: [DEPLOYMENT.md](DEPLOYMENT.md)
- **Docker Docs**: https://docs.docker.com
- **PostgreSQL Docs**: https://www.postgresql.org/docs/

## 🆘 Support

1. Check logs: `docker-compose logs -f`
2. Review DEPLOYMENT.md
3. Verify health: `docker-compose ps`
4. Check disk space: `df -h`

## 🗑️ Uninstall

```bash
# Stop containers
docker-compose down

# Remove all data (CAUTION!)
docker-compose down -v
rm -rf ./snapshots ./backups ./backend/uploads
docker volume rm tarko-stock-flow_postgres_data
```

---

**Ready to deploy?** Run `./deploy.sh` to get started! 🚀
