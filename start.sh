#!/bin/bash
set -e

echo "=========================================="
echo "Starting Tarko Stock Flow"
echo "=========================================="

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cat > .env << 'EOF'
DB_PASSWORD=changeme123
JWT_SECRET_KEY=change-this-secret-in-production
CORS_ORIGINS=*
APP_URL=http://localhost:3000
VITE_API_URL=http://localhost:5500/api
EOF
    echo "✓ .env created"
fi

# Create directories
mkdir -p backend/uploads snapshots backups

# Stop existing containers
echo "Stopping existing containers..."
docker compose down 2>/dev/null || true

# Build and start (without cloudflared by default)
echo "Building and starting services..."
docker compose up -d postgres backend frontend

# Wait for services
echo "Waiting for services to be healthy..."
sleep 5

# Check status
docker compose ps

echo ""
echo "=========================================="
echo "✓ Services started!"
echo "=========================================="
echo ""
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:5500"
echo "  Database: localhost:5432"
echo ""
echo "View logs: docker compose logs -f"
echo "Stop all:  docker compose down"
echo ""
