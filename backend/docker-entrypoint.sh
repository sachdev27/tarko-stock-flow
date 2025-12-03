#!/bin/bash
set -e

echo "🔧 Starting Tarko Inventory Backend..."

# Extract DB connection details from DATABASE_URL
# Format: postgresql://user:password@host:port/dbname
DB_HOST=$(echo $DATABASE_URL | sed -E 's/.*@([^:]+):.*/\1/')
DB_PORT=$(echo $DATABASE_URL | sed -E 's/.*:([0-9]+)\/.*/\1/')
DB_USER=$(echo $DATABASE_URL | sed -E 's/.*\/\/([^:]+):.*/\1/')

echo "📡 Connecting to PostgreSQL at $DB_HOST:$DB_PORT as $DB_USER"

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER"; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done

echo "✅ PostgreSQL is ready!"

# Database is already initialized by postgres container using schema.sql
echo "✅ Database initialization handled by PostgreSQL container"

# Run any pending migrations
echo "🔄 Running database migrations..."
if [ -d "migrations" ]; then
    # Extract password from DATABASE_URL
    DB_PASSWORD=$(echo $DATABASE_URL | sed -E 's/.*:([^@]+)@.*/\1/')
    DB_NAME=$(echo $DATABASE_URL | sed -E 's/.*\/([^?]+).*/\1/')

    export PGPASSWORD="$DB_PASSWORD"

    for migration in migrations/*.sql; do
        if [ -f "$migration" ]; then
            migration_name=$(basename "$migration")
            echo "📝 Applying migration: $migration_name"

            # Run migration and capture output
            if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration" > /tmp/migration.log 2>&1; then
                echo "✅ Successfully applied: $migration_name"
            else
                echo "⚠️  Migration $migration_name may have already been applied or encountered an error"
                cat /tmp/migration.log
            fi
        fi
    done

    unset PGPASSWORD
    echo "✅ Migrations complete!"
else
    echo "⚠️  No migrations directory found"
fi

# Start the Flask application
echo "🚀 Starting Flask application..."
exec gunicorn \
    --bind 0.0.0.0:5500 \
    --workers 4 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    app:app
