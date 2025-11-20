#!/usr/bin/env python3
"""
Initialize default admin user for Tarko Inventory System
Run this script after database setup to create the default admin account
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
import bcrypt
from datetime import datetime

# Get database URL from environment
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://localhost/tarko_inventory')

# Default admin credentials
DEFAULT_ADMIN_USERNAME = os.getenv('DEFAULT_ADMIN_USERNAME', 'admin')
DEFAULT_ADMIN_EMAIL = os.getenv('DEFAULT_ADMIN_EMAIL', 'admin@tarko.local')
DEFAULT_ADMIN_PASSWORD = os.getenv('DEFAULT_ADMIN_PASSWORD', 'Admin@123')
DEFAULT_ADMIN_FULLNAME = os.getenv('DEFAULT_ADMIN_FULLNAME', 'System Administrator')

def hash_password(password):
    """Hash a password using bcrypt"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_default_admin():
    """Create default admin user if it doesn't exist"""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        # Check if admin user already exists
        cursor.execute("""
            SELECT id, username, email FROM users
            WHERE username = %s OR email = %s
        """, (DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_EMAIL))

        existing_user = cursor.fetchone()

        if existing_user:
            print(f"✅ Admin user already exists:")
            print(f"   Username: {existing_user['username']}")
            print(f"   Email: {existing_user['email']}")
            print(f"   ID: {existing_user['id']}")
            cursor.close()
            conn.close()
            return True

        # Create admin user
        password_hash = hash_password(DEFAULT_ADMIN_PASSWORD)

        cursor.execute("""
            INSERT INTO users (
                email,
                username,
                full_name,
                password_hash,
                role,
                is_active,
                created_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, username, email, role
        """, (
            DEFAULT_ADMIN_EMAIL,
            DEFAULT_ADMIN_USERNAME,
            DEFAULT_ADMIN_FULLNAME,
            password_hash,
            'admin',
            True,
            datetime.now()
        ))

        new_user = cursor.fetchone()
        conn.commit()

        print("=" * 60)
        print("✅ DEFAULT ADMIN USER CREATED SUCCESSFULLY")
        print("=" * 60)
        print(f"Username: {new_user['username']}")
        print(f"Email:    {new_user['email']}")
        print(f"Password: {DEFAULT_ADMIN_PASSWORD}")
        print(f"Role:     {new_user['role']}")
        print(f"User ID:  {new_user['id']}")
        print("=" * 60)
        print("⚠️  IMPORTANT: Change the admin password after first login!")
        print("=" * 60)

        cursor.close()
        conn.close()
        return True

    except psycopg2.Error as e:
        print(f"❌ Database error: {e}")
        return False
    except Exception as e:
        print(f"❌ Error creating admin user: {e}")
        return False

def main():
    """Main function"""
    print("Tarko Inventory - Default Admin Setup")
    print("-" * 60)
    print(f"Database: {DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else DATABASE_URL}")
    print(f"Admin Username: {DEFAULT_ADMIN_USERNAME}")
    print(f"Admin Email: {DEFAULT_ADMIN_EMAIL}")
    print("-" * 60)

    success = create_default_admin()

    if success:
        sys.exit(0)
    else:
        sys.exit(1)

if __name__ == '__main__':
    main()
