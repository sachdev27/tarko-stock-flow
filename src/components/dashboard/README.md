# Dashboard Components

Modularized components for the Dashboard page.

## Components

### StatsCard
Main statistics card component with icon, title, value, and optional onClick handler.

**Props:**
- `title`: string - Card title
- `value`: number | string - Main display value
- `icon`: LucideIcon - Icon component
- `description?`: string - Optional description text
- `color`: string - Icon color class
- `bgColor`: string - Background color class
- `onClick?`: () => void - Optional click handler

**Usage:**
```tsx
<StatsCard
  title="Total Batches"
  value={100}
  icon={Package}
  description="All production batches"
  color="text-blue-600"
  bgColor="bg-blue-50"
  onClick={() => navigate('/production')}
/>
```

### QuickActions
Quick action buttons for common operations.

**Props:** None (uses internal navigation)

**Actions:**
- Daily Production Entry
- New Dispatch
- Process Return
- View Inventory
- View Activity

### InventoryByType
Displays inventory breakdown by product type.

**Props:**
- `data`: Array<{ product_type: string, total_quantity: number, batch_count: number }>

### LowStockAlerts
Shows items with low stock levels.

**Props:**
- `items`: Array<LowStockItem>

**LowStockItem:**
```ts
{
  batch_code: string;
  current_quantity: number;
  product_type: string;
  brand: string;
  parameters?: Record<string, string | number | boolean>;
}
```

### RecentActivity
Shows recent transactions across all types.

**Props:**
- `activities`: Array<ActivityItem>

**ActivityItem:**
```ts
{
  id: string;
  transaction_type: string;
  quantity_change: number;
  created_at: string;
  user_name: string;
  batch_code: string;
  product_type: string;
}
```

**Supported Transaction Types:**
- PRODUCTION
- DISPATCH / SALE
- RETURN
- SCRAP
- CUT_ROLL
- SPLIT_BUNDLE
- COMBINE_BUNDLE
- REVERTED

### TransactionStats
Shows transaction statistics for the last 7 days.

**Props:**
- `stats`: TransactionStatsData

**TransactionStatsData:**
```ts
{
  total_transactions?: number;
  production_count?: number;
  sales_count?: number;
  return_count?: number;
  scrap_count?: number;
}
```

## Backend Integration

The dashboard consumes the `/api/stats/dashboard` endpoint which provides:
- Total and active batch counts
- Inventory breakdown by product type
- Low stock alerts
- Recent activity from all transaction sources
- Transaction statistics for last 7 days

The backend aggregates data from multiple tables:
- `batches` - Production batches
- `dispatches` - Dispatch transactions
- `returns` - Return transactions
- `scraps` - Scrap transactions
- `inventory_transactions` - Inventory operations
- `transactions` - Legacy production transactions

## Features

- Auto-refresh every 30 seconds
- Click-to-navigate on stat cards
- Responsive grid layout
- Loading states
- Empty states with helpful messages
- Color-coded transaction types
- Real-time quantity change indicators
- Parameter badges for low stock items

## Styling

All components use:
- Tailwind CSS for styling
- shadcn/ui Card components
- Lucide React icons
- Dark mode support via Tailwind's `dark:` prefix
- Consistent color schemes per transaction type
