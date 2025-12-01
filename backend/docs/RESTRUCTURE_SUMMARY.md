# 🎯 Database Restructure - Ready to Apply

## ✅ What's Been Created

### 1. **Migration SQL** (`migrations/restructure_to_product_specific_tables.sql`)
Complete migration that:
- Creates new tables: `inventory_items`, `hdpe_rolls`, `sprinkler_bundles`
- Migrates all existing data from `rolls` table
- Creates helper views for easy querying
- Backs up old `rolls` table as `rolls_backup_pre_restructure`
- Includes verification queries

### 2. **Helper Functions** (`inventory_helpers.py`)
Python helper class with methods for:
- `create_hdpe_roll()` - Create HDPE rolls
- `create_sprinkler_bundle()` - Create Sprinkler bundles/spares
- `search_available_hdpe()` - Find available HDPE rolls
- `search_available_sprinkler()` - Find available Sprinkler bundles
- `update_hdpe_roll_length()` - Update HDPE after dispatch
- `update_sprinkler_bundle_pieces()` - Update Sprinkler after dispatch

### 3. **Migration Script** (`run_restructure_migration.sh`)
Automated script that:
- Creates backup before migration
- Runs migration SQL
- Verifies data integrity
- Shows summary of results

### 4. **Documentation** (`MIGRATION_GUIDE.md`)
Complete guide with:
- Why this change is needed
- Schema comparison (before/after)
- Step-by-step migration process
- Code examples for updated backend
- Testing checklist
- Rollback plan

## 🚀 How to Apply

### Option 1: Automated (Recommended)

```bash
cd backend
./run_restructure_migration.sh
```

### Option 2: Manual

```bash
# 1. Backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# 2. Run migration
psql $DATABASE_URL -f migrations/restructure_to_product_specific_tables.sql

# 3. Verify
psql $DATABASE_URL -c "SELECT * FROM inventory_unified LIMIT 10;"
```

## 📋 After Migration

### Update Backend Code

You'll need to update these files to use the new structure:

1. **`routes/production_routes.py`**
   - Use `InventoryHelper.create_hdpe_roll()` for HDPE
   - Use `InventoryHelper.create_sprinkler_bundle()` for Sprinkler

2. **`routes/inventory_routes.py`**
   - Use `InventoryHelper.search_available_hdpe()`
   - Use `InventoryHelper.search_available_sprinkler()`

3. **`routes/dispatch_routes.py`**
   - Use `InventoryHelper.update_hdpe_roll_length()` for HDPE dispatch
   - Update `inventory_items.status` for Sprinkler dispatch

### Import the Helper

```python
from inventory_helpers import InventoryHelper
```

## ⚠️ Important Notes

1. **Downtime Required**: Plan for ~5-10 minutes of downtime during migration
2. **Backup First**: Script creates backup automatically, but verify it's there
3. **Test Thoroughly**: After migration, test all inventory operations
4. **Rollback Available**: Old `rolls` table is kept as `rolls_backup_pre_restructure`

## 🧪 Testing Checklist

After migration, verify:

- [ ] Can create HDPE batch in production
- [ ] Can create Sprinkler batch in production
- [ ] Inventory search shows HDPE rolls correctly
- [ ] Inventory search shows Sprinkler bundles correctly
- [ ] Can dispatch HDPE roll (partial cut)
- [ ] Can dispatch Sprinkler bundle (whole)
- [ ] Reports show correct totals

## 📊 What Changed

### Before

```
rolls (single table)
├─ HDPE rolls (with bundle_size = NULL)
└─ Sprinkler bundles (with length_meters for bundles!)
```

**Problems:**
- Confusing: Sprinkler bundles had `length_meters` field
- Lots of NULL columns
- Weak validation
- Mixed logic everywhere

### After

```
inventory_items (base)
├─ hdpe_rolls (only HDPE fields)
│  ├─ length_meters ✓
│  ├─ is_cut_roll ✓
│  └─ parent_roll_id ✓
│
└─ sprinkler_bundles (only Sprinkler fields)
   ├─ bundle_type ✓
   ├─ bundle_size ✓
   ├─ piece_count ✓
   └─ piece_length_meters ✓
```

**Benefits:**
- ✅ Clear structure
- ✅ No NULL columns
- ✅ Strong validation
- ✅ Separate logic

## 🔄 If Something Goes Wrong

### Rollback

```sql
-- Restore from backup
psql $DATABASE_URL < backup_before_restructure_20250121.sql
```

### Or Manually

```sql
-- Drop new tables
DROP VIEW inventory_unified, hdpe_inventory, sprinkler_inventory;
DROP TABLE hdpe_rolls, sprinkler_bundles, inventory_items;

-- Restore old table
ALTER TABLE rolls_backup_pre_restructure RENAME TO rolls;
```

## 💡 Key Takeaway

This restructure makes your database **match your business reality**:

- **HDPE** = Continuous material you cut → `length_meters`
- **Sprinkler** = Discrete pieces in bundles → `piece_count`, `bundle_size`

No more forcing both into one table! 🎉

## 📞 Next Steps

1. **Review the files created** (especially `MIGRATION_GUIDE.md`)
2. **Run the migration** when ready
3. **Update backend code** to use `InventoryHelper`
4. **Test thoroughly** with sample data
5. **Deploy to production** once verified

---

**Ready to apply?** Run `./run_restructure_migration.sh` when you're ready! 🚀
