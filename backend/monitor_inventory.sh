#!/bin/bash
# Monitoring script for refactored inventory system
# Run this periodically to check for issues

echo "======================================================================="
echo "INVENTORY SYSTEM HEALTH CHECK - $(date)"
echo "======================================================================="

echo ""
echo "1. Quantity Validation (should be 0 mismatches):"
psql tarko_inventory -c "SELECT COUNT(*) as mismatches FROM v_stock_quantity_validation WHERE quantity_mismatch != 0;"

echo ""
echo "2. Pieces without immutable creator (should be 0):"
psql tarko_inventory -c "
SELECT
    'HDPE' as type, COUNT(*) as count
FROM hdpe_cut_pieces
WHERE created_by_transaction_id IS NULL AND deleted_at IS NULL
UNION ALL
SELECT
    'SPRINKLER' as type, COUNT(*) as count
FROM sprinkler_spare_pieces
WHERE created_by_transaction_id IS NULL AND deleted_at IS NULL;
"

echo ""
echo "3. Recent lifecycle events (last 24 hours):"
psql tarko_inventory -c "
SELECT
    piece_type,
    event_type,
    COUNT(*) as count
FROM piece_lifecycle_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY piece_type, event_type
ORDER BY count DESC;
"

echo ""
echo "4. Active triggers:"
psql tarko_inventory -c "
SELECT
    c.relname as table_name,
    COUNT(*) as trigger_count
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE c.relname IN ('hdpe_cut_pieces', 'sprinkler_spare_pieces')
  AND t.tgenabled = 'O'
  AND t.tgname NOT LIKE 'RI_%'
GROUP BY c.relname;
"

echo ""
echo "5. Reserved pieces (should timeout after 30 min):"
psql tarko_inventory -c "
SELECT
    COUNT(*) as reserved_count,
    MAX(reserved_at) as most_recent_reservation
FROM sprinkler_spare_pieces
WHERE reserved_by_transaction_id IS NOT NULL;
"

echo ""
echo "======================================================================="
echo "Health check complete!"
echo "======================================================================="
