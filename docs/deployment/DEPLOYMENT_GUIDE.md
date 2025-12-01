# Comprehensive Refactoring - Deployment Guide

## Overview

This guide covers deploying the industry-standard refactoring that fixes all foundational errors in the inventory system.

**Key Improvements:**
1. ✅ Immutable `created_by_transaction_id` - never overwritten
2. ✅ Event sourcing with `piece_lifecycle_events` table - full audit trail
3. ✅ Optimistic locking with row versioning - prevents race conditions
4. ✅ Soft deletes everywhere - preserves history
5. ✅ Pessimistic locking for COMBINE_SPARES - prevents concurrent issues
6. ✅ Database-level validation - triggers enforce business rules
7. ✅ Materialized views - fast queries
8. ✅ Comprehensive indexing - optimized performance

---

## Pre-Deployment Checklist

### 1. Backup Current Database
```bash
cd /Users/sachdevs/Projects/Tarko-Inv/tarko-stock-flow/backend

# Full backup
pg_dump tarko_inventory > backups/pre_refactoring_$(date +%Y%m%d_%H%M%S).sql

# Verify backup
ls -lh backups/

# Test restore (on test database)
createdb tarko_inventory_test
psql tarko_inventory_test < backups/pre_refactoring_*.sql
```

### 2. Verify Current State
```bash
# Connect to database
psql tarko_inventory

-- Check current piece counts
SELECT
  'HDPE' as type,
  COUNT(*) as total,
  COUNT(CASE WHEN status = 'IN_STOCK' THEN 1 END) as in_stock
FROM hdpe_cut_pieces
UNION ALL
SELECT
  'SPRINKLER' as type,
  COUNT(*) as total,
  COUNT(CASE WHEN status = 'IN_STOCK' THEN 1 END) as in_stock
FROM sprinkler_spare_pieces;

-- Check for NULL transaction_ids
SELECT COUNT(*) FROM hdpe_cut_pieces WHERE transaction_id IS NULL;
SELECT COUNT(*) FROM sprinkler_spare_pieces WHERE transaction_id IS NULL;

-- Save current state for comparison
\copy (SELECT * FROM inventory_stock WHERE deleted_at IS NULL) TO 'pre_migration_stock.csv' CSV HEADER
\copy (SELECT * FROM hdpe_cut_pieces WHERE deleted_at IS NULL) TO 'pre_migration_hdpe.csv' CSV HEADER
\copy (SELECT * FROM sprinkler_spare_pieces WHERE status = 'IN_STOCK') TO 'pre_migration_sprinkler.csv' CSV HEADER
```

### 3. Check Dependencies
```bash
# Verify psycopg2 version
python3 -c "import psycopg2; print(psycopg2.__version__)"

# Should be >= 2.8

# Check PostgreSQL version
psql --version

# Should be >= 12.0
```

---

## Deployment Steps

### Step 1: Stop Application
```bash
# Stop backend server
# (Adjust based on your deployment method)

# If using systemd:
sudo systemctl stop tarko-backend

# If using pm2:
pm2 stop tarko-backend

# If running manually:
# Ctrl+C to stop the process
```

### Step 2: Apply Database Migration
```bash
cd /Users/sachdevs/Projects/Tarko-Inv/tarko-stock-flow/backend

# Apply migration
psql tarko_inventory < migrations/001_comprehensive_refactoring.sql

# Should see:
# BEGIN
# CREATE TABLE
# ALTER TABLE
# ... (many lines)
# COMMIT
```

### Step 3: Verify Migration Success
```bash
psql tarko_inventory

-- 1. Check new table exists
\dt piece_lifecycle_events
-- Should show: piece_lifecycle_events table

-- 2. Check new columns exist
\d hdpe_cut_pieces
-- Should show: created_by_transaction_id, original_stock_id, version, deleted_at, deleted_by_transaction_id

\d sprinkler_spare_pieces
-- Should show: created_by_transaction_id, original_stock_id, version, deleted_at, deleted_by_transaction_id, reserved_by_transaction_id, reserved_at

-- 3. Check triggers are active
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid IN ('hdpe_cut_pieces'::regclass, 'sprinkler_spare_pieces'::regclass);
-- Should show all triggers with tgenabled = 'O' (enabled)

-- 4. Check views exist
\dv v_piece_audit_trail
\dv v_available_pieces
\dv v_stock_quantity_validation

-- 5. Check materialized view
\dm mv_piece_current_state

-- 6. Verify data migration
SELECT COUNT(*) FROM hdpe_cut_pieces WHERE created_by_transaction_id IS NULL AND deleted_at IS NULL;
SELECT COUNT(*) FROM sprinkler_spare_pieces WHERE created_by_transaction_id IS NULL AND deleted_at IS NULL;
-- Both should return 0

-- 7. Check for quantity mismatches
SELECT * FROM v_stock_quantity_validation WHERE quantity_mismatch != 0;
-- Should return 0 rows
```

### Step 4: Update Application Code

**Option A: Use New Helper Module (Recommended)**

Replace old code patterns with `InventoryOperations` class:

```python
# OLD CODE - inventory_routes.py
with get_db_cursor() as cursor:
    cursor.execute("""
        INSERT INTO sprinkler_spare_pieces (
            stock_id, piece_count, transaction_id, ...
        ) VALUES (%s, %s, %s, ...)
    """, (...))

# NEW CODE - Using InventoryOperations
from inventory_operations import InventoryOperations

with get_db_cursor(commit=True) as cursor:
    ops = InventoryOperations(cursor, user_id)
    piece_ids = ops.create_spare_pieces(
        stock_id=stock_id,
        piece_count=10,
        transaction_id=txn_id
    )
```

**Option B: Update Queries Manually**

Update all INSERT statements:
```sql
-- OLD
INSERT INTO sprinkler_spare_pieces (
    stock_id, piece_count, transaction_id, ...
)

-- NEW
INSERT INTO sprinkler_spare_pieces (
    stock_id, piece_count,
    created_by_transaction_id,  -- IMMUTABLE
    original_stock_id,          -- IMMUTABLE
    version,
    ...
)
```

Update COMBINE_SPARES:
```sql
-- OLD (WRONG - overwrites transaction_id!)
UPDATE sprinkler_spare_pieces
SET status = 'SOLD_OUT', transaction_id = %s

-- NEW (CORRECT - preserves created_by_transaction_id)
UPDATE sprinkler_spare_pieces
SET status = 'SOLD_OUT'
    -- created_by_transaction_id is NOT touched!
    -- Trigger prevents mutation
WHERE id = ANY(%s::uuid[])
```

### Step 5: Start Application
```bash
# Start backend server
sudo systemctl start tarko-backend

# Or with pm2:
pm2 start tarko-backend

# Check logs
tail -f /var/log/tarko-backend.log

# Should see no errors
```

### Step 6: Run Smoke Tests
```bash
# Test piece creation
curl -X POST http://localhost:5000/api/production/batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "product_type_id": "...",
    "brand_id": "...",
    "quantity": 100,
    "roll_config_type": "bundles",
    "number_of_bundles": 10,
    "bundle_size": 10
  }'

# Verify pieces were created with created_by_transaction_id
psql tarko_inventory -c "
  SELECT
    id,
    created_by_transaction_id,
    original_stock_id,
    version
  FROM sprinkler_spare_pieces
  ORDER BY created_at DESC
  LIMIT 5;
"

# Should show non-NULL created_by_transaction_id
```

---

## Post-Deployment Verification

### 1. Data Integrity Checks
```sql
-- Connect to database
psql tarko_inventory

-- 1. Verify all active pieces have created_by_transaction_id
SELECT 'HDPE missing creator' as issue, COUNT(*) as count
FROM hdpe_cut_pieces
WHERE created_by_transaction_id IS NULL AND deleted_at IS NULL
UNION ALL
SELECT 'SPRINKLER missing creator' as issue, COUNT(*) as count
FROM sprinkler_spare_pieces
WHERE created_by_transaction_id IS NULL AND deleted_at IS NULL;
-- Both should be 0

-- 2. Verify quantity matches piece counts
SELECT * FROM v_stock_quantity_validation
WHERE quantity_mismatch != 0;
-- Should return 0 rows

-- 3. Check lifecycle events are being logged
SELECT
  event_type,
  COUNT(*) as count
FROM piece_lifecycle_events
GROUP BY event_type
ORDER BY count DESC;
-- Should show CREATED events for new pieces

-- 4. Verify triggers are working
-- Try to update created_by_transaction_id (should fail)
BEGIN;
UPDATE sprinkler_spare_pieces
SET created_by_transaction_id = gen_random_uuid()
WHERE id = (SELECT id FROM sprinkler_spare_pieces LIMIT 1);
-- Should error: "created_by_transaction_id is immutable"
ROLLBACK;

-- 5. Check materialized view
SELECT COUNT(*) FROM mv_piece_current_state;
-- Should match piece counts
```

### 2. Performance Checks
```sql
-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename IN ('hdpe_cut_pieces', 'sprinkler_spare_pieces')
ORDER BY idx_scan DESC;

-- Verify queries use indexes (EXPLAIN ANALYZE)
EXPLAIN ANALYZE
SELECT * FROM sprinkler_spare_pieces
WHERE created_by_transaction_id = gen_random_uuid();
-- Should show "Index Scan" not "Seq Scan"
```

### 3. Audit Trail Test
```sql
-- Get full history for a piece
SELECT * FROM v_piece_audit_trail
WHERE piece_id = (
  SELECT id FROM sprinkler_spare_pieces LIMIT 1
)
ORDER BY created_at;

-- Should show all events for that piece
```

---

## Testing Scenarios

### Test 1: Production → COMBINE_SPARES → Revert
```python
# Using new InventoryOperations class

from inventory_operations import InventoryOperations

with get_db_cursor(commit=True) as cursor:
    ops = InventoryOperations(cursor, user_id)

    # 1. Create spare pieces (simulating production)
    prod_txn_id = str(uuid.uuid4())
    piece_ids = []
    for i in range(10):
        pids = ops.create_spare_pieces(
            stock_id=spare_stock_id,
            piece_count=1,
            transaction_id=prod_txn_id,
            notes=f'Production piece {i+1}'
        )
        piece_ids.extend(pids)

    # Verify: created_by_transaction_id = prod_txn_id
    cursor.execute("""
        SELECT id, created_by_transaction_id
        FROM sprinkler_spare_pieces
        WHERE id = ANY(%s::uuid[])
    """, (piece_ids,))

    for piece in cursor.fetchall():
        assert piece['created_by_transaction_id'] == prod_txn_id

    # 2. COMBINE_SPARES using those pieces
    combine_txn_id = str(uuid.uuid4())

    bundle_id, remainder_id = ops.combine_spares(
        spare_piece_ids=piece_ids[:8],  # Use 8 pieces
        bundle_size=8,
        number_of_bundles=1,
        transaction_id=combine_txn_id
    )

    # Verify: created_by_transaction_id STILL = prod_txn_id (not overwritten!)
    cursor.execute("""
        SELECT id, created_by_transaction_id, status
        FROM sprinkler_spare_pieces
        WHERE id = ANY(%s::uuid[])
    """, (piece_ids[:8],))

    for piece in cursor.fetchall():
        assert piece['created_by_transaction_id'] == prod_txn_id, \
            f"FAIL: created_by was overwritten to {piece['created_by_transaction_id']}"
        assert piece['status'] == 'SOLD_OUT'

    print("✅ COMBINE_SPARES preserves created_by_transaction_id!")

    # 3. Revert COMBINE_SPARES
    result = ops.revert_combine_spares(combine_txn_id)

    # Verify: Pieces restored to IN_STOCK
    cursor.execute("""
        SELECT id, status, created_by_transaction_id
        FROM sprinkler_spare_pieces
        WHERE id = ANY(%s::uuid[])
    """, (piece_ids[:8],))

    for piece in cursor.fetchall():
        assert piece['status'] == 'IN_STOCK'
        assert piece['created_by_transaction_id'] == prod_txn_id

    print("✅ Revert restored pieces correctly!")
    print(f"   Restored: {result['pieces_restored']} pieces")
```

### Test 2: Concurrent Operations (Race Condition Prevention)
```python
import threading
import time

def attempt_combine_1():
    try:
        with get_db_cursor(commit=True) as cursor:
            ops = InventoryOperations(cursor, user_id)
            bundle_id, _ = ops.combine_spares(
                spare_piece_ids=piece_ids,
                bundle_size=5,
                number_of_bundles=1,
                transaction_id=str(uuid.uuid4())
            )
            print("✅ Thread 1: Success")
    except Exception as e:
        print(f"❌ Thread 1: {e}")

def attempt_combine_2():
    time.sleep(0.1)  # Slight delay
    try:
        with get_db_cursor(commit=True) as cursor:
            ops = InventoryOperations(cursor, user_id)
            bundle_id, _ = ops.combine_spares(
                spare_piece_ids=piece_ids,  # SAME pieces!
                bundle_size=5,
                number_of_bundles=1,
                transaction_id=str(uuid.uuid4())
            )
            print("✅ Thread 2: Success")
    except Exception as e:
        print(f"❌ Thread 2: {e} (Expected - pieces are locked)")

# Run concurrent operations
t1 = threading.Thread(target=attempt_combine_1)
t2 = threading.Thread(target=attempt_combine_2)

t1.start()
t2.start()

t1.join()
t2.join()

# Expected: One succeeds, one fails with ReservationError
# This proves pessimistic locking works!
```

### Test 3: Optimistic Locking (Version Check)
```python
with get_db_cursor(commit=True) as cursor:
    # Get a piece with its current version
    cursor.execute("""
        SELECT id, version, status
        FROM sprinkler_spare_pieces
        WHERE status = 'IN_STOCK'
        LIMIT 1
    """)

    piece = cursor.fetchone()
    original_version = piece['version']

    # Simulate concurrent modification in another session
    # (In real scenario, this would be another transaction)
    cursor.execute("""
        UPDATE sprinkler_spare_pieces
        SET status = 'DISPATCHED'
        WHERE id = %s
    """, (piece['id'],))

    # Now try to update with old version
    cursor.execute("""
        UPDATE sprinkler_spare_pieces
        SET status = 'SOLD_OUT'
        WHERE id = %s
          AND version = %s
        RETURNING id
    """, (piece['id'], original_version))

    # Should update 0 rows (version mismatch)
    assert cursor.rowcount == 0, "Optimistic lock failed!"

    print("✅ Optimistic locking works - detected concurrent modification!")
```

---

## Monitoring and Alerts

### 1. Set Up Daily Validation Job
```bash
# Create cron job for daily validation
crontab -e

# Add:
0 2 * * * psql tarko_inventory -c "SELECT * FROM v_stock_quantity_validation WHERE quantity_mismatch != 0" | mail -s "Stock Quantity Mismatches" admin@example.com
```

### 2. Prometheus Metrics (if using)
```python
# Add to app.py
from prometheus_client import Gauge

quantity_mismatch_gauge = Gauge(
    'inventory_quantity_mismatches',
    'Number of stocks with quantity mismatches'
)

# Update periodically
def update_metrics():
    with get_db_cursor() as cursor:
        cursor.execute("""
            SELECT COUNT(*) FROM v_stock_quantity_validation
            WHERE quantity_mismatch != 0
        """)
        count = cursor.fetchone()[0]
        quantity_mismatch_gauge.set(count)
```

### 3. Application Logs
```python
import logging

# Log all inventory operations
logger = logging.getLogger('inventory_operations')
logger.setLevel(logging.INFO)

# In InventoryOperations methods:
logger.info(f"COMBINE_SPARES: transaction_id={transaction_id}, pieces={len(spare_piece_ids)}, bundles={number_of_bundles}")
```

---

## Troubleshooting

### Issue 1: Migration Fails with "relation already exists"
**Solution**: Migration is idempotent - safe to re-run
```bash
# Check what already exists
psql tarko_inventory -c "\dt piece_lifecycle_events"

# If it exists, migration will use IF NOT EXISTS - no error
# If you need fresh start:
psql tarko_inventory -c "DROP TABLE IF EXISTS piece_lifecycle_events CASCADE;"

# Then re-run migration
psql tarko_inventory < migrations/001_comprehensive_refactoring.sql
```

### Issue 2: Trigger Error "created_by_transaction_id is immutable"
**Solution**: This is EXPECTED and CORRECT behavior!
```python
# This error means the trigger is working
# Make sure you're NOT trying to update created_by_transaction_id

# WRONG:
UPDATE sprinkler_spare_pieces
SET created_by_transaction_id = %s  # ← DON'T DO THIS!

# RIGHT:
# Don't touch created_by_transaction_id in UPDATE statements
UPDATE sprinkler_spare_pieces
SET status = 'SOLD_OUT'  # OK
WHERE id = %s
```

### Issue 3: Quantity Mismatches After Migration
**Solution**: Refresh materialized view and recalculate
```sql
-- Refresh materialized view
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_piece_current_state;

-- Force recalculate all stock quantities
-- The trigger will auto-update based on actual piece counts
UPDATE inventory_stock
SET updated_at = NOW()
WHERE stock_type IN ('SPARE', 'CUT_ROLL');

-- Verify
SELECT * FROM v_stock_quantity_validation WHERE quantity_mismatch != 0;
```

### Issue 4: Performance Degradation
**Solution**: Analyze and rebuild indexes
```sql
-- Analyze tables
ANALYZE hdpe_cut_pieces;
ANALYZE sprinkler_spare_pieces;
ANALYZE piece_lifecycle_events;

-- Rebuild indexes
REINDEX TABLE hdpe_cut_pieces;
REINDEX TABLE sprinkler_spare_pieces;

-- Vacuum tables
VACUUM ANALYZE hdpe_cut_pieces;
VACUUM ANALYZE sprinkler_spare_pieces;
```

---

## Rollback Procedure

If you need to rollback the migration:

```bash
# 1. Stop application
sudo systemctl stop tarko-backend

# 2. Restore from backup
psql tarko_inventory -c "DROP DATABASE tarko_inventory_backup;"
psql tarko_inventory -c "CREATE DATABASE tarko_inventory_backup;"
pg_restore -d tarko_inventory_backup backups/pre_refactoring_*.sql

# 3. Verify restored data
psql tarko_inventory_backup -c "SELECT COUNT(*) FROM sprinkler_spare_pieces;"

# 4. Switch to backup
psql -c "ALTER DATABASE tarko_inventory RENAME TO tarko_inventory_broken;"
psql -c "ALTER DATABASE tarko_inventory_backup RENAME TO tarko_inventory;"

# 5. Restart application with old code
git checkout HEAD~1  # Or previous commit
sudo systemctl start tarko-backend
```

---

## Success Criteria

✅ All tests pass
✅ No quantity mismatches in `v_stock_quantity_validation`
✅ All pieces have `created_by_transaction_id`
✅ Triggers prevent `created_by_transaction_id` mutation
✅ Lifecycle events logged for all operations
✅ COMBINE_SPARES preserves original creator
✅ Revert operations work correctly
✅ No performance degradation
✅ Application logs show no errors

---

## Next Steps

1. **Monitor for 48 hours** - Watch for any unexpected issues
2. **Run load tests** - Verify performance under load
3. **Update documentation** - Document new patterns for team
4. **Training** - Teach team about new `InventoryOperations` class
5. **Cleanup** - After 1 week, schedule cleanup of old lifecycle events

---

## Support

If issues arise:
1. Check logs: `tail -f /var/log/tarko-backend.log`
2. Check database: `SELECT * FROM v_stock_quantity_validation WHERE quantity_mismatch != 0`
3. Review audit trail: `SELECT * FROM v_piece_audit_trail ORDER BY created_at DESC LIMIT 100`
4. Contact: [Your contact info]
