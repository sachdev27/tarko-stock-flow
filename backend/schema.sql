--
-- PostgreSQL database dump
--

-- Dumped from database version 14.17 (Homebrew)
-- Dumped by pg_dump version 14.17 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'user',
    'reader'
);


--
-- Name: transaction_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transaction_type AS ENUM (
    'PRODUCTION',
    'SALE',
    'CUT_ROLL',
    'ADJUSTMENT',
    'RETURN',
    'TRANSFER_OUT',
    'TRANSFER_IN',
    'INTERNAL_USE',
    'CUT',
    'CUT_BUNDLE',
    'COMBINE_BUNDLE'
);


--
-- Name: TYPE transaction_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.transaction_type IS 'Transaction types: PRODUCTION (new batch), SALE (dispatch), CUT_ROLL (cut HDPE roll), CUT_BUNDLE (cut bundle into spare pieces), COMBINE_BUNDLE (combine spare pieces into bundle), ADJUSTMENT, RETURN, TRANSFER_OUT, TRANSFER_IN, INTERNAL_USE';


--
-- Name: auto_update_stock_quantity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_update_stock_quantity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  affected_stock_id UUID;
  stock_type TEXT;
  new_quantity NUMERIC;
BEGIN
  -- Determine which stock_id was affected
  IF TG_OP = 'DELETE' THEN
    affected_stock_id = OLD.stock_id;
  ELSE
    affected_stock_id = NEW.stock_id;
  END IF;

  -- Get stock type
  SELECT s.stock_type INTO stock_type
  FROM inventory_stock s
  WHERE s.id = affected_stock_id;

  -- Only update for piece-based stocks
  IF stock_type IN ('SPARE', 'CUT_ROLL') THEN
    IF TG_TABLE_NAME = 'sprinkler_spare_pieces' THEN
      -- COUNT actual piece records (each has piece_count=1 now)
      SELECT COUNT(*) INTO new_quantity
      FROM sprinkler_spare_pieces
      WHERE stock_id = affected_stock_id
        AND status = 'IN_STOCK'
        AND deleted_at IS NULL;
    ELSIF TG_TABLE_NAME = 'hdpe_cut_pieces' THEN
      -- COUNT actual piece records
      SELECT COUNT(*) INTO new_quantity
      FROM hdpe_cut_pieces
      WHERE stock_id = affected_stock_id
        AND status = 'IN_STOCK'
        AND deleted_at IS NULL;
    END IF;

    -- Update stock quantity
    UPDATE inventory_stock
    SET quantity = new_quantity, updated_at = NOW()
    WHERE id = affected_stock_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: cleanup_old_lifecycle_events(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_lifecycle_events(days_to_keep integer DEFAULT 180) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Keep last 6 months of events by default
  DELETE FROM piece_lifecycle_events
  WHERE created_at < NOW() - MAKE_INTERVAL(days => days_to_keep)
    AND event_type NOT IN ('CREATED');  -- Never delete creation events
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;


--
-- Name: FUNCTION cleanup_old_lifecycle_events(days_to_keep integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cleanup_old_lifecycle_events(days_to_keep integer) IS 'Cleanup old piece lifecycle events (except CREATED events). Run monthly via cron job.';


--
-- Name: log_piece_lifecycle_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_piece_lifecycle_event() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        DECLARE
          event_type_value TEXT;
          state_before_value JSONB;
          state_after_value JSONB;
          txn_id UUID;
        BEGIN
          -- Determine event type
          IF TG_OP = 'INSERT' THEN
            event_type_value = 'CREATED';
            state_before_value = NULL;
            state_after_value = to_jsonb(NEW);
            txn_id = NEW.created_by_transaction_id;
          ELSIF TG_OP = 'UPDATE' THEN
            -- Determine what changed
            IF OLD.status != NEW.status THEN
              IF NEW.status = 'DISPATCHED' THEN
                event_type_value = 'DISPATCHED';
              ELSIF NEW.status = 'SOLD_OUT' THEN
                event_type_value = 'COMBINED';
              ELSIF NEW.status = 'IN_STOCK' AND OLD.status = 'SOLD_OUT' THEN
                event_type_value = 'REVERTED';
              ELSE
                event_type_value = 'STATUS_CHANGED';
              END IF;
            ELSIF NEW.reserved_by_transaction_id IS NOT NULL AND OLD.reserved_by_transaction_id IS NULL THEN
              event_type_value = 'RESERVED';
            ELSIF NEW.reserved_by_transaction_id IS NULL AND OLD.reserved_by_transaction_id IS NOT NULL THEN
              event_type_value = 'RELEASED';
            ELSE
              event_type_value = 'STATUS_CHANGED';
            END IF;

            state_before_value = to_jsonb(OLD);
            state_after_value = to_jsonb(NEW);

            -- Use the transaction that caused this change:
            -- 1. If being soft-deleted (deleted_at set and wasn't before), use deleted_by_transaction_id
            -- 2. If being restored (deleted_at cleared), use the transaction clearing it (stored in deleted_by_transaction_id of the revert)
            -- 3. Otherwise use created_by_transaction_id
            IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
              -- Being soft-deleted now
              txn_id = NEW.deleted_by_transaction_id;
            ELSIF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN
              -- Being restored - this is tricky, we don't have the revert transaction id
              -- For now, use created_by_transaction_id (the original creator)
              txn_id = NEW.created_by_transaction_id;
            ELSE
              -- Normal update - use the original creator
              txn_id = COALESCE(NEW.created_by_transaction_id, OLD.created_by_transaction_id);
            END IF;
          ELSIF TG_OP = 'DELETE' THEN
            event_type_value = 'REVERTED';
            state_before_value = to_jsonb(OLD);
            state_after_value = NULL;
            txn_id = OLD.deleted_by_transaction_id;
          END IF;

          -- Only log if we have a transaction_id that exists in inventory_transactions
          IF txn_id IS NOT NULL THEN
            -- Check if transaction exists before inserting
            IF EXISTS (SELECT 1 FROM inventory_transactions WHERE id = txn_id) THEN
              INSERT INTO piece_lifecycle_events (
                piece_id,
                piece_type,
                event_type,
                transaction_id,
                state_before,
                state_after,
                created_at
              ) VALUES (
                COALESCE(NEW.id, OLD.id),
                CASE TG_TABLE_NAME
                  WHEN 'hdpe_cut_pieces' THEN 'HDPE'
                  WHEN 'sprinkler_spare_pieces' THEN 'SPRINKLER'
                END,
                event_type_value,
                txn_id,
                state_before_value,
                state_after_value,
                NOW()
              );
            END IF;
          END IF;

          RETURN COALESCE(NEW, OLD);
        END;
        $$;


--
-- Name: populate_transaction_metadata(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.populate_transaction_metadata() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- If roll_id is set, populate roll-specific metadata
  IF NEW.roll_id IS NOT NULL THEN
    -- Get roll and batch data
    SELECT
      r.length_meters,
      r.initial_length_meters,
      r.is_cut_roll,
      r.roll_type,
      r.bundle_size,
      CASE
        WHEN b.weight_per_meter IS NOT NULL THEN (r.length_meters * b.weight_per_meter)
        ELSE NULL
      END as computed_weight
    INTO
      NEW.roll_weight
    FROM rolls r
    JOIN batches b ON r.batch_id = b.id
    WHERE r.id = NEW.roll_id;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: prevent_transaction_id_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_transaction_id_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Allow setting on INSERT
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  
  -- On UPDATE: Prevent changing created_by_transaction_id
  IF TG_OP = 'UPDATE' THEN
    IF OLD.created_by_transaction_id IS NOT NULL 
       AND NEW.created_by_transaction_id IS DISTINCT FROM OLD.created_by_transaction_id THEN
      RAISE EXCEPTION 'created_by_transaction_id is immutable and cannot be changed. Old: %, New: %', 
        OLD.created_by_transaction_id, NEW.created_by_transaction_id;
    END IF;
    
    -- Increment version for optimistic locking
    NEW.version = OLD.version + 1;
    NEW.updated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: refresh_piece_state_view(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_piece_state_view() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_piece_current_state;
END;
$$;


--
-- Name: refresh_product_variant_details(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_product_variant_details() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_product_variant_details;
END;
$$;


--
-- Name: update_backup_config_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_backup_config_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: validate_spare_stock_quantity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_spare_stock_quantity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  actual_piece_count INTEGER;
BEGIN
  -- Only validate for SPARE stock type
  IF NEW.stock_type != 'SPARE' THEN
    RETURN NEW;
  END IF;

  -- Get actual COUNT of spare pieces (one record per piece)
  SELECT COUNT(*) INTO actual_piece_count
  FROM sprinkler_spare_pieces
  WHERE stock_id = NEW.id
    AND status = 'IN_STOCK'
    AND deleted_at IS NULL;

  -- Validate quantity matches actual piece count
  IF NEW.quantity != actual_piece_count THEN
    RAISE EXCEPTION 'SPARE stock quantity validation failed. Stock quantity: %, Actual pieces: %. Stock ID: %',
      NEW.quantity, actual_piece_count, NEW.id;
  END IF;

  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: archive_buckets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.archive_buckets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_name character varying(255) NOT NULL,
    provider character varying(50) NOT NULL,
    credentials_id uuid,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    created_by_user_id uuid
);


--
-- Name: archived_backups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.archived_backups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    original_backup_id character varying(255) NOT NULL,
    backup_type character varying(50) NOT NULL,
    archive_bucket_id uuid,
    archive_path character varying(500) NOT NULL,
    archive_size_bytes bigint,
    archived_at timestamp with time zone DEFAULT now(),
    archived_by_user_id uuid,
    notes text,
    tags character varying(255)[]
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action_type text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    description text NOT NULL,
    before_data jsonb,
    after_data jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    changes jsonb
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    username character varying(100),
    full_name character varying(255),
    is_active boolean DEFAULT true,
    last_login_at timestamp with time zone,
    created_by_user_id uuid,
    failed_login_attempts integer DEFAULT 0,
    locked_until timestamp with time zone,
    last_failed_login timestamp with time zone,
    password_changed_at timestamp without time zone,
    last_password_reset_request timestamp without time zone,
    last_failed_login_at timestamp with time zone
);


--
-- Name: COLUMN users.username; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.username IS 'Username for login (alternative to email)';


--
-- Name: COLUMN users.full_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.full_name IS 'User full display name';


--
-- Name: COLUMN users.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.is_active IS 'Whether user account is active';


--
-- Name: COLUMN users.created_by_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.created_by_user_id IS 'Admin who created this user account';


--
-- Name: COLUMN users.failed_login_attempts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.failed_login_attempts IS 'Number of consecutive failed login attempts';


--
-- Name: COLUMN users.locked_until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.locked_until IS 'Account is locked until this timestamp';


--
-- Name: COLUMN users.last_failed_login; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.last_failed_login IS 'Timestamp of last failed login attempt';


--
-- Name: audit_logs_detailed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.audit_logs_detailed AS
 SELECT al.id,
    al.user_id,
    al.action_type,
    al.entity_type,
    al.entity_id,
    al.description,
    al.before_data,
    al.after_data,
    al.ip_address,
    al.user_agent,
    al.created_at,
    al.changes,
    u.email AS user_email,
    u.username AS user_username,
    u.full_name AS user_name
   FROM (public.audit_logs al
     LEFT JOIN public.users u ON ((al.user_id = u.id)))
  ORDER BY al.created_at DESC;


--
-- Name: backup_deletion_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_deletion_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    backup_id character varying(255) NOT NULL,
    backup_type character varying(50) NOT NULL,
    backup_path character varying(500),
    deletion_reason character varying(100),
    deleted_at timestamp with time zone DEFAULT now(),
    deleted_by_user_id uuid,
    policy_id uuid
);


--
-- Name: backup_retention_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_retention_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    policy_name character varying(100) NOT NULL,
    backup_type character varying(50) NOT NULL,
    retention_days integer DEFAULT 7 NOT NULL,
    auto_delete_enabled boolean DEFAULT true,
    keep_weekly boolean DEFAULT true,
    keep_monthly boolean DEFAULT true,
    max_backups integer,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by_user_id uuid
);


--
-- Name: batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_no text NOT NULL,
    batch_code text NOT NULL,
    product_variant_id uuid NOT NULL,
    production_date timestamp with time zone NOT NULL,
    initial_quantity numeric(15,3) NOT NULL,
    current_quantity numeric(15,3) NOT NULL,
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    attachment_url text,
    weight_per_meter numeric(10,3),
    total_weight numeric(15,3),
    piece_length numeric,
    weight_per_piece numeric,
    CONSTRAINT batches_current_quantity_check CHECK ((current_quantity >= (0)::numeric)),
    CONSTRAINT batches_initial_quantity_check CHECK ((initial_quantity > (0)::numeric))
);


--
-- Name: COLUMN batches.weight_per_meter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.batches.weight_per_meter IS 'Weight in kilograms per meter (kg/m)';


--
-- Name: COLUMN batches.total_weight; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.batches.total_weight IS 'Total weight of the batch in kilograms (kg)';


--
-- Name: COLUMN batches.piece_length; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.batches.piece_length IS 'Length of each individual piece in meters (for quantity-based products like Sprinkler Pipe)';


--
-- Name: COLUMN batches.weight_per_piece; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.batches.weight_per_piece IS 'Weight of each individual piece in grams (for quantity-based products like Sprinkler Pipe)';


--
-- Name: bill_to; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bill_to (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    city text,
    gstin text,
    address text,
    contact_person text,
    phone text,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    created_by uuid
);


--
-- Name: cloud_backup_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cloud_backup_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    account_id text,
    access_key_id text NOT NULL,
    secret_access_key text NOT NULL,
    bucket_name text NOT NULL,
    region text,
    endpoint_url text,
    is_enabled boolean DEFAULT true,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT cloud_backup_config_provider_check CHECK ((provider = ANY (ARRAY['r2'::text, 's3'::text])))
);


--
-- Name: TABLE cloud_backup_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cloud_backup_config IS 'Stores encrypted cloud storage credentials for R2/S3 backups';


--
-- Name: COLUMN cloud_backup_config.secret_access_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cloud_backup_config.secret_access_key IS 'Encrypted using Fernet encryption';


--
-- Name: COLUMN cloud_backup_config.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cloud_backup_config.is_active IS 'Only one config can be active at a time';


--
-- Name: cloud_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cloud_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider character varying(50) NOT NULL,
    account_id character varying(255),
    access_key_id character varying(255) NOT NULL,
    secret_access_key text NOT NULL,
    bucket_name character varying(255) NOT NULL,
    region character varying(100),
    endpoint_url character varying(500),
    is_active boolean DEFAULT true,
    is_encrypted boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by_user_id uuid
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    contact_person text,
    phone text,
    email text,
    gstin text,
    address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    created_by uuid,
    city text,
    pincode text,
    state text
);


--
-- Name: database_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.database_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    snapshot_name text NOT NULL,
    description text,
    snapshot_data jsonb NOT NULL,
    table_counts jsonb NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    file_size_mb numeric(10,2),
    is_automatic boolean DEFAULT false,
    tags text[],
    storage_path text
);


--
-- Name: TABLE database_snapshots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.database_snapshots IS 'Stores complete database snapshots for version control and rollback';


--
-- Name: COLUMN database_snapshots.storage_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.database_snapshots.storage_path IS 'Absolute path where snapshot files are stored on disk';


--
-- Name: dispatch_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispatch_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dispatch_id uuid NOT NULL,
    stock_id uuid NOT NULL,
    product_variant_id uuid NOT NULL,
    item_type text NOT NULL,
    quantity integer NOT NULL,
    cut_piece_id uuid,
    length_meters numeric,
    spare_piece_ids uuid[],
    piece_count integer,
    bundle_size integer,
    pieces_per_bundle integer,
    piece_length_meters numeric,
    rate_per_unit numeric(15,2),
    amount numeric(15,2),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dispatch_items_item_type_check CHECK ((item_type = ANY (ARRAY['FULL_ROLL'::text, 'CUT_ROLL'::text, 'CUT_PIECE'::text, 'BUNDLE'::text, 'SPARE_PIECES'::text]))),
    CONSTRAINT dispatch_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: dispatches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispatches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dispatch_number text NOT NULL,
    customer_id uuid NOT NULL,
    bill_to_id uuid,
    transport_id uuid,
    vehicle_id uuid,
    invoice_number text,
    dispatch_date date DEFAULT CURRENT_DATE NOT NULL,
    notes text,
    total_amount numeric(15,2),
    status text DEFAULT 'PENDING'::text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    reverted_at timestamp with time zone,
    reverted_by uuid,
    CONSTRAINT dispatches_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'DISPATCHED'::text, 'DELIVERED'::text, 'CANCELLED'::text, 'REVERTED'::text])))
);


--
-- Name: COLUMN dispatches.reverted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.dispatches.reverted_at IS 'Timestamp when this dispatch was reverted. NULL means not reverted.';


--
-- Name: COLUMN dispatches.reverted_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.dispatches.reverted_by IS 'User who reverted this dispatch. NULL means not reverted.';


--
-- Name: CONSTRAINT dispatches_status_check ON dispatches; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT dispatches_status_check ON public.dispatches IS 'Valid dispatch statuses: PENDING, DISPATCHED, DELIVERED, CANCELLED, REVERTED';


--
-- Name: inventory_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_stock (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    product_variant_id uuid NOT NULL,
    status text DEFAULT 'IN_STOCK'::text NOT NULL,
    stock_type text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    length_per_unit numeric,
    pieces_per_bundle integer,
    piece_length_meters numeric,
    parent_stock_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_transaction_id uuid,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT inventory_stock_length_per_unit_check CHECK ((length_per_unit > (0)::numeric)),
    CONSTRAINT inventory_stock_piece_length_meters_check CHECK ((piece_length_meters > (0)::numeric)),
    CONSTRAINT inventory_stock_pieces_per_bundle_check CHECK ((pieces_per_bundle > 0)),
    CONSTRAINT inventory_stock_quantity_check CHECK ((quantity >= 0)),
    CONSTRAINT inventory_stock_status_check CHECK ((status = ANY (ARRAY['IN_STOCK'::text, 'DISPATCHED'::text, 'SOLD_OUT'::text, 'DAMAGED'::text, 'RETURNED'::text]))),
    CONSTRAINT inventory_stock_stock_type_check CHECK ((stock_type = ANY (ARRAY['FULL_ROLL'::text, 'CUT_ROLL'::text, 'BUNDLE'::text, 'SPARE'::text])))
);


--
-- Name: COLUMN inventory_stock.deleted_by_transaction_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inventory_stock.deleted_by_transaction_id IS 'Transaction that soft-deleted this stock record. Used for precise revert matching instead of time windows.';


--
-- Name: COLUMN inventory_stock.version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inventory_stock.version IS 'Row version for optimistic locking. Incremented on each update.';


--
-- Name: product_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    unit_id uuid NOT NULL,
    parameter_schema jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    created_by uuid,
    roll_configuration jsonb DEFAULT '{"type": "standard_rolls", "options": [{"label": "500m", "value": 500}, {"label": "300m", "value": 300}]}'::jsonb
);


--
-- Name: COLUMN product_types.roll_configuration; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_types.roll_configuration IS 'JSON config for roll types: standard_rolls, bundles, spare_pipes, cut_rolls';


--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_type_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    parameters jsonb DEFAULT '{}'::jsonb NOT NULL,
    sku text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dispatch_items_detailed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.dispatch_items_detailed AS
 SELECT di.id,
    di.dispatch_id,
    d.dispatch_number,
    di.item_type,
    di.quantity,
    di.length_meters,
    di.piece_count,
    di.bundle_size,
    di.pieces_per_bundle,
    di.piece_length_meters,
    di.rate_per_unit,
    di.amount,
    pv.id AS product_variant_id,
    pt.name AS product_type_name,
    b.name AS brand_name,
    pv.parameters,
    ist.status AS stock_status,
    ist.stock_type,
    di.created_at
   FROM (((((public.dispatch_items di
     JOIN public.dispatches d ON ((di.dispatch_id = d.id)))
     JOIN public.inventory_stock ist ON ((di.stock_id = ist.id)))
     JOIN public.product_variants pv ON ((di.product_variant_id = pv.id)))
     JOIN public.product_types pt ON ((pv.product_type_id = pt.id)))
     JOIN public.brands b ON ((pv.brand_id = b.id)))
  WHERE (d.deleted_at IS NULL);


--
-- Name: transports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    contact_person text,
    phone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vehicle_number text NOT NULL,
    vehicle_type text,
    driver_name text,
    driver_phone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dispatch_summary; Type: VIEW; Schema: public; Owner: -
--

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


--
-- Name: hdpe_cut_pieces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hdpe_cut_pieces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stock_id uuid NOT NULL,
    length_meters numeric NOT NULL,
    status text DEFAULT 'IN_STOCK'::text NOT NULL,
    dispatch_id uuid,
    weight_grams numeric,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    transaction_id uuid,
    created_by_transaction_id uuid,
    original_stock_id uuid,
    version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_transaction_id uuid,
    reserved_by_transaction_id uuid,
    reserved_at timestamp without time zone,
    last_modified_by_transaction_id uuid,
    CONSTRAINT check_length_positive CHECK ((length_meters > (0)::numeric)),
    CONSTRAINT check_version_positive CHECK ((version > 0)),
    CONSTRAINT hdpe_cut_pieces_length_meters_check CHECK ((length_meters > (0)::numeric)),
    CONSTRAINT hdpe_cut_pieces_status_check CHECK ((status = ANY (ARRAY['IN_STOCK'::text, 'DISPATCHED'::text, 'SOLD_OUT'::text, 'SCRAPPED'::text]))),
    CONSTRAINT hdpe_cut_pieces_weight_grams_check CHECK ((weight_grams >= (0)::numeric))
);


--
-- Name: COLUMN hdpe_cut_pieces.transaction_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hdpe_cut_pieces.transaction_id IS 'DEPRECATED: Use created_by_transaction_id instead. Will be removed in future version.';


--
-- Name: COLUMN hdpe_cut_pieces.created_by_transaction_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hdpe_cut_pieces.created_by_transaction_id IS 'IMMUTABLE: Transaction that created this piece. Never updated after creation.';


--
-- Name: COLUMN hdpe_cut_pieces.original_stock_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hdpe_cut_pieces.original_stock_id IS 'IMMUTABLE: Original stock_id when piece was created. Preserved even if piece moves to different stock.';


--
-- Name: COLUMN hdpe_cut_pieces.version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hdpe_cut_pieces.version IS 'Row version for optimistic locking. Incremented on each update. Compare before update to detect concurrent modifications.';


--
-- Name: COLUMN hdpe_cut_pieces.deleted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hdpe_cut_pieces.deleted_at IS 'Soft delete timestamp. NULL means active, non-NULL means deleted. Never hard delete pieces - preserves audit trail.';


--
-- Name: COLUMN hdpe_cut_pieces.deleted_by_transaction_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hdpe_cut_pieces.deleted_by_transaction_id IS 'Transaction that soft-deleted this piece. Used for precise revert operations.';


--
-- Name: COLUMN hdpe_cut_pieces.last_modified_by_transaction_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hdpe_cut_pieces.last_modified_by_transaction_id IS 'MUTABLE: Last transaction that modified this piece. Can be updated.';


--
-- Name: hdpe_stock_details; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.hdpe_stock_details AS
 SELECT s.id AS stock_id,
    s.batch_id,
    s.product_variant_id,
    s.status,
    s.stock_type,
    s.quantity,
    s.length_per_unit,
    s.parent_stock_id,
    s.created_at,
    b.batch_code,
    b.batch_no,
    b.production_date,
    pt.name AS product_type_name,
    br.name AS brand_name,
    pv.parameters,
        CASE
            WHEN (s.stock_type = 'FULL_ROLL'::text) THEN ((s.quantity)::numeric * s.length_per_unit)
            WHEN (s.stock_type = 'CUT_ROLL'::text) THEN ( SELECT COALESCE(sum(hdpe_cut_pieces.length_meters), (0)::numeric) AS "coalesce"
               FROM public.hdpe_cut_pieces
              WHERE ((hdpe_cut_pieces.stock_id = s.id) AND (hdpe_cut_pieces.status = 'IN_STOCK'::text)))
            ELSE (0)::numeric
        END AS total_meters_available,
        CASE
            WHEN (s.stock_type = 'CUT_ROLL'::text) THEN ( SELECT count(*) AS count
               FROM public.hdpe_cut_pieces
              WHERE ((hdpe_cut_pieces.stock_id = s.id) AND (hdpe_cut_pieces.status = 'IN_STOCK'::text)))
            ELSE (s.quantity)::bigint
        END AS available_count
   FROM ((((public.inventory_stock s
     JOIN public.batches b ON ((s.batch_id = b.id)))
     JOIN public.product_variants pv ON ((s.product_variant_id = pv.id)))
     JOIN public.product_types pt ON ((pv.product_type_id = pt.id)))
     JOIN public.brands br ON ((pv.brand_id = br.id)))
  WHERE ((s.deleted_at IS NULL) AND (s.status = 'IN_STOCK'::text) AND (pt.name = 'HDPE Pipe'::text));


--
-- Name: inventory_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_type text NOT NULL,
    from_stock_id uuid,
    from_quantity integer,
    from_length numeric,
    from_pieces integer,
    to_stock_id uuid,
    to_quantity integer,
    to_length numeric,
    to_pieces integer,
    dispatch_id uuid,
    batch_id uuid,
    cut_piece_details jsonb,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dispatch_item_id uuid,
    reverted_at timestamp with time zone,
    reverted_by uuid,
    CONSTRAINT inventory_transactions_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['PRODUCTION'::text, 'CUT_ROLL'::text, 'SPLIT_BUNDLE'::text, 'COMBINE_SPARES'::text, 'DISPATCH'::text, 'ADJUSTMENT'::text, 'RETURN'::text, 'DAMAGE'::text])))
);


--
-- Name: COLUMN inventory_transactions.reverted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inventory_transactions.reverted_at IS 'Timestamp when the transaction was reverted';


--
-- Name: COLUMN inventory_transactions.reverted_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.inventory_transactions.reverted_by IS 'User who reverted the transaction';


--
-- Name: sprinkler_spare_pieces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sprinkler_spare_pieces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stock_id uuid NOT NULL,
    piece_count integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'IN_STOCK'::text NOT NULL,
    dispatch_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    transaction_id uuid,
    created_by_transaction_id uuid,
    original_stock_id uuid,
    version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_transaction_id uuid,
    reserved_by_transaction_id uuid,
    reserved_at timestamp with time zone,
    last_modified_by_transaction_id uuid,
    CONSTRAINT check_piece_count_positive CHECK ((piece_count > 0)),
    CONSTRAINT check_reservation_consistency CHECK ((((reserved_by_transaction_id IS NULL) AND (reserved_at IS NULL)) OR ((reserved_by_transaction_id IS NOT NULL) AND (reserved_at IS NOT NULL)))),
    CONSTRAINT check_version_positive_spare CHECK ((version > 0)),
    CONSTRAINT sprinkler_spare_pieces_piece_count_check CHECK ((piece_count > 0)),
    CONSTRAINT sprinkler_spare_pieces_status_check CHECK ((status = ANY (ARRAY['IN_STOCK'::text, 'DISPATCHED'::text, 'SOLD_OUT'::text, 'SCRAPPED'::text])))
);


--
-- Name: COLUMN sprinkler_spare_pieces.transaction_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sprinkler_spare_pieces.transaction_id IS 'DEPRECATED: Use created_by_transaction_id instead. Will be removed in future version.';


--
-- Name: COLUMN sprinkler_spare_pieces.created_by_transaction_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sprinkler_spare_pieces.created_by_transaction_id IS 'IMMUTABLE: Transaction that created this piece. Never updated after creation.';


--
-- Name: COLUMN sprinkler_spare_pieces.original_stock_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sprinkler_spare_pieces.original_stock_id IS 'IMMUTABLE: Original stock_id when piece was created. Preserved even if piece moves to different stock.';


--
-- Name: COLUMN sprinkler_spare_pieces.version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sprinkler_spare_pieces.version IS 'Row version for optimistic locking. Incremented on each update. Compare before update to detect concurrent modifications.';


--
-- Name: COLUMN sprinkler_spare_pieces.deleted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sprinkler_spare_pieces.deleted_at IS 'Soft delete timestamp. NULL means active, non-NULL means deleted. Never hard delete pieces - preserves audit trail.';


--
-- Name: COLUMN sprinkler_spare_pieces.deleted_by_transaction_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sprinkler_spare_pieces.deleted_by_transaction_id IS 'Transaction that soft-deleted this piece. Used for precise revert operations.';


--
-- Name: COLUMN sprinkler_spare_pieces.reserved_by_transaction_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sprinkler_spare_pieces.reserved_by_transaction_id IS 'Transaction that has reserved this piece for pending operation. Provides pessimistic locking.';


--
-- Name: COLUMN sprinkler_spare_pieces.reserved_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sprinkler_spare_pieces.reserved_at IS 'Timestamp when piece was reserved. Used to detect and release stale reservations.';


--
-- Name: COLUMN sprinkler_spare_pieces.last_modified_by_transaction_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sprinkler_spare_pieces.last_modified_by_transaction_id IS 'MUTABLE: Last transaction that modified this piece (e.g., COMBINE_SPARES). Can be updated.';


--
-- Name: inventory_unified; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.inventory_unified AS
 SELECT s.id,
    s.batch_id,
    s.product_variant_id,
    s.status,
    s.stock_type,
    s.quantity,
    s.created_at,
    s.updated_at,
    b.batch_code,
    b.batch_no,
    pt.name AS product_type_name,
    br.name AS brand_name,
    pt.name AS product_category,
    pv.parameters,
    s.length_per_unit AS length_meters,
        CASE
            WHEN (s.stock_type = 'CUT_ROLL'::text) THEN true
            ELSE false
        END AS is_cut_roll,
    s.parent_stock_id,
        CASE
            WHEN (s.stock_type = 'BUNDLE'::text) THEN 'bundle'::text
            WHEN (s.stock_type = 'SPARE'::text) THEN 'spare'::text
            ELSE NULL::text
        END AS bundle_type,
    s.pieces_per_bundle AS bundle_size,
        CASE
            WHEN (s.stock_type = 'BUNDLE'::text) THEN ((s.pieces_per_bundle * s.quantity))::bigint
            WHEN (s.stock_type = 'SPARE'::text) THEN ( SELECT COALESCE(sum(sprinkler_spare_pieces.piece_count), (0)::bigint) AS "coalesce"
               FROM public.sprinkler_spare_pieces
              WHERE ((sprinkler_spare_pieces.stock_id = s.id) AND (sprinkler_spare_pieces.status = 'IN_STOCK'::text)))
            ELSE NULL::bigint
        END AS piece_count,
    s.piece_length_meters
   FROM ((((public.inventory_stock s
     JOIN public.batches b ON ((s.batch_id = b.id)))
     JOIN public.product_variants pv ON ((s.product_variant_id = pv.id)))
     JOIN public.product_types pt ON ((pv.product_type_id = pt.id)))
     JOIN public.brands br ON ((pv.brand_id = br.id)))
  WHERE (s.deleted_at IS NULL);


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    created_by uuid
);


--
-- Name: mv_piece_current_state; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_piece_current_state AS
 SELECT 'HDPE'::text AS piece_type,
    hcp.id AS piece_id,
    hcp.stock_id,
    hcp.status,
    hcp.created_by_transaction_id,
    hcp.original_stock_id,
    hcp.length_meters AS quantity,
    hcp.created_at,
    hcp.updated_at,
    hcp.deleted_at,
    hcp.version,
    ist.batch_id,
    ist.product_variant_id,
    it.transaction_type AS created_by_type
   FROM ((public.hdpe_cut_pieces hcp
     JOIN public.inventory_stock ist ON ((hcp.stock_id = ist.id)))
     LEFT JOIN public.inventory_transactions it ON ((hcp.created_by_transaction_id = it.id)))
  WHERE (hcp.deleted_at IS NULL)
UNION ALL
 SELECT 'SPRINKLER'::text AS piece_type,
    ssp.id AS piece_id,
    ssp.stock_id,
    ssp.status,
    ssp.created_by_transaction_id,
    ssp.original_stock_id,
    ssp.piece_count AS quantity,
    ssp.created_at,
    ssp.updated_at,
    ssp.deleted_at,
    ssp.version,
    ist.batch_id,
    ist.product_variant_id,
    it.transaction_type AS created_by_type
   FROM ((public.sprinkler_spare_pieces ssp
     JOIN public.inventory_stock ist ON ((ssp.stock_id = ist.id)))
     LEFT JOIN public.inventory_transactions it ON ((ssp.created_by_transaction_id = it.id)))
  WHERE (ssp.deleted_at IS NULL)
  WITH NO DATA;


--
-- Name: mv_product_variant_details; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_product_variant_details AS
 SELECT pv.id AS variant_id,
    pv.product_type_id,
    pv.brand_id,
    pv.parameters,
    pt.name AS product_type_name,
    br.name AS brand_name,
    pt.parameter_schema
   FROM ((public.product_variants pv
     JOIN public.product_types pt ON ((pv.product_type_id = pt.id)))
     JOIN public.brands br ON ((pv.brand_id = br.id)))
  WHERE (pv.deleted_at IS NULL)
  WITH NO DATA;


--
-- Name: parameter_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parameter_options (
    id integer NOT NULL,
    parameter_name character varying(50) NOT NULL,
    option_value character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by uuid
);


--
-- Name: parameter_options_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.parameter_options_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: parameter_options_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.parameter_options_id_seq OWNED BY public.parameter_options.id;


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    used_at timestamp without time zone,
    ip_address character varying(45),
    user_agent text
);


--
-- Name: TABLE password_reset_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.password_reset_tokens IS 'Stores password reset tokens with expiration';


--
-- Name: COLUMN password_reset_tokens.token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.password_reset_tokens.token IS 'Unique token sent to user email';


--
-- Name: COLUMN password_reset_tokens.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.password_reset_tokens.expires_at IS 'Token expiration time (1 hour from creation)';


--
-- Name: COLUMN password_reset_tokens.used; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.password_reset_tokens.used IS 'Whether token has been used';


--
-- Name: piece_lifecycle_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.piece_lifecycle_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    piece_id uuid NOT NULL,
    piece_type text NOT NULL,
    event_type text NOT NULL,
    transaction_id uuid NOT NULL,
    state_before jsonb,
    state_after jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT piece_lifecycle_events_event_type_check CHECK ((event_type = ANY (ARRAY['CREATED'::text, 'STATUS_CHANGED'::text, 'COMBINED'::text, 'DISPATCHED'::text, 'RETURNED'::text, 'REVERTED'::text, 'RESERVED'::text, 'RELEASED'::text]))),
    CONSTRAINT piece_lifecycle_events_piece_type_check CHECK ((piece_type = ANY (ARRAY['HDPE'::text, 'SPRINKLER'::text])))
);


--
-- Name: TABLE piece_lifecycle_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.piece_lifecycle_events IS 'Immutable event log of all piece state changes. Enables full audit trail and precise rollback.';


--
-- Name: piece_tracking_audit; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.piece_tracking_audit AS
 SELECT 'SPRINKLER'::text AS piece_type,
    ssp.id AS piece_id,
    ssp.stock_id,
    ssp.piece_count AS quantity,
    ssp.status,
    ssp.created_at,
    ssp.updated_at,
    ssp.created_by_transaction_id,
    ssp.last_modified_by_transaction_id,
    ssp.transaction_id AS deprecated_transaction_id,
    it_created.transaction_type AS created_by_type,
    it_modified.transaction_type AS last_modified_by_type
   FROM ((public.sprinkler_spare_pieces ssp
     LEFT JOIN public.inventory_transactions it_created ON ((ssp.created_by_transaction_id = it_created.id)))
     LEFT JOIN public.inventory_transactions it_modified ON ((ssp.last_modified_by_transaction_id = it_modified.id)))
UNION ALL
 SELECT 'HDPE'::text AS piece_type,
    hcp.id AS piece_id,
    hcp.stock_id,
    1 AS quantity,
    hcp.status,
    hcp.created_at,
    hcp.updated_at,
    hcp.created_by_transaction_id,
    hcp.last_modified_by_transaction_id,
    hcp.transaction_id AS deprecated_transaction_id,
    it_created.transaction_type AS created_by_type,
    it_modified.transaction_type AS last_modified_by_type
   FROM ((public.hdpe_cut_pieces hcp
     LEFT JOIN public.inventory_transactions it_created ON ((hcp.created_by_transaction_id = it_created.id)))
     LEFT JOIN public.inventory_transactions it_modified ON ((hcp.last_modified_by_transaction_id = it_modified.id)));


--
-- Name: VIEW piece_tracking_audit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.piece_tracking_audit IS 'Unified view of all pieces with their creation and modification tracking. Use this for debugging transaction history.';


--
-- Name: product_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_aliases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_variant_id uuid NOT NULL,
    alias text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: return_bundles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.return_bundles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    return_item_id uuid NOT NULL,
    bundle_number integer NOT NULL,
    bundle_size integer NOT NULL,
    piece_length_meters numeric NOT NULL,
    stock_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT return_bundles_bundle_size_check CHECK ((bundle_size > 0)),
    CONSTRAINT return_bundles_piece_length_meters_check CHECK ((piece_length_meters > (0)::numeric))
);


--
-- Name: return_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.return_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    return_id uuid NOT NULL,
    product_variant_id uuid NOT NULL,
    item_type text NOT NULL,
    quantity integer NOT NULL,
    length_meters numeric,
    bundle_size integer,
    piece_count integer,
    piece_length_meters numeric,
    rate_per_unit numeric(15,2),
    amount numeric(15,2),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT return_items_item_type_check CHECK ((item_type = ANY (ARRAY['FULL_ROLL'::text, 'CUT_ROLL'::text, 'BUNDLE'::text, 'SPARE_PIECES'::text]))),
    CONSTRAINT return_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.returns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    return_number text NOT NULL,
    customer_id uuid NOT NULL,
    return_date date DEFAULT CURRENT_DATE NOT NULL,
    notes text,
    total_amount numeric(15,2),
    status text DEFAULT 'RECEIVED'::text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    reverted_at timestamp without time zone,
    reverted_by uuid,
    CONSTRAINT returns_status_check CHECK ((status = ANY (ARRAY['RECEIVED'::text, 'INSPECTED'::text, 'RESTOCKED'::text, 'CANCELLED'::text, 'REVERTED'::text])))
);


--
-- Name: COLUMN returns.reverted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.returns.reverted_at IS 'Timestamp when the return was reverted (undone), soft-delete for returns that were entered incorrectly';


--
-- Name: COLUMN returns.reverted_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.returns.reverted_by IS 'User who reverted this return';


--
-- Name: return_items_detailed; Type: VIEW; Schema: public; Owner: -
--

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


--
-- Name: return_rolls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.return_rolls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    return_item_id uuid NOT NULL,
    roll_number integer NOT NULL,
    length_meters numeric NOT NULL,
    stock_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT return_rolls_length_meters_check CHECK ((length_meters > (0)::numeric))
);


--
-- Name: return_summary; Type: VIEW; Schema: public; Owner: -
--

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


--
-- Name: rollback_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rollback_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    snapshot_id uuid NOT NULL,
    snapshot_name text NOT NULL,
    rolled_back_by uuid NOT NULL,
    rolled_back_at timestamp with time zone DEFAULT now() NOT NULL,
    previous_state_summary jsonb,
    success boolean DEFAULT true,
    error_message text,
    affected_tables text[]
);


--
-- Name: TABLE rollback_history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.rollback_history IS 'Tracks all rollback operations performed on the system';


--
-- Name: scrap_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scrap_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scrap_id uuid NOT NULL,
    stock_id uuid NOT NULL,
    batch_id uuid NOT NULL,
    product_variant_id uuid NOT NULL,
    stock_type text NOT NULL,
    quantity_scrapped numeric(15,3) NOT NULL,
    length_per_unit numeric,
    pieces_per_bundle integer,
    piece_length_meters numeric,
    original_quantity numeric(15,3),
    original_status text,
    estimated_value numeric(15,2),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT scrap_items_quantity_scrapped_check CHECK ((quantity_scrapped > (0)::numeric)),
    CONSTRAINT scrap_items_stock_type_check CHECK ((stock_type = ANY (ARRAY['FULL_ROLL'::text, 'CUT_ROLL'::text, 'BUNDLE'::text, 'SPARE'::text])))
);


--
-- Name: scraps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scraps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scrap_number text NOT NULL,
    scrap_date date DEFAULT CURRENT_DATE NOT NULL,
    reason text NOT NULL,
    notes text,
    total_quantity numeric(15,3) DEFAULT 0 NOT NULL,
    estimated_loss numeric(15,2),
    status text DEFAULT 'SCRAPPED'::text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT scraps_status_check CHECK ((status = ANY (ARRAY['SCRAPPED'::text, 'DISPOSED'::text, 'CANCELLED'::text])))
);


--
-- Name: scrap_items_detailed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.scrap_items_detailed AS
 SELECT si.id,
    si.scrap_id,
    s.scrap_number,
    s.scrap_date,
    s.reason,
    si.stock_type,
    si.quantity_scrapped,
    si.length_per_unit,
    si.pieces_per_bundle,
    si.piece_length_meters,
    si.original_quantity,
    si.original_status,
    si.estimated_value,
    b.batch_code,
    b.batch_no,
    pv.id AS product_variant_id,
    pt.name AS product_type_name,
    br.name AS brand_name,
    pv.parameters,
    si.notes,
    si.created_at
   FROM (((((public.scrap_items si
     JOIN public.scraps s ON ((si.scrap_id = s.id)))
     JOIN public.batches b ON ((si.batch_id = b.id)))
     JOIN public.product_variants pv ON ((si.product_variant_id = pv.id)))
     JOIN public.product_types pt ON ((pv.product_type_id = pt.id)))
     JOIN public.brands br ON ((pv.brand_id = br.id)))
  WHERE (s.deleted_at IS NULL)
  ORDER BY s.scrap_date DESC, si.created_at;


--
-- Name: scrap_pieces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scrap_pieces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scrap_item_id uuid NOT NULL,
    original_piece_id uuid,
    piece_type text NOT NULL,
    length_meters numeric,
    piece_count integer,
    piece_length_meters numeric,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT scrap_pieces_piece_type_check CHECK ((piece_type = ANY (ARRAY['CUT_PIECE'::text, 'SPARE_PIECE'::text])))
);


--
-- Name: scrap_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.scrap_summary AS
 SELECT s.id,
    s.scrap_number,
    s.scrap_date,
    s.reason,
    s.status,
    s.total_quantity,
    s.estimated_loss,
    count(DISTINCT si.id) AS total_items,
    count(DISTINCT si.batch_id) AS total_batches,
    s.notes,
    u.email AS created_by_email,
    s.created_at,
    s.updated_at
   FROM ((public.scraps s
     LEFT JOIN public.scrap_items si ON ((si.scrap_id = s.id)))
     LEFT JOIN public.users u ON ((s.created_by = u.id)))
  WHERE (s.deleted_at IS NULL)
  GROUP BY s.id, s.scrap_number, s.scrap_date, s.reason, s.status, s.total_quantity, s.estimated_loss, s.notes, u.email, s.created_at, s.updated_at
  ORDER BY s.scrap_date DESC, s.created_at DESC;


--
-- Name: smtp_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.smtp_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    smtp_server character varying(255) DEFAULT 'smtp.gmail.com'::character varying NOT NULL,
    smtp_port integer DEFAULT 587 NOT NULL,
    smtp_email character varying(255) NOT NULL,
    smtp_password_encrypted text NOT NULL,
    use_tls boolean DEFAULT true NOT NULL,
    use_ssl boolean DEFAULT false NOT NULL,
    from_name character varying(255) DEFAULT 'Tarko Inventory'::character varying,
    reply_to_email character varying(255),
    is_active boolean DEFAULT true NOT NULL,
    test_email_sent_at timestamp without time zone,
    test_email_status character varying(50),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid
);


--
-- Name: TABLE smtp_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.smtp_config IS 'Stores encrypted SMTP server configuration for email sending';


--
-- Name: COLUMN smtp_config.smtp_password_encrypted; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.smtp_config.smtp_password_encrypted IS 'Fernet encrypted SMTP password';


--
-- Name: COLUMN smtp_config.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.smtp_config.is_active IS 'Only one configuration should be active at a time';


--
-- Name: COLUMN smtp_config.test_email_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.smtp_config.test_email_status IS 'Status of last test email: success, failed, pending';


--
-- Name: sprinkler_stock_details; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.sprinkler_stock_details AS
 SELECT s.id AS stock_id,
    s.batch_id,
    s.product_variant_id,
    s.status,
    s.stock_type,
    s.quantity,
    s.pieces_per_bundle,
    s.piece_length_meters,
    s.parent_stock_id,
    s.created_at,
    b.batch_code,
    b.batch_no,
    b.production_date,
    pt.name AS product_type_name,
    br.name AS brand_name,
    pv.parameters,
        CASE
            WHEN (s.stock_type = 'BUNDLE'::text) THEN ((s.quantity * s.pieces_per_bundle))::bigint
            WHEN (s.stock_type = 'SPARE'::text) THEN ( SELECT COALESCE(sum(sprinkler_spare_pieces.piece_count), (0)::bigint) AS "coalesce"
               FROM public.sprinkler_spare_pieces
              WHERE ((sprinkler_spare_pieces.stock_id = s.id) AND (sprinkler_spare_pieces.status = 'IN_STOCK'::text)))
            ELSE (0)::bigint
        END AS total_pieces_available,
        CASE
            WHEN (s.stock_type = 'BUNDLE'::text) THEN (s.quantity)::bigint
            WHEN (s.stock_type = 'SPARE'::text) THEN ( SELECT count(*) AS count
               FROM public.sprinkler_spare_pieces
              WHERE ((sprinkler_spare_pieces.stock_id = s.id) AND (sprinkler_spare_pieces.status = 'IN_STOCK'::text)))
            ELSE (0)::bigint
        END AS available_count
   FROM ((((public.inventory_stock s
     JOIN public.batches b ON ((s.batch_id = b.id)))
     JOIN public.product_variants pv ON ((s.product_variant_id = pv.id)))
     JOIN public.product_types pt ON ((pv.product_type_id = pt.id)))
     JOIN public.brands br ON ((pv.brand_id = br.id)))
  WHERE ((s.deleted_at IS NULL) AND (s.status = 'IN_STOCK'::text) AND (pt.name = 'Sprinkler Pipe'::text));


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id integer NOT NULL,
    setting_key character varying(100) NOT NULL,
    setting_value text,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: system_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_settings_id_seq OWNED BY public.system_settings.id;


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    roll_id uuid,
    transaction_type public.transaction_type NOT NULL,
    quantity_change numeric(15,3) NOT NULL,
    transaction_date timestamp with time zone DEFAULT now() NOT NULL,
    customer_id uuid,
    invoice_no text,
    from_location_id uuid,
    to_location_id uuid,
    notes text,
    roll_snapshot jsonb,
    dispatch_id uuid,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    bill_to_id uuid,
    transport_id uuid,
    vehicle_id uuid,
    product_variant_id uuid,
    roll_weight numeric
);


--
-- Name: COLUMN transactions.roll_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.roll_id IS 'Reference to specific roll - enables roll-level transaction tracking';


--
-- Name: COLUMN transactions.product_variant_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.product_variant_id IS 'Direct reference to product variant - ensures exact matching in transaction history queries';


--
-- Name: COLUMN transactions.roll_weight; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.roll_weight IS 'Computed weight of the roll at transaction time (length * weight_per_meter)';


--
-- Name: units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    abbreviation text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role DEFAULT 'user'::public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: v_available_pieces; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_available_pieces AS
 SELECT 'HDPE'::text AS piece_type,
    hcp.id AS piece_id,
    hcp.stock_id,
    hcp.length_meters AS quantity,
    hcp.created_by_transaction_id,
    hcp.version,
    ist.batch_id,
    ist.product_variant_id,
    b.batch_code,
    pv.parameters
   FROM (((public.hdpe_cut_pieces hcp
     JOIN public.inventory_stock ist ON ((hcp.stock_id = ist.id)))
     JOIN public.batches b ON ((ist.batch_id = b.id)))
     JOIN public.product_variants pv ON ((ist.product_variant_id = pv.id)))
  WHERE ((hcp.status = 'IN_STOCK'::text) AND (hcp.deleted_at IS NULL) AND (ist.deleted_at IS NULL))
UNION ALL
 SELECT 'SPRINKLER'::text AS piece_type,
    ssp.id AS piece_id,
    ssp.stock_id,
    ssp.piece_count AS quantity,
    ssp.created_by_transaction_id,
    ssp.version,
    ist.batch_id,
    ist.product_variant_id,
    b.batch_code,
    pv.parameters
   FROM (((public.sprinkler_spare_pieces ssp
     JOIN public.inventory_stock ist ON ((ssp.stock_id = ist.id)))
     JOIN public.batches b ON ((ist.batch_id = b.id)))
     JOIN public.product_variants pv ON ((ist.product_variant_id = pv.id)))
  WHERE ((ssp.status = 'IN_STOCK'::text) AND (ssp.deleted_at IS NULL) AND (ist.deleted_at IS NULL) AND (ssp.reserved_by_transaction_id IS NULL));


--
-- Name: v_piece_audit_trail; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_piece_audit_trail AS
 SELECT ple.id AS event_id,
    ple.piece_id,
    ple.piece_type,
    ple.event_type,
    ple.transaction_id,
    it.transaction_type,
    (ple.state_before ->> 'status'::text) AS status_before,
    (ple.state_after ->> 'status'::text) AS status_after,
    (ple.state_before ->> 'stock_id'::text) AS stock_id_before,
    (ple.state_after ->> 'stock_id'::text) AS stock_id_after,
    ple.notes,
    ple.created_at,
    u.email AS created_by_email
   FROM ((public.piece_lifecycle_events ple
     JOIN public.inventory_transactions it ON ((ple.transaction_id = it.id)))
     LEFT JOIN public.users u ON ((ple.created_by = u.id)))
  ORDER BY ple.created_at DESC;


--
-- Name: v_stock_quantity_validation; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_stock_quantity_validation AS
 SELECT ist.id AS stock_id,
    ist.batch_id,
    ist.stock_type,
    ist.quantity AS recorded_quantity,
        CASE
            WHEN (ist.stock_type = 'SPARE'::text) THEN ( SELECT COALESCE(sum(sprinkler_spare_pieces.piece_count), (0)::bigint) AS "coalesce"
               FROM public.sprinkler_spare_pieces
              WHERE ((sprinkler_spare_pieces.stock_id = ist.id) AND (sprinkler_spare_pieces.status = 'IN_STOCK'::text) AND (sprinkler_spare_pieces.deleted_at IS NULL)))
            WHEN (ist.stock_type = 'CUT_ROLL'::text) THEN ( SELECT count(*) AS count
               FROM public.hdpe_cut_pieces
              WHERE ((hdpe_cut_pieces.stock_id = ist.id) AND (hdpe_cut_pieces.status = 'IN_STOCK'::text) AND (hdpe_cut_pieces.deleted_at IS NULL)))
            ELSE (ist.quantity)::bigint
        END AS actual_quantity,
    (ist.quantity -
        CASE
            WHEN (ist.stock_type = 'SPARE'::text) THEN ( SELECT COALESCE(sum(sprinkler_spare_pieces.piece_count), (0)::bigint) AS "coalesce"
               FROM public.sprinkler_spare_pieces
              WHERE ((sprinkler_spare_pieces.stock_id = ist.id) AND (sprinkler_spare_pieces.status = 'IN_STOCK'::text) AND (sprinkler_spare_pieces.deleted_at IS NULL)))
            WHEN (ist.stock_type = 'CUT_ROLL'::text) THEN ( SELECT count(*) AS count
               FROM public.hdpe_cut_pieces
              WHERE ((hdpe_cut_pieces.stock_id = ist.id) AND (hdpe_cut_pieces.status = 'IN_STOCK'::text) AND (hdpe_cut_pieces.deleted_at IS NULL)))
            ELSE (0)::bigint
        END) AS quantity_mismatch
   FROM public.inventory_stock ist
  WHERE ((ist.deleted_at IS NULL) AND (ist.stock_type = ANY (ARRAY['SPARE'::text, 'CUT_ROLL'::text])));


--
-- Name: parameter_options id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parameter_options ALTER COLUMN id SET DEFAULT nextval('public.parameter_options_id_seq'::regclass);


--
-- Name: system_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings ALTER COLUMN id SET DEFAULT nextval('public.system_settings_id_seq'::regclass);


--
-- Name: archive_buckets archive_buckets_bucket_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archive_buckets
    ADD CONSTRAINT archive_buckets_bucket_name_key UNIQUE (bucket_name);


--
-- Name: archive_buckets archive_buckets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archive_buckets
    ADD CONSTRAINT archive_buckets_pkey PRIMARY KEY (id);


--
-- Name: archived_backups archived_backups_original_backup_id_archive_bucket_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archived_backups
    ADD CONSTRAINT archived_backups_original_backup_id_archive_bucket_id_key UNIQUE (original_backup_id, archive_bucket_id);


--
-- Name: archived_backups archived_backups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archived_backups
    ADD CONSTRAINT archived_backups_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: backup_deletion_log backup_deletion_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_deletion_log
    ADD CONSTRAINT backup_deletion_log_pkey PRIMARY KEY (id);


--
-- Name: backup_retention_policies backup_retention_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_retention_policies
    ADD CONSTRAINT backup_retention_policies_pkey PRIMARY KEY (id);


--
-- Name: backup_retention_policies backup_retention_policies_policy_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_retention_policies
    ADD CONSTRAINT backup_retention_policies_policy_name_key UNIQUE (policy_name);


--
-- Name: batches batches_batch_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_batch_code_key UNIQUE (batch_code);


--
-- Name: batches batches_batch_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_batch_no_key UNIQUE (batch_no);


--
-- Name: batches batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_pkey PRIMARY KEY (id);


--
-- Name: bill_to bill_to_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_to
    ADD CONSTRAINT bill_to_pkey PRIMARY KEY (id);


--
-- Name: brands brands_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_name_key UNIQUE (name);


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);


--
-- Name: cloud_backup_config cloud_backup_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cloud_backup_config
    ADD CONSTRAINT cloud_backup_config_pkey PRIMARY KEY (id);


--
-- Name: cloud_credentials cloud_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cloud_credentials
    ADD CONSTRAINT cloud_credentials_pkey PRIMARY KEY (id);


--
-- Name: cloud_credentials cloud_credentials_provider_bucket_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cloud_credentials
    ADD CONSTRAINT cloud_credentials_provider_bucket_name_key UNIQUE (provider, bucket_name);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: database_snapshots database_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_snapshots
    ADD CONSTRAINT database_snapshots_pkey PRIMARY KEY (id);


--
-- Name: dispatch_items dispatch_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispatch_items
    ADD CONSTRAINT dispatch_items_pkey PRIMARY KEY (id);


--
-- Name: dispatches dispatches_dispatch_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispatches
    ADD CONSTRAINT dispatches_dispatch_number_key UNIQUE (dispatch_number);


--
-- Name: dispatches dispatches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispatches
    ADD CONSTRAINT dispatches_pkey PRIMARY KEY (id);


--
-- Name: hdpe_cut_pieces hdpe_cut_pieces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hdpe_cut_pieces
    ADD CONSTRAINT hdpe_cut_pieces_pkey PRIMARY KEY (id);


--
-- Name: inventory_stock inventory_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stock
    ADD CONSTRAINT inventory_stock_pkey PRIMARY KEY (id);


--
-- Name: inventory_transactions inventory_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_pkey PRIMARY KEY (id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: parameter_options parameter_options_parameter_name_option_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parameter_options
    ADD CONSTRAINT parameter_options_parameter_name_option_value_key UNIQUE (parameter_name, option_value);


--
-- Name: parameter_options parameter_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parameter_options
    ADD CONSTRAINT parameter_options_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_key UNIQUE (token);


--
-- Name: piece_lifecycle_events piece_lifecycle_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_lifecycle_events
    ADD CONSTRAINT piece_lifecycle_events_pkey PRIMARY KEY (id);


--
-- Name: product_aliases product_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_aliases
    ADD CONSTRAINT product_aliases_pkey PRIMARY KEY (id);


--
-- Name: product_aliases product_aliases_product_variant_id_alias_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_aliases
    ADD CONSTRAINT product_aliases_product_variant_id_alias_key UNIQUE (product_variant_id, alias);


--
-- Name: product_types product_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_types
    ADD CONSTRAINT product_types_pkey PRIMARY KEY (id);


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- Name: return_bundles return_bundles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_bundles
    ADD CONSTRAINT return_bundles_pkey PRIMARY KEY (id);


--
-- Name: return_items return_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_items
    ADD CONSTRAINT return_items_pkey PRIMARY KEY (id);


--
-- Name: return_rolls return_rolls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_rolls
    ADD CONSTRAINT return_rolls_pkey PRIMARY KEY (id);


--
-- Name: returns returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_pkey PRIMARY KEY (id);


--
-- Name: returns returns_return_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_return_number_key UNIQUE (return_number);


--
-- Name: rollback_history rollback_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rollback_history
    ADD CONSTRAINT rollback_history_pkey PRIMARY KEY (id);


--
-- Name: scrap_items scrap_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scrap_items
    ADD CONSTRAINT scrap_items_pkey PRIMARY KEY (id);


--
-- Name: scrap_pieces scrap_pieces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scrap_pieces
    ADD CONSTRAINT scrap_pieces_pkey PRIMARY KEY (id);


--
-- Name: scraps scraps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraps
    ADD CONSTRAINT scraps_pkey PRIMARY KEY (id);


--
-- Name: scraps scraps_scrap_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraps
    ADD CONSTRAINT scraps_scrap_number_key UNIQUE (scrap_number);


--
-- Name: smtp_config smtp_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smtp_config
    ADD CONSTRAINT smtp_config_pkey PRIMARY KEY (id);


--
-- Name: sprinkler_spare_pieces sprinkler_spare_pieces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprinkler_spare_pieces
    ADD CONSTRAINT sprinkler_spare_pieces_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_setting_key_key UNIQUE (setting_key);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: transports transports_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transports
    ADD CONSTRAINT transports_name_key UNIQUE (name);


--
-- Name: transports transports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transports
    ADD CONSTRAINT transports_pkey PRIMARY KEY (id);


--
-- Name: units units_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_name_key UNIQUE (name);


--
-- Name: units units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);


--
-- Name: vehicles vehicles_vehicle_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_vehicle_number_key UNIQUE (vehicle_number);


--
-- Name: idx_archived_backups_bucket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_archived_backups_bucket ON public.archived_backups USING btree (archive_bucket_id);


--
-- Name: idx_archived_backups_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_archived_backups_type ON public.archived_backups USING btree (backup_type);


--
-- Name: idx_audit_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_audit_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user ON public.audit_logs USING btree (user_id);


--
-- Name: idx_audit_logs_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user_time ON public.audit_logs USING btree (user_id, created_at DESC);


--
-- Name: idx_backup_policies_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_backup_policies_active ON public.backup_retention_policies USING btree (is_active, backup_type);


--
-- Name: idx_batches_batch_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_batch_code ON public.batches USING btree (batch_code) WHERE (deleted_at IS NULL);


--
-- Name: idx_bill_to_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bill_to_name ON public.bill_to USING btree (name) WHERE (deleted_at IS NULL);


--
-- Name: idx_cloud_backup_config_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cloud_backup_config_active ON public.cloud_backup_config USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_cloud_backup_config_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cloud_backup_config_provider ON public.cloud_backup_config USING btree (provider);


--
-- Name: idx_cloud_credentials_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cloud_credentials_active ON public.cloud_credentials USING btree (is_active);


--
-- Name: idx_cloud_credentials_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cloud_credentials_provider ON public.cloud_credentials USING btree (provider);


--
-- Name: idx_deletion_log_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deletion_log_date ON public.backup_deletion_log USING btree (deleted_at);


--
-- Name: idx_deletion_log_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deletion_log_type ON public.backup_deletion_log USING btree (backup_type);


--
-- Name: idx_dispatch_items_dispatch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dispatch_items_dispatch ON public.dispatch_items USING btree (dispatch_id);


--
-- Name: idx_dispatch_items_stock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dispatch_items_stock ON public.dispatch_items USING btree (stock_id);


--
-- Name: idx_dispatch_items_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dispatch_items_type ON public.dispatch_items USING btree (item_type);


--
-- Name: idx_dispatch_items_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dispatch_items_variant ON public.dispatch_items USING btree (product_variant_id);


--
-- Name: idx_dispatches_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dispatches_customer ON public.dispatches USING btree (customer_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_dispatches_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dispatches_date ON public.dispatches USING btree (dispatch_date DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_dispatches_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dispatches_number ON public.dispatches USING btree (dispatch_number) WHERE (deleted_at IS NULL);


--
-- Name: idx_dispatches_reverted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dispatches_reverted_at ON public.dispatches USING btree (reverted_at) WHERE (reverted_at IS NOT NULL);


--
-- Name: idx_dispatches_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dispatches_status ON public.dispatches USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: idx_hdpe_cut_pieces_created_by_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hdpe_cut_pieces_created_by_transaction ON public.hdpe_cut_pieces USING btree (created_by_transaction_id) WHERE ((created_by_transaction_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_hdpe_cut_pieces_last_modified_by_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hdpe_cut_pieces_last_modified_by_transaction ON public.hdpe_cut_pieces USING btree (last_modified_by_transaction_id) WHERE (last_modified_by_transaction_id IS NOT NULL);


--
-- Name: idx_hdpe_cut_pieces_scrapped; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hdpe_cut_pieces_scrapped ON public.hdpe_cut_pieces USING btree (status) WHERE (status = 'SCRAPPED'::text);


--
-- Name: idx_hdpe_cut_pieces_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hdpe_cut_pieces_status ON public.hdpe_cut_pieces USING btree (status);


--
-- Name: idx_hdpe_cut_pieces_status_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hdpe_cut_pieces_status_active ON public.hdpe_cut_pieces USING btree (status, stock_id) WHERE ((status = 'IN_STOCK'::text) AND (deleted_at IS NULL));


--
-- Name: idx_hdpe_cut_pieces_stock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hdpe_cut_pieces_stock ON public.hdpe_cut_pieces USING btree (stock_id);


--
-- Name: idx_hdpe_cut_pieces_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hdpe_cut_pieces_transaction_id ON public.hdpe_cut_pieces USING btree (transaction_id);


--
-- Name: idx_hdpe_reserved_by_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hdpe_reserved_by_transaction ON public.hdpe_cut_pieces USING btree (reserved_by_transaction_id) WHERE (reserved_by_transaction_id IS NOT NULL);


--
-- Name: idx_inventory_stock_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_stock_batch ON public.inventory_stock USING btree (batch_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_inventory_stock_deleted_by_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_stock_deleted_by_transaction ON public.inventory_stock USING btree (deleted_by_transaction_id) WHERE (deleted_by_transaction_id IS NOT NULL);


--
-- Name: idx_inventory_stock_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_stock_status ON public.inventory_stock USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: idx_inventory_stock_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_stock_type ON public.inventory_stock USING btree (stock_type) WHERE (deleted_at IS NULL);


--
-- Name: idx_inventory_stock_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_stock_variant ON public.inventory_stock USING btree (product_variant_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_inventory_transactions_dispatch_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_transactions_dispatch_item ON public.inventory_transactions USING btree (dispatch_item_id) WHERE (dispatch_item_id IS NOT NULL);


--
-- Name: idx_inventory_transactions_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_transactions_from ON public.inventory_transactions USING btree (from_stock_id) WHERE (from_stock_id IS NOT NULL);


--
-- Name: idx_inventory_transactions_reverted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_transactions_reverted ON public.inventory_transactions USING btree (reverted_at) WHERE (reverted_at IS NOT NULL);


--
-- Name: idx_inventory_transactions_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_transactions_to ON public.inventory_transactions USING btree (to_stock_id) WHERE (to_stock_id IS NOT NULL);


--
-- Name: idx_inventory_transactions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_transactions_type ON public.inventory_transactions USING btree (transaction_type);


--
-- Name: idx_mv_piece_current_state_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mv_piece_current_state_batch ON public.mv_piece_current_state USING btree (batch_id);


--
-- Name: idx_mv_piece_current_state_piece; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mv_piece_current_state_piece ON public.mv_piece_current_state USING btree (piece_id);


--
-- Name: idx_mv_piece_current_state_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mv_piece_current_state_status ON public.mv_piece_current_state USING btree (status) WHERE (status = 'IN_STOCK'::text);


--
-- Name: idx_mv_piece_current_state_stock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mv_piece_current_state_stock ON public.mv_piece_current_state USING btree (stock_id);


--
-- Name: idx_mv_product_variant_details_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_product_variant_details_variant_id ON public.mv_product_variant_details USING btree (variant_id);


--
-- Name: idx_piece_lifecycle_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_piece_lifecycle_events_created_at ON public.piece_lifecycle_events USING btree (created_at DESC);


--
-- Name: idx_piece_lifecycle_events_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_piece_lifecycle_events_event_type ON public.piece_lifecycle_events USING btree (event_type);


--
-- Name: idx_piece_lifecycle_events_piece; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_piece_lifecycle_events_piece ON public.piece_lifecycle_events USING btree (piece_id, piece_type);


--
-- Name: idx_piece_lifecycle_events_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_piece_lifecycle_events_transaction ON public.piece_lifecycle_events USING btree (transaction_id);


--
-- Name: idx_product_aliases_alias; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_aliases_alias ON public.product_aliases USING btree (alias);


--
-- Name: idx_product_aliases_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_aliases_variant ON public.product_aliases USING btree (product_variant_id);


--
-- Name: idx_reset_tokens_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reset_tokens_expires ON public.password_reset_tokens USING btree (expires_at);


--
-- Name: idx_reset_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reset_tokens_token ON public.password_reset_tokens USING btree (token);


--
-- Name: idx_reset_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reset_tokens_user ON public.password_reset_tokens USING btree (user_id);


--
-- Name: idx_return_bundles_return_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_return_bundles_return_item ON public.return_bundles USING btree (return_item_id);


--
-- Name: idx_return_bundles_stock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_return_bundles_stock ON public.return_bundles USING btree (stock_id) WHERE (stock_id IS NOT NULL);


--
-- Name: idx_return_items_return; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_return_items_return ON public.return_items USING btree (return_id);


--
-- Name: idx_return_items_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_return_items_type ON public.return_items USING btree (item_type);


--
-- Name: idx_return_items_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_return_items_variant ON public.return_items USING btree (product_variant_id);


--
-- Name: idx_return_rolls_return_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_return_rolls_return_item ON public.return_rolls USING btree (return_item_id);


--
-- Name: idx_return_rolls_stock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_return_rolls_stock ON public.return_rolls USING btree (stock_id) WHERE (stock_id IS NOT NULL);


--
-- Name: idx_returns_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_returns_customer ON public.returns USING btree (customer_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_returns_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_returns_date ON public.returns USING btree (return_date DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_returns_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_returns_number ON public.returns USING btree (return_number) WHERE (deleted_at IS NULL);


--
-- Name: idx_returns_reverted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_returns_reverted_at ON public.returns USING btree (reverted_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_returns_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_returns_status ON public.returns USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: idx_rollback_history_rolled_back_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rollback_history_rolled_back_at ON public.rollback_history USING btree (rolled_back_at DESC);


--
-- Name: idx_rollback_history_snapshot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rollback_history_snapshot ON public.rollback_history USING btree (snapshot_id);


--
-- Name: idx_scrap_items_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrap_items_batch ON public.scrap_items USING btree (batch_id);


--
-- Name: idx_scrap_items_scrap; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrap_items_scrap ON public.scrap_items USING btree (scrap_id);


--
-- Name: idx_scrap_items_stock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrap_items_stock ON public.scrap_items USING btree (stock_id);


--
-- Name: idx_scrap_items_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrap_items_type ON public.scrap_items USING btree (stock_type);


--
-- Name: idx_scrap_items_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrap_items_variant ON public.scrap_items USING btree (product_variant_id);


--
-- Name: idx_scrap_pieces_original; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrap_pieces_original ON public.scrap_pieces USING btree (original_piece_id) WHERE (original_piece_id IS NOT NULL);


--
-- Name: idx_scrap_pieces_scrap_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scrap_pieces_scrap_item ON public.scrap_pieces USING btree (scrap_item_id);


--
-- Name: idx_scraps_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scraps_date ON public.scraps USING btree (scrap_date DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_scraps_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scraps_number ON public.scraps USING btree (scrap_number) WHERE (deleted_at IS NULL);


--
-- Name: idx_scraps_reason; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scraps_reason ON public.scraps USING btree (reason) WHERE (deleted_at IS NULL);


--
-- Name: idx_scraps_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scraps_status ON public.scraps USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: idx_smtp_config_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_smtp_config_active ON public.smtp_config USING btree (is_active);


--
-- Name: idx_snapshots_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_snapshots_created_at ON public.database_snapshots USING btree (created_at DESC);


--
-- Name: idx_snapshots_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_snapshots_created_by ON public.database_snapshots USING btree (created_by);


--
-- Name: idx_spare_pieces_scrapped; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_spare_pieces_scrapped ON public.sprinkler_spare_pieces USING btree (status) WHERE (status = 'SCRAPPED'::text);


--
-- Name: idx_sprinkler_spare_pieces_created_by_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sprinkler_spare_pieces_created_by_transaction ON public.sprinkler_spare_pieces USING btree (created_by_transaction_id) WHERE ((created_by_transaction_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_sprinkler_spare_pieces_last_modified_by_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sprinkler_spare_pieces_last_modified_by_transaction ON public.sprinkler_spare_pieces USING btree (last_modified_by_transaction_id) WHERE (last_modified_by_transaction_id IS NOT NULL);


--
-- Name: idx_sprinkler_spare_pieces_reserved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sprinkler_spare_pieces_reserved ON public.sprinkler_spare_pieces USING btree (reserved_by_transaction_id) WHERE (reserved_by_transaction_id IS NOT NULL);


--
-- Name: idx_sprinkler_spare_pieces_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sprinkler_spare_pieces_status ON public.sprinkler_spare_pieces USING btree (status);


--
-- Name: idx_sprinkler_spare_pieces_status_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sprinkler_spare_pieces_status_active ON public.sprinkler_spare_pieces USING btree (status, stock_id) WHERE ((status = 'IN_STOCK'::text) AND (deleted_at IS NULL));


--
-- Name: idx_sprinkler_spare_pieces_stock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sprinkler_spare_pieces_stock ON public.sprinkler_spare_pieces USING btree (stock_id);


--
-- Name: idx_sprinkler_spare_pieces_stock_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sprinkler_spare_pieces_stock_status ON public.sprinkler_spare_pieces USING btree (stock_id, status, deleted_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_sprinkler_spare_pieces_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sprinkler_spare_pieces_transaction_id ON public.sprinkler_spare_pieces USING btree (transaction_id);


--
-- Name: idx_transactions_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_batch ON public.transactions USING btree (batch_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_transactions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_date ON public.transactions USING btree (transaction_date) WHERE (deleted_at IS NULL);


--
-- Name: idx_transactions_dispatch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_dispatch ON public.transactions USING btree (dispatch_id) WHERE ((deleted_at IS NULL) AND (dispatch_id IS NOT NULL));


--
-- Name: idx_transactions_product_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_product_variant ON public.transactions USING btree (product_variant_id) WHERE (deleted_at IS NULL);


--
-- Name: INDEX idx_transactions_product_variant; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_transactions_product_variant IS 'Fast filtering of transactions by product variant for history queries';


--
-- Name: idx_transports_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transports_name ON public.transports USING btree (name) WHERE (deleted_at IS NULL);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email) WHERE (deleted_at IS NULL);


--
-- Name: idx_users_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_is_active ON public.users USING btree (is_active) WHERE (deleted_at IS NULL);


--
-- Name: idx_users_locked_until; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_locked_until ON public.users USING btree (locked_until) WHERE (locked_until IS NOT NULL);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_username ON public.users USING btree (username) WHERE (deleted_at IS NULL);


--
-- Name: idx_vehicles_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_number ON public.vehicles USING btree (vehicle_number) WHERE (deleted_at IS NULL);


--
-- Name: hdpe_cut_pieces auto_update_stock_from_hdpe_pieces; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_update_stock_from_hdpe_pieces AFTER INSERT OR DELETE OR UPDATE ON public.hdpe_cut_pieces FOR EACH ROW EXECUTE FUNCTION public.auto_update_stock_quantity();


--
-- Name: sprinkler_spare_pieces auto_update_stock_from_sprinkler_pieces; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_update_stock_from_sprinkler_pieces AFTER INSERT OR DELETE OR UPDATE ON public.sprinkler_spare_pieces FOR EACH ROW EXECUTE FUNCTION public.auto_update_stock_quantity();


--
-- Name: hdpe_cut_pieces log_hdpe_piece_lifecycle; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_hdpe_piece_lifecycle AFTER INSERT OR DELETE OR UPDATE ON public.hdpe_cut_pieces FOR EACH ROW EXECUTE FUNCTION public.log_piece_lifecycle_event();


--
-- Name: sprinkler_spare_pieces log_sprinkler_piece_lifecycle; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER log_sprinkler_piece_lifecycle AFTER INSERT OR DELETE OR UPDATE ON public.sprinkler_spare_pieces FOR EACH ROW EXECUTE FUNCTION public.log_piece_lifecycle_event();


--
-- Name: transactions populate_transaction_metadata_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER populate_transaction_metadata_trigger BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.populate_transaction_metadata();


--
-- Name: hdpe_cut_pieces prevent_hdpe_transaction_id_mutation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevent_hdpe_transaction_id_mutation BEFORE UPDATE ON public.hdpe_cut_pieces FOR EACH ROW EXECUTE FUNCTION public.prevent_transaction_id_mutation();


--
-- Name: sprinkler_spare_pieces prevent_sprinkler_transaction_id_mutation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prevent_sprinkler_transaction_id_mutation BEFORE UPDATE ON public.sprinkler_spare_pieces FOR EACH ROW EXECUTE FUNCTION public.prevent_transaction_id_mutation();


--
-- Name: backup_retention_policies update_backup_retention_policies_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_backup_retention_policies_timestamp BEFORE UPDATE ON public.backup_retention_policies FOR EACH ROW EXECUTE FUNCTION public.update_backup_config_timestamp();


--
-- Name: batches update_batches_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_batches_updated_at BEFORE UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bill_to update_bill_to_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bill_to_updated_at BEFORE UPDATE ON public.bill_to FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: brands update_brands_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_brands_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cloud_credentials update_cloud_credentials_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_cloud_credentials_timestamp BEFORE UPDATE ON public.cloud_credentials FOR EACH ROW EXECUTE FUNCTION public.update_backup_config_timestamp();


--
-- Name: customers update_customers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: dispatches update_dispatches_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_dispatches_updated_at BEFORE UPDATE ON public.dispatches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hdpe_cut_pieces update_hdpe_cut_pieces_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_hdpe_cut_pieces_updated_at BEFORE UPDATE ON public.hdpe_cut_pieces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: inventory_stock update_inventory_stock_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_inventory_stock_updated_at BEFORE UPDATE ON public.inventory_stock FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: locations update_locations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_types update_product_types_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_product_types_updated_at BEFORE UPDATE ON public.product_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_variants update_product_variants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_product_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: returns update_returns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_returns_updated_at BEFORE UPDATE ON public.returns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: scraps update_scraps_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_scraps_updated_at BEFORE UPDATE ON public.scraps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sprinkler_spare_pieces update_sprinkler_spare_pieces_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_sprinkler_spare_pieces_updated_at BEFORE UPDATE ON public.sprinkler_spare_pieces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: transports update_transports_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_transports_updated_at BEFORE UPDATE ON public.transports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: units update_units_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_roles update_user_roles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: vehicles update_vehicles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: inventory_stock validate_spare_stock_quantity_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_spare_stock_quantity_trigger BEFORE UPDATE ON public.inventory_stock FOR EACH ROW WHEN ((new.stock_type = 'SPARE'::text)) EXECUTE FUNCTION public.validate_spare_stock_quantity();


--
-- Name: archive_buckets archive_buckets_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archive_buckets
    ADD CONSTRAINT archive_buckets_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: archive_buckets archive_buckets_credentials_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archive_buckets
    ADD CONSTRAINT archive_buckets_credentials_id_fkey FOREIGN KEY (credentials_id) REFERENCES public.cloud_credentials(id) ON DELETE SET NULL;


--
-- Name: archived_backups archived_backups_archive_bucket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archived_backups
    ADD CONSTRAINT archived_backups_archive_bucket_id_fkey FOREIGN KEY (archive_bucket_id) REFERENCES public.archive_buckets(id) ON DELETE CASCADE;


--
-- Name: archived_backups archived_backups_archived_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archived_backups
    ADD CONSTRAINT archived_backups_archived_by_user_id_fkey FOREIGN KEY (archived_by_user_id) REFERENCES public.users(id);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: backup_deletion_log backup_deletion_log_deleted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_deletion_log
    ADD CONSTRAINT backup_deletion_log_deleted_by_user_id_fkey FOREIGN KEY (deleted_by_user_id) REFERENCES public.users(id);


--
-- Name: backup_deletion_log backup_deletion_log_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_deletion_log
    ADD CONSTRAINT backup_deletion_log_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.backup_retention_policies(id) ON DELETE SET NULL;


--
-- Name: backup_retention_policies backup_retention_policies_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_retention_policies
    ADD CONSTRAINT backup_retention_policies_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: batches batches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: batches batches_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id);


--
-- Name: brands brands_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: cloud_backup_config cloud_backup_config_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cloud_backup_config
    ADD CONSTRAINT cloud_backup_config_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: cloud_credentials cloud_credentials_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cloud_credentials
    ADD CONSTRAINT cloud_credentials_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: customers customers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: database_snapshots database_snapshots_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.database_snapshots
    ADD CONSTRAINT database_snapshots_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: dispatch_items dispatch_items_cut_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispatch_items
    ADD CONSTRAINT dispatch_items_cut_piece_id_fkey FOREIGN KEY (cut_piece_id) REFERENCES public.hdpe_cut_pieces(id);


--
-- Name: dispatch_items dispatch_items_dispatch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispatch_items
    ADD CONSTRAINT dispatch_items_dispatch_id_fkey FOREIGN KEY (dispatch_id) REFERENCES public.dispatches(id) ON DELETE CASCADE;


--
-- Name: dispatch_items dispatch_items_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispatch_items
    ADD CONSTRAINT dispatch_items_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id);


--
-- Name: dispatch_items dispatch_items_stock_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispatch_items
    ADD CONSTRAINT dispatch_items_stock_id_fkey FOREIGN KEY (stock_id) REFERENCES public.inventory_stock(id);


--
-- Name: dispatches dispatches_bill_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispatches
    ADD CONSTRAINT dispatches_bill_to_id_fkey FOREIGN KEY (bill_to_id) REFERENCES public.bill_to(id);


--
-- Name: dispatches dispatches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispatches
    ADD CONSTRAINT dispatches_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: dispatches dispatches_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispatches
    ADD CONSTRAINT dispatches_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: dispatches dispatches_reverted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispatches
    ADD CONSTRAINT dispatches_reverted_by_fkey FOREIGN KEY (reverted_by) REFERENCES public.users(id);


--
-- Name: dispatches dispatches_transport_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispatches
    ADD CONSTRAINT dispatches_transport_id_fkey FOREIGN KEY (transport_id) REFERENCES public.transports(id);


--
-- Name: dispatches dispatches_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispatches
    ADD CONSTRAINT dispatches_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id);


--
-- Name: hdpe_cut_pieces fk_hdpe_cut_pieces_created_by_transaction; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hdpe_cut_pieces
    ADD CONSTRAINT fk_hdpe_cut_pieces_created_by_transaction FOREIGN KEY (created_by_transaction_id) REFERENCES public.inventory_transactions(id) ON DELETE SET NULL;


--
-- Name: hdpe_cut_pieces fk_hdpe_cut_pieces_last_modified_by_transaction; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hdpe_cut_pieces
    ADD CONSTRAINT fk_hdpe_cut_pieces_last_modified_by_transaction FOREIGN KEY (last_modified_by_transaction_id) REFERENCES public.inventory_transactions(id) ON DELETE SET NULL;


--
-- Name: hdpe_cut_pieces fk_hdpe_cut_pieces_transaction; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hdpe_cut_pieces
    ADD CONSTRAINT fk_hdpe_cut_pieces_transaction FOREIGN KEY (transaction_id) REFERENCES public.inventory_transactions(id) ON DELETE SET NULL;


--
-- Name: inventory_stock fk_inventory_stock_deleted_by_transaction; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stock
    ADD CONSTRAINT fk_inventory_stock_deleted_by_transaction FOREIGN KEY (deleted_by_transaction_id) REFERENCES public.inventory_transactions(id) ON DELETE SET NULL;


--
-- Name: sprinkler_spare_pieces fk_sprinkler_spare_pieces_created_by_transaction; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprinkler_spare_pieces
    ADD CONSTRAINT fk_sprinkler_spare_pieces_created_by_transaction FOREIGN KEY (created_by_transaction_id) REFERENCES public.inventory_transactions(id) ON DELETE SET NULL;


--
-- Name: sprinkler_spare_pieces fk_sprinkler_spare_pieces_last_modified_by_transaction; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprinkler_spare_pieces
    ADD CONSTRAINT fk_sprinkler_spare_pieces_last_modified_by_transaction FOREIGN KEY (last_modified_by_transaction_id) REFERENCES public.inventory_transactions(id) ON DELETE SET NULL;


--
-- Name: sprinkler_spare_pieces fk_sprinkler_spare_pieces_transaction; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprinkler_spare_pieces
    ADD CONSTRAINT fk_sprinkler_spare_pieces_transaction FOREIGN KEY (transaction_id) REFERENCES public.inventory_transactions(id) ON DELETE SET NULL;


--
-- Name: hdpe_cut_pieces hdpe_cut_pieces_created_by_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hdpe_cut_pieces
    ADD CONSTRAINT hdpe_cut_pieces_created_by_transaction_id_fkey FOREIGN KEY (created_by_transaction_id) REFERENCES public.inventory_transactions(id) ON DELETE CASCADE;


--
-- Name: hdpe_cut_pieces hdpe_cut_pieces_deleted_by_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hdpe_cut_pieces
    ADD CONSTRAINT hdpe_cut_pieces_deleted_by_transaction_id_fkey FOREIGN KEY (deleted_by_transaction_id) REFERENCES public.inventory_transactions(id) ON DELETE SET NULL;


--
-- Name: hdpe_cut_pieces hdpe_cut_pieces_original_stock_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hdpe_cut_pieces
    ADD CONSTRAINT hdpe_cut_pieces_original_stock_id_fkey FOREIGN KEY (original_stock_id) REFERENCES public.inventory_stock(id) ON DELETE SET NULL;


--
-- Name: hdpe_cut_pieces hdpe_cut_pieces_reserved_by_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hdpe_cut_pieces
    ADD CONSTRAINT hdpe_cut_pieces_reserved_by_transaction_id_fkey FOREIGN KEY (reserved_by_transaction_id) REFERENCES public.inventory_transactions(id);


--
-- Name: hdpe_cut_pieces hdpe_cut_pieces_stock_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hdpe_cut_pieces
    ADD CONSTRAINT hdpe_cut_pieces_stock_id_fkey FOREIGN KEY (stock_id) REFERENCES public.inventory_stock(id) ON DELETE CASCADE;


--
-- Name: inventory_stock inventory_stock_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stock
    ADD CONSTRAINT inventory_stock_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE;


--
-- Name: inventory_stock inventory_stock_deleted_by_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stock
    ADD CONSTRAINT inventory_stock_deleted_by_transaction_id_fkey FOREIGN KEY (deleted_by_transaction_id) REFERENCES public.inventory_transactions(id) ON DELETE SET NULL;


--
-- Name: inventory_stock inventory_stock_parent_stock_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stock
    ADD CONSTRAINT inventory_stock_parent_stock_id_fkey FOREIGN KEY (parent_stock_id) REFERENCES public.inventory_stock(id) ON DELETE SET NULL;


--
-- Name: inventory_stock inventory_stock_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_stock
    ADD CONSTRAINT inventory_stock_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id);


--
-- Name: inventory_transactions inventory_transactions_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE SET NULL;


--
-- Name: inventory_transactions inventory_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: inventory_transactions inventory_transactions_dispatch_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_dispatch_item_id_fkey FOREIGN KEY (dispatch_item_id) REFERENCES public.dispatch_items(id);


--
-- Name: inventory_transactions inventory_transactions_from_stock_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_from_stock_id_fkey FOREIGN KEY (from_stock_id) REFERENCES public.inventory_stock(id) ON DELETE SET NULL;


--
-- Name: inventory_transactions inventory_transactions_reverted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_reverted_by_fkey FOREIGN KEY (reverted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: inventory_transactions inventory_transactions_to_stock_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_to_stock_id_fkey FOREIGN KEY (to_stock_id) REFERENCES public.inventory_stock(id) ON DELETE SET NULL;


--
-- Name: locations locations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: parameter_options parameter_options_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parameter_options
    ADD CONSTRAINT parameter_options_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: piece_lifecycle_events piece_lifecycle_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_lifecycle_events
    ADD CONSTRAINT piece_lifecycle_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: piece_lifecycle_events piece_lifecycle_events_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.piece_lifecycle_events
    ADD CONSTRAINT piece_lifecycle_events_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.inventory_transactions(id) ON DELETE CASCADE;


--
-- Name: product_aliases product_aliases_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_aliases
    ADD CONSTRAINT product_aliases_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: product_types product_types_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_types
    ADD CONSTRAINT product_types_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: product_types product_types_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_types
    ADD CONSTRAINT product_types_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id);


--
-- Name: product_variants product_variants_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id);


--
-- Name: product_variants product_variants_product_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_product_type_id_fkey FOREIGN KEY (product_type_id) REFERENCES public.product_types(id);


--
-- Name: return_bundles return_bundles_return_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_bundles
    ADD CONSTRAINT return_bundles_return_item_id_fkey FOREIGN KEY (return_item_id) REFERENCES public.return_items(id) ON DELETE CASCADE;


--
-- Name: return_bundles return_bundles_stock_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_bundles
    ADD CONSTRAINT return_bundles_stock_id_fkey FOREIGN KEY (stock_id) REFERENCES public.inventory_stock(id);


--
-- Name: return_items return_items_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_items
    ADD CONSTRAINT return_items_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id);


--
-- Name: return_items return_items_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_items
    ADD CONSTRAINT return_items_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.returns(id) ON DELETE CASCADE;


--
-- Name: return_rolls return_rolls_return_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_rolls
    ADD CONSTRAINT return_rolls_return_item_id_fkey FOREIGN KEY (return_item_id) REFERENCES public.return_items(id) ON DELETE CASCADE;


--
-- Name: return_rolls return_rolls_stock_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_rolls
    ADD CONSTRAINT return_rolls_stock_id_fkey FOREIGN KEY (stock_id) REFERENCES public.inventory_stock(id);


--
-- Name: returns returns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: returns returns_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: returns returns_reverted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.returns
    ADD CONSTRAINT returns_reverted_by_fkey FOREIGN KEY (reverted_by) REFERENCES public.users(id);


--
-- Name: rollback_history rollback_history_rolled_back_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rollback_history
    ADD CONSTRAINT rollback_history_rolled_back_by_fkey FOREIGN KEY (rolled_back_by) REFERENCES public.users(id);


--
-- Name: rollback_history rollback_history_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rollback_history
    ADD CONSTRAINT rollback_history_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.database_snapshots(id);


--
-- Name: scrap_items scrap_items_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scrap_items
    ADD CONSTRAINT scrap_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id);


--
-- Name: scrap_items scrap_items_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scrap_items
    ADD CONSTRAINT scrap_items_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id);


--
-- Name: scrap_items scrap_items_scrap_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scrap_items
    ADD CONSTRAINT scrap_items_scrap_id_fkey FOREIGN KEY (scrap_id) REFERENCES public.scraps(id) ON DELETE CASCADE;


--
-- Name: scrap_items scrap_items_stock_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scrap_items
    ADD CONSTRAINT scrap_items_stock_id_fkey FOREIGN KEY (stock_id) REFERENCES public.inventory_stock(id);


--
-- Name: scrap_pieces scrap_pieces_scrap_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scrap_pieces
    ADD CONSTRAINT scrap_pieces_scrap_item_id_fkey FOREIGN KEY (scrap_item_id) REFERENCES public.scrap_items(id) ON DELETE CASCADE;


--
-- Name: scraps scraps_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scraps
    ADD CONSTRAINT scraps_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: smtp_config smtp_config_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smtp_config
    ADD CONSTRAINT smtp_config_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: smtp_config smtp_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smtp_config
    ADD CONSTRAINT smtp_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: sprinkler_spare_pieces sprinkler_spare_pieces_created_by_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprinkler_spare_pieces
    ADD CONSTRAINT sprinkler_spare_pieces_created_by_transaction_id_fkey FOREIGN KEY (created_by_transaction_id) REFERENCES public.inventory_transactions(id) ON DELETE CASCADE;


--
-- Name: sprinkler_spare_pieces sprinkler_spare_pieces_deleted_by_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprinkler_spare_pieces
    ADD CONSTRAINT sprinkler_spare_pieces_deleted_by_transaction_id_fkey FOREIGN KEY (deleted_by_transaction_id) REFERENCES public.inventory_transactions(id) ON DELETE SET NULL;


--
-- Name: sprinkler_spare_pieces sprinkler_spare_pieces_original_stock_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprinkler_spare_pieces
    ADD CONSTRAINT sprinkler_spare_pieces_original_stock_id_fkey FOREIGN KEY (original_stock_id) REFERENCES public.inventory_stock(id) ON DELETE SET NULL;


--
-- Name: sprinkler_spare_pieces sprinkler_spare_pieces_reserved_by_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprinkler_spare_pieces
    ADD CONSTRAINT sprinkler_spare_pieces_reserved_by_transaction_id_fkey FOREIGN KEY (reserved_by_transaction_id) REFERENCES public.inventory_transactions(id) ON DELETE SET NULL;


--
-- Name: sprinkler_spare_pieces sprinkler_spare_pieces_stock_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sprinkler_spare_pieces
    ADD CONSTRAINT sprinkler_spare_pieces_stock_id_fkey FOREIGN KEY (stock_id) REFERENCES public.inventory_stock(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id);


--
-- Name: transactions transactions_bill_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_bill_to_id_fkey FOREIGN KEY (bill_to_id) REFERENCES public.bill_to(id);


--
-- Name: transactions transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: transactions transactions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: transactions transactions_from_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_from_location_id_fkey FOREIGN KEY (from_location_id) REFERENCES public.locations(id);


--
-- Name: transactions transactions_product_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id);


--
-- Name: transactions transactions_to_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_to_location_id_fkey FOREIGN KEY (to_location_id) REFERENCES public.locations(id);


--
-- Name: transactions transactions_transport_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_transport_id_fkey FOREIGN KEY (transport_id) REFERENCES public.transports(id);


--
-- Name: transactions transactions_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id);


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

