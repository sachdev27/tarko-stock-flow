-- Aggregate Inventory System
-- Creates quantity-based inventory tracking instead of individual item tracking

BEGIN;

-- Main inventory stock table (aggregate quantities)
CREATE TABLE inventory_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES product_variants(id),

  status TEXT NOT NULL DEFAULT 'IN_STOCK' CHECK (status IN ('IN_STOCK', 'DISPATCHED', 'SOLD_OUT', 'DAMAGED', 'RETURNED')),
  stock_type TEXT NOT NULL CHECK (stock_type IN ('FULL_ROLL', 'CUT_ROLL', 'BUNDLE', 'SPARE')),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),

  -- HDPE specific
  length_per_unit NUMERIC CHECK (length_per_unit > 0),

  -- Sprinkler specific
  pieces_per_bundle INTEGER CHECK (pieces_per_bundle > 0),
  piece_length_meters NUMERIC CHECK (piece_length_meters > 0),

  parent_stock_id UUID REFERENCES inventory_stock(id) ON DELETE SET NULL,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_inventory_stock_batch ON inventory_stock(batch_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_inventory_stock_variant ON inventory_stock(product_variant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_inventory_stock_status ON inventory_stock(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_inventory_stock_type ON inventory_stock(stock_type) WHERE deleted_at IS NULL;

-- Individual cut pieces from HDPE rolls
CREATE TABLE hdpe_cut_pieces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES inventory_stock(id) ON DELETE CASCADE,
  length_meters NUMERIC NOT NULL CHECK (length_meters > 0),
  status TEXT NOT NULL DEFAULT 'IN_STOCK' CHECK (status IN ('IN_STOCK', 'DISPATCHED', 'SOLD_OUT')),
  dispatch_id UUID,
  weight_grams NUMERIC CHECK (weight_grams >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hdpe_cut_pieces_stock ON hdpe_cut_pieces(stock_id);
CREATE INDEX idx_hdpe_cut_pieces_status ON hdpe_cut_pieces(status);

-- Individual spare pieces from sprinkler bundles
CREATE TABLE sprinkler_spare_pieces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id UUID NOT NULL REFERENCES inventory_stock(id) ON DELETE CASCADE,
  piece_count INTEGER NOT NULL DEFAULT 1 CHECK (piece_count > 0),
  status TEXT NOT NULL DEFAULT 'IN_STOCK' CHECK (status IN ('IN_STOCK', 'DISPATCHED', 'SOLD_OUT')),
  dispatch_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sprinkler_spare_pieces_stock ON sprinkler_spare_pieces(stock_id);
CREATE INDEX idx_sprinkler_spare_pieces_status ON sprinkler_spare_pieces(status);

-- Transaction history
CREATE TABLE inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('PRODUCTION', 'CUT_ROLL', 'SPLIT_BUNDLE', 'COMBINE_SPARES', 'DISPATCH', 'ADJUSTMENT', 'RETURN', 'DAMAGE')),

  from_stock_id UUID REFERENCES inventory_stock(id) ON DELETE SET NULL,
  from_quantity INTEGER,
  from_length NUMERIC,
  from_pieces INTEGER,

  to_stock_id UUID REFERENCES inventory_stock(id) ON DELETE SET NULL,
  to_quantity INTEGER,
  to_length NUMERIC,
  to_pieces INTEGER,

  dispatch_id UUID,
  batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,

  cut_piece_details JSONB,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_transactions_type ON inventory_transactions(transaction_type);
CREATE INDEX idx_inventory_transactions_from ON inventory_transactions(from_stock_id) WHERE from_stock_id IS NOT NULL;
CREATE INDEX idx_inventory_transactions_to ON inventory_transactions(to_stock_id) WHERE to_stock_id IS NOT NULL;

-- Triggers
CREATE TRIGGER update_inventory_stock_updated_at
  BEFORE UPDATE ON inventory_stock
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hdpe_cut_pieces_updated_at
  BEFORE UPDATE ON hdpe_cut_pieces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sprinkler_spare_pieces_updated_at
  BEFORE UPDATE ON sprinkler_spare_pieces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Helper views
CREATE VIEW hdpe_stock_details AS
SELECT
  s.id as stock_id,
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
  pt.name as product_type_name,
  br.name as brand_name,
  pv.parameters,
  CASE
    WHEN s.stock_type = 'FULL_ROLL' THEN s.quantity * s.length_per_unit
    WHEN s.stock_type = 'CUT_ROLL' THEN (SELECT COALESCE(SUM(length_meters), 0) FROM hdpe_cut_pieces WHERE stock_id = s.id AND status = 'IN_STOCK')
    ELSE 0
  END as total_meters_available,
  CASE
    WHEN s.stock_type = 'CUT_ROLL' THEN (SELECT COUNT(*) FROM hdpe_cut_pieces WHERE stock_id = s.id AND status = 'IN_STOCK')
    ELSE s.quantity
  END as available_count
FROM inventory_stock s
JOIN batches b ON s.batch_id = b.id
JOIN product_variants pv ON s.product_variant_id = pv.id
JOIN product_types pt ON pv.product_type_id = pt.id
JOIN brands br ON pv.brand_id = br.id
WHERE s.deleted_at IS NULL
  AND s.status = 'IN_STOCK'
  AND pt.name = 'HDPE Pipe';

CREATE VIEW sprinkler_stock_details AS
SELECT
  s.id as stock_id,
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
  pt.name as product_type_name,
  br.name as brand_name,
  pv.parameters,
  CASE
    WHEN s.stock_type = 'BUNDLE' THEN s.quantity * s.pieces_per_bundle
    WHEN s.stock_type = 'SPARE' THEN (SELECT COALESCE(SUM(piece_count), 0) FROM sprinkler_spare_pieces WHERE stock_id = s.id AND status = 'IN_STOCK')
    ELSE 0
  END as total_pieces_available,
  CASE
    WHEN s.stock_type = 'BUNDLE' THEN s.quantity
    WHEN s.stock_type = 'SPARE' THEN (SELECT COUNT(*) FROM sprinkler_spare_pieces WHERE stock_id = s.id AND status = 'IN_STOCK')
    ELSE 0
  END as available_count
FROM inventory_stock s
JOIN batches b ON s.batch_id = b.id
JOIN product_variants pv ON s.product_variant_id = pv.id
JOIN product_types pt ON pv.product_type_id = pt.id
JOIN brands br ON pv.brand_id = br.id
WHERE s.deleted_at IS NULL
  AND s.status = 'IN_STOCK'
  AND pt.name = 'Sprinkler Pipe';

-- Unified view for backward compatibility
CREATE VIEW inventory_unified AS
SELECT
  s.id,
  s.batch_id,
  s.product_variant_id,
  s.status,
  s.stock_type,
  s.quantity,
  s.created_at,
  s.updated_at,
  b.batch_code,
  b.batch_no,
  pt.name as product_type_name,
  br.name as brand_name,
  pt.name as product_category,
  pv.parameters,
  s.length_per_unit as length_meters,
  CASE WHEN s.stock_type = 'CUT_ROLL' THEN TRUE ELSE FALSE END as is_cut_roll,
  s.parent_stock_id,
  CASE
    WHEN s.stock_type = 'BUNDLE' THEN 'bundle'
    WHEN s.stock_type = 'SPARE' THEN 'spare'
    ELSE NULL
  END as bundle_type,
  s.pieces_per_bundle as bundle_size,
  CASE
    WHEN s.stock_type = 'BUNDLE' THEN s.pieces_per_bundle * s.quantity
    WHEN s.stock_type = 'SPARE' THEN (SELECT COALESCE(SUM(piece_count), 0) FROM sprinkler_spare_pieces WHERE stock_id = s.id AND status = 'IN_STOCK')
    ELSE NULL
  END as piece_count,
  s.piece_length_meters
FROM inventory_stock s
JOIN batches b ON s.batch_id = b.id
JOIN product_variants pv ON s.product_variant_id = pv.id
JOIN product_types pt ON pv.product_type_id = pt.id
JOIN brands br ON pv.brand_id = br.id
WHERE s.deleted_at IS NULL;

COMMIT;
