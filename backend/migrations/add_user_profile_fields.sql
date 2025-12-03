-- Add missing user profile fields
-- Migration: add_user_profile_fields.sql

-- Add username column (optional, can be NULL)
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100) UNIQUE;

-- Add full_name column
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);

-- Add is_active column (default TRUE)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Add last_login_at column
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Add failed login tracking columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMPTZ;

-- Add password reset tracking columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_password_reset_request TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- Create index on username
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL AND deleted_at IS NULL;

-- Create index on is_active
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active) WHERE deleted_at IS NULL;
