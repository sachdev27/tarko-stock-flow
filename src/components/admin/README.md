# Admin Page Components

This directory contains modular components for the Admin page, breaking down the previously monolithic 2282-line file into maintainable, reusable components.

## Components Created

### BrandsTab.tsx
- Manages product brands (add, delete)
- Self-contained with own state management
- Props: `brands`, `onDataChange`

### ProductTypesTab.tsx
- Manages product types with parameters and roll configurations
- Handles HDPE and Sprinkler special cases (no edit/delete)
- Complex form with parameter schema and roll configuration
- Props: `productTypes`, `units`, `onDataChange`

## File Size Reduction
- **Before**: 2282 lines (Admin.tsx)
- **After**: 1897 lines (Admin.tsx) + component files
- **Savings**: 385 lines removed from main file

## Usage

```tsx
import { BrandsTab } from '@/components/admin/BrandsTab';
import { ProductTypesTab } from '@/components/admin/ProductTypesTab';

// In Admin.tsx
<TabsContent value="brands">
  <BrandsTab brands={brands} onDataChange={fetchAllData} />
</TabsContent>

<TabsContent value="products">
  <ProductTypesTab productTypes={productTypes} units={units} onDataChange={fetchAllData} />
</TabsContent>
```

## Future Improvements

Additional tabs that can be modularized:
- UsersTab (user management)
- ParametersTab (parameter options)
- VersionControlTab (snapshots and rollback)
- AuditLogsTab (audit trail)
- DatabaseTab (database reset operations)

## Benefits

1. **Maintainability**: Each tab is self-contained and easier to understand
2. **Reusability**: Components can be reused in other contexts
3. **Testing**: Individual components can be tested in isolation
4. **Performance**: Smaller files load faster in IDE
5. **Collaboration**: Multiple developers can work on different tabs simultaneously
