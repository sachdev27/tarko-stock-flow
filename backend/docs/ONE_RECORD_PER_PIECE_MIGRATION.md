# One-Record-Per-Piece Architecture - Migration Complete

## Summary of Changes

We've migrated from a **grouped spare pieces model** to a **one-record-per-physical-piece model** to eliminate semantic ambiguity and align with true event sourcing principles.

---

## What Changed

### Before (Grouped Model - Ambiguous):
```sql
-- One group record representing multiple pieces
inventory_stock (quantity=1)  -- "1 group"
  └─ sprinkler_spare_pieces (piece_count=50)  -- "50 pieces in the group"
```

**Problem:** `inventory_stock.quantity` didn't match actual piece count, causing confusion.

### After (One-Per-Piece Model - Clear):
```sql
-- One record per physical piece
inventory_stock (quantity=50)  -- "50 actual pieces"
  ├─ sprinkler_spare_pieces (piece_count=1) -- "piece 1"
  ├─ sprinkler_spare_pieces (piece_count=1) -- "piece 2"
  └─ ... (50 total records)
```

**Benefit:** `inventory_stock.quantity` = COUNT of actual pieces. No ambiguity.

---

## Files Modified

### 1. `/backend/routes/return_routes.py` ✅
**Lines 366-374:** Updated inventory_stock creation
- Changed `quantity=1` to `quantity=piece_count`
- Notes now reflect actual piece count

**Lines 460-485:** Updated spare piece creation
- **Sprinkler:** Now creates `piece_count` individual records (each with `piece_count=1`)
- **HDPE:** Already used one-per-piece, just added piece numbering
- Added piece numbering in notes for traceability

### 2. Database Triggers ✅
**File:** `/backend/scripts/update_triggers_one_per_piece.sql`

**`auto_update_stock_quantity()`:**
- Already used `COUNT(*)` for both sprinkler and HDPE
- No changes needed, but verified correctness

**`validate_spare_stock_quantity()`:**
- Updated error message: "Actual spare groups" → "Actual pieces"
- Logic unchanged (already used COUNT)

---

## Architecture Benefits

### ✅ True Event Sourcing
- Each physical piece has its own lifecycle
- Perfect audit trail per piece
- Immutable provenance tracking

### ✅ No Semantic Ambiguity
- `inventory_stock.quantity` = actual piece count
- One source of truth for "how many pieces"
- Clear to developers and users

### ✅ Simplified Logic
- No more COUNT vs SUM confusion
- Triggers are consistent and simple
- Dispatching individual pieces is straightforward

### ✅ Better Granularity
- Can track individual piece history
- Per-piece dispatch/return/damage tracking
- More detailed reporting possible

---

## Migration Path

### For Existing Data:
If you have existing sprinkler_spare_pieces with `piece_count > 1`, run:

```sql
-- Split grouped records into individual pieces
DO $$
DECLARE
  rec RECORD;
  i INTEGER;
BEGIN
  FOR rec IN
    SELECT id, stock_id, piece_count, status, notes,
           created_by_transaction_id, original_stock_id, version,
           deleted_at, deleted_by_transaction_id
    FROM sprinkler_spare_pieces
    WHERE piece_count > 1
  LOOP
    -- Create individual records
    FOR i IN 2..rec.piece_count LOOP
      INSERT INTO sprinkler_spare_pieces (
        stock_id, piece_count, status, notes,
        created_by_transaction_id, original_stock_id, version,
        deleted_at, deleted_by_transaction_id
      ) VALUES (
        rec.stock_id, 1, rec.status,
        COALESCE(rec.notes, '') || ' (split from group)',
        rec.created_by_transaction_id, rec.original_stock_id, 1,
        rec.deleted_at, rec.deleted_by_transaction_id
      );
    END LOOP;

    -- Update original to piece_count=1
    UPDATE sprinkler_spare_pieces
    SET piece_count = 1
    WHERE id = rec.id;
  END LOOP;

  -- Update inventory_stock quantities
  UPDATE inventory_stock ist
  SET quantity = (
    SELECT COUNT(*)
    FROM sprinkler_spare_pieces ssp
    WHERE ssp.stock_id = ist.id
      AND ssp.status = 'IN_STOCK'
      AND ssp.deleted_at IS NULL
  )
  WHERE stock_type = 'SPARE';
END $$;
```

### For New Code:
All new return operations automatically use one-record-per-piece. No changes needed.

---

## Testing Checklist

- [x] Return creation with spare pieces
- [ ] Production with spare pieces (verify split still works)
- [ ] Dispatch of spare pieces (partial and full)
- [ ] Revert dispatch of spare pieces
- [ ] Inventory queries showing correct counts
- [ ] Triggers validating correctly

---

## Future Enhancements

Now that we have one-record-per-piece:

1. **Per-piece damage tracking** - Mark individual pieces as damaged
2. **Per-piece quality control** - Track QC status per piece
3. **Enhanced audit** - See full lifecycle of each physical piece
4. **Better reporting** - Piece-level analytics and tracking

---

## Notes

- **Performance:** Minimal impact. Modern databases handle millions of rows efficiently.
- **Storage:** Slightly more rows, but better data integrity is worth it.
- **Compatibility:** Old code reading `piece_count` will see 1 per record (still correct sum).

---

## Conclusion

This is the **foundational architecture** that aligns with event sourcing principles:
- ✅ One record = One physical entity
- ✅ Immutable tracking per entity
- ✅ No semantic confusion
- ✅ Scalable and maintainable

The system now has a solid foundation for growth! 🎉
