# API Quick Reference Card

## Import Pattern

```typescript
import * as api from '@/lib/api-typed';
import type * as API from '@/types';
```

## Common Operations

### 🏭 Production

```typescript
// Create batch
const batch = await api.production.createBatch({
  product_type_id: 'uuid',
  brand_id: 'uuid',
  parameters: { PE: '80', PN: '10', OD: '32mm' },
  batch_no: 'BATCH-001',
  quantity: 100,
  production_date: new Date().toISOString(),
  roll_config_type: 'standard_rolls',
  number_of_rolls: 100,
  length_per_roll: 100
});
```

### 📦 Dispatch

```typescript
// Create dispatch
const dispatch = await api.dispatch.createDispatch({
  customer_id: 'uuid',
  invoice_number: 'INV-001',
  items: [{
    stock_id: 'uuid',
    product_variant_id: 'uuid',
    item_type: 'FULL_ROLL',
    quantity: 5,
    length_meters: 100,
    rate_per_unit: 50,
    amount: 250
  }]
});
```

### ↩️ Returns

```typescript
// Create return
const ret = await api.returns.create({
  customer_id: 'uuid',
  return_date: new Date().toISOString(),
  items: [{
    product_type_id: 'uuid',
    brand_id: 'uuid',
    parameters: { OD: '25mm' },
    item_type: 'BUNDLE',
    quantity: 3,
    bundles: [
      { bundle_size: 50, piece_length_meters: 6.0 },
      { bundle_size: 50, piece_length_meters: 6.0 },
      { bundle_size: 50, piece_length_meters: 6.0 }
    ]
  }]
});
```

### 🗑️ Scrap

```typescript
// Create scrap
const scrap = await api.scrap.create({
  scrap_date: new Date().toISOString(),
  reason: 'Damaged',
  items: [{
    stock_id: 'uuid',
    quantity_to_scrap: 2,
    estimated_value: 100
  }]
});
```

### 🔄 Transactions

```typescript
// Revert transactions
const result = await api.transactions.revert({
  transaction_ids: ['uuid1', 'uuid2']
});
```

## Stock Types

| Type | Use Case | Example |
|------|----------|---------|
| `FULL_ROLL` | Complete HDPE roll | 100m roll |
| `CUT_ROLL` | Cut HDPE roll | Roll cut into pieces |
| `CUT_PIECE` | Individual piece | 5m piece from cut |
| `BUNDLE` | Sprinkler bundle | 50 pieces bundled |
| `SPARE` | Spare pieces | Loose sprinkler pieces |
| `SPARE_PIECES` | Dispatch spares | Individual spares |

## Common Patterns

### Error Handling

```typescript
try {
  const result = await api.dispatch.createDispatch(data);
  console.log('Success:', result.dispatch_id);
} catch (error) {
  if (axios.isAxiosError(error)) {
    console.error('API Error:', error.response?.data?.error);
  }
}
```

### With Loading State

```typescript
const [loading, setLoading] = useState(false);

const handleSubmit = async (data: API.CreateDispatchRequest) => {
  setLoading(true);
  try {
    const result = await api.dispatch.createDispatch(data);
    return result;
  } finally {
    setLoading(false);
  }
};
```

### Type-Safe Forms

```typescript
const [formData, setFormData] = useState<API.CreateDispatchRequest>({
  customer_id: '',
  items: []
});

// TypeScript ensures all required fields are present
const handleSubmit = () => api.dispatch.createDispatch(formData);
```

## Endpoints Quick List

### Production
- `createBatch(data)` → Create production batch
- `getHistory(params?)` → Get batch history
- `getDetails(id)` → Get batch details

### Dispatch
- `getAvailableRolls(data)` → Search available stock
- `cutRoll(data)` → Cut HDPE roll
- `cutBundle(data)` → Split bundle
- `createDispatch(data)` → Create dispatch
- `getDispatches(params?)` → List dispatches
- `getDispatchDetails(id)` → Get dispatch details

### Returns
- `create(data)` → Create return
- `getHistory(params?)` → List returns
- `getDetails(id)` → Get return details
- `revert(id)` → Cancel return

### Scraps
- `create(data)` → Create scrap
- `getHistory(params?)` → List scraps
- `getDetails(id)` → Get scrap details
- `revert(id)` → Revert scrap

### Inventory
- `getBatches()` → List all batches
- `searchInventory(params)` → Search stock
- `splitBundle(data)` → Split bundle
- `combineSpares(data)` → Combine spares

### Transactions
- `create(data)` → Create transaction
- `getAll(params?)` → List transactions
- `revert(data)` → Revert transactions

## Tips

1. **Always use types:** `const data: API.CreateDispatchRequest = { ... }`
2. **Check required fields:** IDE will show errors for missing fields
3. **Use enums:** `item_type: 'FULL_ROLL'` not `'roll'`
4. **Handle errors:** Wrap in try-catch
5. **Loading states:** Show UI feedback during API calls

## Debug Checklist

- [ ] Correct import from `api-typed`
- [ ] All required fields present
- [ ] Correct `item_type` enum value
- [ ] UUID format for IDs
- [ ] ISO8601 format for dates
- [ ] snake_case for backend params
- [ ] Array format for nested items

## Common Errors

### "Missing required field"
→ Check interface definition, add missing field

### "Type 'X' is not assignable to 'Y'"
→ Check enum values match exactly

### "Cannot find module '@/lib/api-typed'"
→ Use correct import path

### "Property 'X' does not exist"
→ Update to latest types, check API version
