# Extreme Workflow Tests Documentation

## Overview
Comprehensive backend unit tests for extreme multi-step workflows covering all possible combinations of mixed dispatches, returns, and scraps.

**Test File:** `test_extreme_workflows.py`
**Corresponds to:** Phase 9X in `COMPREHENSIVE_TEST_WORKFLOW.md`

---

## Business Rules Tested

### ✅ Production Rules
- **Single category only** per batch
- HDPE Pipe: Can have `FULL_ROLL` + `CUT_ROLL`
- Sprinkler Pipe: Can have `BUNDLE` + `SPARE` pieces

### ✅ Dispatch/Return Rules
- **ANY mix of categories and types allowed**
- Can combine HDPE + Sprinkler in same dispatch
- Can combine rolls + cut pieces + bundles + spares
- Returns follow same mixing rules as dispatches

### ✅ Scrap Rules (MOST RESTRICTIVE)
- **Single category AND single type only**
- Cannot mix HDPE + Sprinkler
- Cannot mix rolls + cut pieces (even if same category)
- Valid: Scrap all HDPE rolls, or all cut pieces, or all bundles, or all spares

---

## Test Structure

### Phase 1: Setup (`TestExtremeWorkflowSetup`)
Creates complete inventory:
- **BATCH-HDPE-001:** 20 HDPE rolls × 500m = 10,000m (2,000kg)
- **BATCH-HDPE-002:** 10 HDPE rolls × 400m = 4,000m (800kg)
- **BATCH-SPR-001:** 15 Sprinkler bundles × 30 pcs × 6m = 2,700m (891kg)
- **BATCH-SPR-002:** 10 Sprinkler bundles × 25 pcs × 6m = 1,500m (495kg)

**Tests:**
- `test_verify_inventory_setup()` - Verifies all batches created correctly

---

### Phase 2: Cut Operations (`TestStep1CutRolls`)
Cuts 5 HDPE rolls with different lengths:
- Roll 1: 500m → 200m cut + 300m remaining
- Roll 2: 500m → 150m cut + 350m remaining
- Roll 3: 500m → 100m cut + 400m remaining
- Roll 4: 500m → 250m cut + 250m remaining
- Roll 5: 500m → 180m cut + 320m remaining

**Tests:**
- `test_cut_five_rolls()` - Creates 10 cut pieces (5 cuts × 2 pieces each)

**P&C Checks:**
```sql
-- Verify 10 cut pieces created
SELECT COUNT(*) FROM hdpe_cut_pieces
WHERE deleted_at IS NULL;
-- Expected: 10

-- Verify total length preserved
SELECT SUM(length_meters) FROM hdpe_cut_pieces;
-- Expected: 2500m (5 rolls × 500m)
```

---

### Phase 3: Split Operations (`TestStep2SplitBundles`)
Splits 4 bundles from BATCH-SPR-001 into spare pieces:
- Bundle 1: 30 pcs → 30 spare pieces
- Bundle 2: 30 pcs → 30 spare pieces
- Bundle 3: 30 pcs → 30 spare pieces
- Bundle 4: 30 pcs → 30 spare pieces

**Tests:**
- `test_split_four_bundles()` - Creates 120 spare pieces

**P&C Checks:**
```sql
-- Verify 120 spare pieces created
SELECT COUNT(*) FROM sprinkler_spare_pieces
WHERE deleted_at IS NULL;
-- Expected: 120

-- Verify weight conservation
SELECT SUM(weight_grams)/1000 FROM sprinkler_spare_pieces;
-- Expected: 237.6kg (120 × 6m × 0.33kg/m)
```

---

### Phase 4: Mixed Dispatch (`TestStep3MixedDispatch`)
Creates **EXTREME mixed dispatch** with ALL 4 item types:
- 8 FULL_ROLL from BATCH-HDPE-001
- 3 FULL_ROLL from BATCH-HDPE-002
- 4 CUT pieces from BATCH-HDPE-001
- 5 BUNDLE from BATCH-SPR-001
- 3 BUNDLE from BATCH-SPR-002
- 50 SPARE pieces from BATCH-SPR-001

**Total:** 11 full rolls + 4 cuts + 8 bundles + 50 spares = 23 items

**Tests:**
- `test_mixed_dispatch_all_types()` - Creates dispatch with all combinations

**P&C Checks:**
```sql
-- Verify mixed products flag
SELECT mixed_products FROM dispatches WHERE id = ?;
-- Expected: true

-- Verify item types
SELECT item_type, COUNT(*) FROM dispatch_items
WHERE dispatch_id = ?
GROUP BY item_type;
-- Expected:
-- FULL_ROLL: 11
-- CUT_ROLL: 4
-- BUNDLE: 8
-- SPARE_PIECES: 1 (with quantity=50)

-- Verify all items DISPATCHED
SELECT COUNT(*) FROM inventory_stock
WHERE id IN (SELECT stock_id FROM dispatch_items WHERE dispatch_id = ?)
AND status = 'DISPATCHED';
```

---

### Phase 5: Mixed Return (`TestStep4MixedReturn`)
Returns partial items from mixed dispatch:
- 3 FULL_ROLL (HDPE)
- 2 CUT pieces (HDPE)
- 2 BUNDLE (Sprinkler)
- 15 SPARE pieces (Sprinkler)

**Tests:**
- `test_partial_mixed_return()` - Returns subset of dispatched items

**P&C Checks:**
```sql
-- Verify return created
SELECT status FROM returns WHERE id = ?;
-- Expected: RECEIVED or COMPLETED

-- Verify items returned to IN_STOCK
SELECT COUNT(*) FROM inventory_stock
WHERE id IN (SELECT stock_id FROM return_items WHERE return_id = ?)
AND status = 'IN_STOCK';
-- Expected: 5 (3 rolls + 2 bundles)

-- Verify spare pieces returned
SELECT COUNT(*) FROM sprinkler_spare_pieces
WHERE id IN (SELECT spare_piece_id FROM return_pieces WHERE return_id = ?)
AND status = 'IN_STOCK';
-- Expected: 15
```

---

### Phase 6: Scrap Operations (`TestStep5ScrapOperations`)
**4 Separate Scrap Operations** (each following single category + single type rule):

#### Scrap Operation 1: HDPE Full Rolls Only
- `test_scrap_hdpe_full_rolls_only()`
- Scraps 2 FULL_ROLL from returned items
- Reason: "Water damage during storage"

#### Scrap Operation 2: HDPE Cut Pieces Only
- `test_scrap_hdpe_cut_pieces_only()`
- Scraps 1 CUT piece (100m)
- Reason: "Crushed during handling"

#### Scrap Operation 3: Sprinkler Bundles Only
- `test_scrap_sprinkler_bundles_only()`
- Scraps 1 BUNDLE
- Reason: "UV degradation"

#### Scrap Operation 4: Sprinkler Spare Pieces Only
- `test_scrap_sprinkler_spare_pieces_only()`
- Scraps 10 SPARE pieces
- Reason: "Contaminated"

#### Business Rule Validation Tests
- `test_scrap_mixed_types_should_fail()` ❌
  - Tries to scrap HDPE roll + cut piece together
  - **Expected:** 400 Bad Request with "single type" error

- `test_scrap_mixed_categories_should_fail()` ❌
  - Tries to scrap HDPE roll + Sprinkler bundle together
  - **Expected:** 400 Bad Request with "single category" error

**P&C Checks:**
```sql
-- Verify 4 separate scrap records
SELECT COUNT(*) FROM scraps WHERE created_at::date = CURRENT_DATE;
-- Expected: 4

-- Verify each scrap has only 1 category + 1 type
SELECT s.id,
  COUNT(DISTINCT CASE
    WHEN si.product_type = 'HDPE Pipe' THEN 1
    WHEN si.product_type LIKE 'Sprinkler%' THEN 2
  END) as category_count,
  COUNT(DISTINCT si.stock_type) as type_count
FROM scraps s
LEFT JOIN scrap_items si ON s.id = si.scrap_id
GROUP BY s.id;
-- Expected: All rows have category_count=1 AND type_count=1

-- Verify items scrapped
SELECT COUNT(*) FROM inventory_stock
WHERE status = 'SCRAPPED' AND updated_at::date = CURRENT_DATE;
-- Expected: 3 (2 rolls + 1 bundle)

-- Verify cut pieces scrapped
SELECT COUNT(*) FROM hdpe_cut_pieces
WHERE status = 'SCRAPPED' AND updated_at::date = CURRENT_DATE;
-- Expected: 1

-- Verify spare pieces scrapped
SELECT COUNT(*) FROM sprinkler_spare_pieces
WHERE status = 'SCRAPPED' AND updated_at::date = CURRENT_DATE;
-- Expected: 10
```

---

### Phase 7: Revert Dispatch (`TestStep6RevertDispatch`)
Reverts the extreme mixed dispatch:
- Reason: "Incorrect customer - order was for Customer B"

**Tests:**
- `test_revert_mixed_dispatch()` - Reverts dispatch and restores all items

**P&C Checks:**
```sql
-- Verify dispatch reverted
SELECT status, reverted_at, revert_reason FROM dispatches WHERE id = ?;
-- Expected: status='REVERTED', reverted_at IS NOT NULL

-- Verify all non-scrapped items back to IN_STOCK
SELECT COUNT(*) FROM inventory_stock
WHERE id IN (SELECT stock_id FROM dispatch_items WHERE dispatch_id = ?)
AND status = 'IN_STOCK';

-- Verify transactions marked as reverted
SELECT COUNT(*) FROM inventory_transactions
WHERE dispatch_id = ? AND reverted_at IS NOT NULL;
-- Expected: Should equal number of dispatch_items
```

---

### Phase 8: Final Reconciliation (`TestFinalStateReconciliation`)
Complete integrity checks after all operations:

#### Test 1: No Orphaned Records
- `test_no_orphaned_records()`
- Checks for orphaned dispatch_items, cut_pieces, spare_pieces

```sql
-- Check orphaned dispatch_items
SELECT COUNT(*) FROM dispatch_items di
LEFT JOIN inventory_stock ist ON di.stock_id = ist.id
WHERE di.stock_id IS NOT NULL AND ist.id IS NULL;
-- Expected: 0

-- Check orphaned cut_pieces
SELECT COUNT(*) FROM hdpe_cut_pieces hcp
LEFT JOIN inventory_stock ist ON hcp.stock_id = ist.id
WHERE hcp.deleted_at IS NULL AND ist.id IS NULL;
-- Expected: 0

-- Check orphaned spare_pieces
SELECT COUNT(*) FROM sprinkler_spare_pieces ssp
LEFT JOIN inventory_stock ist ON ssp.stock_id = ist.id
WHERE ssp.deleted_at IS NULL AND ist.id IS NULL;
-- Expected: 0
```

#### Test 2: Weight Conservation
- `test_weight_conservation()`
- Verifies: Original Weight = Current Weight + Scrapped Weight

```sql
-- For each batch
SELECT
  (quantity * weight_per_meter) as original_weight,
  (SELECT SUM(weight) FROM inventory_stock WHERE batch_id = ?) as current_weight,
  (SELECT SUM(weight) FROM scrapped_items WHERE batch_id = ?) as scrapped_weight
FROM batches WHERE id = ?;
-- Expected: original_weight = current_weight + scrapped_weight (within tolerance)
```

#### Test 3: Transaction Audit Trail
- `test_transaction_audit_trail()`
- Verifies all transaction types present

```sql
SELECT transaction_type, COUNT(*)
FROM inventory_transactions
WHERE batch_code IN (test batch codes)
GROUP BY transaction_type;
-- Expected types: PRODUCTION, CUT_ROLL, SPLIT_BUNDLE, DISPATCH, RETURN, SCRAP
```

---

## Running the Tests

### Run All Extreme Workflow Tests
```bash
cd backend
pytest tests/test_extreme_workflows.py -v -s
```

### Run Specific Test Class
```bash
# Setup phase only
pytest tests/test_extreme_workflows.py::TestExtremeWorkflowSetup -v

# Mixed dispatch tests
pytest tests/test_extreme_workflows.py::TestStep3MixedDispatch -v

# Scrap validation tests
pytest tests/test_extreme_workflows.py::TestStep5ScrapOperations -v

# Final reconciliation
pytest tests/test_extreme_workflows.py::TestFinalStateReconciliation -v
```

### Run Specific Test
```bash
pytest tests/test_extreme_workflows.py::TestStep3MixedDispatch::test_mixed_dispatch_all_types -v -s
```

### Run with Coverage
```bash
pytest tests/test_extreme_workflows.py --cov=routes --cov=services --cov-report=html
```

### Run in Sequential Order (Recommended for First Run)
```bash
pytest tests/test_extreme_workflows.py -v -s --tb=short
```

---

## Test Dependencies

### Required Fixtures (from `conftest.py`)
- `client` - Flask test client
- `auth_headers` - Authorization headers with JWT token
- `get_product_type_id()` - Function to get product type IDs
- `get_brand_id()` - Function to get brand IDs
- `db_connection` - Database connection with transaction rollback

### Database State
Tests use **function-scoped** fixtures that rollback after each test class, but some tests depend on previous operations within the same workflow.

**Important:** Some tests (like `test_partial_mixed_return`) require a dispatch to exist first. Run tests in order or use fixtures that create dependencies.

---

## Expected Results Summary

| Test Phase | Success Criteria |
|------------|------------------|
| Setup | 4 batches created (HDPE × 2, SPR × 2) |
| Cut Rolls | 10 cut pieces from 5 rolls, length preserved |
| Split Bundles | 120 spare pieces from 4 bundles, weight preserved |
| Mixed Dispatch | 23 items dispatched (4 types), mixed_products=true |
| Mixed Return | 4 item types returned, status restored to IN_STOCK |
| Scrap - Valid | 4 separate scraps (1 per type), all succeed |
| Scrap - Invalid | 2 validation tests fail with 400 error |
| Revert | Dispatch reverted, items restored |
| Reconciliation | 0 orphaned records, weight conserved, audit trail complete |

---

## Troubleshooting

### Test Fails: "Not enough rolls/bundles available"
**Cause:** Previous test consumed inventory
**Solution:** Run `pytest tests/test_extreme_workflows.py::TestExtremeWorkflowSetup` first

### Test Fails: "No dispatch found to return from"
**Cause:** Dispatch test skipped or failed
**Solution:** Run tests in order or check dispatch creation logs

### Test Fails: Foreign key constraint violation
**Cause:** Database state inconsistent
**Solution:**
```bash
# Reset test database
psql -U tarko_user -d tarko_inventory_test -c "DELETE FROM inventory_transactions WHERE created_at::date = CURRENT_DATE"
psql -U tarko_user -d tarko_inventory_test -c "DELETE FROM dispatch_items WHERE created_at::date = CURRENT_DATE"
# ... etc (see conftest.py cleanup)
```

### Test Fails: "Scrap should reject mixed types" but returns 200
**Cause:** Backend not validating scrap business rules
**Solution:** Implement validation in `/api/scrap/create` endpoint:
```python
def validate_scrap_items(items):
    categories = set()
    types = set()
    for item in items:
        # Extract category and type from item
        categories.add(item['category'])
        types.add(item['item_type'])

    if len(categories) > 1:
        raise ValidationError("Scrap must contain single category only")
    if len(types) > 1:
        raise ValidationError("Scrap must contain single type only")
```

---

## Integration with CI/CD

Add to `.github/workflows/test.yml`:
```yaml
- name: Run Extreme Workflow Tests
  run: |
    cd backend
    pytest tests/test_extreme_workflows.py -v --junitxml=extreme-workflow-results.xml

- name: Upload Test Results
  uses: actions/upload-artifact@v3
  with:
    name: extreme-workflow-test-results
    path: backend/extreme-workflow-results.xml
```

---

## Performance Considerations

**Test Duration:** ~30-60 seconds for full suite
**Database Operations:** ~200-300 queries total
**Test Isolation:** Each test class uses fresh inventory via fixtures

**Optimization Tips:**
1. Use database transactions for faster rollback
2. Batch insert operations where possible
3. Use `pytest-xdist` for parallel execution (with caution - some tests have dependencies)

---

## Maintenance

### Adding New Item Types
1. Add to `extreme_inventory` fixture setup
2. Add to mixed dispatch test
3. Add separate scrap validation test
4. Update business rules documentation

### Modifying Business Rules
1. Update rule validation tests
2. Update expected error messages
3. Update documentation in this README
4. Update `COMPREHENSIVE_TEST_WORKFLOW.md`

---

## Related Documentation
- `COMPREHENSIVE_TEST_WORKFLOW.md` - Full manual testing workflow
- `conftest.py` - Test fixtures and setup
- `backend/routes/scrap.py` - Scrap validation implementation
- `backend/routes/dispatch.py` - Mixed dispatch implementation

---

**Last Updated:** December 6, 2025
**Author:** Tarko Development Team
**Version:** 1.0
