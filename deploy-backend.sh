#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         Tarko Inventory - Backend Deployment Setup            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed (try both old and new commands)
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    echo "   Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker is installed"
echo "✅ Docker Compose is installed ($COMPOSE_CMD)"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.production .env

    # Generate random secrets
    DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    JWT_SECRET=$(openssl rand -base64 48 | tr -d "=+/")

    # Update .env with generated secrets
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/your-secure-database-password-here/$DB_PASSWORD/" .env
        sed -i '' "s/your-very-long-and-secure-jwt-secret-key-here-minimum-32-characters/$JWT_SECRET/" .env
    else
        # Linux
        sed -i "s/your-secure-database-password-here/$DB_PASSWORD/" .env
        sed -i "s/your-very-long-and-secure-jwt-secret-key-here-minimum-32-characters/$JWT_SECRET/" .env
    fi

    echo "✅ Generated secure passwords and secrets"
    echo ""
    echo "⚠️  IMPORTANT: Review and update .env file with your settings:"
    echo "   - DB_HOST: Set to your production database host"
    echo "   - CORS_ORIGINS: Set to your Firebase hosting URL"
    echo "   - TUNNEL_TOKEN: Set your Cloudflare Tunnel token"
    echo "   - Other optional settings as needed"
    echo ""
    read -p "Press Enter to continue after reviewing .env file..."
fi

echo ""
echo "🔨 Building Docker images..."
$COMPOSE_CMD build backend postgres

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please check the error messages above."
    exit 1
fi

echo ""
echo "✅ Build completed successfully"
echo ""
echo "🚀 Starting services..."
$COMPOSE_CMD up -d postgres backend cloudflared

if [ $? -ne 0 ]; then
    echo "❌ Failed to start services. Please check the error messages above."
    exit 1
fi

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

echo ""
echo "🔍 Checking service status..."
$COMPOSE_CMD ps

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                Backend Deployment Complete! 🎉                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📍 Backend API:"
echo "   • Local:     http://localhost:5500/api/health"
echo "   • Cloudflare: https://backend.tarko.dpdns.org/api/health"
echo ""
echo "📊 View logs:"
echo "   Backend:     $COMPOSE_CMD logs -f backend"
echo "   Tunnel:      $COMPOSE_CMD logs -f cloudflared"
echo ""
echo "🛑 Stop services:"
echo "   $COMPOSE_CMD down"
echo ""
echo "💡 Next steps:"
echo "   1. Verify Cloudflare Tunnel: https://backend.tarko.dpdns.org/api/health"
echo "   2. Deploy frontend to Firebase: ./deploy-firebase.sh"
echo "   3. Update CORS_ORIGINS in .env with Firebase URL"
echo "   4. Navigate to /setup to create admin account"
echo ""  3. Navigate to /setup to create admin account"
echo ""
