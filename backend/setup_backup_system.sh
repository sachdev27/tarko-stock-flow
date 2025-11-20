#!/bin/bash

# Setup script for daily snapshots and Google Drive sync

echo "===================================="
echo "Tarko Inventory - Backup Setup"
echo "===================================="
echo ""

# Check if we're in the backend directory
if [ ! -f "requirements.txt" ]; then
    echo "Error: Please run this script from the backend directory"
    exit 1
fi

echo "Step 1: Installing Python dependencies..."
pip install -r requirements.txt

if [ $? -ne 0 ]; then
    echo "Error: Failed to install dependencies"
    exit 1
fi

echo "✓ Dependencies installed successfully"
echo ""

echo "Step 2: Checking for Google Drive credentials..."
if [ -f "google_drive_credentials.json" ]; then
    echo "✓ Google Drive credentials found"
else
    echo "⚠ Google Drive credentials not found"
    echo ""
    echo "To enable Google Drive sync:"
    echo "1. Follow instructions in GOOGLE_DRIVE_SETUP.md"
    echo "2. Place google_drive_credentials.json in the backend directory"
    echo "3. Restart the Flask application"
    echo ""
    echo "Note: The application will work without Google Drive sync."
    echo "Snapshots will only be stored in the local database."
fi

echo ""
echo "Step 3: Verifying database migration..."
echo "Make sure you've run the add_version_control.sql migration:"
echo "  psql -U your_user -d tarko_inventory -f migrations/add_version_control.sql"
echo ""

echo "===================================="
echo "Setup Complete!"
echo "===================================="
echo ""
echo "Next steps:"
echo "1. Start/restart your Flask application"
echo "2. Daily snapshots will run automatically at 2:00 AM"
echo "3. Access Version Control in the Admin panel"
echo "4. Test Google Drive connection if configured"
echo ""
echo "For Google Drive setup, see: GOOGLE_DRIVE_SETUP.md"
echo ""
