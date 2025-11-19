#!/bin/bash
# Run the transaction architecture fix migration

echo "Running transaction architecture fix migration..."

# Get database connection details from environment or use defaults
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-tarko_inventory}"
DB_USER="${DB_USER:-postgres}"

# Run the migration
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$(dirname "$0")/migrations/fix_transaction_architecture.sql"

if [ $? -eq 0 ]; then
    echo "✅ Migration completed successfully"
    echo ""
    echo "Summary of changes:"
    echo "  - Added product_variant_id to transactions table (guarantees exact matching)"
    echo "  - Added weight_per_meter and total_weight to batches"
    echo "  - Added is_cut_roll, roll_type, bundle_size to rolls"
    echo "  - Created automatic metadata population triggers"
    echo "  - Created materialized view for fast product variant lookups"
    echo ""
    echo "Next steps:"
    echo "  1. Restart the backend server: python3 app.py"
    echo "  2. Restart the frontend server (if needed)"
    echo "  3. Test by creating a new production batch"
    echo "  4. Check product history - you should see EXACT matches only"
else
    echo "❌ Migration failed. Please check the error messages above."
    exit 1
fi
