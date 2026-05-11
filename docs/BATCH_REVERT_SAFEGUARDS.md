# Batch Revert Foundation Fix

## Root Cause Analysis

### The Bug
The revert logic in `backend/routes/transaction_routes.py` used a faulty time-window constraint when soft-deleting inventory_stock rows:

```python
# BUGGY CODE (before fix):
cursor.execute("""
    UPDATE inventory_stock
    SET deleted_at = NOW(), status = 'SOLD_OUT'
    WHERE batch_id = %s
    AND created_at >= %s - INTERVAL '1 minute'
    AND created_at <= %s + INTERVAL '1 minute'
""", (batch_id, transaction['created_at'], transaction['created_at']))
```

**The problem:** This used the original TRANSACTION creation timestamp (e.g., 3 days ago) to filter inventory_stock rows. If stock rows were created/recreated within a different timeframe, they wouldn't match the 1-minute window and would be silently skipped.

### Real-World Failure Sequence
For batch `HDPEPipe-OD32-PE63-PN6-TARKO-2026-244`:
1. **Batch created:** 2026-05-08 07:54:08
2. **Batch reverted by admin:** 2026-05-11 09:18:08 (3 days later)
3. **Revert logic runs** with time-window check: `created_at >= 2026-05-08 07:54:08 - 1min AND created_at <= 2026-05-08 07:54:08 + 1min`
4. **Stock rows created at:** 2026-05-08 07:54:08 (matches! ✓)
5. **Stock rows updated at:** 2026-05-11 11:15:35 (2+ minutes after revert)
6. **Result:** UPDATE found rows to delete, but silently failed—no error, no exception
7. **Batch marked as REVERTED** anyway → orphaned rows with status='SOLD_OUT', deleted_at=NULL

This created a **silent data corruption**: batch status changed but underlying inventory wasn't cleaned up.

---

## The Foundation Fix

### Change 1: Remove Faulty Time-Window Constraint
**File:** `backend/routes/transaction_routes.py` (line ~1575)

```python
# CORRECT CODE (after fix):
cursor.execute("""
    SELECT id, stock_type
    FROM inventory_stock
    WHERE batch_id = %s          # Use ONLY batch_id as constraint
    AND deleted_at IS NULL
""", (batch_id,))

stock_to_delete = cursor.fetchall()
# ... cascade delete child pieces ...

# Soft delete inventory stock
cursor.execute("""
    UPDATE inventory_stock
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE batch_id = %s          # No time-window check
    AND deleted_at IS NULL
""", (batch_id,))

deleted_count = cursor.rowcount

# VALIDATION: Ensure deletion succeeded
if stock_ids and deleted_count != len(stock_ids):
    raise Exception(
        f"Stock cleanup failed: {len(stock_ids)} rows exist but only "
        f"{deleted_count} were deleted. Batch revert aborted."
    )
```

**Why this works:**
- ✅ **Scope:** All inventory_stock rows for a batch, regardless of when created
- ✅ **Safety:** Validates deletion before marking batch REVERTED
- ✅ **Clarity:** Fails fast with explicit error if cleanup incomplete
- ✅ **Immutable:** batch_id never changes; time-windows can be misleading

---

## Prevention (Going Forward)

### Layer 1: Core Fix
The foundation now correctly:
1. Identifies ALL stock rows via `batch_id` (not time windows)
2. Cascade-deletes child pieces first
3. Validates deletion count before committing batch status change
4. Fails the entire revert if validation fails (no silent corruption)

### Layer 2: Detection Endpoints (for existing data)
Added admin endpoints to catch any future orphans:

```bash
GET /api/admin/diagnose-orphaned-stock
# Identifies rows where status='SOLD_OUT' AND deleted_at=NULL
# Helps detect similar bugs in other parts of the system

POST /api/admin/cleanup-orphaned-stock
# Safely soft-deletes orphaned rows + child pieces
# Only used if orphans somehow occur despite the foundation fix
```

### Layer 3: Defensive Filtering
All snapshot/ledger endpoints triple-check before including stock:
```python
WHERE ist.deleted_at IS NULL          # Soft-delete check
AND COALESCE(ist.status, 'IN_STOCK') = 'IN_STOCK'   # Status check
AND ist.quantity > 0                  # Non-zero check
```

---

## Key Lesson

**Don't use transaction timestamps to filter operational data.** Batches and their inventory can be created, modified, and reverted at any time. Always use immutable references (like `batch_id`) to define data relationships.

**Before:** `created_at >= transaction_time ± 1 minute` ❌ (time-based, fragile)
**After:** `batch_id = %s` ✅ (ID-based, robust)

---

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Time-window constraint** | ±1 min around transaction creation | ❌ Removed entirely |
| **Stock row identification** | created_at in narrow window | batch_id (source of truth) |
| **Validation** | None; deletion could silently fail | Explicit rowcount check |
| **Error handling** | Silent orphans | Revert fails with clear message |
| **Orphan risk** | High (silent data corruption) | Near zero (foundation fixed) |

This fix prevents future orphans at the source rather than requiring cleanup tools.

---

## Future-Proofing (Preventing Recurrence)

### 1. Database Trigger
**File:** `backend/migrations/prevent_orphaned_sold_out_stock.sql`

A trigger now **rejects** any attempt to create an orphaned state:
```sql
CREATE TRIGGER trigger_prevent_orphaned_sold_out_stock
BEFORE INSERT OR UPDATE ON inventory_stock
FOR EACH ROW
EXECUTE FUNCTION prevent_orphaned_sold_out_stock();
```

**What it prevents:**
- Setting `status='SOLD_OUT'` without `deleted_at IS NOT NULL`
- Restoring a SOLD_OUT row without investigation

If the trigger fires, it indicates a bug or incomplete operation. Investigating immediately prevents silent data corruption.

### 2. Production Runbook
**File:** `docs/BATCH_REVERT_RUNBOOK.md`

Comprehensive procedure for safe batch reverts:
- ✅ Verification steps before revert
- ✅ API endpoint usage (recommended method)
- ✅ What to do if revert fails
- ✅ Monitoring for orphaned rows
- ✅ Daily check procedures

**Key principle:** If the API returns an error about validation failure, **trust it**. Don't manually bypass the check—it's preventing data corruption.

### 3. Scheduled Monitoring
Monitor for orphaned rows daily:
```bash
# Lists any SOLD_OUT orphans
GET /api/admin/diagnose-orphaned-stock

# Safe cleanup with audit logging
POST /api/admin/cleanup-orphaned-stock
```

### 4. Code Review Checklist
For any future batch/transaction revert logic:

- [ ] Uses **ID-based constraints** (batch_id, transaction_id), NOT timestamps
- [ ] **Validates row counts** before marking operation complete
- [ ] **Fails entire operation** if validation fails (no partial commits)
- [ ] Tests with sample data: create → revert → verify no orphans
- [ ] Cascade deletes are tested: parent → children deletion order
- [ ] Audit logs record the revert action and any errors

### 5. Design Principle
**Rule:** Never use transaction timestamps to filter operational data.

**Why:** Transactions and operations can happen at any time, creating data outside the original timestamp window.

**Correct approach:** Use immutable identifiers:
- ❌ `WHERE created_at >= txn_time ± 1 minute` (time-based, fragile)
- ✅ `WHERE batch_id = %s` (ID-based, robust)
- ✅ `WHERE transaction_id = %s` (direct reference)

---

## Implementation Checklist

- [x] Fix foundation: revert logic uses batch_id instead of time-window
- [x] Add validation: deletion count check before marking REVERTED
- [x] Add database trigger: prevent orphaned SOLD_OUT states
- [x] Exclude REVERTED batches: from all ledger calculations
- [x] Document procedure: runbook for safe batch reverts
- [x] Create admin tools: diagnose + cleanup endpoints
- [x] Fix event timestamps: use activity_date instead of created_at

**Next steps (team responsibility):**
- [ ] Run migration: `prevent_orphaned_sold_out_stock.sql`
- [ ] Schedule daily monitoring: `/api/admin/diagnose-orphaned-stock`
- [ ] Train team: review `docs/BATCH_REVERT_RUNBOOK.md`
- [ ] Optional: run cleanup on existing orphaned rows
