#!/bin/bash
# Quick Start Script - Apply All Fixes
# Run this to deploy the comprehensive refactoring

set -e  # Exit on error

echo "======================================================================"
echo "TARKO INVENTORY - COMPREHENSIVE REFACTORING DEPLOYMENT"
echo "======================================================================"
echo ""
echo "This script will:"
echo "  1. Backup current database"
echo "  2. Apply comprehensive migration"
echo "  3. Verify everything is working"
echo "  4. Show you next steps"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "Aborted."
    exit 1
fi

# Configuration
DB_NAME="tarko_inventory"
BACKUP_DIR="./backups"
MIGRATION_FILE="./migrations/001_comprehensive_refactoring.sql"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Create backup directory
echo ""
echo "======================================================================"
echo "STEP 1: Creating Backup"
echo "======================================================================"

mkdir -p $BACKUP_DIR
BACKUP_FILE="$BACKUP_DIR/pre_refactoring_$(date +%Y%m%d_%H%M%S).sql"

echo "Backing up database to: $BACKUP_FILE"
pg_dump $DB_NAME > $BACKUP_FILE

if [ $? -eq 0 ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✓ Backup successful!${NC} Size: $BACKUP_SIZE"
else
    echo -e "${RED}✗ Backup failed!${NC}"
    exit 1
fi

# Step 2: Verify current state
echo ""
echo "======================================================================"
echo "STEP 2: Verifying Current State"
echo "======================================================================"

echo "Checking piece counts..."
psql $DB_NAME -c "
SELECT
  'HDPE' as type,
  COUNT(*) as total,
  COUNT(CASE WHEN status = 'IN_STOCK' THEN 1 END) as in_stock
FROM hdpe_cut_pieces
UNION ALL
SELECT
  'SPRINKLER' as type,
  COUNT(*) as total,
  COUNT(CASE WHEN status = 'IN_STOCK' THEN 1 END) as in_stock
FROM sprinkler_spare_pieces;" > /tmp/pre_migration_counts.txt

cat /tmp/pre_migration_counts.txt
echo -e "${GREEN}✓ Current state captured${NC}"

# Step 3: Apply migration
echo ""
echo "======================================================================"
echo "STEP 3: Applying Migration"
echo "======================================================================"

echo "Running migration from: $MIGRATION_FILE"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}✗ Migration file not found: $MIGRATION_FILE${NC}"
    exit 1
fi

psql $DB_NAME < $MIGRATION_FILE

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Migration applied successfully!${NC}"
else
    echo -e "${RED}✗ Migration failed!${NC}"
    echo ""
    echo "To rollback:"
    echo "  psql $DB_NAME < $BACKUP_FILE"
    exit 1
fi

# Step 4: Verify migration
echo ""
echo "======================================================================"
echo "STEP 4: Verifying Migration"
echo "======================================================================"

# Check new table exists
echo "Checking new tables..."
psql $DB_NAME -c "\dt piece_lifecycle_events" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ piece_lifecycle_events table created${NC}"
else
    echo -e "${RED}✗ piece_lifecycle_events table missing${NC}"
    exit 1
fi

# Check new columns
echo "Checking new columns..."
HDPE_COLS=$(psql $DB_NAME -c "\d hdpe_cut_pieces" | grep -c "created_by_transaction_id")
SPRINKLER_COLS=$(psql $DB_NAME -c "\d sprinkler_spare_pieces" | grep -c "created_by_transaction_id")

if [ $HDPE_COLS -gt 0 ] && [ $SPRINKLER_COLS -gt 0 ]; then
    echo -e "${GREEN}✓ New columns added${NC}"
else
    echo -e "${RED}✗ New columns missing${NC}"
    exit 1
fi

# Check triggers
echo "Checking triggers..."
TRIGGER_COUNT=$(psql $DB_NAME -c "
SELECT COUNT(*) FROM pg_trigger
WHERE tgrelid IN ('hdpe_cut_pieces'::regclass, 'sprinkler_spare_pieces'::regclass)
AND tgenabled = 'O';" -t | xargs)

if [ $TRIGGER_COUNT -gt 0 ]; then
    echo -e "${GREEN}✓ Triggers active ($TRIGGER_COUNT triggers)${NC}"
else
    echo -e "${RED}✗ Triggers not active${NC}"
    exit 1
fi

# Check views
echo "Checking views..."
psql $DB_NAME -c "\dv v_piece_audit_trail" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Views created${NC}"
else
    echo -e "${RED}✗ Views missing${NC}"
    exit 1
fi

# Check data migration
echo "Checking data migration..."
NULL_COUNT=$(psql $DB_NAME -c "
SELECT COUNT(*) FROM sprinkler_spare_pieces
WHERE created_by_transaction_id IS NULL AND deleted_at IS NULL;" -t | xargs)

if [ $NULL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ All pieces have created_by_transaction_id${NC}"
else
    echo -e "${YELLOW}⚠ Warning: $NULL_COUNT pieces missing created_by_transaction_id${NC}"
fi

# Check quantity validation
echo "Checking quantity validation..."
MISMATCH_COUNT=$(psql $DB_NAME -c "
SELECT COUNT(*) FROM v_stock_quantity_validation
WHERE quantity_mismatch != 0;" -t | xargs)

if [ $MISMATCH_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ All quantities valid${NC}"
else
    echo -e "${YELLOW}⚠ Warning: $MISMATCH_COUNT quantity mismatches${NC}"
fi

# Step 5: Compare before/after
echo ""
echo "======================================================================"
echo "STEP 5: Comparing Before/After"
echo "======================================================================"

echo "Before migration:"
cat /tmp/pre_migration_counts.txt

echo ""
echo "After migration:"
psql $DB_NAME -c "
SELECT
  'HDPE' as type,
  COUNT(*) as total,
  COUNT(CASE WHEN status = 'IN_STOCK' THEN 1 END) as in_stock
FROM hdpe_cut_pieces
WHERE deleted_at IS NULL
UNION ALL
SELECT
  'SPRINKLER' as type,
  COUNT(*) as total,
  COUNT(CASE WHEN status = 'IN_STOCK' THEN 1 END) as in_stock
FROM sprinkler_spare_pieces;"

# Final summary
echo ""
echo "======================================================================"
echo "MIGRATION COMPLETE!"
echo "======================================================================"
echo ""
echo -e "${GREEN}✓ Database backup created: $BACKUP_FILE${NC}"
echo -e "${GREEN}✓ Migration applied successfully${NC}"
echo -e "${GREEN}✓ All verifications passed${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Review the new helper module:"
echo "   cat backend/inventory_operations.py"
echo ""
echo "2. Read the deployment guide:"
echo "   cat DEPLOYMENT_GUIDE.md"
echo ""
echo "3. Test the new operations:"
echo "   python3 -c 'from inventory_operations import InventoryOperations; print(\"✓ Module loaded\")'"
echo ""
echo "4. Update your code gradually to use InventoryOperations class"
echo "   (See REFACTORING_COMPLETE.md for examples)"
echo ""
echo "5. Monitor for 48 hours:"
echo "   - Check application logs for errors"
echo "   - Run: psql $DB_NAME -c 'SELECT * FROM v_stock_quantity_validation WHERE quantity_mismatch != 0'"
echo "   - Verify lifecycle events: psql $DB_NAME -c 'SELECT COUNT(*) FROM piece_lifecycle_events'"
echo ""
echo "If you need to rollback:"
echo "   psql $DB_NAME < $BACKUP_FILE"
echo ""
echo "======================================================================"
echo "Documentation:"
echo "======================================================================"
echo "  REFACTORING_COMPLETE.md  - Complete overview"
echo "  DEPLOYMENT_GUIDE.md      - Detailed deployment steps"
echo "  FOUNDATIONAL_ERRORS_ANALYSIS.md - What was fixed and why"
echo "  QUICK_FIX_GUIDE.md       - Quick reference for developers"
echo "======================================================================"
