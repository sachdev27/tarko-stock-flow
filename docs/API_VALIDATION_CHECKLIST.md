# API Type Safety Validation Checklist

Use this checklist to ensure your API calls are properly typed and aligned with the backend.

## Pre-Integration Checklist

### Setup
- [ ] `/src/types/api.ts` exists and is complete
- [ ] `/src/lib/api-typed.ts` exists and imports types
- [ ] TypeScript `strict` mode enabled in `tsconfig.json`
- [ ] `@types` dependencies installed

### Imports
```typescript
// ✅ Correct
import * as api from '@/lib/api-typed';
import type * as API from '@/types';

// ❌ Incorrect
import api from '@/lib/api';  // Old loose-typed version
```

## Per-Endpoint Validation

### 1. Production Batch Creation

#### Request Structure ✅
```typescript
const request: API.CreateProductionBatchRequest = {
  product_type_id: string,         // ✅ UUID format
  brand_id: string,                 // ✅ UUID format
  parameters: object,               // ✅ Key-value pairs
  batch_no: string,                 // ✅ Unique identifier
  quantity: number,                 // ✅ Total quantity
  production_date: string,          // ✅ ISO8601 format

  // HDPE specific (optional)
  roll_config_type?: string,        // ✅ 'standard_rolls' | 'quantity_based' | 'length_based'
  number_of_rolls?: number,         // ✅ If standard_rolls
  length_per_roll?: number,         // ✅ Meters per roll

  // Sprinkler specific (optional)
  number_of_bundles?: number,       // ✅ Bundle count
  bundle_size?: number,             // ✅ Pieces per bundle
  pieces_per_bundle?: number,       // ✅ Alias for bundle_size
  piece_length_meters?: number,     // ✅ Length of each piece
};
```

#### Validation Rules
- [ ] `product_type_id` is valid UUID
- [ ] `brand_id` is valid UUID
- [ ] `production_date` is ISO8601 formatted
- [ ] Either roll OR bundle config provided (not both)
- [ ] `quantity` matches calculated total
- [ ] `batch_no` is unique

### 2. Dispatch Creation

#### Request Structure ✅
```typescript
const request: API.CreateDispatchRequest = {
  customer_id: string,              // ✅ UUID format
  invoice_number?: string,          // ✅ Optional
  dispatch_date?: string,           // ✅ ISO8601 format
  notes?: string,                   // ✅ Optional
  items: API.DispatchItem[],        // ✅ Array of items

  // Transport details (optional)
  vehicle_id?: string,              // ✅ UUID
  transport_id?: string,            // ✅ UUID
  bill_to_id?: string,              // ✅ UUID
  lr_number?: string,               // ✅ LR number
  lr_date?: string,                 // ✅ ISO8601
  freight_amount?: number,          // ✅ Decimal
};
```

#### Dispatch Item Structure ✅
```typescript
const item: API.DispatchItem = {
  stock_id: string,                 // ✅ UUID - REQUIRED
  product_variant_id: string,       // ✅ UUID - REQUIRED
  item_type: StockType,             // ✅ Enum - REQUIRED
  quantity: number,                 // ✅ Count - REQUIRED

  // Type-specific fields
  length_meters?: number,           // ✅ For FULL_ROLL
  piece_ids?: string[],             // ✅ For CUT_ROLL
  bundle_size?: number,             // ✅ For BUNDLE
  pieces_per_bundle?: number,       // ✅ For BUNDLE
  spare_piece_ids?: string[],       // ✅ For SPARE_PIECES

  // Pricing (optional)
  rate_per_unit?: number,           // ✅ Price per unit
  amount?: number,                  // ✅ Total amount
};
```

#### Validation Rules
- [ ] `customer_id` is valid UUID
- [ ] Each item has `stock_id`, `product_variant_id`, `item_type`, `quantity`
- [ ] `item_type` is one of: `FULL_ROLL`, `CUT_ROLL`, `BUNDLE`, `SPARE_PIECES`
- [ ] Type-specific fields match `item_type`
- [ ] `piece_ids` array provided when `item_type === 'CUT_ROLL'`
- [ ] `spare_piece_ids` provided when `item_type === 'SPARE_PIECES'`
- [ ] `quantity` matches array lengths where applicable

### 3. Return Creation

#### Request Structure ✅
```typescript
const request: API.CreateReturnRequest = {
  customer_id: string,              // ✅ UUID format
  return_date?: string,             // ✅ ISO8601 format
  notes?: string,                   // ✅ Optional
  items: API.ReturnItem[],          // ✅ Array of items
};
```

#### Return Item Structure ✅
```typescript
const item: API.ReturnItem = {
  product_type_id: string,          // ✅ UUID - REQUIRED
  brand_id: string,                 // ✅ UUID - REQUIRED
  parameters: object,               // ✅ Parameters - REQUIRED
  item_type: StockType,             // ✅ Enum - REQUIRED
  quantity: number,                 // ✅ Count - REQUIRED

  // Type-specific arrays (one must match item_type)
  rolls?: Array<{                   // ✅ For item_type='FULL_ROLL'
    length_meters: number,
    notes?: string
  }>,
  bundles?: Array<{                 // ✅ For item_type='BUNDLE'
    bundle_size: number,
    piece_length_meters: number,
    notes?: string
  }>,
  spare_pieces?: Array<{            // ✅ For item_type='SPARE'
    piece_count: number,
    piece_length_meters: number,
    notes?: string
  }>,
};
```

#### Validation Rules
- [ ] `customer_id` is valid UUID
- [ ] Each item has product identification (`product_type_id`, `brand_id`, `parameters`)
- [ ] `item_type` is one of: `FULL_ROLL`, `BUNDLE`, `SPARE`
- [ ] Corresponding array (`rolls`/`bundles`/`spare_pieces`) provided
- [ ] Array length matches `quantity`
- [ ] All array items have required fields

### 4. Scrap Creation

#### Request Structure ✅
```typescript
const request: API.CreateScrapRequest = {
  scrap_date?: string,              // ✅ ISO8601 format
  reason: string,                   // ✅ REQUIRED
  notes?: string,                   // ✅ Optional
  items: API.ScrapItem[],           // ✅ Array - REQUIRED
};
```

#### Scrap Item Structure ✅
```typescript
const item: API.ScrapItem = {
  stock_id: string,                 // ✅ UUID - REQUIRED
  quantity_to_scrap: number,        // ✅ Count - REQUIRED
  piece_ids?: string[],             // ✅ For CUT_ROLL or SPARE
  estimated_value?: number,         // ✅ Optional
  notes?: string,                   // ✅ Optional
};
```

#### Validation Rules
- [ ] `reason` is non-empty string
- [ ] Each item has `stock_id` and `quantity_to_scrap`
- [ ] `piece_ids` provided when scrapping cut rolls or spares
- [ ] `quantity_to_scrap` ≤ available quantity

### 5. Transaction Revert

#### Request Structure ✅
```typescript
const request: API.RevertTransactionRequest = {
  transaction_ids: string[],        // ✅ Array of UUIDs - REQUIRED
};
```

#### Validation Rules
- [ ] `transaction_ids` is non-empty array
- [ ] All IDs are valid UUIDs
- [ ] All transactions are revertible status

## Type Safety Tests

### Compile-Time Tests
```typescript
// Should compile ✅
const validRequest: API.CreateDispatchRequest = {
  customer_id: 'uuid',
  items: [{
    stock_id: 'uuid',
    product_variant_id: 'uuid',
    item_type: 'FULL_ROLL',
    quantity: 5
  }]
};

// Should NOT compile ❌
const invalidRequest: API.CreateDispatchRequest = {
  customer_id: 'uuid',
  items: [{
    stock_id: 'uuid',
    // Missing product_variant_id
    item_type: 'INVALID_TYPE',  // Not in enum
    quantity: 5
  }]
};
```

### Runtime Validation
```typescript
// Validate UUIDs
const isValidUUID = (uuid: string): boolean => {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
};

// Validate ISO8601 dates
const isValidISO8601 = (date: string): boolean => {
  return !isNaN(Date.parse(date));
};

// Validate stock type
const isValidStockType = (type: string): type is API.StockType => {
  return ['FULL_ROLL', 'CUT_ROLL', 'CUT_PIECE', 'BUNDLE', 'SPARE', 'SPARE_PIECES'].includes(type);
};
```

## Common Validation Failures

### 1. Missing Required Field
```typescript
// ❌ ERROR: Property 'product_variant_id' is missing
const item = {
  stock_id: 'uuid',
  item_type: 'FULL_ROLL',
  quantity: 5
};

// ✅ FIXED
const item: API.DispatchItem = {
  stock_id: 'uuid',
  product_variant_id: 'uuid',  // Added
  item_type: 'FULL_ROLL',
  quantity: 5
};
```

### 2. Wrong Enum Value
```typescript
// ❌ ERROR: Type '"roll"' is not assignable to type 'StockType'
const item_type = 'roll';

// ✅ FIXED
const item_type: API.StockType = 'FULL_ROLL';
```

### 3. Wrong Structure
```typescript
// ❌ ERROR: Expected object with transaction_ids property
api.transactions.revert(['uuid1', 'uuid2']);

// ✅ FIXED
api.transactions.revert({ transaction_ids: ['uuid1', 'uuid2'] });
```

### 4. Type-Specific Field Mismatch
```typescript
// ❌ ERROR: spare_piece_ids provided but item_type is FULL_ROLL
const item: API.DispatchItem = {
  stock_id: 'uuid',
  product_variant_id: 'uuid',
  item_type: 'FULL_ROLL',
  quantity: 5,
  spare_piece_ids: ['uuid1']  // Wrong for FULL_ROLL
};

// ✅ FIXED
const item: API.DispatchItem = {
  stock_id: 'uuid',
  product_variant_id: 'uuid',
  item_type: 'FULL_ROLL',
  quantity: 5,
  length_meters: 100  // Correct for FULL_ROLL
};
```

## Integration Testing

### Test Each Endpoint
```typescript
describe('API Type Safety', () => {
  it('Production: should create batch with valid data', async () => {
    const data: API.CreateProductionBatchRequest = { /* ... */ };
    const result = await api.production.createBatch(data);
    expect(result.batch_id).toBeDefined();
  });

  it('Dispatch: should create dispatch with valid data', async () => {
    const data: API.CreateDispatchRequest = { /* ... */ };
    const result = await api.dispatch.createDispatch(data);
    expect(result.dispatch_id).toBeDefined();
  });

  it('Returns: should create return with valid data', async () => {
    const data: API.CreateReturnRequest = { /* ... */ };
    const result = await api.returns.create(data);
    expect(result.return_id).toBeDefined();
  });
});
```

## Final Validation

### Before Deployment
- [ ] All components use `api-typed.ts`
- [ ] No TypeScript compilation errors
- [ ] All API calls wrapped in try-catch
- [ ] Loading states implemented
- [ ] Error messages user-friendly
- [ ] Types match backend exactly
- [ ] Integration tests pass
- [ ] Manual testing completed

### Post-Deployment Monitoring
- [ ] Watch for 400 errors (validation failures)
- [ ] Monitor 500 errors (server issues)
- [ ] Check API response times
- [ ] Verify data integrity
- [ ] Review error logs

## Support

If validation fails:
1. Check `/docs/API_MIGRATION_GUIDE.md`
2. Review `/docs/API_QUICK_REFERENCE.md`
3. Inspect `/src/types/api.ts` for exact types
4. Compare with backend route in `/backend/routes/`
5. Use TypeScript compiler error messages as guide
