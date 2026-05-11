# Batch Revert Procedure - Production Runbook

## Overview
When reverting a production batch, follow this procedure to ensure all inventory is properly cleaned up.

## Prerequisites
- Batch is marked as `status='PRODUCTION'` or `status='IN_PROGRESS'`
- You have admin access
- Reason for revert is documented

## Step-by-Step Procedure

### 1. Verify Batch State
```sql
SELECT
    id, batch_code, status, current_quantity,
    created_at, reverted_at, reverted_by
FROM batches
WHERE batch_code = 'HDPEPipe-OD32-PE63-PN6-TARKO-XXXX-XXX'
    AND deleted_at IS NULL;
```
Expected: `status='PRODUCTION'` or similar non-reverted state.

### 2. Identify Associated Stock
```sql
SELECT
    id, batch_id, stock_type, status, quantity,
    length_per_unit, deleted_at, created_at
FROM inventory_stock
WHERE batch_id = '<batch_id>'
    AND deleted_at IS NULL;
```
Expected: Multiple rows with `status='IN_STOCK'`, quantities > 0.

### 3. Revert Via API (Recommended)
```bash
curl -X POST http://localhost:5000/api/transactions/revert \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "txn_abc123"
  }'
```
API will:
- ✅ Use batch_id to identify ALL stock rows (no time-window)
- ✅ Cascade soft-delete child pieces (hdpe_cut_pieces, sprinkler_spare_pieces)
- ✅ Soft-delete parent stock rows
- ✅ Validate count before marking batch REVERTED
- ❌ **FAIL** if validation fails (no silent corruption)

### 4. Verify Revert Success
```sql
-- Check batch status
SELECT id, batch_code, status, reverted_at, reverted_by
FROM batches WHERE batch_code = 'HDPEPipe-...';
-- Expected: status='REVERTED', reverted_at is set

-- Check stock is soft-deleted
SELECT COUNT(*) FROM inventory_stock
WHERE batch_id = '<batch_id>'
    AND deleted_at IS NULL;
-- Expected: 0 rows (all soft-deleted)

-- Check child pieces are also soft-deleted
SELECT COUNT(*) FROM hdpe_cut_pieces
WHERE stock_id IN (SELECT id FROM inventory_stock WHERE batch_id = '<batch_id>')
    AND deleted_at IS NULL;
-- Expected: 0 rows
```

### 5. If Revert FAILS
**DO NOT revert manually.** If the API returns an error:

```json
{
  "error": "Stock cleanup failed: 5 rows exist but only 4 deleted. Revert aborted..."
}
```

This means:
1. ⚠️ Batch revert was **not committed** (status still PRODUCTION)
2. ⚠️ Some stock rows were **not deleted** (data inconsistency detected)
3. ✅ The system **prevented data corruption** by failing the entire operation

**Action:**
- Check logs for the specific stock IDs that failed
- Investigate why those rows couldn't be deleted
- Contact DevOps/Database team
- Do NOT force manual cleanup without investigation

## Monitoring & Alerts

### Daily Check for Orphaned Rows
```bash
# Admin endpoint that lists any orphaned SOLD_OUT rows
curl http://localhost:5000/api/admin/diagnose-orphaned-stock \
  -H "Authorization: Bearer $JWT_TOKEN"
```

Expected response: `{"orphan_count": 0}`

If > 0 orphans exist:
1. Investigate which batches they're from
2. Check batch revert history for failures
3. Run cleanup: `POST /api/admin/cleanup-orphaned-stock`
4. Create incident ticket

### Scheduled Job (DevOps)
Add a cron job to run daily:
```bash
# Check for orphans every day at 2 AM
0 2 * * * curl -s http://localhost:5000/api/admin/diagnose-orphaned-stock -H "Authorization: Bearer $ADMIN_TOKEN" | grep -q '"orphan_count": 0' || send_alert
```

## Database Protection

A trigger prevents invalid states:
```
CREATE TRIGGER trigger_prevent_orphaned_sold_out_stock
BEFORE INSERT OR UPDATE ON inventory_stock
FOR EACH ROW
EXECUTE FUNCTION prevent_orphaned_sold_out_stock();
```

This trigger **rejects** any attempt to:
- Set `status='SOLD_OUT'` without `deleted_at` being set
- Restore a SOLD_OUT row without investigation

## Root Cause Summary (What We Fixed)

**Old Logic (Broken):**
- Used `created_at ± 1 minute` time-window to find stock rows
- If stock was created/updated outside that window, deletion silently failed
- Batch still marked REVERTED anyway → orphans

**New Logic (Fixed):**
- Uses `batch_id = %s` as sole constraint (immutable reference)
- Validates deletion count before committing
- **FAILS** if validation fails (no silent corruption)

## Key Principles for Future Development

1. **Never use timestamps for data relationships** — Use IDs (batch_id, stock_id, etc.)
2. **Always validate critical operations** — Check row counts before marking complete
3. **Fail fast on validation failure** — Don't silently corrupt data
4. **Soft deletes need explicit validation** — deleted_at + status must be coordinated
5. **Test batch revert with test data regularly** — Create → revert → verify no orphans

## References
- See `docs/BATCH_REVERT_SAFEGUARDS.md` for technical deep-dive
- Backend code: `backend/routes/transaction_routes.py` (batch revert logic)
- Migration: `backend/migrations/prevent_orphaned_sold_out_stock.sql`
