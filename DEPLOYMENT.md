# Tarko Inventory - Production Deployment Guide

## Architecture Overview

**Frontend**: Hosted on Firebase Hosting (static files)
**Backend**: Docker container with Flask API + PostgreSQL
**Storage**: Local volumes for uploads, snapshots, and backups

## Prerequisites

1. **Firebase CLI**: `npm install -g firebase-tools`
2. **Docker & Docker Compose**: [Install Docker](https://docs.docker.com/get-docker/)
3. **Node.js**: v20+ for building frontend
4. **Firebase Project**: Create at [Firebase Console](https://console.firebase.google.com/)

## Deployment Steps

### 1. Backend Deployment

```bash
# 1. Update .env.production with your settings
cp .env.production .env
# Edit .env with your database credentials and settings

# 2. Deploy backend services (PostgreSQL + Flask API)
./deploy-backend.sh

# 3. Verify backend is running
curl http://localhost:5500/api/health
```

**Backend will be available at**: `http://YOUR_SERVER_IP:5500/api`

### 2. Frontend Deployment to Firebase

```bash
# 1. Update .firebaserc with your Firebase project ID
# Edit .firebaserc and replace "your-firebase-project-id"

# 2. Set your backend API URL
export VITE_API_URL=https://your-backend-url.com

# 3. Deploy to Firebase
./deploy-firebase.sh
```

**Frontend will be available at**: `https://YOUR_PROJECT_ID.web.app`

### 3. CORS Configuration

Update backend `.env` to allow Firebase origin:

```bash
CORS_ORIGINS=https://your-project-id.web.app,https://your-project-id.firebaseapp.com
```

Restart backend:
```bash
docker-compose restart backend
```

## Environment Variables

### Backend (.env)
```bash
# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=tarko_inventory
DB_USER=tarko_user
DB_PASSWORD=your-secure-password

# JWT
JWT_SECRET_KEY=your-jwt-secret-minimum-32-chars

# CORS (set after Firebase deployment)
CORS_ORIGINS=https://your-firebase-app.web.app

# Storage
SNAPSHOT_STORAGE_PATH=/app/snapshots
UPLOAD_STORAGE_PATH=/app/uploads
BACKUP_RETENTION_DAYS=30
```

### Frontend (build time)
```bash
# Set during build or in .env
VITE_API_URL=https://your-backend-api-url.com
```

## Post-Deployment Setup

1. **Create Admin Account**
   - Navigate to `https://your-app.web.app/setup`
   - Create your first admin user

2. **Configure Email (Optional)**
   - Go to Admin Panel → SMTP Configuration
   - Enter your email server details for password reset

3. **Configure Cloud Backup (Optional)**
   - Go to Admin Panel → Version Control → Cloud Credentials
   - Add your R2/S3 credentials for cloud backups

## Monitoring & Maintenance

### View Backend Logs
```bash
docker-compose logs -f backend
```

### Database Backup
```bash
# Manual backup
docker-compose exec postgres pg_dump -U tarko_user tarko_inventory > backup.sql

# Backups are automatically created by scheduler service daily at 2 AM
```

### Update Backend
```bash
git pull
docker-compose build backend
docker-compose up -d backend
```

### Update Frontend
```bash
git pull
./deploy-firebase.sh
```

## Custom Domain Setup

### Firebase Hosting Custom Domain
1. Go to Firebase Console → Hosting
2. Click "Add custom domain"
3. Follow DNS configuration instructions

### Backend API Custom Domain
1. Set up reverse proxy (nginx) on your server
2. Configure SSL certificate (Let's Encrypt)
3. Update `VITE_API_URL` and redeploy frontend

## Security Checklist

- [ ] Change default database password
- [ ] Generate strong JWT secret (min 32 chars)
- [ ] Configure CORS origins (remove wildcard `*`)
- [ ] Set up SSL/TLS for backend API
- [ ] Enable Firebase security rules (if needed)
- [ ] Regular database backups
- [ ] Keep Docker images updated
- [ ] Monitor application logs

## Troubleshooting

### Backend not accessible
```bash
# Check if services are running
docker-compose ps

# Check backend logs
docker-compose logs backend

# Verify health endpoint
curl http://localhost:5500/api/health
```

### Frontend can't connect to backend
1. Check CORS configuration in backend `.env`
2. Verify `VITE_API_URL` was set during build
3. Check browser console for errors
4. Ensure backend is publicly accessible

### Database connection issues
```bash
# Check PostgreSQL logs
docker-compose logs postgres

# Test database connection
docker-compose exec postgres psql -U tarko_user -d tarko_inventory -c "SELECT 1"
```

## Support

For issues and questions:
- Check logs: `docker-compose logs`
- Review documentation: `/docs`
- Contact: your-email@domain.com
