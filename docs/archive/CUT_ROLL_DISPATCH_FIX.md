# Cut Roll Dispatch Fix

## Date
November 23, 2025

## Problem
Cut rolls were showing incorrectly in the dispatch frontend and being sent to the backend as FULL_ROLL instead of CUT_PIECE, causing the double-decrement bug.

## Root Cause Analysis

### Data Flow Issue

1. **Backend** (`/api/inventory/search`):
   - Groups cut pieces by length
   - Returns with `piece_ids` (plural, array): `['id1', 'id2', 'id3']`
   - Sets `quantity` = count of pieces in group
   - Example: `{ stock_type: 'CUT_ROLL', quantity: 5, length_meters: 100, piece_ids: [...] }`

2. **Frontend Cart** (`ProductSelectionSection.tsx` lines 360-398):
   - Adds cut pieces to cart with `piece_ids` array
   - Stores: `{ piece_ids: ['id1', 'id2'], quantity: 2, ... }`

3. **Dispatch Submission** (`DispatchNewModular.tsx` lines 273-278):
   - ❌ **BUG**: Checked for `roll.piece_id` (singular)
   - Cut rolls have `piece_ids` (plural array)
   - Failed check → Fell through to FULL_ROLL branch
   - Sent as item_type: 'FULL_ROLL' instead of 'CUT_PIECE'

4. **Backend Dispatch** (`dispatch_routes.py`):
   - Received FULL_ROLL with CUT_ROLL stock_type
   - Attempted manual quantity decrement
   - Trigger also decremented (double-decrement bug)

### The Mismatch

```typescript
// What backend sends
{
  piece_ids: ['abc-123', 'def-456', 'ghi-789'],  // Array
  quantity: 3
}

// What dispatch checked for
if (roll.piece_id) {  // ❌ Singular, undefined!
  // Never executed
}

// What actually happened
else {
  item_type: 'FULL_ROLL'  // ❌ Wrong!
}
```

## Solution

### Changes Made to `DispatchNewModular.tsx`

Changed the dispatch item formatting logic to:

1. **Check for `piece_ids` array first** (lines 282-292)
2. **Expand array to individual CUT_PIECE items** using `flatMap`
3. **Keep backward compatibility** with singular `piece_id`

**Before:**
```typescript
const items = selectedRolls.map(roll => {
  // ...
  if (roll.piece_id) {  // ❌ Only checks singular
    return {
      item_type: 'CUT_PIECE',
      cut_piece_id: roll.piece_id,
      // ...
    };
  }
  // Falls through to FULL_ROLL
});
```

**After:**
```typescript
const items = selectedRolls.flatMap(roll => {  // ✅ flatMap to expand arrays
  // ...

  // Check for array first
  if (roll.piece_ids && Array.isArray(roll.piece_ids) && roll.piece_ids.length > 0) {
    // Create one dispatch item per piece
    return roll.piece_ids.map(pieceId => ({
      stock_id: roll.id,
      product_variant_id: roll.product_variant_id,
      quantity: 1,
      item_type: 'CUT_PIECE' as const,
      cut_piece_id: pieceId,
      length_meters: roll.length_meters
    }));
  }

  // Backward compatibility with singular piece_id
  else if (roll.piece_id) {
    return [{
      item_type: 'CUT_PIECE' as const,
      cut_piece_id: roll.piece_id,
      // ...
    }];
  }

  // Other types wrapped in arrays for flatMap
  else {
    return [{ item_type: 'FULL_ROLL', ... }];
  }
});
```

### Key Changes

1. **Changed `map` to `flatMap`**: Allows expanding arrays of pieces into individual items
2. **Check `piece_ids` array first**: Primary path for cut rolls from search
3. **Expand to individual items**: Each piece gets its own dispatch item with `quantity: 1`
4. **Wrap all returns in arrays**: Required for `flatMap` to work
5. **Maintain backward compatibility**: Still handles singular `piece_id`

## How It Works Now

### Example: Dispatching 3 cut pieces of 100m

**Cart Item:**
```typescript
{
  id: 'stock-123',
  product_variant_id: 'variant-456',
  piece_ids: ['piece-1', 'piece-2', 'piece-3'],
  quantity: 3,
  length_meters: 100,
  stock_type: 'CUT_ROLL'
}
```

**Dispatch Items Sent to Backend:**
```typescript
[
  {
    stock_id: 'stock-123',
    product_variant_id: 'variant-456',
    item_type: 'CUT_PIECE',
    cut_piece_id: 'piece-1',
    quantity: 1,
    length_meters: 100
  },
  {
    stock_id: 'stock-123',
    product_variant_id: 'variant-456',
    item_type: 'CUT_PIECE',
    cut_piece_id: 'piece-2',
    quantity: 1,
    length_meters: 100
  },
  {
    stock_id: 'stock-123',
    product_variant_id: 'variant-456',
    item_type: 'CUT_PIECE',
    cut_piece_id: 'piece-3',
    quantity: 1,
    length_meters: 100
  }
]
```

**Backend Processing:**
```python
# For each CUT_PIECE item:
1. Updates hdpe_cut_pieces status = 'DISPATCHED'
2. Trigger recalculates inventory_stock.quantity (COUNT of IN_STOCK)
3. ✅ No manual quantity update (fixed in DISPATCH_DOUBLE_DECREMENT_FIX)
4. Result: Correct quantity, no double-decrement
```

## Benefits

### ✅ Correct Item Type
- Cut pieces now sent as `CUT_PIECE`, not `FULL_ROLL`
- Backend processes them correctly

### ✅ Granular Tracking
- Each physical piece gets its own dispatch item
- Better audit trail
- Matches one-record-per-piece architecture

### ✅ Prevents Double-Decrement
- Works with trigger-based quantity management
- Backend doesn't attempt manual quantity updates for piece-based stocks

### ✅ Data Integrity
- `inventory_stock.quantity` stays consistent
- `hdpe_cut_pieces.status` properly tracked
- Check constraints not violated

## Testing Checklist

- [x] Backend search returns cut pieces with `piece_ids` array
- [x] Frontend displays cut pieces correctly grouped by length
- [x] Adding cut pieces to cart works
- [x] Cart shows correct quantity and length
- [ ] **Dispatch submission creates CUT_PIECE items** (need to test)
- [ ] **Backend processes each piece individually** (need to test)
- [ ] **Inventory quantity decrements correctly** (need to test)
- [ ] **No double-decrement bug** (need to test)
- [ ] **Revert works correctly** (need to test)

## Related Issues

1. **Double-Decrement Bug** (`DISPATCH_DOUBLE_DECREMENT_FIX.md`)
   - Fixed backend to not manually update quantity for piece-based stocks
   - Triggers handle quantity automatically

2. **One-Record-Per-Piece Architecture** (`ONE_RECORD_PER_PIECE_MIGRATION.md`)
   - Moved spare pieces to one record per physical piece
   - Cut pieces were already individual but had this dispatch bug

3. **Event Sourcing Pattern**
   - Piece status changes tracked via triggers
   - Derived quantities calculated automatically
   - Application code shouldn't manually update derived values

## Architecture Principle

### Frontend → Backend Contract

**For Piece-Based Stocks (CUT_ROLL, SPARE):**
- Frontend sends array of individual piece items
- Each item has `quantity: 1` and specific piece ID
- Backend updates piece status, trigger handles stock quantity

**For Simple Stocks (BUNDLE, FULL_ROLL):**
- Frontend sends single item with total quantity
- Backend manually decrements inventory_stock.quantity
- No pieces table, no trigger automation

## Files Modified

- `/src/pages/DispatchNewModular.tsx` (lines 265-320)
  - Changed `map` to `flatMap`
  - Added `piece_ids` array handling
  - Expanded cut pieces to individual items
  - Wrapped all returns in arrays

## Next Steps

1. **Test full dispatch flow** with cut rolls
2. **Verify backend logs** show CUT_PIECE not FULL_ROLL
3. **Check database** after dispatch:
   - `hdpe_cut_pieces.status` = 'DISPATCHED'
   - `inventory_stock.quantity` = COUNT of remaining IN_STOCK pieces
   - `dispatch_items.item_type` = 'CUT_PIECE'
4. **Test revert operation** to ensure pieces status reverts correctly
5. **Monitor for any remaining issues** in production flow
