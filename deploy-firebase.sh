#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     Tarko Inventory - Firebase Frontend Deployment            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed."
    echo "   Install it with: npm install -g firebase-tools"
    exit 1
fi

echo "✅ Firebase CLI is installed"
echo ""

# Check if logged in to Firebase
if ! firebase projects:list &> /dev/null; then
    echo "📝 You need to login to Firebase..."
    firebase login
fi

echo "✅ Firebase authentication confirmed"
echo ""

# Get Firebase project ID
if [ -f .firebaserc ]; then
    PROJECT_ID=$(grep -oP '"default": "\K[^"]+' .firebaserc)
    if [ "$PROJECT_ID" = "your-firebase-project-id" ]; then
        echo "⚠️  Please update .firebaserc with your Firebase project ID"
        read -p "Enter your Firebase project ID: " NEW_PROJECT_ID
        sed -i.bak "s/your-firebase-project-id/$NEW_PROJECT_ID/" .firebaserc
        rm .firebaserc.bak
        PROJECT_ID=$NEW_PROJECT_ID
    fi
    echo "📦 Using Firebase project: $PROJECT_ID"
else
    echo "❌ .firebaserc not found. Please run 'firebase init' first."
    exit 1
fi

echo ""
echo "🔍 Checking environment configuration..."

# Check if VITE_API_URL is set
if [ -z "$VITE_API_URL" ]; then
    echo "⚠️  VITE_API_URL environment variable not set"
    read -p "Enter your backend API URL (e.g., https://api.yourdomain.com): " API_URL
    export VITE_API_URL=$API_URL
fi

echo "✅ API URL: $VITE_API_URL"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo ""
echo "🔨 Building production frontend..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please check the error messages above."
    exit 1
fi

echo "✅ Build completed successfully"
echo ""

# Deploy to Firebase
echo "🚀 Deploying to Firebase Hosting..."
firebase deploy --only hosting

if [ $? -ne 0 ]; then
    echo "❌ Deployment failed. Please check the error messages above."
    exit 1
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║               Deployment Complete! 🎉                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📍 Your app is now live at:"
echo "   https://$PROJECT_ID.web.app"
echo ""
echo "💡 Next steps:"
echo "   1. Test your deployed application"
echo "   2. Set up custom domain in Firebase Console (optional)"
echo "   3. Configure CORS on your backend API"
echo ""
