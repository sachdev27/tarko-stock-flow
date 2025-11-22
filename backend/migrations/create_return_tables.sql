-- Create Return Tables for Return Management System
-- Date: 2025-11-22
-- Purpose: Track product returns from customers back to inventory

BEGIN;

-- Master return record
CREATE TABLE IF NOT EXISTS returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number TEXT UNIQUE NOT NULL, -- Auto-generated: RET-2025-001

  customer_id UUID REFERENCES customers(id) NOT NULL,

  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,

  total_amount NUMERIC(15,2),
  status TEXT DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'INSPECTED', 'RESTOCKED', 'CANCELLED')),

  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_returns_customer ON returns(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_returns_date ON returns(return_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_returns_number ON returns(return_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status) WHERE deleted_at IS NULL;

-- Individual items in return
CREATE TABLE IF NOT EXISTS return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID REFERENCES returns(id) ON DELETE CASCADE NOT NULL,

  product_variant_id UUID REFERENCES product_variants(id) NOT NULL,

  -- Item type and quantity
  item_type TEXT NOT NULL CHECK (item_type IN ('FULL_ROLL', 'CUT_ROLL', 'BUNDLE', 'SPARE_PIECES')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),

  -- For rolls (both full and cut)
  length_meters NUMERIC,

  -- For bundles and spare pieces (Sprinkler)
  bundle_size INTEGER,
  piece_count INTEGER, -- pieces per bundle OR total spare pieces
  piece_length_meters NUMERIC,

  -- Pricing (optional for now)
  rate_per_unit NUMERIC(15,2),
  amount NUMERIC(15,2),

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_variant ON return_items(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_return_items_type ON return_items(item_type);

-- Detailed return_rolls table - one row per roll returned
CREATE TABLE IF NOT EXISTS return_rolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_item_id UUID REFERENCES return_items(id) ON DELETE CASCADE NOT NULL,
  roll_number INTEGER NOT NULL, -- 1, 2, 3... for the Nth roll
  length_meters NUMERIC NOT NULL CHECK (length_meters > 0),

  -- Link to created inventory stock (populated after restocking)
  stock_id UUID REFERENCES inventory_stock(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_rolls_return_item ON return_rolls(return_item_id);
CREATE INDEX IF NOT EXISTS idx_return_rolls_stock ON return_rolls(stock_id) WHERE stock_id IS NOT NULL;

-- Detailed return_bundles table - one row per bundle returned
CREATE TABLE IF NOT EXISTS return_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_item_id UUID REFERENCES return_items(id) ON DELETE CASCADE NOT NULL,
  bundle_number INTEGER NOT NULL, -- 1, 2, 3... for the Nth bundle
  bundle_size INTEGER NOT NULL CHECK (bundle_size > 0),
  piece_length_meters NUMERIC NOT NULL CHECK (piece_length_meters > 0),

  -- Link to created inventory stock (populated after restocking)
  stock_id UUID REFERENCES inventory_stock(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_bundles_return_item ON return_bundles(return_item_id);
CREATE INDEX IF NOT EXISTS idx_return_bundles_stock ON return_bundles(stock_id) WHERE stock_id IS NOT NULL;

-- Trigger to update updated_at on returns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_returns_updated_at
  BEFORE UPDATE ON returns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View for easy return reporting
CREATE OR REPLACE VIEW return_summary AS
SELECT
    r.id,
    r.return_number,
    r.return_date,
    r.status,
    c.name as customer_name,
    c.city as customer_city,
    c.phone as customer_phone,
    r.total_amount,
    COUNT(DISTINCT ri.id) as total_items,
    SUM(ri.quantity) as total_quantity,
    r.notes,
    u.email as created_by_email,
    r.created_at,
    r.updated_at
FROM returns r
LEFT JOIN customers c ON r.customer_id = c.id
LEFT JOIN return_items ri ON ri.return_id = r.id
LEFT JOIN users u ON r.created_by = u.id
WHERE r.deleted_at IS NULL
GROUP BY r.id, r.return_number, r.return_date, r.status,
         c.name, c.city, c.phone, r.total_amount,
         r.notes, u.email, r.created_at, r.updated_at
ORDER BY r.return_date DESC, r.created_at DESC;

-- View for detailed return items
CREATE OR REPLACE VIEW return_items_detailed AS
SELECT
    ri.id,
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
    pv.id as product_variant_id,
    pt.name as product_type_name,
    b.name as brand_name,
    pv.parameters,
    c.name as customer_name,
    ri.notes,
    ri.created_at
FROM return_items ri
JOIN returns r ON ri.return_id = r.id
JOIN customers c ON r.customer_id = c.id
JOIN product_variants pv ON ri.product_variant_id = pv.id
JOIN product_types pt ON pv.product_type_id = pt.id
JOIN brands b ON pv.brand_id = b.id
WHERE r.deleted_at IS NULL
ORDER BY r.return_date DESC, ri.created_at;

COMMIT;
