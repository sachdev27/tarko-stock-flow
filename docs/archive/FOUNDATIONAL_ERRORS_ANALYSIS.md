# Foundational Database and Query Errors Analysis

**Date**: November 22, 2024
**Analysis Type**: Comprehensive system audit
**Severity**: CRITICAL - Production-impacting bugs found

---

## Executive Summary

This document details **8 foundational errors** in the inventory management system's database design and querying patterns. These errors cause data loss, inconsistent state, and inability to properly track and revert inventory operations.

**Most Critical Issue**: COMBINE_SPARES operation overwrites the immutable `transaction_id` field, permanently losing the original creator transaction and making it impossible to properly audit piece provenance.

---

## Error #1: COMBINE_SPARES Overwrites Original transaction_id ⚠️ CRITICAL

### Location
- File: `/backend/routes/inventory_routes.py`
- Lines: 1283-1287

### The Bug
```python
# WRONG: This overwrites the original transaction_id!
cursor.execute("""
    UPDATE sprinkler_spare_pieces
    SET status = 'SOLD_OUT', transaction_id = %s, updated_at = NOW()
    WHERE id = ANY(%s::uuid[])
""", (transaction_id, actual_spare_piece_ids))
```

### Why It's Broken
1. **Creation**: Production creates spare pieces with `transaction_id = production_txn_123`
2. **Modification**: COMBINE_SPARES uses those pieces and **OVERWRITES** `transaction_id = combine_txn_456`
3. **Loss**: The original production transaction ID is **permanently lost** from the database
4. **Revert Failure**: When reverting COMBINE_SPARES, we query `WHERE transaction_id = combine_txn_456`
5. **Incorrect Result**: We find all pieces used in combine, but we can't distinguish which were created by production vs which were created as remainders

### Real-World Impact
```
Initial State:
- Production creates 10 spare pieces: piece_1, piece_2, ..., piece_10
  All have transaction_id = prod_001

User Action: COMBINE_SPARES uses 8 pieces (piece_1 through piece_8)
Database State After:
- piece_1 to piece_8: transaction_id = combine_001 (OVERWRITTEN!)
- piece_9 to piece_10: transaction_id = prod_001 (unchanged)
- Original prod_001 link to pieces 1-8 is LOST FOREVER

User Action: Revert COMBINE_SPARES
Database Query: WHERE transaction_id = combine_001
Result: Finds piece_1 through piece_8
Problem: We don't know these were originally created by prod_001!

Later Issues:
- Can't trace piece provenance back to production batch
- Audit trail is broken
- If production batch is deleted, orphaned pieces remain
```

### The Fix
**transaction_id should be IMMUTABLE**. We need TWO fields:
- `created_by_transaction_id`: Set once when piece is created, NEVER updated
- `last_modified_by_transaction_id`: Tracks which operation last touched the piece

Migration created: `/backend/migrations/fix_transaction_id_tracking.sql`

---

## Error #2: No Piece Ownership Change Tracking

### The Problem
We only track:
- `transaction_id` - which we're incorrectly overwriting
- `status` - only shows current state (IN_STOCK, DISPATCHED, SOLD_OUT)
- No history of operations that touched the piece

### Why It's Broken
**Scenario**: A piece goes through multiple operations:
1. PRODUCTION creates piece → `transaction_id = prod_001`, `status = IN_STOCK`
2. COMBINE_SPARES uses piece → `transaction_id = combine_001` (overwritten!), `status = SOLD_OUT`
3. COMBINE_SPARES reverted → `transaction_id = combine_001` (still!), `status = IN_STOCK`
4. Piece dispatched → `status = DISPATCHED`

**Problem**: We've lost all history except the final state. We can't answer:
- Which transaction originally created this piece?
- What operations has it gone through?
- When was it first created vs when was it last modified?
- If we revert dispatch, what state should it return to?

### The Fix
**Option A (Recommended)**: Add explicit tracking columns
```sql
created_by_transaction_id UUID NOT NULL  -- Immutable
last_modified_by_transaction_id UUID     -- Tracks last operation
```

**Option B**: Junction table for full history
```sql
CREATE TABLE piece_transaction_history (
  id UUID PRIMARY KEY,
  piece_id UUID NOT NULL,
  piece_type TEXT NOT NULL, -- 'HDPE' or 'SPRINKLER'
  transaction_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'CREATED', 'MODIFIED', 'DISPATCHED', 'RETURNED'
  status_before TEXT,
  status_after TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
```

**Option C**: Store piece IDs in transaction record
```sql
ALTER TABLE inventory_transactions ADD COLUMN affected_piece_ids JSONB;
-- Store: {"created": [uuid1, uuid2], "modified": [uuid3], "deleted": [uuid4]}
```

---

## Error #3: Time-Based Matching for Stock Deletion (Still Exists!)

### Location
- File: `/backend/routes/transaction_routes.py`
- Lines: 1148-1154

### The Bug
```python
# WRONG: Uses time window instead of transaction_id
cursor.execute("""
    UPDATE inventory_stock
    SET deleted_at = NULL, status = 'IN_STOCK', updated_at = NOW()
    WHERE batch_id = %s
    AND stock_type = 'SPARE'
    AND deleted_at >= %s - INTERVAL '1 minute'
    AND deleted_at <= %s + INTERVAL '1 minute'
""", (inv_transaction['from_batch_id'], inv_transaction['created_at'], inv_transaction['created_at']))
```

### Why It's Broken
1. **Race Conditions**: If two COMBINE_SPARES happen within 2 minutes, they interfere
2. **Clock Skew**: If system clock changes, matching fails
3. **Long Transactions**: If operation takes >1 minute, it won't find its own deletion
4. **False Positives**: Might restore wrong stock records deleted by different operations

### Real-World Impact
```
Time: 10:00:00 - COMBINE_SPARES #1 deletes SPARE stock A
Time: 10:00:30 - COMBINE_SPARES #2 deletes SPARE stock B
Time: 10:01:00 - User reverts COMBINE_SPARES #1

Query matches both deletions (within ±1 minute window)
Result: BOTH stocks A and B are restored!
Bug: Stock B should still be deleted by operation #2
```

### The Fix
Add `deleted_by_transaction_id` to `inventory_stock`:
```sql
ALTER TABLE inventory_stock
ADD COLUMN deleted_by_transaction_id UUID
REFERENCES inventory_transactions(id) ON DELETE SET NULL;

-- In COMBINE_SPARES: Set deleted_by_transaction_id when deleting
UPDATE inventory_stock
SET deleted_at = NOW(), deleted_by_transaction_id = %s
WHERE id = %s

-- In REVERT: Restore only OUR deletions
UPDATE inventory_stock
SET deleted_at = NULL, deleted_by_transaction_id = NULL
WHERE deleted_by_transaction_id = %s
```

This is **already included** in the migration file.

---

## Error #4: Soft Delete vs Hard Delete Inconsistency

### The Problem
Mixed deletion strategies across the codebase:

**Soft Delete** (keeps record, sets deleted_at):
- `inventory_stock`: Uses `deleted_at IS NOT NULL`
- Good for audit trail

**Status-Based Delete** (keeps record, changes status):
- `sprinkler_spare_pieces`: Uses `status = 'SOLD_OUT'`
- `hdpe_cut_pieces`: Uses `status = 'SOLD_OUT'`

**Hard Delete** (removes from database):
- COMBINE_SPARES revert: `DELETE FROM sprinkler_spare_pieces WHERE ...`
- Loses all history!

### Why It's Broken
In `/backend/routes/transaction_routes.py` line 1163:
```python
# WRONG: Hard delete loses all history
cursor.execute("""
    DELETE FROM sprinkler_spare_pieces
    WHERE transaction_id = %s
    AND status = 'IN_STOCK'
    AND notes LIKE 'Remainder from combining%'
""", (clean_id,))
```

**Consequences**:
1. If remainder piece was partially dispatched, DELETE cascades and removes dispatch records
2. No audit trail of remainder pieces ever existing
3. Can't reconstruct what happened during the operation
4. If revert fails partway through, some pieces are gone forever

### The Fix
**Standardize on soft delete everywhere**:
```python
# CORRECT: Soft delete preserves history
cursor.execute("""
    UPDATE sprinkler_spare_pieces
    SET deleted_at = NOW(), status = 'SOLD_OUT'
    WHERE transaction_id = %s
    AND status = 'IN_STOCK'
    AND notes LIKE 'Remainder from combining%'
""", (clean_id,))
```

**Add cleanup job** for old soft-deleted records (run monthly):
```sql
DELETE FROM sprinkler_spare_pieces
WHERE deleted_at < NOW() - INTERVAL '6 months';
```

---

## Error #5: Missing Validation for Piece Dispatch Status

### Location
- File: `/backend/routes/inventory_routes.py`
- Lines: 1212-1220

### The Bug
```python
# WRONG: No locking, no validation of reservations
cursor.execute("""
    SELECT ssp.id as spare_piece_id, ssp.piece_count, ssp.stock_id
    FROM sprinkler_spare_pieces ssp
    WHERE ssp.id = ANY(%s::uuid[]) AND ssp.status = 'IN_STOCK'
""", (spare_piece_ids,))
```

### Why It's Broken
**Scenario: Race Condition**
```
User A: Starts COMBINE_SPARES with pieces [1, 2, 3]
User B: Starts DISPATCH with pieces [2, 3, 4]

Timeline:
10:00:00.000 - User A queries: SELECT WHERE id IN (1,2,3) AND status='IN_STOCK' → Returns all 3
10:00:00.100 - User B queries: SELECT WHERE id IN (2,3,4) AND status='IN_STOCK' → Returns all 3
10:00:00.200 - User A updates: SET status='SOLD_OUT' WHERE id IN (1,2,3)
10:00:00.300 - User B updates: SET status='DISPATCHED' WHERE id IN (2,3,4)

Result: Pieces 2 and 3 are marked DISPATCHED even though they were consumed by COMBINE_SPARES!
Database is now in inconsistent state.
```

### The Fix
**Add pessimistic locking**:
```python
cursor.execute("""
    SELECT ssp.id as spare_piece_id, ssp.piece_count, ssp.stock_id
    FROM sprinkler_spare_pieces ssp
    WHERE ssp.id = ANY(%s::uuid[])
    AND ssp.status = 'IN_STOCK'
    AND ssp.reserved_by_transaction_id IS NULL
    FOR UPDATE NOWAIT  -- Lock these rows immediately or fail
""", (spare_piece_ids,))

if cursor.rowcount < len(spare_piece_ids):
    raise ValueError("Some pieces are locked by another operation")

# Reserve pieces for this transaction
cursor.execute("""
    UPDATE sprinkler_spare_pieces
    SET reserved_by_transaction_id = %s
    WHERE id = ANY(%s::uuid[])
""", (transaction_id, spare_piece_ids))
```

**Add column**:
```sql
ALTER TABLE sprinkler_spare_pieces
ADD COLUMN reserved_by_transaction_id UUID
REFERENCES inventory_transactions(id) ON DELETE SET NULL;
```

**Set transaction isolation**:
```python
cursor.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
```

---

## Error #6: Quantity Calculations Don't Match Piece Counts

### The Problem
Throughout the codebase, we calculate spare stock quantity incorrectly:

**WRONG**:
```python
cursor.execute("""
    UPDATE inventory_stock
    SET quantity = (
        SELECT COUNT(*) FROM sprinkler_spare_pieces
        WHERE stock_id = %s AND status = 'IN_STOCK'
    )
    WHERE id = %s
""", (stock_id, stock_id))
```

### Why It's Broken
`sprinkler_spare_pieces` has a `piece_count` column:
```sql
CREATE TABLE sprinkler_spare_pieces (
  id UUID PRIMARY KEY,
  stock_id UUID NOT NULL,
  piece_count INTEGER NOT NULL DEFAULT 1 CHECK (piece_count > 0),
  ...
);
```

**Example**:
```
Stock has 3 spare piece records:
- Record 1: piece_count = 10
- Record 2: piece_count = 5
- Record 3: piece_count = 8

COUNT(*) = 3 records
SUM(piece_count) = 23 pieces

Current code sets quantity = 3 (WRONG!)
Should set quantity = 23 (CORRECT!)
```

### The Fix
**Use SUM instead of COUNT**:
```python
cursor.execute("""
    UPDATE inventory_stock
    SET quantity = (
        SELECT COALESCE(SUM(piece_count), 0)
        FROM sprinkler_spare_pieces
        WHERE stock_id = %s AND status = 'IN_STOCK'
    )
    WHERE id = %s
""", (stock_id, stock_id))
```

**Add validation constraint**:
```sql
-- Ensure quantity always matches sum of pieces
CREATE OR REPLACE FUNCTION validate_spare_stock_quantity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stock_type = 'SPARE' THEN
    -- Verify quantity matches sum of spare pieces
    DECLARE
      actual_count INTEGER;
    BEGIN
      SELECT COALESCE(SUM(piece_count), 0)
      INTO actual_count
      FROM sprinkler_spare_pieces
      WHERE stock_id = NEW.id AND status = 'IN_STOCK';

      IF NEW.quantity != actual_count THEN
        RAISE EXCEPTION 'Stock quantity (%) does not match sum of spare pieces (%)',
          NEW.quantity, actual_count;
      END IF;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_spare_stock_quantity
  BEFORE INSERT OR UPDATE ON inventory_stock
  FOR EACH ROW
  WHEN (NEW.stock_type = 'SPARE')
  EXECUTE FUNCTION validate_spare_stock_quantity();
```

---

## Error #7: No Atomic Transaction Boundaries

### The Problem
Complex operations span multiple queries without explicit transaction control.

**Example from COMBINE_SPARES**:
```python
# Query 1: Get stock details
cursor.execute("SELECT ... FROM inventory_stock ...")

# Query 2: Get spare pieces
cursor.execute("SELECT ... FROM sprinkler_spare_pieces ...")

# Query 3: Create or update bundle stock
cursor.execute("INSERT INTO inventory_stock ...")

# Query 4: Create transaction record
cursor.execute("INSERT INTO inventory_transactions ...")

# Query 5: Mark spare pieces as sold_out
cursor.execute("UPDATE sprinkler_spare_pieces ...")

# Query 6: Handle remainder pieces
cursor.execute("INSERT INTO sprinkler_spare_pieces ...")

# Query 7: Update SPARE stock quantity
cursor.execute("UPDATE inventory_stock ...")

# Query 8: Check if SPARE should be deleted
cursor.execute("SELECT quantity ...")

# Query 9: Soft delete SPARE if needed
cursor.execute("UPDATE inventory_stock SET deleted_at ...")
```

### Why It's Broken
If operation fails at Query 6:
- Queries 1-5 are committed
- Spare pieces are marked SOLD_OUT
- Bundle stock was created
- But remainder pieces weren't created!
- Stock quantities are wrong!

**No rollback** - database is left in inconsistent state.

### The Fix
**Explicit transaction control**:
```python
def combine_spares(...):
    with get_db_cursor() as cursor:
        try:
            # Start explicit transaction
            cursor.execute("BEGIN")

            # Create savepoint before each major step
            cursor.execute("SAVEPOINT before_bundle_creation")

            # ... do bundle creation ...

            cursor.execute("SAVEPOINT before_piece_updates")

            # ... update pieces ...

            # If everything succeeds
            cursor.execute("COMMIT")

        except Exception as e:
            # Rollback to last savepoint or entire transaction
            cursor.execute("ROLLBACK")
            raise
```

**Set transaction isolation**:
```python
cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
```

---

## Error #8: UUID Parameter Format Confusion

### The Problem
Inconsistent handling of UUID vs prefixed ID formats:

**Frontend sends**: `'inv_a1b2c3d4-...'` (prefixed)
**Database expects**: `'a1b2c3d4-...'` (clean UUID)

**Inconsistent handling**:
```python
# Some endpoints:
transaction_id = data.get('transaction_id')  # Accepts: 'inv_abc123'
clean_id = transaction_id.replace('inv_', '')  # Returns: 'abc123'
cursor.execute("... WHERE id = %s", (clean_id,))  # Works!

# Other endpoints:
transaction_id = data.get('transaction_id')  # Gets: 'inv_abc123'
cursor.execute("... WHERE id = %s", (transaction_id,))  # FAILS! Invalid UUID format
```

### Why It's Broken
**Symptoms**:
- Random "invalid input syntax for type uuid" errors
- Works in some endpoints, fails in others
- Inconsistent API behavior

**Root cause**: Mixed responsibility
- Frontend generates IDs with prefix for display
- Backend stores clean UUIDs
- No consistent conversion layer

### The Fix
**Option A: Clean UUIDs everywhere** (Recommended)
```python
# API layer: Always strip prefix on input
@dispatch_bp.route('/revert', methods=['POST'])
def revert():
    data = request.json
    transaction_ids = data.get('transaction_ids', [])

    # Strip all prefixes
    clean_ids = [tid.replace('inv_', '').replace('dsp_', '') for tid in transaction_ids]

    # Use clean IDs in DB queries
    cursor.execute("... WHERE id = ANY(%s::uuid[])", (clean_ids,))

    # Return prefixed IDs in response
    return jsonify({
        'reverted': [f'inv_{id}' for id in clean_ids]
    })
```

**Option B: Store prefixed IDs in database**
```sql
-- Change all UUID columns to TEXT
ALTER TABLE inventory_transactions ALTER COLUMN id TYPE TEXT;
-- Now can store 'inv_abc123' directly
```

**Option C: Create helper functions**
```python
def to_clean_uuid(id_string):
    """Strip any prefix and return clean UUID"""
    return id_string.split('_', 1)[-1]

def to_prefixed_id(uuid_string, prefix='inv'):
    """Add prefix to UUID"""
    return f"{prefix}_{uuid_string}"

# Use everywhere
clean_id = to_clean_uuid(transaction_id)
cursor.execute("... WHERE id = %s", (clean_id,))
```

---

## Priority Recommendations

### 🔴 IMMEDIATE (Deploy Today)
1. Apply migration: `/backend/migrations/fix_transaction_id_tracking.sql`
2. Update COMBINE_SPARES to use `created_by_transaction_id` (immutable) + `last_modified_by_transaction_id` (mutable)
3. Remove all time-based matching queries (INTERVAL '1 minute')
4. Fix quantity calculations: COUNT(*) → SUM(piece_count)

### 🟡 THIS WEEK
5. Standardize all deletions to soft delete
6. Add SELECT FOR UPDATE locking to COMBINE_SPARES and DISPATCH
7. Add explicit transaction boundaries with SAVEPOINT usage
8. Standardize UUID handling across all endpoints

### 🟢 NEXT SPRINT
9. Add piece_transaction_history table for full audit trail
10. Add database constraints to validate quantity = SUM(piece_count)
11. Implement reserved_by_transaction_id for pessimistic locking
12. Set proper transaction isolation levels (SERIALIZABLE or REPEATABLE READ)

---

## Testing Plan

### Unit Tests Needed
1. Test COMBINE_SPARES doesn't overwrite created_by_transaction_id
2. Test COMBINE_SPARES sets last_modified_by_transaction_id
3. Test revert uses created_by_transaction_id, not last_modified_by_transaction_id
4. Test quantity calculations use SUM(piece_count) not COUNT(*)
5. Test no hard DELETEs (except cleanup job)
6. Test SELECT FOR UPDATE prevents race conditions
7. Test UUID stripping works consistently

### Integration Tests Needed
1. Full flow: Production → COMBINE_SPARES → Dispatch → Revert COMBINE_SPARES → Verify state
2. Concurrent COMBINE_SPARES operations don't interfere
3. Revert doesn't restore wrong pieces from different transactions
4. Quantity always matches piece counts after any operation

### Manual Verification
1. Create production batch with 20 spare pieces
2. COMBINE_SPARES 10 pieces into 1 bundle
3. Verify created_by_transaction_id still points to production
4. Verify last_modified_by_transaction_id points to COMBINE_SPARES
5. Revert COMBINE_SPARES
6. Verify all 10 pieces restored with correct transaction tracking
7. Verify quantity = SUM(piece_count) throughout

---

## Migration Guide

### Step 1: Apply Database Migration
```bash
cd /Users/sachdevs/Projects/Tarko-Inv/tarko-stock-flow/backend
psql tarko_inventory < migrations/fix_transaction_id_tracking.sql
```

### Step 2: Update Code - Replace transaction_id with created_by_transaction_id

**In all INSERT statements** (production, cut_roll, split_bundle, returns):
```python
# OLD
INSERT INTO sprinkler_spare_pieces (stock_id, piece_count, transaction_id, ...)

# NEW
INSERT INTO sprinkler_spare_pieces (stock_id, piece_count, created_by_transaction_id, ...)
```

**In COMBINE_SPARES** (CRITICAL CHANGE):
```python
# OLD - WRONG
UPDATE sprinkler_spare_pieces
SET status = 'SOLD_OUT', transaction_id = %s
WHERE id = ANY(%s::uuid[])

# NEW - CORRECT
UPDATE sprinkler_spare_pieces
SET status = 'SOLD_OUT', last_modified_by_transaction_id = %s
WHERE id = ANY(%s::uuid[])
-- Do NOT touch created_by_transaction_id!
```

**In revert operations**:
```python
# OLD
WHERE transaction_id = %s

# NEW - More precise!
WHERE last_modified_by_transaction_id = %s
-- Or for newly created pieces:
WHERE created_by_transaction_id = %s
```

### Step 3: Fix Quantity Calculations
Search and replace all instances:
```python
# OLD
SELECT COUNT(*) FROM sprinkler_spare_pieces WHERE stock_id = %s

# NEW
SELECT COALESCE(SUM(piece_count), 0) FROM sprinkler_spare_pieces WHERE stock_id = %s
```

### Step 4: Remove Time-Based Matching
```python
# OLD
WHERE deleted_at >= %s - INTERVAL '1 minute'
AND deleted_at <= %s + INTERVAL '1 minute'

# NEW
WHERE deleted_by_transaction_id = %s
```

### Step 5: Deploy and Test
1. Deploy to staging
2. Run full test suite
3. Manually verify Production → COMBINE → Revert flow
4. Check piece_tracking_audit view for data consistency
5. Deploy to production during low-traffic window

---

## Monitoring and Alerts

### Database Queries to Monitor

**Check for pieces with inconsistent tracking**:
```sql
-- Find pieces where created_by != last_modified but should be
SELECT * FROM piece_tracking_audit
WHERE created_by_transaction_id IS NULL
AND status != 'SOLD_OUT';  -- These pieces should have a creator!

-- Find pieces modified without proper tracking
SELECT * FROM sprinkler_spare_pieces
WHERE last_modified_by_transaction_id IS NULL
AND status = 'SOLD_OUT';  -- These were modified but not tracked!
```

**Check for quantity mismatches**:
```sql
SELECT
  ist.id,
  ist.quantity as stock_quantity,
  COALESCE(SUM(ssp.piece_count), 0) as actual_pieces,
  ist.quantity - COALESCE(SUM(ssp.piece_count), 0) as mismatch
FROM inventory_stock ist
LEFT JOIN sprinkler_spare_pieces ssp ON ist.id = ssp.stock_id AND ssp.status = 'IN_STOCK'
WHERE ist.stock_type = 'SPARE'
AND ist.deleted_at IS NULL
GROUP BY ist.id, ist.quantity
HAVING ist.quantity != COALESCE(SUM(ssp.piece_count), 0);
```

**Check for orphaned pieces**:
```sql
-- Pieces whose stock was deleted but they're still IN_STOCK
SELECT ssp.*
FROM sprinkler_spare_pieces ssp
JOIN inventory_stock ist ON ssp.stock_id = ist.id
WHERE ist.deleted_at IS NOT NULL
AND ssp.status = 'IN_STOCK';
```

### Add to Monitoring Dashboard
1. Alert if quantity mismatches > 0
2. Alert if orphaned pieces found
3. Alert if pieces created without created_by_transaction_id
4. Daily report of pieces modified in last 24 hours with full tracking

---

## Conclusion

These 8 foundational errors represent significant technical debt that has accumulated due to:
1. Mixing immutable and mutable concepts in single fields
2. Using time-based queries instead of explicit foreign keys
3. Inconsistent deletion strategies
4. Missing transaction boundaries and locking
5. Calculation errors (COUNT vs SUM)

The good news: All errors are fixable with the provided migration and code changes. The critical issue (overwriting transaction_id) can be resolved by introducing `created_by_transaction_id` and `last_modified_by_transaction_id` columns, allowing proper provenance tracking while still supporting modification tracking.

**Estimated fix time**:
- Database migration: 5 minutes
- Code updates: 2-3 hours
- Testing: 4-6 hours
- **Total: 1 working day**

**Risk if not fixed**: Continued data loss, inability to audit transactions, system state inconsistencies, potential regulatory compliance issues.
