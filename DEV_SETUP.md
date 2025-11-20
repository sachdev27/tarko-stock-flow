# Local Development Setup

## Quick Start

### Backend Setup

1. **Navigate to backend directory**
```bash
cd backend
```

2. **Create virtual environment** (if not exists)
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies**
```bash
pip install -r requirements.txt
```

4. **Set environment variables**
```bash
export DATABASE_URL="postgresql://localhost/tarko_inventory"
export JWT_SECRET_KEY="dev-secret-key"
export SNAPSHOT_STORAGE_PATH="./snapshots"
```

Or create a `.env` file:
```bash
DATABASE_URL=postgresql://localhost/tarko_inventory
JWT_SECRET_KEY=dev-secret-key
SNAPSHOT_STORAGE_PATH=./snapshots
BACKUP_RETENTION_DAYS=30

# Optional: Customize default admin credentials
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_EMAIL=admin@tarko.local
DEFAULT_ADMIN_PASSWORD=Admin@123
DEFAULT_ADMIN_FULLNAME=System Administrator
```

5. **Initialize database and admin user**
```bash
# Database schema is initialized automatically on first run
# Default admin user is also created automatically
# Default credentials: admin / Admin@123
python app.py
```

Backend will run on: http://localhost:5500

**First Login:**
- Username: `admin`
- Password: `Admin@123` (or your custom password)

Change the password after first login in the Admin section.

### Frontend Setup

1. **Navigate to project root**
```bash
cd ..  # if you're in backend/
```

2. **Install dependencies**
```bash
npm install
# or
bun install
```

3. **Run development server**
```bash
npm run dev
# or
bun run dev
```

Frontend will run on: http://localhost:5173

## Directory Structure

The snapshot and backup system uses local directories:

```
tarko-stock-flow/
├── snapshots/          # Database snapshots (JSON format)
├── backups/            # SQL dumps
├── backend/
│   └── uploads/        # User uploads
│       └── batches/    # Batch attachments
```

These directories are created automatically when the app starts.

## Snapshots in Development

### Create Snapshot (API)

```bash
curl -X POST http://localhost:5500/api/version-control/snapshots \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot_name": "Dev Snapshot",
    "description": "Testing snapshot feature"
  }'
```

### List Local Snapshots

```bash
curl -X GET http://localhost:5500/api/version-control/snapshots/local \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### View Snapshots

```bash
ls -lh ./snapshots/
```

Each snapshot contains:
- `metadata.json` - Snapshot info
- `complete.json` - Full database dump
- `{table}.json` - Individual table files

## Production vs Development

### Development (Local)
- Snapshots stored in `./snapshots/`
- Backups in `./backups/`
- Uploads in `./backend/uploads/`
- No automated scheduler (manual only)

### Production (Docker)
- Snapshots stored in `/app/snapshots` (mounted volume)
- Backups in `/backups` (mounted volume)
- Automated daily snapshots at 2 AM
- 30-day retention with automatic cleanup

## Troubleshooting

### "No module named flask_cors"

Install backend dependencies:
```bash
cd backend
pip install -r requirements.txt
```

### "Permission denied" for snapshots directory

Check directory permissions:
```bash
chmod 755 snapshots backups backend/uploads
```

### Database connection error

Ensure PostgreSQL is running and database exists:
```bash
psql -U postgres
CREATE DATABASE tarko_inventory;
\q
```

### Port already in use

Backend (5500):
```bash
lsof -ti:5500 | xargs kill -9
```

Frontend (5173):
```bash
lsof -ti:5173 | xargs kill -9
```

## Environment Variables

### Backend (.env or export)

```bash
# Database
DATABASE_URL=postgresql://localhost/tarko_inventory

# JWT
JWT_SECRET_KEY=dev-secret-key

# Snapshots
SNAPSHOT_STORAGE_PATH=./snapshots
BACKUP_RETENTION_DAYS=30

# Flask
FLASK_ENV=development
FLASK_DEBUG=true
```

### Frontend

```bash
# API URL
VITE_API_URL=http://localhost:5500
```

## Running Tests

```bash
# Backend tests
cd backend
pytest

# Frontend tests
npm test
```

## Building for Production

See [DEPLOYMENT.md](DEPLOYMENT.md) for Docker deployment instructions.

Quick build:
```bash
# Frontend
npm run build

# Docker
docker-compose build
docker-compose up -d
```

## Useful Commands

### Backend

```bash
# Run with debug
python app.py

# Check syntax
python -m py_compile app.py

# Install new dependency
pip install package-name
pip freeze > requirements.txt
```

### Frontend

```bash
# Development
npm run dev

# Build
npm run build

# Preview build
npm run preview

# Lint
npm run lint
```

### Database

```bash
# Connect to database
psql -U postgres tarko_inventory

# Backup database
pg_dump tarko_inventory > backup.sql

# Restore database
psql tarko_inventory < backup.sql

# Run migration
psql tarko_inventory < backend/schema.sql
```

## API Documentation

### Health Check
```bash
curl http://localhost:5500/api/health
```

### Snapshot Endpoints

- `POST /api/version-control/snapshots` - Create snapshot
- `GET /api/version-control/snapshots` - List all snapshots
- `GET /api/version-control/snapshots/local` - List local storage
- `GET /api/version-control/snapshots/<id>/download` - Download ZIP
- `POST /api/version-control/rollback/<id>` - Rollback to snapshot
- `DELETE /api/version-control/snapshots/<id>` - Delete snapshot

## Notes

- **Snapshots are not committed to git** (in .gitignore)
- **Always test restore** before relying on backups
- **Use Docker for production** (includes automated backups)
- **Keep backups on external storage** for disaster recovery
