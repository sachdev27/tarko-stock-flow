# Tarko Inventory Management System

A **mobile-first, production-grade inventory management web application** for Tarko HDPE pipe manufacturing company.

## 🎯 Features

### Core Functionality
- ✅ **Multi-level Inventory Tracking** - Product → Batch → Roll granularity
- ✅ **Dynamic Product Configuration** - Parameter-driven product definitions
- ✅ **Production Entry** - Daily production recording with batch and roll creation
- ✅ **Transaction Management** - Sales, cuts, transfers, returns, adjustments
- ✅ **Multi-Location Support** - Track inventory across multiple warehouses
- ✅ **Role-Based Access Control** - Admin, User, and Reader roles
- ✅ **Real-time Inventory** - Live stock levels with drill-down views
- ✅ **Reports & Analytics** - Top products, customer sales, location inventory
- ✅ **CSV Export** - Export reports for Excel analysis
- ✅ **Audit Logging** - Complete traceability of all changes
- ✅ **QC Status Tracking** - Quality control workflow

### Technical Features
- 📱 **Mobile-First Design** - Optimized for factory floor use
- 🔐 **Secure Authentication** - JWT-based authentication
- 🎨 **Modern UI** - shadcn/ui components with Tailwind CSS
- ⚡ **Fast Performance** - React 18 + Vite + React Query
- 🗄️ **PostgreSQL Database** - Self-hosted database
- 🔌 **Flask API** - Python backend REST API

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.9+
- PostgreSQL 14+

### Installation

```bash
# Clone repository
git clone <repo-url>
cd tarko-stock-flow

# Install frontend dependencies
npm install

# Setup backend
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Setup database
./setup_db.sh

# Configure backend environment
cp .env.example .env
# Edit .env with your database credentials and JWT secret

# Configure frontend environment
cd ..
cp .env.local.example .env.local
# Set VITE_API_URL=http://localhost:5000/api
```

### Running the Application

```bash
# Terminal 1: Start backend
cd backend
source venv/bin/activate
python app.py

# Terminal 2: Start frontend
npm run dev
```

Visit `http://localhost:8080` to access the application.

## 📚 Documentation

- **[MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)** - Migration from Supabase to local PostgreSQL
- **[Backend README](./backend/README.md)** - Backend API documentation
- **[Database Schema](./backend/schema.sql)** - Complete database structure

## 🏗️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **UI**: shadcn/ui, Radix UI, Tailwind CSS
- **State**: React Query (TanStack Query)
- **Backend**: Flask (Python 3.9+)
- **Auth**: JWT (Flask-JWT-Extended)
- **Database**: PostgreSQL 14+
- **Routing**: React Router v6

## 📋 Usage

### First-Time Setup

1. **Create admin account** - Use the signup endpoint, then update database to set role to admin
2. Start recording production and transactions

### User Roles

- **Admin**: Full system access, can manage master data
- **User**: Can record production and transactions
- **Reader**: View-only access

### Key Workflows

#### 1. Daily Production Entry
1. Navigate to Production page
2. Select location, product type, brand
3. Enter product parameters (PE, PN, OD, etc.)
4. Set quantity and number of rolls
5. Submit to create batch and rolls

#### 2. Recording Sales
1. Go to Transactions page
2. Click "New Transaction"
3. Select "Sale" type
4. Choose batch and roll
5. Enter quantity and customer
6. Submit to update inventory

#### 3. View Inventory
1. Go to Inventory page
2. Filter by location if needed
3. Search for products
4. Expand products to see batches
5. Expand batches to see individual rolls

#### 4. Generate Reports
1. Navigate to Reports page
2. Select date range
3. View top products, customer sales, etc.
4. Export to CSV for further analysis

## 🔧 Development

### Project Structure

```
src/
├── components/        # Reusable UI components
├── contexts/         # React contexts (Auth)
├── hooks/            # Custom React hooks
├── lib/              # Utility functions (API client)
└── pages/            # Page components
    ├── Auth.tsx
    ├── Dashboard.tsx
    ├── Production.tsx
    ├── Inventory.tsx
    ├── Transactions.tsx
    ├── Reports.tsx
    └── Admin.tsx

backend/
├── app.py            # Flask application entry
├── config.py         # Configuration
├── database.py       # Database helpers
├── auth.py           # Auth utilities
└── routes/           # API endpoints
    ├── auth_routes.py
    ├── inventory_routes.py
    ├── production_routes.py
    └── transaction_routes.py
```

### Building for Production

```bash
npm run build
```

Output will be in `dist/` directory.

## 🐛 Troubleshooting

Common issues and solutions:

1. **Authentication fails**: Check JWT_SECRET_KEY in backend `.env`
2. **Database connection errors**: Verify PostgreSQL is running and DATABASE_URL is correct
3. **Build errors**: Clear cache with `rm -rf dist .vite node_modules` and reinstall
4. **Backend errors**: Check backend logs and ensure all Python dependencies are installed

## 📊 Database Schema

### Key Tables
- `product_types` - Product categories with parameter schemas
- `product_variants` - Specific product configurations
- `batches` - Production batches
- `rolls` - Individual roll/coil units
- `transactions` - All inventory movements
- `customers` - Customer master
- `locations` - Warehouse locations
- `audit_logs` - System activity log

## 🤝 Contributing

This is a proprietary system for Tarko Manufacturing.

## 📞 Support

For support or questions, contact the system administrator.

## 📝 License

Proprietary - Tarko Manufacturing Company

---

**Built for Tarko Manufacturing** | Last Updated: November 2025
