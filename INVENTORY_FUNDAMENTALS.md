# Inventory System Fundamentals

## Database Schema - Core Principles

### 1. Aggregate Inventory (`inventory_stock` table)

This is the **master table** that tracks aggregate stock levels:

```sql
CREATE TABLE inventory_stock (
  id UUID PRIMARY KEY,
  batch_id UUID REFERENCES batches(id),
  product_variant_id UUID REFERENCES product_variants(id),
  stock_type TEXT CHECK (stock_type IN ('FULL_ROLL', 'CUT_ROLL', 'BUNDLE', 'SPARE')),
  quantity INTEGER,  -- Meaning depends on stock_type
  status TEXT CHECK (status IN ('IN_STOCK', 'RESERVED', 'DISPATCHED')),

  -- Type-specific fields
  length_per_unit NUMERIC,      -- For FULL_ROLL, CUT_ROLL
  pieces_per_bundle INTEGER,    -- For BUNDLE
  piece_length_meters NUMERIC,  -- For BUNDLE, SPARE

  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
```

**Key Understanding of `quantity` field:**

| Stock Type | `quantity` Means | Example |
|------------|------------------|---------|
| `FULL_ROLL` | Number of full rolls | 10 rolls |
| `CUT_ROLL` | Number of cut pieces | 5 cut pieces |
| `BUNDLE` | Number of bundles | 20 bundles |
| `SPARE` | **Number of spare groups** | 3 groups |

---

### 2. Detail Tables - Individual Tracking

#### A. HDPE Cut Pieces (`hdpe_cut_pieces`)

Tracks **individual** cut pieces from HDPE rolls:

```sql
CREATE TABLE hdpe_cut_pieces (
  id UUID PRIMARY KEY,
  stock_id UUID REFERENCES inventory_stock(id),  -- Links to CUT_ROLL stock
  length_meters NUMERIC,  -- Individual piece length
  status TEXT CHECK (status IN ('IN_STOCK', 'DISPATCHED')),
  created_at TIMESTAMPTZ
);
```

**Example:**
- Cut 500m roll → 100m piece
- `inventory_stock`: 1 row with `stock_type='CUT_ROLL'`, `quantity=2`
- `hdpe_cut_pieces`: 2 rows
  - Row 1: `length_meters=100`, `status='IN_STOCK'`
  - Row 2: `length_meters=400` (remainder), `status='IN_STOCK'`

**Relationship:**
```
inventory_stock.quantity = COUNT(hdpe_cut_pieces WHERE status='IN_STOCK')
```

---

#### B. Sprinkler Spare Pieces (`sprinkler_spare_pieces`)

Tracks **groups** of spare pieces from sprinkler bundles:

```sql
CREATE TABLE sprinkler_spare_pieces (
  id UUID PRIMARY KEY,
  stock_id UUID REFERENCES inventory_stock(id),  -- Links to SPARE stock
  piece_count INTEGER,  -- Number of pieces in THIS group
  status TEXT CHECK (status IN ('IN_STOCK', 'DISPATCHED')),
  created_at TIMESTAMPTZ
);
```

**Example:**
- Split 50-piece bundle → 8 pieces + 42 pieces remainder
- `inventory_stock`: 1 row with `stock_type='SPARE'`, `quantity=2` (2 groups)
- `sprinkler_spare_pieces`: 2 rows
  - Row 1: `piece_count=8`, `status='IN_STOCK'`
  - Row 2: `piece_count=42`, `status='IN_STOCK'`

**Relationship:**
```
inventory_stock.quantity = COUNT(sprinkler_spare_pieces WHERE status='IN_STOCK')
Total Pieces = SUM(sprinkler_spare_pieces.piece_count WHERE status='IN_STOCK')
```

---

## UI Display Logic

### HDPE Pipes (Rolls)

**Stats Badge:**
- Full Rolls: Shows `SUM(quantity)` where `stock_type='FULL_ROLL'`
- Cut Pieces: Shows `COUNT(stock_entries)` where `stock_type='CUT_ROLL'`

**Detail View:**
- Each cut piece shown separately with its length
- Example: "Cut Piece: 100m", "Cut Piece: 400m"

---

### Sprinkler Pipes (Bundles)

**Stats Badge:**
- Bundles: Shows `SUM(quantity)` where `stock_type='BUNDLE'`
- Spare Pieces: Shows `SUM(piece_count)` from ALL spare groups

**Detail View:**
- Bundles: Grouped by size (e.g., "19 Bundles of 10 pieces")
- Spares: **Aggregated as ONE entity** showing total pieces (e.g., "15 Spare Pieces")

**Important:** Unlike HDPE where each cut piece is shown separately, spare pieces are shown as one total because:
1. Spare pieces are fungible (interchangeable)
2. User doesn't care about individual groups
3. User combines them back into bundles of custom sizes

---

## Operations Flow

### Production Entry

#### HDPE Pipe:
1. User enters: 10 standard rolls of 500m each
2. System creates: 1 row in `inventory_stock` with `quantity=10`, `stock_type='FULL_ROLL'`

#### Sprinkler Pipe:
1. User enters: 20 bundles of 50 pieces + 3 spare groups [8, 5, 2]
2. System creates:
   - 1 row in `inventory_stock`: `quantity=20`, `stock_type='BUNDLE'`
   - 1 row in `inventory_stock`: `quantity=3`, `stock_type='SPARE'`
   - 3 rows in `sprinkler_spare_pieces`: piece_count=[8, 5, 2]

---

### Cut Roll (HDPE)

**Action:** Cut 100m from 500m roll

**Database Changes:**
1. Reduce `inventory_stock.quantity` by 1 (FULL_ROLL)
2. Create/Update `inventory_stock` for CUT_ROLL with `quantity=2`
3. Insert 2 rows in `hdpe_cut_pieces`:
   - `length_meters=100`
   - `length_meters=400` (remainder)

**UI Shows:** 2 separate cut pieces

---

### Split Bundle (Sprinkler)

**Action:** Split 50-piece bundle → take 8 pieces

**Database Changes:**
1. Reduce `inventory_stock.quantity` by 1 (BUNDLE)
2. Create/Update `inventory_stock` for SPARE with `quantity+=2`
3. Insert 2 rows in `sprinkler_spare_pieces`:
   - `piece_count=8`
   - `piece_count=42` (remainder)

**UI Shows:** Total spare pieces increases by 50

---

### Combine Spares (Sprinkler)

**Action:** Combine 15 spare pieces → 1 bundle of 10 pieces

**Database Changes:**
1. Mark spare group rows as `DISPATCHED` (total 15 pieces consumed)
2. Create/Update `inventory_stock` for BUNDLE with `quantity+=1`, `pieces_per_bundle=10`
3. Insert 1 row in `sprinkler_spare_pieces`:
   - `piece_count=5` (remainder)
4. Update SPARE `inventory_stock.quantity` = COUNT of remaining groups

**UI Shows:**
- Bundles increased by 1
- Spare pieces decreased by 10, remainder 5 shown

---

## Important Rules

### 1. Quantity Field Consistency

Always maintain:
```sql
-- For CUT_ROLL
inventory_stock.quantity = (
  SELECT COUNT(*) FROM hdpe_cut_pieces
  WHERE stock_id = inventory_stock.id AND status = 'IN_STOCK'
)

-- For SPARE
inventory_stock.quantity = (
  SELECT COUNT(*) FROM sprinkler_spare_pieces
  WHERE stock_id = inventory_stock.id AND status = 'IN_STOCK'
)
```

### 2. Transaction Logging

Every operation must create:
- Row in `inventory_transactions` table
- Row in `audit_logs` table

### 3. Status Management

- `IN_STOCK`: Available for dispatch
- `DISPATCHED`: Used in orders
- Detail table rows marked `DISPATCHED` are hidden from UI
- Aggregate `quantity` reflects only `IN_STOCK` items

### 4. Soft Deletes

- Use `deleted_at` instead of actual deletes
- Maintains audit trail
- Queries must always filter `WHERE deleted_at IS NULL`

---

## UI Display Formulas

### Stats Badge (Top Card)

```typescript
// Full Rolls
fullRollCount = SUM(stock_entries.quantity WHERE stock_type='FULL_ROLL')

// Cut Pieces
cutPieceCount = COUNT(stock_entries WHERE stock_type='CUT_ROLL')

// Bundles
bundleCount = SUM(stock_entries.quantity WHERE stock_type='BUNDLE')

// Spare Pieces (IMPORTANT!)
sparePieceCount = SUM(stock_entries.piece_count WHERE stock_type='SPARE')
// NOT: SUM(stock_entries.quantity) - that would show group count!
```

### Detail View Logic

```typescript
// HDPE: Show each cut piece separately
cutRolls.map(entry => `Cut Piece: ${entry.length_per_unit}m`)

// Sprinkler Bundles: Group by size
bundlesBySize[size] = bundles.filter(b => b.pieces_per_bundle === size)
display: `${totalBundles} Bundles of ${size} pieces`

// Sprinkler Spares: Show as one aggregated entity
totalSpares = spares.reduce((sum, s) => sum + s.piece_count, 0)
display: `${totalSpares} Spare Pieces`
```

---

## Common Mistakes to Avoid

1. ❌ Showing spare **groups** count in stats badge
   - ✅ Show total **pieces** count

2. ❌ Directly modifying `inventory_stock.quantity` without updating detail tables
   - ✅ Always update detail tables first, then recalculate quantity

3. ❌ Forgetting remainder pieces when splitting/cutting
   - ✅ Always create remainder entries

4. ❌ Allowing negative quantities
   - ✅ Validate before operations

5. ❌ Not marking old pieces as DISPATCHED
   - ✅ Change status to track usage

---

## Summary

**The Golden Rule:**

> `inventory_stock` is the **aggregate view** of inventory.
> Detail tables (`hdpe_cut_pieces`, `sprinkler_spare_pieces`) are the **source of truth**.
> Backend recalculates aggregates from detail tables.
> UI displays aggregates but allows operations on individual items.

This ensures data consistency and accurate inventory tracking at all times.
