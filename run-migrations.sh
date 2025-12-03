#!/bin/bash
# Local Development Migration Runner
# Run this after pulling new code or when setting up locally

set -e

echo "🔄 Running local database migrations..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not set. Please set it in .env or export it."
    echo "   Example: export DATABASE_URL=postgresql://tarko_user:password@localhost:5432/tarko_inventory"
    exit 1
fi

# Extract connection details
# Handles both formats:
# postgresql://user:pass@host:port/db
# postgresql://user@host:port/db (no password)
DB_HOST=$(echo $DATABASE_URL | sed -E 's/.*@([^:\/]+).*/\1/')
DB_PORT=$(echo $DATABASE_URL | sed -E 's/.*:([0-9]+)\/.*/\1/')
DB_NAME=$(echo $DATABASE_URL | sed -E 's/.*\/([^?]+).*/\1/')

# Extract user and password (handle both with and without password)
if echo $DATABASE_URL | grep -q '://.*:.*@'; then
    # Has password: postgresql://user:pass@host
    DB_USER=$(echo $DATABASE_URL | sed -E 's/.*\/\/([^:]+):.*/\1/')
    DB_PASSWORD=$(echo $DATABASE_URL | sed -E 's/.*:([^@]+)@.*/\1/')
else
    # No password: postgresql://user@host
    DB_USER=$(echo $DATABASE_URL | sed -E 's/.*\/\/([^@]+)@.*/\1/')
    DB_PASSWORD=""
fi

export PGPASSWORD="$DB_PASSWORD"

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ psql not found. Please install PostgreSQL client:"
    echo "   macOS: brew install postgresql"
    echo "   Ubuntu: sudo apt-get install postgresql-client"
    exit 1
fi

# Check if migrations directory exists
if [ ! -d "backend/migrations" ]; then
    echo "❌ Migrations directory not found: backend/migrations"
    exit 1
fi

# Run migrations
cd backend
for migration in migrations/*.sql; do
    if [ -f "$migration" ]; then
        migration_name=$(basename "$migration")
        echo "📝 Applying migration: $migration_name"

        if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration" 2>&1 | grep -v "already exists\|duplicate"; then
            echo "✅ Applied: $migration_name"
        fi
    fi
done

unset PGPASSWORD

echo ""
echo "✅ All migrations applied!"
echo ""
echo "🚀 You can now run the Flask app:"
echo "   cd backend"
echo "   python app.py"
