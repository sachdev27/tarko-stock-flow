# Password Reset Email Configuration

The password reset feature uses Gmail SMTP to send reset emails. You need to configure the SMTP credentials in your environment.

## Gmail App Password Setup

Since Google no longer allows "less secure apps", you need to generate an **App Password**:

1. Go to your Google Account: https://myaccount.google.com/
2. Click on **Security** (left sidebar)
3. Enable **2-Step Verification** if not already enabled
4. Scroll down to **How you sign in to Google**
5. Click on **2-Step Verification**
6. Scroll to the bottom and click on **App passwords**
7. Select **Mail** as the app and **Other** as the device
8. Enter "Tarko Inventory" as the device name
9. Click **Generate**
10. Copy the 16-character password (without spaces)

## Environment Configuration

Add these variables to your `.env` file in the `backend` directory:

```bash
# Email Configuration for Password Reset
SMTP_EMAIL=your-email@gmail.com
SMTP_PASSWORD=your-16-char-app-password
APP_URL=http://localhost:3000

# For production, change APP_URL to your domain:
# APP_URL=https://yourdomain.com
```

### Environment Variables Explained

- **SMTP_EMAIL**: Your Gmail address (e.g., `admin@tarko.com`)
- **SMTP_PASSWORD**: The 16-character App Password generated above (NOT your Gmail password)
- **APP_URL**: The frontend URL where users will be redirected to reset their password
  - Development: `http://localhost:3000`
  - Production: `https://yourdomain.com`

## Testing Email Delivery

After configuring the environment variables:

1. Restart the Flask backend server
2. Go to the login page
3. Click "Forgot Password?"
4. Enter a valid user email
5. Check the email inbox (including spam folder)
6. Click the reset link in the email
7. Set a new password

## Email Features

### Password Reset Email
- Beautiful HTML design with gradient purple theme
- Responsive layout for mobile devices
- Clear call-to-action button
- 1-hour expiration warning
- Alternative plain text version for email clients without HTML support

### Password Changed Notification
- Confirmation email sent after successful password reset
- Security alert if the change was not initiated by the user

## Troubleshooting

### Email not received?
1. **Check spam folder** - Gmail may mark automated emails as spam
2. **Verify SMTP credentials** - Make sure you're using the App Password, not your regular Gmail password
3. **Check server logs** - Look for SMTP errors in the Flask console
4. **Test SMTP connection** - Use the test script below

### Test SMTP Connection

Create a file `test_smtp.py` in the backend directory:

```python
import os
from dotenv import load_dotenv
import smtplib

load_dotenv()

smtp_email = os.getenv('SMTP_EMAIL')
smtp_password = os.getenv('SMTP_PASSWORD')

try:
    server = smtplib.SMTP('smtp.gmail.com', 587)
    server.starttls()
    server.login(smtp_email, smtp_password)
    print("✅ SMTP connection successful!")
    server.quit()
except Exception as e:
    print(f"❌ SMTP connection failed: {e}")
```

Run it:
```bash
cd backend
python test_smtp.py
```

### Common Errors

**"Username and Password not accepted"**
- You're using your regular Gmail password instead of an App Password
- Generate a new App Password from Google Account settings

**"Connection timed out"**
- Firewall or network is blocking SMTP port 587
- Try a different network or check firewall settings

**"Recipient address rejected"**
- Email address doesn't exist in the database
- Check that the user account exists and has a valid email

## Security Notes

- Reset tokens expire after 1 hour
- Tokens are single-use only
- Rate limiting: Max 1 reset request per 5 minutes per email
- Audit trail includes IP address and user agent
- Never expose SMTP credentials in code or version control

## Production Recommendations

For production deployments:

1. **Use a dedicated email service**: Consider SendGrid, AWS SES, or Mailgun for better deliverability
2. **Set up SPF/DKIM records**: Improve email authentication and reduce spam marking
3. **Monitor email delivery**: Track bounces and failed deliveries
4. **Implement stricter rate limiting**: Prevent abuse at the application or API gateway level
5. **Use environment-specific URLs**: Ensure APP_URL points to your production domain

## Email Template Customization

To customize the email templates, edit `backend/services/email_service.py`:

- `get_password_reset_html()` - HTML template for reset emails
- `send_password_changed_notification()` - Success notification template

The current design features:
- Gradient purple header matching the app theme
- Lock icon in circular badge
- Prominent "Reset Password" button
- Security disclaimers
- Professional footer with copyright
- Fully responsive CSS for mobile devices
