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

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    echo "   Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker is installed"
echo "✅ Docker Compose is installed"
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
    echo "   - Other optional settings as needed"
    echo ""
    read -p "Press Enter to continue after reviewing .env file..."
else
    echo "✅ .env file already exists"
fi

echo ""
echo "🔨 Building Docker images..."
docker-compose build backend postgres

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please check the error messages above."
    exit 1
fi

echo ""
echo "✅ Build completed successfully"
echo ""
echo "🚀 Starting services..."
docker-compose up -d postgres backend

if [ $? -ne 0 ]; then
    echo "❌ Failed to start services. Please check the error messages above."
    exit 1
fi

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

echo ""
echo "🔍 Checking service status..."
docker-compose ps

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                Backend Deployment Complete! 🎉                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📍 Backend API:"
echo "   • Health:    http://localhost:5500/api/health"
echo "   • Endpoint:  http://localhost:5500/api"
echo ""
echo "📊 View logs:"
echo "   docker-compose logs -f backend"
echo ""
echo "🛑 Stop services:"
echo "   docker-compose down"
echo ""
echo "💡 Next steps:"
echo "   1. Deploy frontend to Firebase: ./deploy-firebase.sh"
echo "   2. Update CORS_ORIGINS in .env with Firebase URL"
echo "   3. Navigate to /setup to create admin account"
echo ""
