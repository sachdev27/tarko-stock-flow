-- Drop unused tables from the database
-- Run: psql tarko_inventory -f migrations/drop_unused_tables.sql

-- Backup table from old restructure - no longer needed
DROP TABLE IF EXISTS rolls_backup_pre_restructure;

-- Attached documents table - not implemented/used
DROP TABLE IF EXISTS attached_documents;

-- Check remaining tables
SELECT 'Remaining tables:' as message;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
