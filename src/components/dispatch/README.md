# Dispatch Module - Modular Architecture

## Overview
The dispatch system has been redesigned with a modular, reusable component architecture for better maintainability, testability, and scalability.

## Structure

```
src/components/dispatch/
├── SearchableCombobox.tsx          # Reusable searchable dropdown with create functionality
├── CustomerDetailsSection.tsx      # Customer info form section
├── ProductSelectionSection.tsx     # Product selection and roll management
├── useKeyboardShortcuts.tsx        # Keyboard shortcut management hook
├── dispatchAPI.ts                  # API client for dispatch operations
└── useDispatchData.ts              # Custom hook for data fetching/management

src/pages/
└── DispatchNewModular.tsx          # Main dispatch page using modular components
```

## Components

### 1. SearchableCombobox
**Purpose**: Reusable dropdown with search and inline creation

**Features**:
- Type-ahead search
- Create new entries by pressing Tab
- Keyboard navigation (Enter, Escape, Tab)
- Click-outside to close
- Customizable display format and filter function

**Usage**:
```tsx
<SearchableCombobox
  value={selectedId}
  onChange={setSelectedId}
  options={dataList}
  placeholder="Search or create..."
  onCreateNew={handleCreate}
  displayFormat={(item) => item.name}
/>
```

### 2. CustomerDetailsSection
**Purpose**: Encapsulates all customer-related form fields

**Fields**:
- Customer (with city) *required
- Bill To
- Transport
- Vehicle
- Notes

**Features**:
- Integrated create functionality
- Proper form validation
- Reference support for keyboard navigation

### 3. ProductSelectionSection
**Purpose**: Product search and roll selection interface

**Features**:
- Product type dropdown
- Product search with format hints
- Available rolls grid display
- Selected rolls list with removal
- Real-time totals

### 4. useKeyboardShortcuts
**Purpose**: Centralized keyboard shortcut management

**Shortcuts**:
- `Ctrl+H`: Jump to Customer field
- `Ctrl+P`: Jump to Product Type
- `Ctrl+Shift+P`: Jump to Product Search

**Usage**:
```tsx
useKeyboardShortcuts({
  shortcuts: [
    { key: 'h', ctrl: true, action: () => focusCustomer(), description: 'Customer' }
  ]
});
```

### 5. dispatchAPI
**Purpose**: Centralized API client for all dispatch operations

**Methods**:
- `fetchCustomers(search?)`
- `createCustomer(data)`
- `fetchBillToList(search?)`
- `createBillTo(data)`
- `fetchTransports(search?)`
- `createTransport(data)`
- `fetchVehicles(search?)`
- `createVehicle(data)`
- `fetchProductTypes()`
- `searchProducts(params)`
- `dispatchSale(data)`

**Usage**:
```tsx
const api = new DispatchAPI(token);
const customers = await api.fetchCustomers();
await api.dispatchSale({ customer_id, rolls });
```

### 6. useDispatchData
**Purpose**: React hook for managing all dispatch-related data

**Returns**:
- State: `customers`, `billToList`, `transports`, `vehicles`, `productTypes`
- Fetch functions: `fetchCustomers()`, `fetchBillToList()`, etc.
- Create functions: `createCustomer()`, `createBillTo()`, etc.
- API instance

**Usage**:
```tsx
const {
  customers,
  fetchCustomers,
  createCustomer,
  api
} = useDispatchData(token);
```

## Backend API Endpoints

### New Endpoints Added:
```
GET    /api/bill-to              # List bill-to entities
POST   /api/bill-to              # Create bill-to
GET    /api/transports           # List transports
POST   /api/transports           # Create transport
GET    /api/vehicles             # List vehicles
POST   /api/vehicles             # Create vehicle
GET    /api/product-aliases      # List product aliases
POST   /api/product-aliases      # Create alias
```

## Database Schema

### New Tables:
```sql
-- Bill To entities
CREATE TABLE bill_to (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT,
  gstin TEXT,
  address TEXT,
  contact_person TEXT,
  phone TEXT,
  email TEXT
);

-- Transport companies
CREATE TABLE transports (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  contact_person TEXT,
  phone TEXT
);

-- Vehicles
CREATE TABLE vehicles (
  id UUID PRIMARY KEY,
  vehicle_number TEXT NOT NULL UNIQUE,
  vehicle_type TEXT,
  driver_name TEXT,
  driver_phone TEXT
);

-- Product aliases for quick search
CREATE TABLE product_aliases (
  id UUID PRIMARY KEY,
  product_variant_id UUID REFERENCES product_variants(id),
  alias TEXT NOT NULL,
  UNIQUE(product_variant_id, alias)
);
```

### Modified Tables:
```sql
-- Added to customers table
ALTER TABLE customers ADD COLUMN city TEXT;

-- Added to transactions table
ALTER TABLE transactions ADD COLUMN bill_to_id UUID;
ALTER TABLE transactions ADD COLUMN transport_id UUID;
ALTER TABLE transactions ADD COLUMN vehicle_id UUID;
```

## Workflow

### 1. Customer Details Entry
1. User focuses on customer field (auto-focus on load)
2. Types to search existing customers
3. If not found, presses Tab to create new (format: Name - City)
4. Tabs through Bill To, Transport, Vehicle (all optional)
5. Optionally adds notes

### 2. Product Selection
1. Press Ctrl+P to jump to product type
2. Select or search for product type
3. Tab to product search field
4. Enter search criteria or product alias
5. Press Enter to search
6. Click available rolls to add to selection
7. Review selected rolls, remove if needed

### 3. Dispatch
1. Review summary (totals, customer, transport)
2. Click "Dispatch Sale"
3. Form resets and focuses on customer field
4. Ready for next dispatch

## Benefits of Modular Architecture

1. **Reusability**: Components can be used in other parts of the application
2. **Testability**: Each component can be tested in isolation
3. **Maintainability**: Changes to one component don't affect others
4. **Scalability**: Easy to add new features or modify existing ones
5. **Type Safety**: TypeScript interfaces for better IDE support
6. **Separation of Concerns**: Logic, UI, and data management are separated
7. **Performance**: Optimized re-renders with proper memoization

## Future Enhancements

1. Add product alias auto-suggestion
2. Implement barcode scanning for rolls
3. Add batch dispatch for multiple customers
4. Include dispatch history and editing
5. Add print dispatch note functionality
6. Implement dispatch tracking
7. Add validation for roll availability
8. Include customer credit limit checks
