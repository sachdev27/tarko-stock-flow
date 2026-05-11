-- Add automatic orphan cleanup scheduler settings
-- This migration adds system settings to enable/disable automatic cleanup of orphaned stock

-- Add setting for enabling/disabling auto orphan cleanup (default: disabled)
INSERT INTO system_settings (setting_key, setting_value, description, updated_at)
VALUES (
    'auto_cleanup_orphans_enabled',
    'false',
    'Enable automatic cleanup of orphaned inventory stock rows (default: disabled)',
    NOW()
)
ON CONFLICT (setting_key) DO NOTHING;

-- Add setting for orphan cleanup interval (default: weekly)
INSERT INTO system_settings (setting_key, setting_value, description, updated_at)
VALUES (
    'auto_cleanup_orphans_interval',
    'weekly',
    'Interval for automatic orphan cleanup: hourly, daily, weekly, monthly, or custom formats like 6h, 2d (default: weekly)',
    NOW()
)
ON CONFLICT (setting_key) DO NOTHING;
