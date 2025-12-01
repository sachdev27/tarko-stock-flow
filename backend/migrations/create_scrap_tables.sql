-- Create Scrap Tables for Scrap Management System
-- Date: 2025-11-29
-- Purpose: Track scrapped/damaged inventory items for audit and reporting

BEGIN;

-- Master scrap record
CREATE TABLE IF NOT EXISTS scraps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scrap_number TEXT UNIQUE NOT NULL, -- Auto-generated: SCR-2025-001

  scrap_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL, -- Damaged, Defective, Quality Issue, Expired, etc.
  notes TEXT,

  total_quantity NUMERIC(15,3) NOT NULL DEFAULT 0,
  estimated_loss NUMERIC(15,2), -- Financial loss estimate

  status TEXT DEFAULT 'SCRAPPED' CHECK (status IN ('SCRAPPED', 'DISPOSED', 'CANCELLED')),

  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scraps_date ON scraps(scrap_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_scraps_number ON scraps(scrap_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_scraps_status ON scraps(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_scraps_reason ON scraps(reason) WHERE deleted_at IS NULL;

-- Individual items in scrap
CREATE TABLE IF NOT EXISTS scrap_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scrap_id UUID REFERENCES scraps(id) ON DELETE CASCADE NOT NULL,

  -- Original stock reference
  stock_id UUID REFERENCES inventory_stock(id) NOT NULL,
  batch_id UUID REFERENCES batches(id) NOT NULL,
  product_variant_id UUID REFERENCES product_variants(id) NOT NULL,

  -- Item type and quantity
  stock_type TEXT NOT NULL CHECK (stock_type IN ('FULL_ROLL', 'CUT_ROLL', 'BUNDLE', 'SPARE')),
  quantity_scrapped NUMERIC(15,3) NOT NULL CHECK (quantity_scrapped > 0),

  -- For FULL_ROLL
  length_per_unit NUMERIC,

  -- For BUNDLE
  pieces_per_bundle INTEGER,
  piece_length_meters NUMERIC,

  -- Original stock snapshot (before scrap)
  original_quantity NUMERIC(15,3),
  original_status TEXT,

  -- Financial info (optional)
  estimated_value NUMERIC(15,2),

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scrap_items_scrap ON scrap_items(scrap_id);
CREATE INDEX IF NOT EXISTS idx_scrap_items_stock ON scrap_items(stock_id);
CREATE INDEX IF NOT EXISTS idx_scrap_items_batch ON scrap_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_scrap_items_variant ON scrap_items(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_scrap_items_type ON scrap_items(stock_type);

-- Detailed scrap pieces table - for CUT_ROLL and SPARE items
CREATE TABLE IF NOT EXISTS scrap_pieces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scrap_item_id UUID REFERENCES scrap_items(id) ON DELETE CASCADE NOT NULL,

  -- Reference to original piece (if applicable)
  original_piece_id UUID, -- Reference to hdpe_cut_pieces.id or sprinkler_spare_pieces.id
  piece_type TEXT NOT NULL CHECK (piece_type IN ('CUT_PIECE', 'SPARE_PIECE')),

  -- For cut pieces
  length_meters NUMERIC,

  -- For spare pieces
  piece_count INTEGER,
  piece_length_meters NUMERIC,

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scrap_pieces_scrap_item ON scrap_pieces(scrap_item_id);
CREATE INDEX IF NOT EXISTS idx_scrap_pieces_original ON scrap_pieces(original_piece_id) WHERE original_piece_id IS NOT NULL;

-- Trigger to update updated_at on scraps
CREATE TRIGGER update_scraps_updated_at
  BEFORE UPDATE ON scraps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View for easy scrap reporting
CREATE OR REPLACE VIEW scrap_summary AS
SELECT
    s.id,
    s.scrap_number,
    s.scrap_date,
    s.reason,
    s.status,
    s.total_quantity,
    s.estimated_loss,
    COUNT(DISTINCT si.id) as total_items,
    COUNT(DISTINCT si.batch_id) as total_batches,
    s.notes,
    u.email as created_by_email,
    s.created_at,
    s.updated_at
FROM scraps s
LEFT JOIN scrap_items si ON si.scrap_id = s.id
LEFT JOIN users u ON s.created_by = u.id
WHERE s.deleted_at IS NULL
GROUP BY s.id, s.scrap_number, s.scrap_date, s.reason, s.status,
         s.total_quantity, s.estimated_loss, s.notes, u.email, s.created_at, s.updated_at
ORDER BY s.scrap_date DESC, s.created_at DESC;

-- View for detailed scrap items
CREATE OR REPLACE VIEW scrap_items_detailed AS
SELECT
    si.id,
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
    pv.id as product_variant_id,
    pt.name as product_type_name,
    br.name as brand_name,
    pv.parameters,
    si.notes,
    si.created_at
FROM scrap_items si
JOIN scraps s ON si.scrap_id = s.id
JOIN batches b ON si.batch_id = b.id
JOIN product_variants pv ON si.product_variant_id = pv.id
JOIN product_types pt ON pv.product_type_id = pt.id
JOIN brands br ON pv.brand_id = br.id
WHERE s.deleted_at IS NULL
ORDER BY s.scrap_date DESC, si.created_at;

COMMIT;
