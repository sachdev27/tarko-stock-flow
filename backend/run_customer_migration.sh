#!/bin/bash

# Run customer address update migration

echo "Running customer address update migration..."

# Assuming you're in the backend directory
psql -U your_user -d tarko_inventory -f migrations/update_customer_address.sql

if [ $? -eq 0 ]; then
    echo "✓ Migration completed successfully"
else
    echo "✗ Migration failed"
    exit 1
fi
