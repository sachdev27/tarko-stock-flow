# Automatic Orphan Cleanup System

## Overview

The backend now includes an automatic scheduler that periodically cleans up orphaned inventory stock rows. These are rows that should have been deleted during batch reversions but weren't, potentially due to bugs in the revert logic.

## What is an Orphan?

An orphaned stock row is one that has:
- `status = 'SOLD_OUT'`
- `deleted_at IS NULL` (not soft-deleted)
- `quantity > 0`
- Associated with a batch (not deleted itself)

These typically occur when:
1. A batch revert fails silently (old bug fixed in batch revert refactor)
2. Stock is marked as sold out but the reversal logic didn't properly clean it up
3. Edge cases in cascade deletion logic

## Configuration

### System Settings

Two new system settings control the orphan cleanup:

1. **auto_cleanup_orphans_enabled** (default: `false`)
   - Set to `true` to enable automatic cleanup
   - Set to `false` to disable automatic cleanup

2. **auto_cleanup_orphans_interval** (default: `weekly`)
   - **Standard intervals**: `hourly`, `daily`, `weekly`, `monthly`
   - **Custom intervals**: `15m`, `30m`, `6h`, `12h`, `2d`, `7d` etc.
   - **Default schedule**: Sunday 3:00 AM (IST) for weekly cleanups

### API Endpoints

#### GET /api/version-control/settings/orphan-cleanup

Get current orphan cleanup settings and next scheduled run time.

**Response:**
```json
{
  "enabled": true,
  "interval": "weekly",
  "next_run": "2026-05-18T21:30:00+00:00"
}
```

#### POST /api/version-control/settings/orphan-cleanup

Update orphan cleanup settings and reschedule the job.

**Request Body:**
```json
{
  "enabled": true,
  "interval": "daily"
}
```

**Valid Intervals:**
- `hourly` - Every hour
- `daily` - Every 24 hours (at 3:00 AM IST)
- `weekly` - Every Sunday at 3:00 AM IST
- `monthly` - 1st of month at 3:00 AM IST
- `15m`, `30m` - Every 15/30 minutes
- `6h`, `12h` - Every 6/12 hours
- `2d`, `7d` - Every 2/7 days

**Response:**
```json
{
  "message": "Orphan cleanup settings updated",
  "enabled": true,
  "interval": "daily",
  "next_run": "2026-05-12T21:30:00+00:00"
}
```

#### POST /api/version-control/settings/orphan-cleanup/test

Manually trigger an orphan cleanup for testing purposes (admin only).

**Response:**
```json
{
  "message": "Cleaned 4 orphaned stock rows and 12 child pieces",
  "cleaned_rows": 4,
  "cleaned_cut_pieces": 8,
  "cleaned_spare_pieces": 4,
  "total_cleaned_pieces": 12,
  "total_quantity_meters": 3050
}
```

## How It Works

1. **Scheduling**: APScheduler runs the cleanup job at the configured interval
2. **Lock-based Concurrency**: In multi-worker environments, only one worker runs all scheduled jobs (via file-based lock)
3. **Orphan Detection**: Finds all rows with `status='SOLD_OUT'` and `deleted_at IS NULL`
4. **Cascade Deletion**: Soft-deletes all child pieces (`hdpe_cut_pieces`, `sprinkler_spare_pieces`)
5. **Audit Logging**: Records the cleanup action with affected IDs and details
6. **System Attribution**: Cleanup is attributed to the system user (UUID: `00000000-0000-0000-0000-000000000001`)

## Automatic Run Details

When cleanup runs automatically:
- **Action**: `AUTO_CLEANUP_ORPHANED_STOCK`
- **User**: System user (indicates automatic action)
- **Log Location**: `audit_logs` table
- **Error Handling**: Failures are logged but don't crash the scheduler

## Testing

To test the orphan cleanup feature:

1. **Get current settings:**
   ```bash
   curl http://localhost:5500/api/version-control/settings/orphan-cleanup
   ```

2. **Enable auto cleanup (daily):**
   ```bash
   curl -X POST http://localhost:5500/api/version-control/settings/orphan-cleanup \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{"enabled": true, "interval": "daily"}'
   ```

3. **Test cleanup manually:**
   ```bash
   curl -X POST http://localhost:5500/api/version-control/settings/orphan-cleanup/test \
     -H "Authorization: Bearer <token>"
   ```

## Best Practices

1. **Don't Disable**: Keep cleanup enabled in production (default safe)
2. **Frequency**: Weekly (default) is good for most setups
3. **Time**: Cleanup runs at 3 AM IST to avoid peak usage times
4. **Audit**: Check `audit_logs` to see what was cleaned up
5. **Monitoring**: Alert if orphaned stock is found repeatedly (indicates new bugs)

## Integration with Batch Revert Fix

This cleanup works alongside the batch revert foundation fix:

- **Prevention Layer**: The revert logic now uses `batch_id` constraints instead of timestamps
- **Detection Layer**: Database trigger prevents new SOLD_OUT orphans
- **Ledger Filter**: REVERTED batches excluded from ledger calculations
- **Cleanup Layer**: This feature removes any existing orphans periodically

Together, these layers prevent, detect, and clean up orphaned stock.

## Troubleshooting

### Orphan cleanup not running
1. Check if enabled: `GET /api/version-control/settings/orphan-cleanup`
2. Check scheduler logs for errors
3. Verify database connection is healthy
4. Check that system user exists (UUID: `00000000-0000-0000-0000-000000000001`)

### Too many orphans being deleted
1. This indicates a bug in revert logic or cascade delete logic
2. Check `audit_logs` for patterns
3. Enable verbose logging to see which batches are affected
4. Review batch revert traces to find root cause

### Cleanup taking too long
1. Increase interval to less frequent (e.g., `weekly` instead of `daily`)
2. Check if there are many orphaned rows (could indicate larger issue)
3. Consider running manually at off-peak hours

## Database Optimization

The cleanup queries use:
- `ANY(...::uuid[])` for efficient batch operations
- Soft-delete pattern with `deleted_at` and `updated_at`
- Foreign key cascade for data integrity
- Audit logging for accountability

No indexes needed - queries are already optimized.
