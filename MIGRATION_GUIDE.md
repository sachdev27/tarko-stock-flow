# Migration Guide: Supabase Cloud → Local PostgreSQL

## Overview

This guide walks you through migrating from Supabase cloud to a local PostgreSQL database with Flask backend.

## What Changes

### Before (Supabase)
- Frontend → Supabase Client SDK → Supabase Cloud
- Auth handled by Supabase
- Database: Supabase PostgreSQL (cloud)
- No custom backend code

### After (Local PostgreSQL)
- Frontend → Axios → Flask API → Local PostgreSQL
- Auth handled by Flask + JWT
- Database: PostgreSQL (local or self-hosted)
- Flask backend for API

## Migration Steps

### 1. Setup Backend

```bash
cd backend

# Setup database
./setup_db.sh

# Configure environment
cp .env.example .env
# Edit .env with your database URL

# Install Python dependencies
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run backend
python app.py
```

Backend will run on `http://localhost:5000`

### 2. Update Frontend Configuration

Create `.env` in frontend root:

```bash
VITE_API_URL=http://localhost:5000/api
```

### 3. Export Existing Data from Supabase (Optional)

If you have existing data in Supabase:

**Option A: Manual export via Supabase Dashboard**
1. Go to Database → Tables
2. Export each table as CSV
3. Import into local PostgreSQL

**Option B: Using Supabase CLI**
```bash
supabase db dump -f supabase_dump.sql
psql tarko_inventory < supabase_dump.sql
```

### 4. Update Frontend Auth Context

The frontend is already configured to work with both Supabase and the new API.

For new API, it will use:
- `src/lib/api.ts` - Axios client
- JWT tokens stored in localStorage
- Bearer token authentication

### 5. Test Everything

```bash
# Terminal 1: Run backend
cd backend
source venv/bin/activate
python app.py

# Terminal 2: Run frontend
cd ..
npm run dev
```

Visit `http://localhost:5173`

### 6. Create First Admin User

```bash
# Using API
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tarko.com","password":"admin123"}'

# Get user ID from response, then:
psql tarko_inventory

# In psql:
UPDATE user_roles SET role = 'admin'
WHERE user_id = '<user-id-from-signup>';
```

## Key Differences

### Authentication

**Supabase:**
```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email, password
});
```

**New API:**
```typescript
const { data } = await auth.login(email, password);
localStorage.setItem('token', data.access_token);
```

### Data Fetching

**Supabase:**
```typescript
const { data } = await supabase
  .from('batches')
  .select('*')
  .is('deleted_at', null);
```

**New API:**
```typescript
const { data } = await inventory.getBatches();
```

### Security

**Supabase:**
- Row Level Security (RLS) policies in database
- Automatic user authentication

**New API:**
- JWT tokens
- Backend authorization checks
- Manual role verification

## Advantages of Local PostgreSQL

✅ **Full control** - Own your data completely
✅ **No vendor lock-in** - Not dependent on Supabase
✅ **Cost** - Free for local, cheaper for self-hosted
✅ **Customization** - Full control over backend logic
✅ **Privacy** - Data stays on your infrastructure

## Disadvantages

❌ **More maintenance** - Need to manage backend + database
❌ **No realtime** - Need to implement yourself if needed
❌ **Manual auth** - Have to handle authentication yourself
❌ **Hosting complexity** - Need to deploy backend separately

## Backend Deployment Options

### Option 1: VPS (DigitalOcean, Linode)
```bash
# Install PostgreSQL on server
sudo apt install postgresql

# Deploy Flask app
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

### Option 2: Railway.app
- Connect GitHub repo
- Add PostgreSQL database
- Deploy Flask app automatically

### Option 3: Heroku
```bash
heroku create tarko-api
heroku addons:create heroku-postgresql
git push heroku main
```

### Option 4: AWS (EC2 + RDS)
- EC2 for Flask app
- RDS for PostgreSQL
- Most scalable option

## Rollback to Supabase

If you need to go back:

1. Keep your Supabase project
2. Don't delete the old frontend code
3. Switch environment variables
4. Comment out new API code

## Next Steps

1. ✅ Setup backend (done)
2. ✅ Setup database (done)
3. ✅ Install dependencies (done)
4. ⬜ Run backend and test
5. ⬜ Update frontend .env
6. ⬜ Test signup/login
7. ⬜ Test production entry
8. ⬜ Test transactions
9. ⬜ Deploy to production

## Support

For issues:
1. Check backend logs: `python app.py` output
2. Check database: `psql tarko_inventory`
3. Check frontend console
4. Verify API calls in Network tab

## Production Checklist

Before going live:

- [ ] Use production PostgreSQL (not local)
- [ ] Set strong JWT_SECRET_KEY
- [ ] Enable HTTPS
- [ ] Use environment variables for secrets
- [ ] Setup backups for database
- [ ] Use gunicorn/uwsgi for Flask
- [ ] Setup nginx reverse proxy
- [ ] Enable CORS only for your domain
- [ ] Setup monitoring (logs, errors)
- [ ] Test all endpoints
