# Google Drive OAuth Setup Guide

This guide will help you set up OAuth authentication for Google Drive backup sync.

## Prerequisites
- Google Account (personal Gmail or Workspace)
- Access to [Google Cloud Console](https://console.cloud.google.com/)

## Step 1: Create OAuth Credentials

### 1.1 Go to Google Cloud Console
1. Visit https://console.cloud.google.com/
2. Create a new project or select an existing one
3. Name it something like "Tarko Inventory Backups"

### 1.2 Enable Google Drive API
1. Go to **APIs & Services** > **Library**
2. Search for "Google Drive API"
3. Click **Enable**

### 1.3 Configure OAuth Consent Screen
1. Go to **APIs & Services** > **OAuth consent screen**
2. Choose **External** (unless you have Google Workspace, then you can choose Internal)
3. Fill in the required fields:
   - **App name**: Tarko Inventory System
   - **User support email**: Your email
   - **Developer contact email**: Your email
4. Click **Save and Continue**
5. On **Scopes** screen, click **Add or Remove Scopes**
   - Search for "Google Drive API"
   - Select: `https://www.googleapis.com/auth/drive.file`
6. Click **Save and Continue**
7. On **Test users** screen:
   - Click **Add Users**
   - Add your Google account email
   - Click **Save and Continue**

### 1.4 Create OAuth Client ID
1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Choose **Web application**
4. Name it: "Tarko Inventory Backend"
5. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:5500/api/version-control/drive/oauth-callback
   ```
6. Click **Create**
7. **Download JSON** - This is your `client_secret.json`
8. Save the downloaded file as `client_secret.json` in your `backend/` directory

## Step 2: Configure Your Application

### 2.1 Update .env file
Add these lines to your `backend/.env`:

```bash
# Google Drive OAuth Configuration
ENABLE_GOOGLE_DRIVE_SYNC=true
GOOGLE_DRIVE_AUTH_TYPE=oauth
GOOGLE_OAUTH_CLIENT_SECRET_PATH=client_secret.json
```

### 2.2 File Structure
Your backend directory should have:
```
backend/
├── app.py
├── client_secret.json       # OAuth credentials (from Google Cloud Console)
├── google_drive_token.json  # Auto-generated after authorization
└── .env
```

## Step 3: Authorize the Application

### 3.1 Start Your Backend
```bash
cd backend
python app.py
```

### 3.2 Authorize via Admin Panel
1. Open your app: http://localhost:5173
2. Log in as admin
3. Go to **Admin Panel** > **Version Control**
4. Click **Authorize Google Drive** button
5. You'll be redirected to Google's consent screen
6. Click **Continue** (even if it says the app is unverified)
7. Select your Google account
8. Click **Allow** to grant permissions
9. You'll be redirected back to your app

### 3.3 Verify Authorization
- You should see a success message
- The `google_drive_token.json` file will be created
- Try creating a snapshot and sync it to Drive

## Troubleshooting

### "App is unverified" warning
This is normal for apps in testing mode. Click **Advanced** > **Go to Tarko Inventory System (unsafe)** to proceed.

### Token expiration
OAuth tokens expire after some time. If sync fails, click **Authorize Google Drive** again to refresh the token.

### Missing scopes
Make sure you added the correct scope: `https://www.googleapis.com/auth/drive.file`

### Redirect URI mismatch
Ensure the redirect URI in Google Cloud Console matches exactly:
```
http://localhost:5500/api/version-control/drive/oauth-callback
```

## Production Deployment

For production:
1. Update the redirect URI in Google Cloud Console to your production domain
2. Add the production URL to `.env`:
   ```bash
   OAUTH_REDIRECT_BASE_URL=https://yourdomain.com
   ```
3. Consider publishing your OAuth app (requires verification) or keep it in testing mode with specific test users

## Security Notes

- ⚠️ **Never commit** `client_secret.json` or `google_drive_token.json` to git
- Add them to `.gitignore`
- The token file contains refresh tokens that allow long-term access
- Store these files securely in production

## Next Steps

Once authorized, your snapshots will automatically sync to Google Drive in a folder called "Tarko Inventory Backups" in your Google Drive root.
