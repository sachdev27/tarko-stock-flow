# Inventory Routes Fix

## Date
November 23, 2025

## Problem
The `cut_roll` and `split_bundle` endpoints in `inventory_routes.py` were manually updating `inventory_stock.quantity` for piece-based stock types (`CUT_ROLL`, `SPARE`).
This was redundant and potentially dangerous because database triggers (`auto_update_stock_quantity`) already handle this.

Specifically, in `cut_roll` (when cutting from `FULL_ROLL`), the code was overwriting the quantity with `len(pieces_created)`, which would be incorrect if the `CUT_ROLL` stock already existed and had pieces (it would reset quantity to just the new pieces count).

## Solution
Removed manual quantity updates for piece-based stock types in `inventory_routes.py` and `inventory_helpers_aggregate.py`.

### Changes Made

1. **`cut_roll` endpoint** (in `inventory_routes.py`):
   - Removed manual increment of `CUT_ROLL` stock quantity.
   - Removed final manual update of `CUT_ROLL` stock quantity.
   - Relies on `auto_update_stock_quantity` trigger which fires when `hdpe_cut_pieces` are inserted.

2. **`split_bundle` endpoint** (in `inventory_routes.py`):
   - Removed manual update of `SPARE` stock quantity.
   - Relies on `auto_update_stock_quantity` trigger which fires when `sprinkler_spare_pieces` are inserted.

3. **`AggregateInventoryHelper`** (in `inventory_helpers_aggregate.py`):
   - Fixed `cut_hdpe_roll` to remove manual quantity updates.
   - Fixed `split_sprinkler_bundle` to remove manual quantity updates.

## Benefits
- **Prevents Data Corruption**: Avoids overwriting total quantity with partial counts.
- **Prevents Double Updates**: Avoids conflict between manual update and trigger.
- **Consistency**: Aligns with `DISPATCH_DOUBLE_DECREMENT_FIX.md` architecture principle.

## Verification
- `CUT_ROLL` creation/update now relies on triggers.
- `SPARE` creation/update now relies on triggers.
- `FULL_ROLL` and `BUNDLE` (simple stocks) still use manual updates where appropriate (e.g. decrementing source).
