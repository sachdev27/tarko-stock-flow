"""
Email service for sending password reset and other emails
Uses Gmail SMTP server with database configuration support
"""
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

APP_NAME = 'Tarko Inventory System'
APP_URL = os.getenv('APP_URL', 'http://localhost:3000')

def get_smtp_config():
    """
    Get SMTP configuration from database first, fallback to environment variables

    Returns:
        dict: SMTP configuration with keys: smtp_server, smtp_port, smtp_email,
              smtp_password, use_tls, use_ssl, from_name
    """
    try:
        from database import get_db_connection
        from psycopg2.extras import RealDictCursor
        from services.encryption_service import get_encryption_service

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT smtp_server, smtp_port, smtp_email, smtp_password_encrypted,
                       use_tls, use_ssl, from_name
                FROM smtp_config
                WHERE is_active = TRUE
                ORDER BY created_at DESC
                LIMIT 1
            """)

            config = cursor.fetchone()

            if config:
                # Decrypt password
                encryption_service = get_encryption_service()
                smtp_password = encryption_service.decrypt(config['smtp_password_encrypted'])

                return {
                    'smtp_server': config['smtp_server'],
                    'smtp_port': config['smtp_port'],
                    'smtp_email': config['smtp_email'],
                    'smtp_password': smtp_password,
                    'use_tls': config['use_tls'],
                    'use_ssl': config['use_ssl'],
                    'from_name': config['from_name'] or APP_NAME
                }
    except Exception as e:
        print(f"⚠️  Could not load SMTP config from database: {e}")
        print("📧 Falling back to environment variables...")

    # Fallback to environment variables
    return {
        'smtp_server': 'smtp.gmail.com',
        'smtp_port': 587,
        'smtp_email': os.getenv('SMTP_EMAIL'),
        'smtp_password': os.getenv('SMTP_PASSWORD'),
        'use_tls': True,
        'use_ssl': False,
        'from_name': APP_NAME
    }

def get_password_reset_html(user_name, reset_token, reset_link):
    """Generate HTML email for password reset"""
    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333333;
            margin: 0;
            padding: 0;
            background-color: #f4f4f7;
        }}
        .container {{
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }}
        .header {{
            background: linear-gradient(135deg, #1565C0 0%, #0D47A1 100%);
            padding: 40px 30px;
            text-align: center;
        }}
        .header h1 {{
            color: #ffffff;
            margin: 0;
            font-size: 28px;
            font-weight: 600;
        }}
        .content {{
            padding: 40px 30px;
        }}
        .greeting {{
            font-size: 18px;
            color: #333333;
            margin-bottom: 20px;
        }}
        .message {{
            font-size: 16px;
            color: #555555;
            margin-bottom: 30px;
            line-height: 1.8;
        }}
        .reset-button {{
            display: inline-block;
            padding: 14px 40px;
            background: linear-gradient(135deg, #1976D2 0%, #1565C0 100%);
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            font-size: 16px;
            text-align: center;
            margin: 20px 0;
            transition: transform 0.2s;
            box-shadow: 0 2px 4px rgba(21, 101, 192, 0.3);
        }}
        .reset-button:hover {{
            transform: translateY(-2px);
        }}
        .button-container {{
            text-align: center;
            margin: 30px 0;
        }}
        .divider {{
            margin: 30px 0;
            border: none;
            border-top: 1px solid #e0e0e0;
        }}
        .alternative {{
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 6px;
            margin: 20px 0;
        }}
        .alternative p {{
            margin: 10px 0;
            font-size: 14px;
            color: #666666;
        }}
        .token {{
            font-family: 'Courier New', monospace;
            background-color: #f0f0f0;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 14px;
            color: #d63384;
            display: inline-block;
            margin: 5px 0;
        }}
        .warning {{
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }}
        .warning p {{
            margin: 5px 0;
            font-size: 14px;
            color: #856404;
        }}
        .footer {{
            background-color: #f8f9fa;
            padding: 30px;
            text-align: center;
            font-size: 14px;
            color: #666666;
        }}
        .footer p {{
            margin: 8px 0;
        }}
        .footer a {{
            color: #1976D2;
            text-decoration: none;
        }}
        .icon {{
            width: 60px;
            height: 60px;
            margin: 0 auto 20px;
            background-color: rgba(255, 255, 255, 0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 30px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="icon">🔐</div>
            <h1>{APP_NAME}</h1>
        </div>

        <div class="content">
            <p class="greeting">Hello {user_name},</p>

            <p class="message">
                We received a request to reset your password for your {APP_NAME} account.
                If you made this request, click the button below to reset your password:
            </p>

            <div class="button-container">
                <a href="{reset_link}" class="reset-button">Reset Your Password</a>
            </div>

            <div class="warning">
                <p><strong>⏰ This link expires in 1 hour</strong></p>
                <p>For security reasons, this password reset link will only work once and expires after 1 hour.</p>
            </div>

            <hr class="divider">

            <div class="alternative">
                <p><strong>Button not working?</strong> Copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #1976D2;">
                    <a href="{reset_link}" style="color: #1976D2;">{reset_link}</a>
                </p>
            </div>

            <hr class="divider">

            <p class="message" style="font-size: 14px; color: #666;">
                <strong>Didn't request this?</strong><br>
                If you didn't request a password reset, you can safely ignore this email.
                Your password will remain unchanged.
            </p>
        </div>

        <div class="footer">
            <p><strong>{APP_NAME}</strong></p>
            <p>© {datetime.now().year} All rights reserved.</p>
            <p>This is an automated message, please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
"""

def send_password_reset_email(to_email, user_name, reset_token):
    """
    Send password reset email with token

    Args:
        to_email: Recipient email address
        user_name: User's display name
        reset_token: Password reset token

    Returns:
        bool: True if email sent successfully, False otherwise
    """
    config = get_smtp_config()

    if not config['smtp_email'] or not config['smtp_password']:
        print("❌ SMTP credentials not configured. Set up SMTP in admin panel or environment variables.")
        return False

    try:
        # Create reset link
        reset_link = f"{APP_URL}/reset-password?token={reset_token}"

        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = f'Reset Your Password - {config["from_name"]}'
        msg['From'] = f'{config["from_name"]} <{config["smtp_email"]}>'
        msg['To'] = to_email

        # Plain text version (fallback)
        text_body = f"""
Hello {user_name},

We received a request to reset your password for your {APP_NAME} account.

To reset your password, click the link below or copy it into your browser:
{reset_link}

This link expires in 1 hour and can only be used once.

If you didn't request this password reset, you can safely ignore this email.

Best regards,
{APP_NAME} Team
        """

        # HTML version
        html_body = get_password_reset_html(user_name, reset_token, reset_link)

        # Attach both versions
        part1 = MIMEText(text_body, 'plain')
        part2 = MIMEText(html_body, 'html')
        msg.attach(part1)
        msg.attach(part2)

        # Send email
        if config['use_ssl']:
            server = smtplib.SMTP_SSL(config['smtp_server'], config['smtp_port'])
        else:
            server = smtplib.SMTP(config['smtp_server'], config['smtp_port'])
            if config['use_tls']:
                server.starttls()

        server.login(config['smtp_email'], config['smtp_password'])
        server.send_message(msg)
        server.quit()

        print(f"✅ Password reset email sent to {to_email}")
        return True

    except Exception as e:
        print(f"❌ Failed to send email to {to_email}: {str(e)}")
        return False

def send_welcome_email(to_email, user_name, temp_password=None):
    """Send welcome email to new user"""
    # Can be expanded later for new user onboarding
    pass

def send_password_changed_notification(to_email, user_name):
    """Send notification when password is successfully changed"""
    config = get_smtp_config()

    if not config['smtp_email'] or not config['smtp_password']:
        return False

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = f'Password Changed - {config["from_name"]}'
        msg['From'] = f'{config["from_name"]} <{config["smtp_email"]}>'
        msg['To'] = to_email

        html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{{{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}}}
        .container {{{{ max-width: 600px; margin: 40px auto; padding: 20px; background: #f9f9f9; border-radius: 8px; }}}}
        .content {{{{ background: white; padding: 30px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }}}}
        .header {{{{ background: linear-gradient(135deg, #1565C0 0%, #0D47A1 100%); color: white; padding: 20px; text-align: center; border-radius: 6px 6px 0 0; box-shadow: 0 2px 4px rgba(21, 101, 192, 0.2); }}}}
        .success {{{{ color: #2E7D32; font-size: 24px; }}}}
    </style>
</head>
<body>
    <div class="container">
        <div class="content">
            <div class="header">
                <h2>✓ Password Changed Successfully</h2>
            </div>
            <div style="padding: 20px;">
                <p>Hello {user_name},</p>
                <p>Your password for {APP_NAME} has been changed successfully.</p>
                <p>If you did not make this change, please contact your administrator immediately.</p>
                <p>Best regards,<br>{APP_NAME} Team</p>
            </div>
        </div>
    </div>
</body>
</html>
        """

        msg.attach(MIMEText(html_body, 'html'))

        if config['use_ssl']:
            server = smtplib.SMTP_SSL(config['smtp_server'], config['smtp_port'])
        else:
            server = smtplib.SMTP(config['smtp_server'], config['smtp_port'])
            if config['use_tls']:
                server.starttls()

        server.login(config['smtp_email'], config['smtp_password'])
        server.send_message(msg)
        server.quit()

        return True

    except Exception as e:
        print(f"❌ Failed to send notification to {to_email}: {str(e)}")
        return False

def test_smtp_connection(smtp_server, smtp_port, smtp_email, smtp_password,
                        use_tls, use_ssl, from_name, test_email):
    """
    Test SMTP connection and send a test email

    Args:
        smtp_server: SMTP server address
        smtp_port: SMTP port number
        smtp_email: Sender email address
        smtp_password: SMTP password
        use_tls: Whether to use TLS
        use_ssl: Whether to use SSL
        from_name: Display name for sender
        test_email: Email address to send test to

    Returns:
        tuple: (success: bool, message: str)
    """
    try:
        # Create test message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = f'SMTP Test - {from_name}'
        msg['From'] = f'{from_name} <{smtp_email}>'
        msg['To'] = test_email

        html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 40px auto; padding: 20px; background: #f9f9f9; border-radius: 8px; }}
        .content {{ background: white; padding: 30px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }}
        .header {{{{ background: linear-gradient(135deg, #1565C0 0%, #0D47A1 100%); color: white; padding: 20px; text-align: center; border-radius: 6px 6px 0 0; box-shadow: 0 2px 4px rgba(21, 101, 192, 0.2); }}}}
        .success {{{{ color: #2E7D32; font-size: 48px; text-align: center; margin: 20px 0; }}}}
    </style>
</head>
<body>
    <div class="container">
        <div class="content">
            <div class="header">
                <h2>📧 SMTP Configuration Test</h2>
            </div>
            <div style="padding: 20px; text-align: center;">
                <div class="success">✓</div>
                <h3>Success!</h3>
                <p>Your SMTP configuration is working correctly.</p>
                <p><strong>{from_name}</strong></p>
                <p>Server: {smtp_server}:{smtp_port}</p>
                <p>TLS: {'Enabled' if use_tls else 'Disabled'}</p>
                <p>SSL: {'Enabled' if use_ssl else 'Disabled'}</p>
                <p style="margin-top: 30px; color: #666; font-size: 14px;">
                    Test conducted at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
                </p>
            </div>
        </div>
    </div>
</body>
</html>
        """

        msg.attach(MIMEText(html_body, 'html'))

        # Send test email
        if use_ssl:
            server = smtplib.SMTP_SSL(smtp_server, smtp_port, timeout=10)
        else:
            server = smtplib.SMTP(smtp_server, smtp_port, timeout=10)
            if use_tls:
                server.starttls()

        server.login(smtp_email, smtp_password)
        server.send_message(msg)
        server.quit()

        return (True, f"Test email sent successfully to {test_email}")

    except smtplib.SMTPAuthenticationError:
        return (False, "Authentication failed. Check your email and password.")
    except smtplib.SMTPConnectError:
        return (False, f"Could not connect to SMTP server {smtp_server}:{smtp_port}")
    except smtplib.SMTPException as e:
        return (False, f"SMTP error: {str(e)}")
    except Exception as e:
        return (False, f"Failed to send test email: {str(e)}")
