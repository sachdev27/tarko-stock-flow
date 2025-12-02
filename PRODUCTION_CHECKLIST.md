# Production Deployment Checklist

Use this checklist to ensure your production deployment is secure and properly configured.

## Pre-Deployment

### 1. Firebase Setup
- [ ] Create Firebase project at [console.firebase.google.com](https://console.firebase.google.com/)
- [ ] Note your project ID
- [ ] Update `.firebaserc` with your project ID
- [ ] Install Firebase CLI: `npm install -g firebase-tools`
- [ ] Login to Firebase: `firebase login`

### 2. Backend Server Setup
- [ ] Provision server (VPS, cloud instance, etc.)
- [ ] Install Docker and Docker Compose
- [ ] Configure firewall (allow ports 5432, 5500)
- [ ] Set up domain/subdomain for API (optional but recommended)

### 3. Environment Configuration
- [ ] Copy `.env.production` to `.env`
- [ ] Generate strong database password (25+ characters)
- [ ] Generate strong JWT secret (48+ characters)
- [ ] Update `DB_HOST` if using external database
- [ ] Set `CORS_ORIGINS` to your Firebase URL

### 4. Security Review
- [ ] Remove all default/test credentials
- [ ] Verify `.env` is in `.gitignore`
- [ ] Review CORS origins (no wildcards in production)
- [ ] Plan SSL/TLS setup for backend API
- [ ] Review database access rules

## Backend Deployment

### 5. Deploy Backend Services
```bash
# On your server
./deploy-backend.sh
```

- [ ] PostgreSQL container running
- [ ] Backend API container running
- [ ] Backup scheduler container running
- [ ] Health check passing: `curl http://localhost:5500/api/health`

### 6. Database Setup
- [ ] Run initial migrations (automatic on first start)
- [ ] Verify database connection
- [ ] Test database backup creation
- [ ] Configure backup schedule (default: daily 2 AM)

### 7. Backend Verification
- [ ] API health endpoint responds: `/api/health`
- [ ] Logs show no errors: `docker-compose logs backend`
- [ ] Database queries working
- [ ] File uploads working (test manually after frontend deployed)

## Frontend Deployment

### 8. Build Configuration
- [ ] Set `VITE_API_URL` environment variable
- [ ] Verify API URL is accessible from internet
- [ ] Test API endpoint from external network

### 9. Deploy to Firebase
```bash
# Set your backend URL
export VITE_API_URL=https://your-api-domain.com

# Deploy
./deploy-firebase.sh
```

- [ ] Build completes successfully
- [ ] Firebase deployment succeeds
- [ ] Note your Firebase hosting URL

### 10. Frontend Verification
- [ ] Visit Firebase hosting URL
- [ ] Application loads without errors
- [ ] Check browser console for errors
- [ ] Test API connectivity from app

## Post-Deployment Configuration

### 11. Initial Setup
- [ ] Visit `/setup` page on your deployed app
- [ ] Create first admin account
- [ ] Login with admin credentials
- [ ] Verify dashboard loads

### 12. Update CORS
- [ ] Add Firebase URL to backend `CORS_ORIGINS` in `.env`
- [ ] Restart backend: `docker-compose restart backend`
- [ ] Test that CORS errors are resolved

### 13. Email Configuration (Optional)
- [ ] Go to Admin Panel → SMTP Configuration
- [ ] Enter SMTP server details
- [ ] Test email sending
- [ ] Verify password reset emails work

### 14. Cloud Backup Configuration (Optional)
- [ ] Go to Admin Panel → Version Control → Cloud Credentials
- [ ] Add R2/S3 credentials
- [ ] Test cloud backup creation
- [ ] Configure retention policies

## Testing

### 15. Functional Testing
- [ ] User registration/login works
- [ ] Production batch creation
- [ ] Inventory management
- [ ] Dispatch creation
- [ ] Return processing
- [ ] Scrap recording
- [ ] Report generation
- [ ] File uploads (batch attachments)

### 16. Admin Features
- [ ] User management
- [ ] Master data management (brands, products, etc.)
- [ ] Version control snapshots
- [ ] Cloud backup operations
- [ ] Email configuration
- [ ] System settings

### 17. Mobile Responsiveness
- [ ] Test on mobile browser
- [ ] Verify all tables display correctly (card view on mobile)
- [ ] Test dialogs and modals
- [ ] Verify navigation works

## Security Hardening

### 18. SSL/TLS Setup
- [ ] Install SSL certificate for backend API
- [ ] Configure reverse proxy (nginx/Apache) if needed
- [ ] Update Firebase with HTTPS API URL
- [ ] Force HTTPS redirects

### 19. Database Security
- [ ] Change PostgreSQL default port (optional)
- [ ] Restrict PostgreSQL to local connections only
- [ ] Enable database SSL connection (if using external DB)
- [ ] Set up database user permissions properly

### 20. Firewall Configuration
- [ ] Only expose necessary ports (5500 for API)
- [ ] Block PostgreSQL port (5432) from public access
- [ ] Configure rate limiting (if available)
- [ ] Set up fail2ban or similar (optional)

## Monitoring & Maintenance

### 21. Monitoring Setup
- [ ] Set up log monitoring
- [ ] Configure error alerts (optional)
- [ ] Monitor disk space for backups
- [ ] Track API response times

### 22. Backup Verification
- [ ] Verify daily snapshots are created
- [ ] Test snapshot restoration
- [ ] Verify cloud backups (if configured)
- [ ] Document backup restoration procedure

### 23. Documentation
- [ ] Document your deployment configuration
- [ ] Save credentials securely (password manager)
- [ ] Document custom domain setup (if applicable)
- [ ] Share access with team members

## Production Operations

### 24. Regular Maintenance
- [ ] Schedule for database cleanup
- [ ] Monitor backup storage usage
- [ ] Review application logs weekly
- [ ] Update Docker images monthly
- [ ] Test disaster recovery procedure

### 25. User Training
- [ ] Create user documentation
- [ ] Train admin users
- [ ] Document common workflows
- [ ] Set up support channel

## Rollback Plan

### 26. Emergency Procedures
- [ ] Document rollback steps
- [ ] Test snapshot restoration
- [ ] Keep previous version accessible
- [ ] Have database backup before major updates

---

## Quick Reference

### Backend Management
```bash
# View logs
docker-compose logs -f backend

# Restart services
docker-compose restart

# Stop services
docker-compose down

# Update backend
git pull
docker-compose build backend
docker-compose up -d backend
```

### Frontend Management
```bash
# Redeploy frontend
./deploy-firebase.sh

# Rollback to previous version
firebase hosting:rollback
```

### Database Backup
```bash
# Manual backup
docker-compose exec postgres pg_dump -U tarko_user tarko_inventory > backup_$(date +%Y%m%d).sql

# Restore backup
docker-compose exec -T postgres psql -U tarko_user tarko_inventory < backup.sql
```

---

**✅ Deployment Complete!**

Once all items are checked, your Tarko Inventory system is production-ready.
