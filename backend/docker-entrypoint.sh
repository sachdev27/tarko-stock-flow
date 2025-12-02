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

# Run database migrations
echo "🔄 Running database migrations..."
python -c "
from database import get_db_connection
import os

try:
    conn = get_db_connection()
    cursor = conn.cursor()

    # Check if schema exists
    cursor.execute(\"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'\")
    table_count = cursor.fetchone()[0]

    if table_count == 0:
        print('📋 No tables found. Running schema.sql...')
        with open('schema.sql', 'r') as f:
            cursor.execute(f.read())
        conn.commit()
        print('✅ Schema created successfully')
    else:
        print(f'✅ Database already initialized ({table_count} tables found)')

    cursor.close()
    conn.close()
except Exception as e:
    print(f'⚠️  Database initialization error: {e}')
    print('Continuing anyway - migrations may handle this...')
"

# Run any pending migrations
echo "🔄 Checking for migrations..."
if [ -d "migrations" ]; then
    for migration in migrations/*.sql; do
        if [ -f "$migration" ]; then
            echo "📝 Found migration: $(basename $migration)"
        fi
    done
fi

