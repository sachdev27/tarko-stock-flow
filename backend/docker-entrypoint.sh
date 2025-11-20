#!/bin/bash
set -e

echo "Starting Tarko Stock Flow Backend..."

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
while ! nc -z postgres 5432; do
  sleep 1
done
echo "PostgreSQL is ready"

# Initialize database schema if needed
echo "Initializing database schema..."
python -c "
from database import init_db
try:
    init_db()
    print('Database schema initialized')
except Exception as e:
    print(f'Database schema initialization: {e}')
"

# Initialize default admin user
echo "Initializing default admin user..."
python init_admin.py

# Start the application
echo "Starting Flask application..."
exec python app.py
