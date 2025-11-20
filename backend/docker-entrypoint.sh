#!/bin/bash
set -e

echo "Starting Tarko Stock Flow Backend..."

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
while ! nc -z postgres 5432; do
  sleep 1
done
echo "PostgreSQL is ready"

# Initialize database schema
echo "Checking database schema..."
python -c "
import psycopg2
import os

DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://tarko_user:tarko_pass@postgres:5432/tarko_inventory')
try:
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()

    # Check if users table exists
    cursor.execute(\"\"\"
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = 'users'
        );
    \"\"\")

    exists = cursor.fetchone()[0]

    if not exists:
        print('Initializing database schema...')
        with open('schema.sql', 'r') as f:
            cursor.execute(f.read())
        conn.commit()
        print('✅ Database schema initialized')
    else:
        print('✅ Database schema already exists')

    cursor.close()
    conn.close()
except Exception as e:
    print(f'Schema check: {e}')
"

# Initialize default admin user
echo "Initializing default admin user..."
python init_admin.py

# Start the application
echo "Starting Flask application..."
exec python app.py
