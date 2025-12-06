# API Migration Guide: Type-Safe Frontend ↔ Backend Communication

## Overview

This guide helps migrate from the loose-typed `api.ts` to the strict-typed `api-typed.ts` system.

## Key Changes

### 1. Import Statement
```typescript
// OLD
import api from '@/lib/api';

// NEW
import * as api from '@/lib/api-typed';
import type * as API from '@/types/api';
```

### 2. Type Safety

All API calls now have strict TypeScript types that match backend exactly.

## Critical Backend Route Alignments

### 🔴 BREAKING CHANGES

#### 1. Dispatch Create Endpoint
**Backend Route:** `/api/dispatch/create-dispatch` (NOT `/create`)

```typescript
// OLD (INCORRECT)
dispatch.create({ customer_id, items })

// NEW (CORRECT)
dispatch.createDispatch({ customer_id, items })
```

#### 2. Transaction Revert
**Backend expects:** `transaction_ids` (array)

```typescript
// OLD (INCORRECT)
transactions.revert(transactionIds)

// NEW (CORRECT)
transactions.revert({ transaction_ids: transactionIds })
```

#### 3. Stock Update Endpoint
**Backend Route:** `/api/inventory/rolls/{id}` (NOT `/batches/{id}`)

```typescript
// OLD
inventory.updateRoll(rollId, data)

// NEW
inventory.updateStock(stockId, data)  // Renamed for clarity
```

#### 4. Return Create - Item Structure
**Backend expects specific item_type format:**

```typescript
interface ReturnItem {
  product_type_id: UUID;
  brand_id: UUID;
  parameters: Parameters;
  item_type: 'FULL_ROLL' | 'BUNDLE' | 'SPARE';  // Must match exactly
  quantity: number;

  // Type-specific arrays
  rolls?: { length_meters: number; notes?: string; }[];
  bundles?: { bundle_size: number; piece_length_meters: number; notes?: string; }[];
  spare_pieces?: { piece_count: number; piece_length_meters: number; notes?: string; }[];
}
```

#### 5. Dispatch Items - Updated Structure
**Backend expects:**

```typescript
interface DispatchItem {
  stock_id: UUID;
  product_variant_id: UUID;
  item_type: StockType;
  quantity: number;

  // Conditional fields based on item_type
  length_meters?: number;        // For FULL_ROLL
  piece_ids?: UUID[];            // For CUT_ROLL/CUT_PIECE
  bundle_size?: number;          // For BUNDLE
  pieces_per_bundle?: number;    // For BUNDLE
  spare_piece_ids?: UUID[];      // For SPARE_PIECES

  rate_per_unit?: number;
  amount?: number;
}
```

### ✅ Correct Endpoint Mappings

| Function | Frontend Call | Backend Route | Method |
|----------|---------------|---------------|--------|
| **Production** |
| Create batch | `production.createBatch()` | `/production/batch` | POST |
| Get history | `production.getHistory()` | `/production/history` | GET |
| Get details | `production.getDetails(id)` | `/production/history/{id}` | GET |
| **Dispatch** |
| Get available | `dispatch.getAvailableRolls()` | `/dispatch/available-rolls` | POST |
| Cut roll | `dispatch.cutRoll()` | `/dispatch/cut-roll` | POST |
| Cut bundle | `dispatch.cutBundle()` | `/dispatch/cut-bundle` | POST |
| Combine spares | `dispatch.combineSpares()` | `/dispatch/combine-spares` | POST |
| **Create dispatch** | `dispatch.createDispatch()` | `/dispatch/create-dispatch` | POST |
| Get summary | `dispatch.getProductsSummary()` | `/dispatch/products-summary` | GET |
| Get dispatches | `dispatch.getDispatches()` | `/dispatch/dispatches` | GET |
| Get details | `dispatch.getDispatchDetails(id)` | `/dispatch/dispatches/{id}` | GET |
| **Returns** |
| Create return | `returns.create()` | `/returns/create` | POST |
| Get history | `returns.getHistory()` | `/returns/history` | GET |
| Get details | `returns.getDetails(id)` | `/returns/history/{id}` | GET |
| Revert return | `returns.revert(id)` | `/returns/{id}/revert` | POST |
| **Scraps** |
| Create scrap | `scrap.create()` | `/scraps/create` | POST |
| Get history | `scrap.getHistory()` | `/scraps/history` | GET |
| Get details | `scrap.getDetails(id)` | `/scraps/history/{id}` | GET |
| Get reasons | `scrap.getReasons()` | `/scraps/reasons` | GET |
| Revert scrap | `scrap.revert(id)` | `/scraps/{id}/revert` | POST |
| **Inventory** |
| Get batches | `inventory.getBatches()` | `/inventory/batches` | GET |
| Update batch | `inventory.updateBatch(id, data)` | `/inventory/batches/{id}` | PUT |
| Update stock | `inventory.updateStock(id, data)` | `/inventory/rolls/{id}` | PUT |
| Split bundle | `inventory.splitBundle()` | `/inventory/split-bundle` | POST |
| Combine spares | `inventory.combineSpares()` | `/inventory/combine-spares` | POST |
| Search | `inventory.searchInventory()` | `/inventory/search` | GET |
| **Transactions** |
| Create | `transactions.create()` | `/transactions/` | POST |
| Get all | `transactions.getAll()` | `/transactions/` | GET |
| **Revert** | `transactions.revert({transaction_ids})` | `/transactions/revert` | POST |

## Stock Types Standardization

The backend uses these **exact** stock types:

```typescript
type StockType =
  | 'FULL_ROLL'      // Complete HDPE roll
  | 'CUT_ROLL'       // HDPE roll cut into pieces (parent record)
  | 'CUT_PIECE'      // Individual HDPE piece from cut
  | 'BUNDLE'         // Sprinkler bundle
  | 'SPARE'          // Sprinkler spare pieces (parent record)
  | 'SPARE_PIECES';  // Individual sprinkler spare (used in some contexts)
```

### Usage Rules:
- **Dispatch**: Use `FULL_ROLL`, `CUT_ROLL`, `BUNDLE`, `SPARE_PIECES`
- **Return**: Use `FULL_ROLL`, `BUNDLE`, `SPARE`
- **Scrap**: Can use any type
- **Inventory queries**: All types valid

## Common Pitfalls

### 1. Wrong Endpoint Path
```typescript
// ❌ WRONG
api.post('/dispatch/create', data)

// ✅ CORRECT
api.post('/dispatch/create-dispatch', data)
```

### 2. Missing Required Fields
```typescript
// ❌ WRONG - Missing item_type
dispatch.createDispatch({
  customer_id: 'uuid',
  items: [{ stock_id: 'uuid', quantity: 5 }]
})

// ✅ CORRECT
dispatch.createDispatch({
  customer_id: 'uuid',
  items: [{
    stock_id: 'uuid',
    product_variant_id: 'uuid',
    item_type: 'FULL_ROLL',
    quantity: 5
  }]
})
```

### 3. Incorrect Parameter Names
```typescript
// ❌ WRONG
transactions.revert({ transactionIds: [...] })

// ✅ CORRECT
transactions.revert({ transaction_ids: [...] })
```

### 4. Wrong Data Structure for Returns
```typescript
// ❌ WRONG
returns.create({
  items: [{
    type: 'BUNDLE',  // Wrong key
    bundles: 5       // Wrong structure
  }]
})

// ✅ CORRECT
returns.create({
  items: [{
    product_type_id: 'uuid',
    brand_id: 'uuid',
    parameters: { OD: '25mm' },
    item_type: 'BUNDLE',
    quantity: 5,
    bundles: [
      { bundle_size: 50, piece_length_meters: 6.0 },
      { bundle_size: 50, piece_length_meters: 6.0 },
      // ... 5 bundles total
    ]
  }]
})
```

## Migration Checklist

- [ ] Replace all `import api from '@/lib/api'` with typed version
- [ ] Update dispatch calls to use `createDispatch()`
- [ ] Fix transaction revert to use object with `transaction_ids`
- [ ] Verify all `item_type` values match backend enum
- [ ] Check return item structures match backend format
- [ ] Update stock update calls from `updateRoll` to `updateStock`
- [ ] Add proper TypeScript types to all API call sites
- [ ] Test each endpoint in development
- [ ] Verify error handling for type mismatches

## Type Import Pattern

```typescript
import * as api from '@/lib/api-typed';
import type * as API from '@/types/api';

// Usage
const createDispatch = async (data: API.CreateDispatchRequest) => {
  try {
    const result: API.DispatchResponse = await api.dispatch.createDispatch(data);
    return result;
  } catch (error) {
    // Type-safe error handling
  }
};
```

## Benefits

1. **Compile-time safety**: TypeScript catches mismatches before runtime
2. **IDE autocomplete**: Better developer experience
3. **Documentation**: Types serve as inline documentation
4. **Refactoring**: Safe renames and structure changes
5. **Backend alignment**: Guaranteed match with backend contracts

## Testing

After migration:

```typescript
// Test each endpoint type
const testProduction = async () => {
  const data: API.CreateProductionBatchRequest = {
    product_type_id: 'uuid',
    brand_id: 'uuid',
    parameters: { PE: '80', PN: '10', OD: '32mm' },
    batch_no: 'TEST-001',
    quantity: 100,
    production_date: new Date().toISOString(),
    roll_config_type: 'standard_rolls',
    number_of_rolls: 100,
    length_per_roll: 100
  };

  const result = await api.production.createBatch(data);
  console.log('Batch created:', result.batch_id);
};
```

## Support

For questions or issues:
1. Check `/src/types/api.ts` for complete type definitions
2. Check `/src/lib/api-typed.ts` for implementation
3. Review backend route files in `/backend/routes/`
4. Check this document's issue tracker
