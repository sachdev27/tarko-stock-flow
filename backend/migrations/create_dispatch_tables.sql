-- Create Dispatch Tables for New Modular Dispatch System
-- Date: 2025-11-21
-- Purpose: Separate dispatch/sale operations from inventory transactions

BEGIN;

-- Master dispatch record
CREATE TABLE IF NOT EXISTS dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_number TEXT UNIQUE NOT NULL, -- Auto-generated: DISP-2025-001

  customer_id UUID REFERENCES customers(id) NOT NULL,
  bill_to_id UUID REFERENCES bill_to(id),
  transport_id UUID REFERENCES transports(id),
  vehicle_id UUID REFERENCES vehicles(id),

  invoice_number TEXT,
  dispatch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,

  total_amount NUMERIC(15,2),
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DISPATCHED', 'DELIVERED', 'CANCELLED')),

  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dispatches_customer ON dispatches(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dispatches_date ON dispatches(dispatch_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dispatches_number ON dispatches(dispatch_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dispatches_status ON dispatches(status) WHERE deleted_at IS NULL;

-- Individual items in dispatch
CREATE TABLE IF NOT EXISTS dispatch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id UUID REFERENCES dispatches(id) ON DELETE CASCADE NOT NULL,

  stock_id UUID REFERENCES inventory_stock(id) NOT NULL,
  product_variant_id UUID REFERENCES product_variants(id) NOT NULL,

  -- Item type and quantity
  item_type TEXT NOT NULL CHECK (item_type IN ('FULL_ROLL', 'CUT_PIECE', 'BUNDLE', 'SPARE_PIECES')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),

  -- For cut pieces (HDPE) - individual piece tracking
  cut_piece_id UUID REFERENCES hdpe_cut_pieces(id),
  length_meters NUMERIC,

  -- For spare pieces (Sprinkler) - array of individual spare piece IDs
  spare_piece_ids UUID[],
  piece_count INTEGER,

  -- For bundles and full rolls
  bundle_size INTEGER,
  pieces_per_bundle INTEGER,
  piece_length_meters NUMERIC,

  -- Pricing (optional for now)
  rate_per_unit NUMERIC(15,2),
  amount NUMERIC(15,2),

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_items_dispatch ON dispatch_items(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_items_stock ON dispatch_items(stock_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_items_variant ON dispatch_items(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_items_type ON dispatch_items(item_type);

-- Add dispatch_item_id to inventory_transactions for better tracking
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS dispatch_item_id UUID REFERENCES dispatch_items(id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_dispatch_item ON inventory_transactions(dispatch_item_id) WHERE dispatch_item_id IS NOT NULL;

-- Trigger to update updated_at on dispatches
CREATE TRIGGER update_dispatches_updated_at
  BEFORE UPDATE ON dispatches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View for easy dispatch reporting
CREATE OR REPLACE VIEW dispatch_summary AS
SELECT
    d.id,
    d.dispatch_number,
    d.dispatch_date,
    d.status,
    d.invoice_number,
    c.name as customer_name,
    c.city as customer_city,
    bt.name as bill_to_name,
    t.name as transport_name,
    v.vehicle_number,
    d.total_amount,
    COUNT(di.id) as total_items,
    SUM(di.quantity) as total_quantity,
    d.notes,
    u.email as created_by_email,
    d.created_at,
    d.updated_at
FROM dispatches d
LEFT JOIN customers c ON d.customer_id = c.id
LEFT JOIN bill_to bt ON d.bill_to_id = bt.id
LEFT JOIN transports t ON d.transport_id = t.id
LEFT JOIN vehicles v ON d.vehicle_id = v.id
LEFT JOIN dispatch_items di ON di.dispatch_id = d.id
LEFT JOIN users u ON d.created_by = u.id
WHERE d.deleted_at IS NULL
GROUP BY d.id, d.dispatch_number, d.dispatch_date, d.status, d.invoice_number,
         c.name, c.city, bt.name, t.name, v.vehicle_number, d.total_amount,
         d.notes, u.email, d.created_at, d.updated_at
ORDER BY d.dispatch_date DESC, d.created_at DESC;

-- View for detailed dispatch items
CREATE OR REPLACE VIEW dispatch_items_detailed AS
SELECT
    di.id,
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
    pv.id as product_variant_id,
    pt.name as product_type_name,
    b.name as brand_name,
    pv.parameters,
    ist.status as stock_status,
    ist.stock_type,
    di.created_at
FROM dispatch_items di
JOIN dispatches d ON di.dispatch_id = d.id
JOIN inventory_stock ist ON di.stock_id = ist.id
JOIN product_variants pv ON di.product_variant_id = pv.id
JOIN product_types pt ON pv.product_type_id = pt.id
JOIN brands b ON pv.brand_id = b.id
WHERE d.deleted_at IS NULL;

COMMIT;
