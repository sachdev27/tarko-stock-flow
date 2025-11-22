-- Migration: Add REVERTED to dispatches status constraint
-- This allows dispatches to have status='REVERTED' when they are reverted

-- Drop the old constraint
ALTER TABLE dispatches DROP CONSTRAINT IF EXISTS dispatches_status_check;

-- Add new constraint with REVERTED included
ALTER TABLE dispatches ADD CONSTRAINT dispatches_status_check
CHECK (status = ANY (ARRAY['PENDING'::text, 'DISPATCHED'::text, 'DELIVERED'::text, 'CANCELLED'::text, 'REVERTED'::text]));

-- Add comment
COMMENT ON CONSTRAINT dispatches_status_check ON dispatches IS 'Valid dispatch statuses: PENDING, DISPATCHED, DELIVERED, CANCELLED, REVERTED';
