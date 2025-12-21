-- Migration: Fix datetime columns for dispatch_date and return_date
-- These columns were defined as DATE type which truncates time information.
-- Changing to TIMESTAMPTZ to properly store and display times.
--
-- Run this migration with: docker exec -i tarko-postgres psql -U tarko_user -d tarko_inventory < backend/migrations/fix_datetime_columns.sql

BEGIN;

-- =====================================================
-- STEP 1: Drop dependent views (safe even if already dropped)
-- =====================================================

-- Drop views that depend on dispatches.dispatch_date
DROP VIEW IF EXISTS public.dispatch_summary CASCADE;

-- Drop views that depend on returns.return_date
DROP VIEW IF EXISTS public.return_items_detailed CASCADE;
DROP VIEW IF EXISTS public.return_summary CASCADE;

-- =====================================================
-- STEP 2: Alter column types from DATE to TIMESTAMPTZ
-- (Only alters if not already TIMESTAMPTZ - idempotent)
-- =====================================================

-- Alter dispatches.dispatch_date (if still DATE type)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'dispatches'
        AND column_name = 'dispatch_date'
        AND data_type = 'date'
    ) THEN
        ALTER TABLE public.dispatches
            ALTER COLUMN dispatch_date TYPE TIMESTAMPTZ
            USING dispatch_date::timestamptz;
        ALTER TABLE public.dispatches
            ALTER COLUMN dispatch_date SET DEFAULT now();
        RAISE NOTICE 'dispatch_date altered to TIMESTAMPTZ';
    ELSE
        RAISE NOTICE 'dispatch_date already TIMESTAMPTZ, skipping';
    END IF;
END $$;

-- Alter returns.return_date (if still DATE type)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'returns'
        AND column_name = 'return_date'
        AND data_type = 'date'
    ) THEN
        ALTER TABLE public.returns
            ALTER COLUMN return_date TYPE TIMESTAMPTZ
            USING return_date::timestamptz;
        ALTER TABLE public.returns
            ALTER COLUMN return_date SET DEFAULT now();
        RAISE NOTICE 'return_date altered to TIMESTAMPTZ';
    ELSE
        RAISE NOTICE 'return_date already TIMESTAMPTZ, skipping';
    END IF;
END $$;

-- Recreate dispatch_summary view
CREATE VIEW public.dispatch_summary AS
 SELECT d.id,
    d.dispatch_number,
    d.dispatch_date,
    d.status,
    d.invoice_number,
    c.name AS customer_name,
    c.city AS customer_city,
    bt.name AS bill_to_name,
    t.name AS transport_name,
    v.vehicle_number,
    d.total_amount,
    count(di.id) AS total_items,
    sum(di.quantity) AS total_quantity,
    d.notes,
    u.email AS created_by_email,
    d.created_at,
    d.updated_at
   FROM ((((((public.dispatches d
     LEFT JOIN public.customers c ON ((d.customer_id = c.id)))
     LEFT JOIN public.bill_to bt ON ((d.bill_to_id = bt.id)))
     LEFT JOIN public.transports t ON ((d.transport_id = t.id)))
     LEFT JOIN public.vehicles v ON ((d.vehicle_id = v.id)))
     LEFT JOIN public.dispatch_items di ON ((di.dispatch_id = d.id)))
     LEFT JOIN public.users u ON ((d.created_by = u.id)))
  WHERE (d.deleted_at IS NULL)
  GROUP BY d.id, d.dispatch_number, d.dispatch_date, d.status, d.invoice_number, c.name, c.city, bt.name, t.name, v.vehicle_number, d.total_amount, d.notes, u.email, d.created_at, d.updated_at
  ORDER BY d.dispatch_date DESC, d.created_at DESC;

-- Recreate return_items_detailed view
CREATE VIEW public.return_items_detailed AS
 SELECT ri.id,
    ri.return_id,
    r.return_number,
    r.return_date,
    ri.item_type,
    ri.quantity,
    ri.length_meters,
    ri.bundle_size,
    ri.piece_count,
    ri.piece_length_meters,
    ri.rate_per_unit,
    ri.amount,
    pv.id AS product_variant_id,
    pt.name AS product_type_name,
    b.name AS brand_name,
    pv.parameters,
    c.name AS customer_name,
    ri.notes,
    ri.created_at
   FROM (((((public.return_items ri
     JOIN public.returns r ON ((ri.return_id = r.id)))
     JOIN public.customers c ON ((r.customer_id = c.id)))
     JOIN public.product_variants pv ON ((ri.product_variant_id = pv.id)))
     JOIN public.product_types pt ON ((pv.product_type_id = pt.id)))
     JOIN public.brands b ON ((pv.brand_id = b.id)))
  WHERE (r.deleted_at IS NULL)
  ORDER BY r.return_date DESC, ri.created_at;

-- Recreate return_summary view
CREATE VIEW public.return_summary AS
 SELECT r.id,
    r.return_number,
    r.return_date,
    r.status,
    c.name AS customer_name,
    c.city AS customer_city,
    c.phone AS customer_phone,
    r.total_amount,
    count(DISTINCT ri.id) AS total_items,
    sum(ri.quantity) AS total_quantity,
    r.notes,
    u.email AS created_by_email,
    r.created_at,
    r.updated_at
   FROM (((public.returns r
     LEFT JOIN public.customers c ON ((r.customer_id = c.id)))
     LEFT JOIN public.return_items ri ON ((ri.return_id = r.id)))
     LEFT JOIN public.users u ON ((r.created_by = u.id)))
  WHERE (r.deleted_at IS NULL)
  GROUP BY r.id, r.return_number, r.return_date, r.status, c.name, c.city, c.phone, r.total_amount, r.notes, u.email, r.created_at, r.updated_at
  ORDER BY r.return_date DESC, r.created_at DESC;

COMMIT;

-- Verify the changes
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'dispatches' AND column_name = 'dispatch_date';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'returns' AND column_name = 'return_date';
