#!/bin/bash
# Setup script for Tarko Testing Database

set -e

DB_NAME="tarko_test_$(date +%Y%m%d_%H%M%S)"
DB_USER="postgres"
SCHEMA_FILE="backend/schema.sql"

echo "========================================"
echo "Creating new Tarko test database: $DB_NAME"
echo "========================================"

# Create database
echo "Creating database..."
psql -U $DB_USER -c "CREATE DATABASE $DB_NAME;" || {
    echo "Error: Failed to create database"
    exit 1
}

# Load schema
echo "Loading schema from $SCHEMA_FILE..."
psql -U $DB_USER -d $DB_NAME -f $SCHEMA_FILE || {
    echo "Error: Failed to load schema"
    psql -U $DB_USER -c "DROP DATABASE $DB_NAME;"
    exit 1
}

echo ""
echo "========================================"
echo "✅ Test database created successfully!"
echo "========================================"
echo ""
echo "Database Name: $DB_NAME"
echo "Connection String: postgresql://localhost/$DB_NAME"
echo ""
echo "To use this database, update your .env file:"
echo "  DATABASE_URL=postgresql://localhost/$DB_NAME"
echo ""
echo "Or set environment variable:"
echo "  export DATABASE_URL=postgresql://localhost/$DB_NAME"
echo ""
