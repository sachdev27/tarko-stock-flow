#!/bin/bash
set -e

echo "Starting Tarko Inventory Backup Scheduler"
echo "Backup schedule: ${BACKUP_SCHEDULE:-0 2 * * *}"
echo "Retention period: ${BACKUP_RETENTION_DAYS:-30} days"

# Run initial backup
echo "Running initial backup..."
python /app/backup_scheduler.py

# Start cron in foreground
echo "Starting cron daemon..."
cron && tail -f /var/log/cron.log
