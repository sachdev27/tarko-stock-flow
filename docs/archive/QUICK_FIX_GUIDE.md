# Quick Fix Reference Guide

This is a condensed checklist for fixing the foundational errors. See FOUNDATIONAL_ERRORS_ANALYSIS.md for detailed explanations.

## 🔴 CRITICAL: Fix COMBINE_SPARES Transaction ID Overwrite

### Files to Change
- `/backend/routes/inventory_routes.py` (COMBINE_SPARES operation)
- `/backend/routes/transaction_routes.py` (COMBINE_SPARES revert)

### Current WRONG Code (inventory_routes.py ~line 1285)
```python
# WRONG: Overwrites original transaction_id!
cursor.execute("""
    UPDATE sprinkler_spare_pieces
    SET status = 'SOLD_OUT', transaction_id = %s, updated_at = NOW()
    WHERE id = ANY(%s::uuid[])
""", (transaction_id, actual_spare_piece_ids))
```

### Correct Fix
```python
# CORRECT: Preserves created_by, only updates last_modified
cursor.execute("""
    UPDATE sprinkler_spare_pieces
    SET status = 'SOLD_OUT',
        last_modified_by_transaction_id = %s,
        updated_at = NOW()
    WHERE id = ANY(%s::uuid[])
""", (transaction_id, actual_spare_piece_ids))
```

---

## 🔴 CRITICAL: Fix Quantity Calculations

### Search For (in all files)
```python
SELECT COUNT(*) FROM sprinkler_spare_pieces WHERE stock_id = %s
```

### Replace With
```python
SELECT COALESCE(SUM(piece_count), 0) FROM sprinkler_spare_pieces WHERE stock_id = %s
```

### Files Affected
- `/backend/routes/inventory_routes.py` (multiple locations)
- `/backend/routes/dispatch_routes.py`
- `/backend/routes/return_routes.py`
- `/backend/inventory_helpers_aggregate.py`

---

## 🔴 CRITICAL: Remove Time-Based Matching

### Current WRONG Code (transaction_routes.py ~line 1150)
```python
# WRONG: Uses time window
cursor.execute("""
    UPDATE inventory_stock
    SET deleted_at = NULL, status = 'IN_STOCK', updated_at = NOW()
    WHERE batch_id = %s
    AND stock_type = 'SPARE'
    AND deleted_at >= %s - INTERVAL '1 minute'
    AND deleted_at <= %s + INTERVAL '1 minute'
""", (inv_transaction['from_batch_id'], inv_transaction['created_at'], inv_transaction['created_at']))
```

### Correct Fix
```python
# CORRECT: Uses transaction_id
cursor.execute("""
    UPDATE inventory_stock
    SET deleted_at = NULL,
        status = 'IN_STOCK',
        deleted_by_transaction_id = NULL,
        updated_at = NOW()
    WHERE deleted_by_transaction_id = %s
    AND stock_type = 'SPARE'
""", (clean_id,))
```

And when deleting:
```python
# Set deleted_by_transaction_id when soft deleting
cursor.execute("""
    UPDATE inventory_stock
    SET deleted_at = NOW(),
        deleted_by_transaction_id = %s
    WHERE id = %s
""", (transaction_id, stock_id))
```

---

## 🟡 IMPORTANT: Fix All Piece Creation

### Pattern to Update
Whenever creating pieces, use `created_by_transaction_id`:

```python
# PRODUCTION, CUT_ROLL, SPLIT_BUNDLE, RETURNS
INSERT INTO sprinkler_spare_pieces (
    stock_id, piece_count, status, notes,
    created_by_transaction_id,  -- NEW: Immutable creator
    created_at
) VALUES (%s, %s, 'IN_STOCK', %s, %s, NOW())
```

```python
INSERT INTO hdpe_cut_pieces (
    stock_id, length_meters, status, notes,
    created_by_transaction_id,  -- NEW: Immutable creator
    created_at
) VALUES (%s, %s, 'IN_STOCK', %s, %s, NOW())
```

---

## 🟡 IMPORTANT: Fix Revert Operations

### CUT_ROLL Revert (transaction_routes.py ~line 970)
```python
# Query pieces created by THIS transaction
cursor.execute("""
    SELECT COUNT(*) as piece_count
    FROM hdpe_cut_pieces
    WHERE created_by_transaction_id = %s  -- Changed from transaction_id
    AND status = 'IN_STOCK'
""", (clean_id,))

# Mark pieces as SOLD_OUT
cursor.execute("""
    UPDATE hdpe_cut_pieces
    SET status = 'SOLD_OUT', updated_at = NOW()
    WHERE created_by_transaction_id = %s  -- Changed from transaction_id
    AND status = 'IN_STOCK'
""", (clean_id,))
```

### SPLIT_BUNDLE Revert (transaction_routes.py ~line 1020)
```python
# Query pieces created by THIS transaction
cursor.execute("""
    SELECT COUNT(*) as piece_count
    FROM sprinkler_spare_pieces
    WHERE created_by_transaction_id = %s  -- Changed from transaction_id
    AND status = 'IN_STOCK'
""", (clean_id,))

# Mark pieces as SOLD_OUT
cursor.execute("""
    UPDATE sprinkler_spare_pieces
    SET status = 'SOLD_OUT', updated_at = NOW()
    WHERE created_by_transaction_id = %s  -- Changed from transaction_id
    AND status = 'IN_STOCK'
""", (clean_id,))
```

### COMBINE_SPARES Revert (transaction_routes.py ~line 1157)
```python
# Restore pieces that were CONSUMED by this operation
cursor.execute("""
    UPDATE sprinkler_spare_pieces
    SET status = 'IN_STOCK', updated_at = NOW()
    WHERE last_modified_by_transaction_id = %s  -- Changed from transaction_id
    AND status = 'SOLD_OUT'
""", (clean_id,))

# Delete remainder pieces CREATED by this operation
cursor.execute("""
    UPDATE sprinkler_spare_pieces  -- Changed from DELETE to UPDATE (soft delete)
    SET deleted_at = NOW(), status = 'SOLD_OUT'
    WHERE created_by_transaction_id = %s  -- Changed from transaction_id
    AND status = 'IN_STOCK'
    AND notes LIKE 'Remainder from combining%'
""", (clean_id,))
```

---

## 🟡 IMPORTANT: Standardize to Soft Delete

### Pattern to Replace
```python
# WRONG: Hard delete
DELETE FROM sprinkler_spare_pieces WHERE ...
```

### Replace With
```python
# CORRECT: Soft delete
UPDATE sprinkler_spare_pieces
SET deleted_at = NOW(), status = 'SOLD_OUT'
WHERE ...
```

---

## 🟢 OPTIONAL: Add Locking to COMBINE_SPARES

### Before Querying Pieces (inventory_routes.py ~line 1217)
```python
# Start transaction with proper isolation
cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")

# Add pessimistic locking
cursor.execute("""
    SELECT ssp.id as spare_piece_id, ssp.piece_count, ssp.stock_id
    FROM sprinkler_spare_pieces ssp
    WHERE ssp.id = ANY(%s::uuid[])
    AND ssp.status = 'IN_STOCK'
    FOR UPDATE NOWAIT  -- Lock rows or fail immediately
""", (spare_piece_ids,))

spare_pieces = cursor.fetchall()

# Verify we got all requested pieces
if len(spare_pieces) < len(spare_piece_ids):
    raise ValueError("Some pieces are locked by another operation or no longer available")
```

---

## Deployment Checklist

### 1. Database Migration
```bash
cd /Users/sachdevs/Projects/Tarko-Inv/tarko-stock-flow/backend
psql tarko_inventory < migrations/fix_transaction_id_tracking.sql
```

### 2. Code Updates (in order)
- [ ] Update all INSERT statements to use `created_by_transaction_id`
- [ ] Update COMBINE_SPARES to use `last_modified_by_transaction_id` (not overwrite created_by)
- [ ] Update all revert operations to use `created_by_transaction_id` and `last_modified_by_transaction_id`
- [ ] Replace all `COUNT(*)` with `SUM(piece_count)` for quantity calculations
- [ ] Remove all time-based matching (INTERVAL '1 minute')
- [ ] Add `deleted_by_transaction_id` when soft deleting stocks
- [ ] Replace hard DELETEs with soft deletes (UPDATE ... SET deleted_at)

### 3. Testing
- [ ] Test production entry creates pieces with created_by_transaction_id
- [ ] Test COMBINE_SPARES preserves created_by_transaction_id
- [ ] Test COMBINE_SPARES sets last_modified_by_transaction_id
- [ ] Test revert COMBINE_SPARES restores correct pieces
- [ ] Test quantity always equals SUM(piece_count)
- [ ] Test no time-based queries remain
- [ ] Test concurrent operations don't interfere

### 4. Verification Queries

**Check pieces have creators**:
```sql
SELECT COUNT(*) FROM sprinkler_spare_pieces
WHERE created_by_transaction_id IS NULL
AND status != 'SOLD_OUT';
-- Should return 0
```

**Check quantity matches**:
```sql
SELECT ist.id, ist.quantity, COALESCE(SUM(ssp.piece_count), 0) as actual
FROM inventory_stock ist
LEFT JOIN sprinkler_spare_pieces ssp ON ist.id = ssp.stock_id AND ssp.status = 'IN_STOCK'
WHERE ist.stock_type = 'SPARE' AND ist.deleted_at IS NULL
GROUP BY ist.id, ist.quantity
HAVING ist.quantity != COALESCE(SUM(ssp.piece_count), 0);
-- Should return 0 rows
```

---

## Common Mistakes to Avoid

❌ **Don't update created_by_transaction_id after creation**
```python
# WRONG
UPDATE sprinkler_spare_pieces SET created_by_transaction_id = %s WHERE id = %s
```

❌ **Don't use COUNT for piece quantities**
```python
# WRONG
SELECT COUNT(*) FROM sprinkler_spare_pieces WHERE stock_id = %s
```

❌ **Don't use time-based matching**
```python
# WRONG
WHERE created_at BETWEEN %s - INTERVAL '1 minute' AND %s + INTERVAL '1 minute'
```

❌ **Don't hard delete pieces**
```python
# WRONG
DELETE FROM sprinkler_spare_pieces WHERE ...
```

✅ **Do use immutable created_by + mutable last_modified**
```python
# CORRECT
created_by_transaction_id = transaction_id  # Set once, never change
last_modified_by_transaction_id = transaction_id  # Update when modified
```

✅ **Do use SUM for quantities**
```python
# CORRECT
SELECT COALESCE(SUM(piece_count), 0) FROM sprinkler_spare_pieces
```

✅ **Do use transaction_id for matching**
```python
# CORRECT
WHERE created_by_transaction_id = %s
WHERE last_modified_by_transaction_id = %s
WHERE deleted_by_transaction_id = %s
```

✅ **Do use soft delete**
```python
# CORRECT
UPDATE sprinkler_spare_pieces SET deleted_at = NOW(), status = 'SOLD_OUT'
```

---

## Quick Test Scenario

1. **Create production batch**: 20 spare pieces (should have created_by_transaction_id = prod_001)
2. **COMBINE_SPARES**: Use 10 pieces
   - Check: created_by_transaction_id still = prod_001
   - Check: last_modified_by_transaction_id = combine_001
   - Check: status = SOLD_OUT
3. **Revert COMBINE_SPARES**
   - Check: All 10 pieces restored to IN_STOCK
   - Check: created_by_transaction_id still = prod_001
   - Check: last_modified_by_transaction_id = NULL or revert_001
4. **Verify quantity**: Should equal 20 (original count)

---

## Emergency Rollback

If issues occur after deployment:

```sql
-- Rollback migration (restore old structure)
ALTER TABLE sprinkler_spare_pieces DROP COLUMN IF EXISTS created_by_transaction_id;
ALTER TABLE sprinkler_spare_pieces DROP COLUMN IF EXISTS last_modified_by_transaction_id;
ALTER TABLE hdpe_cut_pieces DROP COLUMN IF EXISTS created_by_transaction_id;
ALTER TABLE hdpe_cut_pieces DROP COLUMN IF EXISTS last_modified_by_transaction_id;
ALTER TABLE inventory_stock DROP COLUMN IF EXISTS deleted_by_transaction_id;
DROP VIEW IF EXISTS piece_tracking_audit;
```

Then restore previous code version from git.
