# Tarko Inventory - Backend API

Flask backend with PostgreSQL for Tarko Inventory Management System.

## 🚀 Quick Setup

### 1. Install PostgreSQL (if not installed)

```bash
brew install postgresql@14
brew services start postgresql@14
```

### 2. Setup Database

```bash
cd backend
./setup_db.sh
```

This will:
- Create `tarko_inventory` database
- Apply schema with all tables
- Insert seed data

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```
DATABASE_URL=postgresql://localhost:5432/tarko_inventory
JWT_SECRET_KEY=your-secret-key-here
```

### 4. Install Python Dependencies

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 5. Run Backend

```bash
python app.py
```

Backend runs on `http://localhost:5000`

## 📡 API Endpoints

### Authentication

- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Inventory

- `GET /api/inventory/batches?location_id=<id>` - Get batches
- `GET /api/inventory/locations` - Get all locations
- `GET /api/inventory/product-types` - Get product types
- `GET /api/inventory/brands` - Get brands
- `GET /api/inventory/customers` - Get customers

### Production

- `POST /api/production/batch` - Create production batch

### Transactions

- `POST /api/transactions/` - Create transaction
- `GET /api/transactions/` - Get recent transactions

## 🔐 Authentication

All endpoints (except auth) require JWT token:

```
Authorization: Bearer <token>
```

Get token from `/api/auth/login` response.

## 🗄️ Database

**PostgreSQL** with the following tables:

- users
- user_roles
- locations
- brands
- units
- product_types
- product_variants
- customers
- batches
- rolls
- transactions
- attached_documents
- audit_logs

## 🧪 Testing

Create first admin user:

```bash
psql tarko_inventory
```

```sql
-- Create user (password: admin123)
INSERT INTO users (email, password_hash)
VALUES ('admin@tarko.com', '$2b$12$...');  -- Use hashed password

-- Get user ID
SELECT id FROM users WHERE email = 'admin@tarko.com';

-- Set as admin
UPDATE user_roles SET role = 'admin'
WHERE user_id = '<user-id>';
```

## 🔧 Development

```bash
# Activate virtual environment
source venv/bin/activate

# Run with auto-reload
FLASK_ENV=development python app.py

# Or use Flask CLI
export FLASK_APP=app.py
flask run --debug
```

## 📦 Dependencies

- Flask - Web framework
- Flask-CORS - CORS support
- Flask-JWT-Extended - JWT authentication
- psycopg2-binary - PostgreSQL driver
- bcrypt - Password hashing
- python-dotenv - Environment variables

## 🔄 Migration from Supabase

This backend replaces Supabase with:
- PostgreSQL database (local or hosted)
- Custom auth with JWT
- Direct database queries
- No third-party dependencies

## 🐛 Troubleshooting

**Database connection error:**
```bash
# Check PostgreSQL is running
pg_isready

# Start if needed
brew services start postgresql@14
```

**Port already in use:**
```bash
# Change port in app.py
app.run(port=5001)
```

## 📝 Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET_KEY` - Secret key for JWT tokens
- `FLASK_ENV` - development/production

## 🚀 Production Deployment

1. Use production PostgreSQL (AWS RDS, DigitalOcean, etc.)
2. Set strong JWT_SECRET_KEY
3. Use gunicorn:
   ```bash
   pip install gunicorn
   gunicorn -w 4 -b 0.0.0.0:5000 app:app
   ```
4. Setup reverse proxy (nginx)
5. Enable HTTPS
