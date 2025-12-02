#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     Tarko Inventory - Production Setup Quick Start            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "This script will guide you through the production setup."
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."
echo ""

MISSING_DEPS=0

if ! command -v docker &> /dev/null; then
    echo "❌ Docker not installed"
    MISSING_DEPS=1
else
    echo "✅ Docker installed"
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not installed"
    MISSING_DEPS=1
else
    echo "✅ Docker Compose installed"
fi

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not installed"
    MISSING_DEPS=1
else
    echo "✅ Node.js installed"
fi

if ! command -v firebase &> /dev/null; then
    echo "⚠️  Firebase CLI not installed"
    echo "   Install with: npm install -g firebase-tools"
    MISSING_DEPS=1
else
    echo "✅ Firebase CLI installed"
fi

echo ""

if [ $MISSING_DEPS -eq 1 ]; then
    echo "❌ Please install missing dependencies before continuing."
    echo ""
    echo "Installation guides:"
    echo "  • Docker: https://docs.docker.com/get-docker/"
    echo "  • Node.js: https://nodejs.org/"
    echo "  • Firebase CLI: npm install -g firebase-tools"
    exit 1
fi

echo "✅ All prerequisites met!"
echo ""

# Firebase setup
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  Firebase Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

read -p "Do you have a Firebase project created? (y/n): " HAS_FIREBASE

if [ "$HAS_FIREBASE" != "y" ]; then
    echo ""
    echo "Please create a Firebase project first:"
    echo "1. Go to https://console.firebase.google.com/"
    echo "2. Click 'Add project'"
    echo "3. Follow the setup wizard"
    echo "4. Come back here when done"
    echo ""
    read -p "Press Enter when your Firebase project is ready..."
fi

echo ""
read -p "Enter your Firebase project ID: " FIREBASE_PROJECT_ID

if [ -z "$FIREBASE_PROJECT_ID" ]; then
    echo "❌ Project ID cannot be empty"
    exit 1
fi

# Update .firebaserc
if [ -f .firebaserc ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/your-firebase-project-id/$FIREBASE_PROJECT_ID/" .firebaserc
    else
        sed -i "s/your-firebase-project-id/$FIREBASE_PROJECT_ID/" .firebaserc
    fi
    echo "✅ Updated .firebaserc with project ID: $FIREBASE_PROJECT_ID"
else
    echo "❌ .firebaserc not found"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  Backend API URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Enter your backend API URL (where the Flask API will be hosted)"
echo "Examples:"
echo "  • http://your-server-ip:5500 (if using IP)"
echo "  • https://api.yourdomain.com (if using domain)"
echo ""
read -p "Backend API URL: " BACKEND_URL

if [ -z "$BACKEND_URL" ]; then
    echo "❌ Backend URL cannot be empty"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  Environment Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp .env.production .env

    # Generate secrets
    DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    JWT_SECRET=$(openssl rand -base64 48 | tr -d "=+/")

    # Update .env
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|your-secure-database-password-here|$DB_PASSWORD|" .env
        sed -i '' "s|your-very-long-and-secure-jwt-secret-key-here-minimum-32-characters|$JWT_SECRET|" .env
        sed -i '' "s|https://your-backend-api-url.com|$BACKEND_URL|" .env
    else
        sed -i "s|your-secure-database-password-here|$DB_PASSWORD|" .env
        sed -i "s|your-very-long-and-secure-jwt-secret-key-here-minimum-32-characters|$JWT_SECRET|" .env
        sed -i "s|https://your-backend-api-url.com|$BACKEND_URL|" .env
    fi

    echo "✅ Created .env with generated secrets"
else
    echo "✅ .env file already exists"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 Configuration Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Firebase Project: $FIREBASE_PROJECT_ID"
echo "Backend API URL:  $BACKEND_URL"
echo "Frontend URL:     https://$FIREBASE_PROJECT_ID.web.app"
echo ""

read -p "Does this look correct? (y/n): " CONFIRM

if [ "$CONFIRM" != "y" ]; then
    echo "❌ Setup cancelled. Please run the script again."
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Ready to Deploy!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo ""
echo "1️⃣  Deploy Backend (on your server):"
echo "   ./deploy-backend.sh"
echo ""
echo "2️⃣  Deploy Frontend (from this machine):"
echo "   VITE_API_URL=$BACKEND_URL ./deploy-firebase.sh"
echo ""
echo "3️⃣  Update CORS in backend .env:"
echo "   CORS_ORIGINS=https://$FIREBASE_PROJECT_ID.web.app"
echo "   Then restart: docker-compose restart backend"
echo ""
echo "4️⃣  Create admin account:"
echo "   Visit: https://$FIREBASE_PROJECT_ID.web.app/setup"
echo ""
echo "📚 For detailed instructions, see:"
echo "   • DEPLOYMENT.md - Complete deployment guide"
echo "   • PRODUCTION_CHECKLIST.md - Step-by-step checklist"
echo "   • DEPLOYMENT_SUMMARY.md - Quick reference"
echo ""

read -p "Would you like to see the detailed checklist now? (y/n): " SHOW_CHECKLIST

if [ "$SHOW_CHECKLIST" = "y" ]; then
    if command -v less &> /dev/null; then
        less PRODUCTION_CHECKLIST.md
    else
        cat PRODUCTION_CHECKLIST.md
    fi
fi

echo ""
echo "✅ Setup complete! Follow the next steps above to deploy."
echo ""
