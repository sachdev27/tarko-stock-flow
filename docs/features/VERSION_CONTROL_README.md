# Version Control & Rollback System

## Overview
The Version Control system provides database snapshot and rollback functionality, allowing administrators to:
- Create point-in-time snapshots of the entire database
- Roll back to any previous snapshot
- Track rollback history for audit purposes

## Features

### 1. **Database Snapshots**
- Captures complete state of all inventory-related tables
- Stores metadata including:
  - Snapshot name and description
  - Creation timestamp and creator
  - File size and record counts
  - Optional tags for organization
- Automatic and manual snapshot creation

### 2. **Rollback Capability**
- Restore database to any previous snapshot
- Confirmation required before rollback
- Tracks affected tables and previous state
- Records success/failure with error messages
- Audit log integration

### 3. **Rollback History**
- Complete history of all rollback operations
- Shows who performed the rollback and when
- Displays affected tables and outcomes
- Error tracking for failed rollbacks

## Usage

### Creating a Snapshot (Admin Only)

1. Navigate to Admin Panel → Version Control tab
2. Click "Create Snapshot"
3. Enter:
   - **Snapshot Name**: Descriptive name (e.g., "Before Bulk Import 2025-11-20")
   - **Description**: Optional details about why this snapshot was created
   - **Tags**: Optional tags for organization
4. Click "Create Snapshot"

**Best Practices:**
- Create snapshots before:
  - Bulk data imports
  - Major system changes
  - Database migrations
  - End of month/quarter
- Use descriptive names with dates
- Add context in descriptions

### Rolling Back (Admin Only)

1. Navigate to Admin Panel → Version Control tab
2. Find the snapshot you want to restore
3. Click "Rollback" button
4. Review the confirmation dialog carefully:
   - ⚠️ **All current data will be replaced**
   - Changes made after snapshot will be lost
   - Operation cannot be undone
5. Click "Confirm Rollback"

**⚠️ Warning:**
- Consider creating a snapshot of the current state before rolling back
- Inform all users before performing a rollback
- Verify the snapshot timestamp carefully

## Technical Details

### Tables Included in Snapshots
- `batches` - Production batches
- `rolls` - Individual roll inventory
- `transactions` - All transaction history
- `product_variants` - Product configurations
- `product_types` - Product type definitions
- `brands` - Brand information
- `customers` - Customer records
- `parameter_options` - Product parameter options

### Excluded from Snapshots
- User accounts and authentication data
- Audit logs (preserved separately)
- System configuration

### Database Schema

**database_snapshots table:**
```sql
- id: UUID (primary key)
- snapshot_name: TEXT
- description: TEXT
- snapshot_data: JSONB (complete data dump)
- table_counts: JSONB (record counts per table)
- created_by: UUID (references users)
- created_at: TIMESTAMPTZ
- file_size_mb: NUMERIC
- is_automatic: BOOLEAN
- tags: TEXT[]
```

**rollback_history table:**
```sql
- id: UUID (primary key)
- snapshot_id: UUID (references database_snapshots)
- snapshot_name: TEXT
- rolled_back_by: UUID (references users)
- rolled_back_at: TIMESTAMPTZ
- previous_state_summary: JSONB
- success: BOOLEAN
- error_message: TEXT
- affected_tables: TEXT[]
```

## API Endpoints

All endpoints require admin role authentication.

### GET `/api/version-control/snapshots`
List all database snapshots

### POST `/api/version-control/snapshots`
Create a new snapshot
```json
{
  "snapshot_name": "Before Import 2025-11-20",
  "description": "Before bulk customer import",
  "tags": ["import", "monthly-backup"]
}
```

### DELETE `/api/version-control/snapshots/:id`
Delete a snapshot

### POST `/api/version-control/rollback/:id`
Rollback to a snapshot
```json
{
  "confirm": true
}
```

### GET `/api/version-control/rollback-history`
Get rollback history

## Security

- **Admin Only**: All version control operations require admin role
- **Audit Logging**: All snapshot and rollback operations are logged
- **Confirmation Required**: Rollbacks require explicit confirmation
- **Sensitive Data Excluded**: User authentication data is not included in snapshots

## Performance Considerations

- Snapshot creation time depends on database size
- Large databases (>100MB) may take 10-30 seconds
- Rollback operations may take 30-60 seconds for large databases
- Consider scheduling automatic snapshots during low-traffic periods

## Maintenance

### Storage Management
- Monitor snapshot storage usage
- Delete old unnecessary snapshots
- Keep critical snapshots (month-end, before major changes)
- Recommended: Retain at least 7 days of daily snapshots

### Backup Strategy
- Snapshots are stored in the database
- Regular database backups should include snapshot tables
- Consider exporting critical snapshots externally
- Test rollback procedures periodically

## Troubleshooting

### Snapshot Creation Fails
- Check database connection
- Verify sufficient disk space
- Review error logs
- Ensure admin permissions

### Rollback Fails
- Check error message in rollback history
- Verify snapshot data integrity
- Ensure no active transactions
- Contact system administrator

## Future Enhancements

Potential improvements:
- Automatic scheduled snapshots
- Snapshot comparison tools
- Partial rollback (specific tables only)
- Export/import snapshots to external storage
- Snapshot compression
- Incremental snapshots

## Support

For issues or questions:
1. Check rollback history for error messages
2. Review audit logs for related operations
3. Contact system administrator
4. Refer to main application documentation
