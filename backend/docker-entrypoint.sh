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
echo "🔄 Checking for migrations..."
if [ -d "migrations" ]; then
    for migration in migrations/*.sql; do
        if [ -f "$migration" ]; then
            echo "📝 Found migration: $(basename $migration)"
        fi
    done
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
