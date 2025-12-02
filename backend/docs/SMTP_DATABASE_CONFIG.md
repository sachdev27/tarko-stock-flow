# Database-Based SMTP Configuration

## Overview

SMTP settings can now be managed through the Admin UI instead of environment variables. Credentials are encrypted and stored securely in the database using Fernet encryption.

## Benefits

✅ **No Server Restarts** - Update email settings without restarting the backend
✅ **Encrypted Storage** - Passwords encrypted using Fernet symmetric encryption
✅ **Admin UI** - Easy configuration through web interface
✅ **Test Functionality** - Send test emails to verify settings
✅ **Automatic Fallback** - Falls back to .env if no database config exists
✅ **Multi-Provider Support** - Works with Gmail, Outlook, SendGrid, etc.

## How It Works

1. **Priority Order**: Database config → Environment variables (.env)
2. **Encryption**: SMTP passwords encrypted before storage
3. **Active Config**: Only one configuration can be active at a time
4. **Test Emails**: Send test emails to verify configuration

## Setup via Admin UI

### 1. Access SMTP Configuration

1. Login as admin
2. Navigate to **Admin** → **Backups** tab
3. Click on **Email (SMTP)** sub-tab

### 2. Configure SMTP Settings

**Basic Settings:**
- **SMTP Server**: e.g., `smtp.gmail.com`
- **SMTP Port**: `587` (TLS) or `465` (SSL)
- **Email Address**: Your email address
- **Password**: App-specific password (not your regular password)
- **From Name**: Display name for sent emails (e.g., "Tarko Inventory")
- **Reply-To Email**: Optional reply address

**Security Options:**
- **Use TLS**: Enable for port 587 (recommended)
- **Use SSL**: Enable for port 465

### 3. Gmail Setup (Most Common)

Gmail requires an **App Password** instead of your regular password:

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** if not already enabled
3. Go to **App Passwords**: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
4. Generate a new app password:
   - App: **Mail**
   - Device: **Other** → "Tarko Inventory"
5. Copy the 16-character password (no spaces)
6. Use this password in the SMTP configuration

**Gmail Settings:**
```
SMTP Server: smtp.gmail.com
Port: 587
Use TLS: ✓ Enabled
Use SSL: ✗ Disabled
Email: your-email@gmail.com
Password: [16-character app password]
```

### 4. Test Configuration

1. Enter a test email address
2. Click **Send Test Email**
3. Check inbox (including spam folder)
4. Verify test email received successfully

## Database Schema

### smtp_config Table

```sql
CREATE TABLE smtp_config (
    id UUID PRIMARY KEY,
    smtp_server VARCHAR(255),        -- e.g., smtp.gmail.com
    smtp_port INTEGER,                -- e.g., 587
    smtp_email VARCHAR(255),          -- Sender email
    smtp_password_encrypted TEXT,     -- Fernet encrypted password
    use_tls BOOLEAN,                  -- Enable STARTTLS
    use_ssl BOOLEAN,                  -- Enable SSL/TLS
    from_name VARCHAR(255),           -- Display name
    reply_to_email VARCHAR(255),      -- Reply-to address
    is_active BOOLEAN,                -- Only one active config
    test_email_sent_at TIMESTAMP,     -- Last test timestamp
    test_email_status VARCHAR(50),    -- success/failed/pending
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by UUID,
    updated_by UUID
);
```

## API Endpoints

### Get Current SMTP Config
```http
GET /api/admin/smtp-config
Authorization: Bearer <admin-token>

Response: 200 OK
{
  "config": {
    "id": "uuid",
    "smtp_server": "smtp.gmail.com",
    "smtp_port": 587,
    "smtp_email": "admin@example.com",
    "use_tls": true,
    "use_ssl": false,
    "from_name": "Tarko Inventory",
    "is_active": true,
    "test_email_status": "success",
    "test_email_sent_at": "2025-12-03T10:30:00Z"
  }
}
```

### Create/Update SMTP Config
```http
POST /api/admin/smtp-config
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "smtp_server": "smtp.gmail.com",
  "smtp_port": 587,
  "smtp_email": "admin@example.com",
  "smtp_password": "your-app-password",
  "use_tls": true,
  "use_ssl": false,
  "from_name": "Tarko Inventory",
  "reply_to_email": "support@example.com"
}

Response: 201 Created
{
  "message": "SMTP configuration saved successfully",
  "config": { ... }
}
```

### Test SMTP Configuration
```http
POST /api/admin/smtp-config/test
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "test_email": "test@example.com",
  "config_id": "uuid"  // optional, uses active config if omitted
}

Response: 200 OK
{
  "success": true,
  "message": "Test email sent successfully to test@example.com"
}
```

### Get All Configurations (History)
```http
GET /api/admin/smtp-config/all
Authorization: Bearer <admin-token>

Response: 200 OK
{
  "configs": [
    { "id": "uuid", "smtp_email": "...", "is_active": true, ... },
    { "id": "uuid", "smtp_email": "...", "is_active": false, ... }
  ]
}
```

### Update Existing Config
```http
PUT /api/admin/smtp-config/<config_id>
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "smtp_port": 465,
  "use_tls": false,
  "use_ssl": true
}
```

### Delete Configuration
```http
DELETE /api/admin/smtp-config/<config_id>
Authorization: Bearer <admin-token>

Response: 200 OK
{
  "message": "SMTP configuration deleted successfully"
}
```

## Email Service Integration

The `email_service.py` has been updated to automatically use database configuration:

```python
def get_smtp_config():
    """
    Get SMTP configuration from database first, fallback to environment variables
    """
    try:
        # Try to load from database
        config = load_from_database()
        if config:
            return decrypt_and_return(config)
    except Exception as e:
        print(f"Falling back to environment variables: {e}")

    # Fallback to .env
    return {
        'smtp_server': os.getenv('SMTP_SERVER', 'smtp.gmail.com'),
        'smtp_port': int(os.getenv('SMTP_PORT', '587')),
        'smtp_email': os.getenv('SMTP_EMAIL'),
        'smtp_password': os.getenv('SMTP_PASSWORD'),
        ...
    }
```

## Common SMTP Providers

| Provider | Server | Port (TLS) | Port (SSL) |
|----------|--------|------------|------------|
| Gmail | smtp.gmail.com | 587 | 465 |
| Outlook | smtp.office365.com | 587 | - |
| Yahoo | smtp.mail.yahoo.com | 587 | 465 |
| SendGrid | smtp.sendgrid.net | 587 | 465 |
| Mailgun | smtp.mailgun.org | 587 | 465 |
| AWS SES | email-smtp.us-east-1.amazonaws.com | 587 | 465 |

## Security Features

### Encryption
- Passwords encrypted using Fernet symmetric encryption
- Same encryption service used for cloud credentials
- Encryption key stored in environment (ENCRYPTION_KEY)

### Access Control
- Only admin users can view/modify SMTP settings
- All actions logged in audit trail
- Rate limiting on API endpoints

### Audit Trail
- Created/updated by user tracking
- Test email status tracking
- Timestamp for all actions

## Troubleshooting

### Test Email Not Received

1. **Check Spam Folder** - Automated emails often marked as spam
2. **Verify Credentials** - Ensure app password is correct (not regular password)
3. **Check Firewall** - Port 587/465 may be blocked
4. **Review Logs** - Check Flask console for detailed error messages

### Authentication Failed

**Gmail:**
- Ensure 2-Step Verification is enabled
- Generate new App Password
- Use app password, not regular Gmail password
- Check if "Less secure app access" is disabled (app passwords are more secure)

**Outlook:**
- Enable SMTP authentication in account settings
- Use account password directly (no app password needed)

### Connection Timeout

- Verify SMTP server address is correct
- Check network connectivity
- Try alternative port (587 vs 465)
- Disable firewall temporarily to test

### SSL/TLS Errors

- **Port 587**: Use TLS (STARTTLS), disable SSL
- **Port 465**: Use SSL, disable TLS
- Don't enable both TLS and SSL simultaneously

## Environment Variables (Optional Fallback)

If no database configuration exists, system falls back to these:

```bash
# In backend/.env
SMTP_EMAIL=your-email@gmail.com
SMTP_PASSWORD=your-app-password
APP_URL=http://localhost:3000

# Optional (defaults shown)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USE_TLS=true
SMTP_USE_SSL=false
```

## Migration

### From Environment Variables to Database

1. **Keep existing .env** as fallback
2. **Configure via Admin UI** - settings will override .env
3. **Test thoroughly** before removing .env variables
4. **Optional**: Remove SMTP vars from .env once verified

### Rollback Plan

If database config causes issues:

1. Delete database config via Admin UI or SQL:
   ```sql
   DELETE FROM smtp_config WHERE id = 'config-id';
   ```
2. System automatically falls back to .env
3. No restart required

## Production Recommendations

1. **Use Dedicated Email Service**
   - Consider SendGrid, AWS SES, or Mailgun
   - Better deliverability and monitoring
   - Higher sending limits

2. **Set Up SPF/DKIM/DMARC Records**
   - Improves email authentication
   - Reduces spam marking
   - Increases delivery rates

3. **Monitor Email Delivery**
   - Track bounces and failures
   - Set up alerts for failed deliveries
   - Review test email status regularly

4. **Backup SMTP Configuration**
   - Include smtp_config table in database backups
   - Document SMTP provider account details
   - Keep encryption key secure

5. **Rate Limiting**
   - Implement at application level
   - Prevent abuse of password reset
   - Monitor email sending volume

## Files Modified/Created

### Backend
- **Created**: `backend/migrations/add_smtp_config.sql`
- **Created**: `backend/routes/smtp_config_routes.py`
- **Modified**: `backend/services/email_service.py`
- **Modified**: `backend/app.py`

### Frontend
- **Created**: `src/components/admin/SMTPConfigTab.tsx`
- **Modified**: `src/pages/Admin.tsx`

### Documentation
- **Created**: `backend/docs/SMTP_DATABASE_CONFIG.md`

## Testing Checklist

- [ ] Configure SMTP via Admin UI
- [ ] Send test email successfully
- [ ] Verify encryption of password in database
- [ ] Test password reset flow with DB config
- [ ] Verify fallback to .env works
- [ ] Test with different SMTP providers
- [ ] Verify only admins can access settings
- [ ] Check audit trail logging
- [ ] Test email notifications work
- [ ] Verify test status updates correctly
