# Production Deployment Configuration

## Environment-Specific Settings

### Development (.env)
```bash
APP_URL=http://localhost:8080
FLASK_ENV=development
```

### Production (.env.production or environment variables)
```bash
APP_URL=https://yourdomain.com
FLASK_ENV=production

# Or if you use a subdomain for the app:
APP_URL=https://inventory.yourdomain.com

# Or if the frontend is on a different port:
APP_URL=https://yourdomain.com:8443
```

## Deployment Options

### Option 1: Using .env file in production

1. Create `backend/.env.production`:
```bash
DATABASE_URL=postgresql://prod_user:secure_password@db-host:5432/tarko_inventory_prod
JWT_SECRET_KEY=generate-a-long-random-secure-key-here
FLASK_ENV=production
APP_URL=https://inventory.yourdomain.com

# SMTP Configuration (if using .env instead of database)
SMTP_EMAIL=noreply@yourdomain.com
SMTP_PASSWORD=your-secure-app-password
```

2. Load the correct .env file:
```bash
# In your deployment script or docker-compose
cp .env.production .env
```

### Option 2: Using Environment Variables (Recommended)

Set environment variables directly in your deployment platform:

**Docker Compose:**
```yaml
version: '3.8'
services:
  backend:
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/tarko_inventory
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
      - FLASK_ENV=production
      - APP_URL=https://inventory.yourdomain.com
      - SMTP_EMAIL=${SMTP_EMAIL}
      - SMTP_PASSWORD=${SMTP_PASSWORD}
```

**Kubernetes:**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: tarko-config
data:
  APP_URL: "https://inventory.yourdomain.com"
  FLASK_ENV: "production"

---
apiVersion: v1
kind: Secret
metadata:
  name: tarko-secrets
stringData:
  SMTP_EMAIL: "noreply@yourdomain.com"
  SMTP_PASSWORD: "your-app-password"
  JWT_SECRET_KEY: "your-secret-key"
```

**Heroku:**
```bash
heroku config:set APP_URL=https://yourapp.herokuapp.com
heroku config:set FLASK_ENV=production
heroku config:set SMTP_EMAIL=noreply@yourdomain.com
heroku config:set SMTP_PASSWORD=your-app-password
```

**AWS Elastic Beanstalk:**
```bash
# Via EB CLI
eb setenv APP_URL=https://inventory.yourdomain.com FLASK_ENV=production

# Or in .ebextensions/environment.config
option_settings:
  - option_name: APP_URL
    value: https://inventory.yourdomain.com
  - option_name: FLASK_ENV
    value: production
```

**DigitalOcean App Platform:**
```yaml
# In app.yaml
services:
  - name: backend
    envs:
      - key: APP_URL
        value: https://inventory.yourdomain.com
      - key: FLASK_ENV
        value: production
      - key: SMTP_EMAIL
        value: noreply@yourdomain.com
        type: SECRET
```

### Option 3: Using Admin UI (Best for Production)

**Recommended:** Configure SMTP via the Admin UI instead of environment variables:

1. Deploy your app with just the `APP_URL` environment variable
2. Login as admin → Admin → Backups → Email (SMTP)
3. Configure SMTP settings through the web interface
4. Settings are encrypted and stored in database
5. No need to restart the application to update email settings

**Production .env (minimal):**
```bash
DATABASE_URL=postgresql://...
JWT_SECRET_KEY=...
FLASK_ENV=production
APP_URL=https://inventory.yourdomain.com
```

## URL Configuration by Deployment Type

### Same Domain (Frontend + Backend)
```bash
# Frontend and backend on same domain, different paths
APP_URL=https://yourdomain.com
# Frontend: https://yourdomain.com/
# Backend: https://yourdomain.com/api/
```

### Subdomain
```bash
# Frontend on subdomain
APP_URL=https://inventory.yourdomain.com

# Backend on API subdomain
APP_URL=https://inventory.yourdomain.com
# Backend: https://api.yourdomain.com
```

### Different Ports
```bash
# If using non-standard ports
APP_URL=https://yourdomain.com:8443
```

### Cloud Platforms
```bash
# Netlify + Heroku
APP_URL=https://your-app.netlify.app

# Vercel + Railway
APP_URL=https://your-app.vercel.app

# AWS S3 + Lambda
APP_URL=https://your-bucket.s3-website.region.amazonaws.com
```

## Verification

After deployment, verify the configuration:

1. **Check environment variable is loaded:**
```bash
# In your backend container/server
echo $APP_URL
# Should output: https://inventory.yourdomain.com
```

2. **Test password reset:**
   - Request password reset from login page
   - Check email received
   - Verify the reset link contains the correct domain:
     ```
     https://inventory.yourdomain.com/reset-password?token=...
     ```

3. **Check backend logs:**
```bash
# Look for email service initialization
✅ SMTP config loaded from database
✅ Password reset email sent to user@example.com
```

## Common Issues

### Issue: Reset link still shows localhost
**Cause:** Backend not loading APP_URL from environment
**Fix:** Restart backend after setting APP_URL

### Issue: Reset link shows wrong port
**Cause:** APP_URL doesn't match frontend port
**Fix:** Update APP_URL to match your frontend URL exactly

### Issue: CORS errors on production
**Cause:** Frontend domain not in CORS whitelist
**Fix:** Update `app.py` CORS configuration:
```python
CORS(app, resources={
    r"/api/*": {
        "origins": ["https://inventory.yourdomain.com"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    }
})
```

## Security Best Practices

1. **Always use HTTPS in production:**
   ```bash
   APP_URL=https://yourdomain.com  # ✅ Correct
   APP_URL=http://yourdomain.com   # ❌ Insecure
   ```

2. **Use environment-specific configurations:**
   - Development: `http://localhost:8080`
   - Staging: `https://staging.yourdomain.com`
   - Production: `https://yourdomain.com`

3. **Rotate secrets regularly:**
   - JWT_SECRET_KEY
   - SMTP passwords
   - Database credentials

4. **Use secrets management:**
   - AWS Secrets Manager
   - Azure Key Vault
   - HashiCorp Vault
   - Kubernetes Secrets

## Nginx Configuration (if applicable)

If using Nginx as reverse proxy:

```nginx
server {
    listen 443 ssl;
    server_name inventory.yourdomain.com;

    # Frontend
    location / {
        root /var/www/tarko-frontend;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:5500/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
}
```

With this setup:
```bash
APP_URL=https://inventory.yourdomain.com
```

## Docker Example

```dockerfile
# docker-compose.yml
version: '3.8'
services:
  frontend:
    build: ./frontend
    ports:
      - "8080:80"
    environment:
      - VITE_API_URL=https://api.yourdomain.com

  backend:
    build: ./backend
    ports:
      - "5500:5500"
    environment:
      - APP_URL=https://yourdomain.com
      - FLASK_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
    env_file:
      - .env.production
```

## Testing Different Environments

```bash
# Development
export APP_URL=http://localhost:8080
python app.py

# Staging
export APP_URL=https://staging.yourdomain.com
python app.py

# Production
export APP_URL=https://inventory.yourdomain.com
gunicorn -w 4 -b 0.0.0.0:5500 app:app
```

## Summary

For your current setup:
- **Development:** `APP_URL=http://localhost:8080` (✅ Already set)
- **Production:** `APP_URL=https://your-production-domain.com`

The system will automatically use this URL when generating password reset links in emails.
