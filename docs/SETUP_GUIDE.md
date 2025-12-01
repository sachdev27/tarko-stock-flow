# Initial Setup Guide - UI-Based Admin Creation

## Overview

The Tarko Inventory Management System now features a **UI-based initial setup** that allows you to create the first administrator account through a user-friendly web interface instead of running Python scripts.

## How It Works

### First Time Setup

1. **Start the Backend Server**
   ```bash
   cd backend
   python app.py
   ```

2. **Start the Frontend**
   ```bash
   npm run dev
   ```

3. **Automatic Redirect**
   - When you first access the application, the system checks if any admin users exist
   - If no admin exists, you'll be automatically redirected to `/setup`
   - You'll see a beautiful setup page with the Tarko branding

4. **Create Admin Account**
   - Fill in the required fields:
     - **Full Name**: Administrator's full name
     - **Email**: Admin email address (must be valid format)
     - **Password**: Minimum 8 characters
     - **Confirm Password**: Must match the password
   - Click "Create Admin Account"
   - Upon success, you'll be redirected to the login page

5. **Login**
   - Use the credentials you just created to sign in
   - You now have full admin access to the system

## API Endpoints

### Check Setup Status
```
GET /api/setup/check
```

**Response:**
```json
{
  "setup_required": true/false,
  "message": "Initial setup required" or "System is ready"
}
```

### Create Admin User
```
POST /api/setup/admin
```

**Request Body:**
```json
{
  "email": "admin@example.com",
  "password": "SecurePassword123",
  "full_name": "System Administrator"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Admin account created successfully",
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "role": "admin",
    "created_at": "2024-01-15T10:30:00"
  }
}
```

**Error Responses:**
- `400`: Missing required fields or invalid email format
- `403`: System already initialized (admin already exists)
- `409`: Email already in use
- `500`: Server error

## Security Features

1. **One-Time Setup**: The setup endpoint only works when NO admin users exist in the database
2. **Password Validation**: Minimum 8 characters required
3. **Email Validation**: Proper email format enforced
4. **Password Hashing**: bcrypt encryption for secure password storage
5. **Protected Endpoint**: Once an admin exists, the setup endpoint returns a 403 Forbidden

## Components Created

### Frontend (`src/`)
- **`pages/Setup.tsx`**: Beautiful setup page with form validation
- **`components/SetupChecker.tsx`**: Checks setup status and redirects if needed
- **`App.tsx`**: Updated with `/setup` route and SetupChecker wrapper

### Backend (`backend/`)
- **`routes/setup_routes.py`**: Setup API endpoints
- **`app.py`**: Registered setup blueprint, removed Python script initialization

## Migration from Old Method

### Old Method (Deprecated)
```bash
python backend/scripts/init_admin.py
```

### New Method (Current)
1. Start the application
2. Navigate to the web interface
3. Fill out the setup form
4. Done!

## Advantages of UI-Based Setup

✅ **User-Friendly**: No need to run Python scripts or know command line
✅ **Visual Feedback**: Clear form validation and error messages
✅ **Cross-Platform**: Works on any device with a web browser
✅ **Secure**: Same security as script-based method
✅ **Professional**: Branded setup experience
✅ **Flexible**: Easy to customize email, password, and name

## Development Notes

### Disabling Setup Check (Development)
If you need to bypass the setup check during development, you can:

1. Comment out the `<SetupChecker>` wrapper in `App.tsx`
2. Or manually create an admin user in the database
3. Or access `/setup` directly if the check fails

### Testing the Setup Flow

To test the setup flow after initial setup:

1. **Remove all admin users from database:**
   ```sql
   DELETE FROM user_roles WHERE role = 'admin';
   DELETE FROM users;
   ```

2. **Restart the application**
3. **Access any route** - you'll be redirected to `/setup`

### Database Requirements

The setup system assumes these tables exist:
- `users` (id, email, password_hash, created_at)
- `user_roles` (user_id, role)

## Troubleshooting

### "System already initialized" error
- An admin user already exists in the database
- Use the normal login page at `/auth`
- If you forgot credentials, reset via database or create new user via admin panel

### Setup page not showing
- Check if backend is running (`http://localhost:5500`)
- Check browser console for errors
- Verify `/api/setup/check` endpoint is accessible

### "Failed to create admin account" error
- Check backend logs for detailed error
- Verify database connection is working
- Ensure `user_roles` table has admin role configured

## Future Enhancements

Potential improvements for the setup system:

- [ ] Multi-step setup wizard (admin → company details → initial inventory)
- [ ] Email verification for admin account
- [ ] Setup completion dashboard
- [ ] Database backup/restore during setup
- [ ] Setup analytics and logging
- [ ] Password strength meter
- [ ] Admin account recovery options

## Files Modified/Created

### Created
- `src/pages/Setup.tsx` - Setup page UI
- `src/components/SetupChecker.tsx` - Setup status checker
- `backend/routes/setup_routes.py` - Setup API routes
- `docs/SETUP_GUIDE.md` - This documentation

### Modified
- `src/App.tsx` - Added setup route and checker
- `backend/app.py` - Registered setup blueprint, removed script init

### Deprecated
- `backend/scripts/init_admin.py` - No longer called automatically (kept for manual use if needed)

## Support

For issues or questions about the setup process:
1. Check backend logs: Look for "Setup" related messages
2. Check browser console: Look for API errors
3. Verify database connectivity
4. Review this documentation

---

**Version**: 2.0
**Last Updated**: December 2, 2025
**Status**: Active & Recommended Method
