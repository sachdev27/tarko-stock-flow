#!/bin/bash

# Tarko Inventory - Database Setup Script

echo "🔧 Setting up Tarko Inventory Database..."

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed. Please install it first:"
    echo "   brew install postgresql@14"
    exit 1
fi

# Check if PostgreSQL is running
if ! pg_isready &> /dev/null; then
    echo "⚠️  PostgreSQL is not running. Starting it..."
    brew services start postgresql@14
    sleep 2
fi

# Database name
DB_NAME="tarko_inventory"

# Check if database exists
if psql -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo "⚠️  Database '$DB_NAME' already exists."
    read -p "Do you want to DROP and recreate it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🗑️  Dropping existing database..."
        dropdb $DB_NAME
    else
        echo "❌ Aborted. Using existing database."
        exit 0
    fi
fi

# Create database
echo "📦 Creating database '$DB_NAME'..."
createdb $DB_NAME

if [ $? -eq 0 ]; then
    echo "✅ Database created successfully!"
else
    echo "❌ Failed to create database"
    exit 1
fi

# Run schema
echo "📋 Running database schema..."
psql $DB_NAME < schema.sql

if [ $? -eq 0 ]; then
    echo "✅ Schema applied successfully!"
else
    echo "❌ Failed to apply schema"
    exit 1
fi

echo ""
echo "🎉 Database setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Copy .env.example to .env"
echo "   2. Update DATABASE_URL in .env"
echo "   3. Install Python dependencies: pip install -r requirements.txt"
echo "   4. Run the backend: python app.py"
echo ""
echo "🔗 Database URL: postgresql://localhost:5432/$DB_NAME"
