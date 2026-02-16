# Tarko Inventory Management System

A **mobile-first, production-grade inventory management web application** for Tarko HDPE and Sprinkler pipe manufacturing. Tracks inventory from production through dispatch at Product → Batch → Stock → Piece granularity with full audit trail and revert capabilities.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Frontend Pages & Components](#frontend-pages--components)
- [Backend Services](#backend-services)
- [Deployment](#deployment)
- [Backup & Version Control](#backup--version-control)
- [Migrations](#migrations)
- [Key Workflows](#key-workflows)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Documentation Index](#documentation-index)

---

## Architecture Overview

```
Internet
  ├── Firebase Hosting  ──→  React SPA (Vite build)
  └── Cloudflare Tunnel ──→  Docker backend:5500 (Gunicorn + Flask)
                                   │
                              Docker postgres:5432
```

- **Frontend**: React 19 SPA on Firebase Hosting (global CDN)
- **Backend**: Flask REST API in Docker, served via Gunicorn (4 workers, 120s timeout)
- **Database**: PostgreSQL 15 (Alpine) in Docker with persistent volume
- **Tunnel**: Cloudflare Tunnel (`cloudflared`) exposes the backend without opening ports
- **Reverse Proxy**: Nginx serves the frontend static build, proxies `/api/` to backend

---

## Features

### Inventory Management
- **Two Product Domains** — HDPE Pipe (FULL_ROLL, CUT_ROLL stock types) and Sprinkler Pipe (BUNDLE, SPARE stock types)
- **Multi-level Tracking** — Product Type → Product Variant (brand + parameters) → Batch → Inventory Stock → Individual Pieces
- **Dynamic Product Configuration** — Parameter-driven definitions (PE, PN, OD, Type) with admin-managed parameter options
- **One-Record-Per-Physical-Piece** — Each cut piece (HDPE) and spare piece (Sprinkler) has its own database row for precise tracking
- **Stock Operations** — Cut full rolls into pieces, split bundles into spares, combine spares back into bundles
- **Optimistic Locking** — Row versioning on stock and piece records prevents concurrent modification conflicts
- **Soft Deletes** — All records use `deleted_at` timestamps; nothing is hard-deleted, preserving full audit history

### Production
- **Batch Creation** — Supports HDPE standard rolls (grouped by length: 500m, 300m, etc.), cut rolls, and Sprinkler bundles/spare pipes
- **Auto-generated Codes** — Batch numbers and codes auto-generated from product variant + date
- **File Attachments** — Multipart upload for batch documentation (certificates, photos)
- **Weight Tracking** — Weight per meter (kg/m), total weight per batch, weight per piece
- **Production History** — Full history with reverted production tab

### Dispatch System
- **Multi-item Dispatch** — Cart-based workflow supporting FULL_ROLL, CUT_PIECE, BUNDLE, SPARE_PIECES in a single dispatch
- **Dispatch Entities** — Customers, Bill-To parties, Transport companies, Vehicles — all managed as master data
- **Invoice Tracking** — Invoice numbers, dispatch dates (with backdating), amounts with rate-per-unit
- **Stale Cart Detection** — Validates stock availability at dispatch time; prevents dispatching already-sold items
- **Auto-numbering** — DISP-YYYY-NNNN format

### Returns
- **Customer Returns** — Create returns with FULL_ROLL, CUT_ROLL, BUNDLE, SPARE_PIECES items
- **Auto-batch Creation** — Returned items create new batches (code: RET-YYYY-NNN-variant)
- **Return Revert** — Undo returns if entered incorrectly
- **Return Statistics** — Totals by status, 7-day and 30-day counts

### Scrap Management
- **Scrap Recording** — Mark stock as scrapped with reason tracking (manufacturing defect, damage, QC rejection, etc.)
- **Partial Scrapping** — Scrap individual cut pieces or spare pieces from a stock entry
- **Estimated Loss** — Track financial impact of scrapped inventory
- **Scrap Revert** — Admin can undo scrap operations, restoring inventory

### Transaction / Activity Log
- **Unified History** — Single view combining production, dispatches, returns, scraps, inventory operations (cuts, splits, combines)
- **Two-phase Revert** — Validates all selected transactions, then atomically reverts them (dispatches restore stock, returns remove returned inventory, etc.)
- **Advanced Filtering** — By type, product, brand, parameter values, date range, text search
- **CSV Export** — Export filtered transaction data

### Reports & Analytics
- **Top Selling Products** — By dispatch quantity over configurable date range
- **Customer Sales** — Per-customer sales breakdown with date and product filters
- **Regional Analysis** — Sales distribution by customer city/region
- **Product Performance** — Production vs. sales comparison
- **Sales Trends** — Daily trend charts
- **Customer Preferences** — Which customers buy which products

### Admin Panel
- **Master Data Management** — Brands, Product Types (with parameter schemas and roll configuration), Units, Customers
- **User Management** — Create/edit/deactivate users, assign roles, reset passwords
- **Parameter Options** — Manage dropdown values for PE, PN, OD, Type
- **Database Reset** — 5 levels: transactions only → complete wipe (requires confirmation token)
- **Database Statistics** — Record counts for all tables
- **Audit Logs** — Full activity trail with user, action, entity, before/after data, IP, user agent

### Authentication & Security
- **JWT Auth** — 24-hour access tokens stored in localStorage, auto-refresh on 401
- **Role-Based Access** — `admin` (full access), `user` (create/edit), `reader` (view-only)
- **Account Lockout** — 5 failed login attempts trigger 30-minute lockout
- **Password Reset** — Email-based reset flow with 1-hour token expiry, rate limiting (1 per 2 minutes)
- **SMTP Configuration** — Database-stored encrypted SMTP settings; admin can configure and test email delivery
- **Fernet Encryption** — Secrets stored at rest (cloud credentials, SMTP passwords) encrypted with Fernet symmetric encryption
- **First-Run Setup** — `/setup` page creates the first admin account; blocks after creation

### Backup & Version Control
- **Database Snapshots** — Full JSON export of 35+ tables with file-based storage
- **Auto-Snapshots** — Configurable scheduler (hourly/daily/weekly/monthly/custom intervals) using APScheduler
- **Cloud Backup** — Dual storage: local filesystem + Cloudflare R2 or AWS S3
- **Full Rollback** — Restore entire database or selective tables from any snapshot
- **Rollback History** — Track all rollback operations
- **Retention Policies** — Auto-delete old backups with weekly/monthly grandfathering
- **Archive Management** — Cherry-pick backups to archive buckets

### Sync / Continuous Backup
- **PostgreSQL Mirroring** — Sync database to remote storage (rsync to NAS, network mount, R2/S3)
- **Backup Methods** — `pg_dump`, `pg_basebackup`, or both
- **Auto-Sync** — Configurable intervals per sync target
- **Connection Testing** — Validate sync configuration before enabling

### UI/UX
- **Mobile-First** — Bottom tab bar on mobile, hamburger overlay for all nav items; card layouts for small screens, tables for desktop
- **Keyboard Shortcuts** — Configurable shortcuts for inventory page (stored in localStorage)
- **WhatsApp Sharing** — Generate formatted inventory summary for sharing via WhatsApp
- **Backend Health Indicator** — Polls `/api/health` every 10 seconds, shows green/red status dot
- **Live Clock** — Real-time clock in the header
- **Auto-Refresh** — Dashboard (30s), sync status (5s), inventory (on window focus/visibility change)
- **Swagger Docs** — Auto-generated OpenAPI 3.0 spec at `/api/docs`

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript 5.8, Vite 5 |
| **UI** | shadcn/ui (Radix UI primitives), Tailwind CSS 3, Lucide icons, Recharts, cmdk, react-day-picker |
| **State** | TanStack React Query 5, React Hook Form + Zod validation |
| **Routing** | React Router v6 |
| **Backend** | Flask 3.0, Python 3.11, Gunicorn |
| **Auth** | Flask-JWT-Extended (bcrypt hashing), Fernet encryption for secrets |
| **Database** | PostgreSQL 15 (psycopg2, connection pooling 2–10 connections) |
| **Scheduling** | APScheduler (BackgroundScheduler with file-based lock for multi-worker safety) |
| **Cloud Storage** | boto3 (Cloudflare R2 / AWS S3) |
| **Email** | smtplib (configurable via DB-stored SMTP settings) |
| **Containerization** | Docker, Docker Compose |
| **Hosting** | Firebase Hosting (frontend), Docker on VPS (backend) |
| **Tunnel** | Cloudflare Tunnel (cloudflared) |
| **Reverse Proxy** | Nginx (static files + API proxy) |
| **Testing** | Vitest (jsdom, V8 coverage), pytest (backend) |

---

## Quick Start

### Prerequisites
- Node.js 20+
- Python 3.9+
- PostgreSQL 14+

### Development Setup

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

# Setup database (macOS/Homebrew)
./scripts/setup_db.sh
# OR manually: createdb tarko_inventory && psql tarko_inventory < schema.sql

# Configure backend environment
cp .env.example .env
# Edit .env with your DATABASE_URL, JWT_SECRET_KEY, etc.

# Configure frontend environment
cd ..
# Set VITE_API_URL=http://localhost:5500/api (in .env.local or env)
```

### Running Locally

```bash
# Terminal 1: Start backend (port 5500)
cd backend
source venv/bin/activate
python app.py

# Terminal 2: Start frontend (port 8080)
npm run dev
```

Visit `http://localhost:8080`. On first run, you'll be redirected to `/setup` to create the admin account.

### Docker Quick Start

```bash
# Start all services (postgres + backend + frontend)
./start.sh

# OR full production deploy with Cloudflare Tunnel
./deploy-backend.sh
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://localhost/tarko_inventory` | PostgreSQL connection string |
| `JWT_SECRET_KEY` | `dev-secret-key-change-in-prod` | JWT signing secret (change in production!) |
| `FLASK_ENV` | `development` | `development` or `production` |
| `CORS_ORIGINS` | `*` | Allowed CORS origins |
| `APP_URL` | — | Frontend URL (used in password reset emails) |
| `SNAPSHOT_STORAGE_PATH` | `./snapshots` | Directory for database snapshots |
| `UPLOAD_STORAGE_PATH` | `./uploads` | Directory for file uploads |
| `BACKUP_RETENTION_DAYS` | `30` | Days to keep automatic backups |
| `MAX_UPLOAD_SIZE_MB` | `10` | Max file upload size |
| `ENABLE_CLOUD_BACKUP` | `false` | Enable R2/S3 cloud backup |
| `CLOUD_STORAGE_PROVIDER` | `r2` | `r2` or `s3` |
| `R2_ACCOUNT_ID` | — | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | — | R2 access key |
| `R2_SECRET_ACCESS_KEY` | — | R2 secret key |
| `R2_BUCKET_NAME` | `tarko-inventory-backups` | R2 bucket name |
| `AWS_ACCESS_KEY_ID` | — | AWS S3 access key |
| `AWS_SECRET_ACCESS_KEY` | — | AWS S3 secret key |
| `AWS_REGION` | `us-east-1` | S3 region |
| `S3_BUCKET_NAME` | `tarko-inventory-backups` | S3 bucket name |
| `ENCRYPTION_KEY` | derived from DB_PASSWORD + JWT_SECRET_KEY | Fernet encryption key for secrets at rest |
| `SMTP_EMAIL` | — | Fallback SMTP email (overridden by DB config) |
| `SMTP_PASSWORD` | — | Fallback SMTP password (overridden by DB config) |
| `DB_PASSWORD` | `changeme123` | PostgreSQL password (Docker) |
| `TUNNEL_TOKEN` | — | Cloudflare Tunnel auth token |

### Frontend

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend API base URL (e.g., `http://localhost:5500/api` for dev, `https://backend.tarko.dpdns.org/api` for prod) |

---

## Project Structure

```
tarko-stock-flow/
├── src/                            # Frontend source
│   ├── App.tsx                     # Root component, routing, React Query provider
│   ├── main.tsx                    # Entry point
│   ├── contexts/
│   │   └── AuthContext.tsx         # JWT auth state, signIn/signOut, role checks
│   ├── pages/
│   │   ├── Auth.tsx                # Login page
│   │   ├── Setup.tsx               # First-run admin creation
│   │   ├── ForgotPassword.tsx      # Password reset request
│   │   ├── ResetPassword.tsx       # Password reset with token
│   │   ├── Dashboard.tsx           # Stats, quick actions, alerts
│   │   ├── Production.tsx          # New production, history, reverted tabs
│   │   ├── InventoryNew.tsx        # Stock inventory with filters, cut/split/combine
│   │   ├── Dispatch.tsx            # New dispatch, dispatch history
│   │   ├── Return.tsx              # New return, return history
│   │   ├── TransactionsNew.tsx     # Unified activity log with revert
│   │   ├── Details.tsx             # Master data: customers, vehicles, transports, bill-to
│   │   ├── Reports.tsx             # Analytics: products, customers, regions, trends
│   │   ├── Admin.tsx               # Admin panel with all management tabs
│   │   ├── SyncSettings.tsx        # Sync config: rsync, network, R2, S3
│   │   └── NotFound.tsx            # 404 page
│   ├── components/
│   │   ├── Layout.tsx              # App shell: header, sidebar, mobile bottom bar
│   │   ├── BackendStatusIndicator.tsx  # Health check polling indicator
│   │   ├── SetupChecker.tsx        # Redirects to /setup if no admin exists
│   │   ├── SyncIndicator.tsx       # Sync status dropdown in header
│   │   ├── ProtectedRoute.tsx      # Auth guard (role-based)
│   │   ├── admin/                  # BrandsTab, ProductTypesTab, UsersTab, ParametersTab,
│   │   │                           # VersionControlTab, AuditLogsTab, DatabaseTab,
│   │   │                           # CloudCredentialsTab, RetentionPoliciesTab,
│   │   │                           # ArchiveManagementTab, SMTPConfigTab, UnitsTab
│   │   ├── dashboard/              # StatsCard, QuickActions, InventoryByType,
│   │   │                           # LowStockAlerts, RecentActivity, TransactionStats
│   │   ├── production/             # ProductionNewTab, ProductSelectionForm,
│   │   │                           # BatchDetailsForm, QuantityConfigForm,
│   │   │                           # ProductionHistoryTab, EditProductionDialog,
│   │   │                           # RevertedProductionTab
│   │   ├── inventory/              # ProductVariantCard, StockEntryList, BatchStockCard,
│   │   │                           # StockSummary, StockFilters, AdvancedFilters,
│   │   │                           # CutRollDialog, SplitBundleDialog, CombineSparesDialog,
│   │   │                           # ScrapDialog, ScrapHistory, WhatsAppShareDialog,
│   │   │                           # ImportExportDialog, KeyboardShortcutsDialog
│   │   ├── dispatch/               # DispatchNewTab, DispatchHistoryTab, EditDispatchDialog,
│   │   │                           # CustomerDetailsSection, ProductSelectionSection,
│   │   │                           # SearchableCombobox, dispatchAPI, useDispatchData,
│   │   │                           # useKeyboardShortcuts
│   │   ├── returns/                # ReturnNewModular, ProductSelectionSection,
│   │   │                           # ReturnCartSection, ReturnDetailsSection, ReturnHistory
│   │   ├── transactions/           # TransactionTable, TransactionCard, TransactionFilters,
│   │   │                           # TransactionDetailModal, TransactionSummaryCards,
│   │   │                           # TransactionTypeBadge, ParameterBadges,
│   │   │                           # PaginationControls, RevertDialog
│   │   ├── reports/                # TopProducts, TopCustomers, CustomerPreferences,
│   │   │                           # RegionalSales, RegionalProductDistribution,
│   │   │                           # ProductPerformance, SalesTrends, SummaryCards
│   │   ├── details/                # CustomersTab, VehiclesTab, TransportsTab, BillToTab,
│   │   │                           # CustomerDialog, VehicleDialog, TransportDialog,
│   │   │                           # BillToDialog
│   │   └── ui/                     # shadcn/ui primitives (Button, Card, Dialog, etc.)
│   ├── hooks/
│   │   ├── useSync.ts              # React Query hooks for sync CRUD + status
│   │   ├── useBackupConfig.ts      # React Query hooks for backup config CRUD
│   │   ├── use-mobile.tsx          # Mobile detection hook
│   │   ├── use-toast.ts            # Toast notification hook
│   │   └── transactions/           # useTransactionData, useTransactionFilters,
│   │                               # useTransactionPagination, useTransactionSelection
│   ├── lib/
│   │   ├── api.ts                  # Legacy axios-based API client (raw responses)
│   │   ├── api-typed.ts            # Primary typed API client (auto-unwrapped responses)
│   │   ├── sync-api.ts             # Dedicated sync API client
│   │   ├── fileSystemAccess.ts     # File system access utilities
│   │   └── utils.ts                # General utilities
│   ├── types/
│   │   ├── api.ts                  # Full TypeScript types (921 lines): UUID, StockType,
│   │   │                           # DispatchStatus, TransactionType, all request/response interfaces
│   │   ├── index.ts                # Barrel re-export
│   │   └── transaction.ts          # TransactionRecord, TransactionFilters types
│   └── utils/
│       └── transactions/           # Transaction-specific utility functions
│
├── backend/                        # Flask backend
│   ├── app.py                      # Flask app factory, blueprint registration, JWT setup
│   ├── config.py                   # Config class (env vars for DB, JWT, storage, cloud)
│   ├── database.py                 # Connection pool (2-10), get_db_cursor, execute_query helpers
│   ├── schema.sql                  # Complete PostgreSQL schema (4500+ lines)
│   ├── requirements.txt            # Python dependencies
│   ├── routes/
│   │   ├── auth_routes.py          # Login, signup (disabled), current user
│   │   ├── inventory_routes.py     # Batches, stock, cut-roll, split-bundle, combine-spares, search
│   │   ├── production_routes.py    # Batch creation, history, attachments
│   │   ├── transaction_routes.py   # Unified transaction history, create, revert
│   │   ├── dispatch_routes.py      # Available rolls, create dispatch, history, edit
│   │   ├── dispatch_entities_routes.py  # CRUD for customers, bill-to, transports, vehicles, aliases
│   │   ├── return_routes.py        # Create return, history, revert, stats
│   │   ├── scrap_routes.py         # Create scrap, history, reasons, revert
│   │   ├── stats_routes.py         # Dashboard stats
│   │   ├── admin_routes.py         # Master data CRUD, users, audit logs, DB reset
│   │   ├── reports_routes.py       # Analytics: top products, customer sales, regions
│   │   ├── parameter_routes.py     # Parameter options CRUD
│   │   ├── version_control_routes.py  # Snapshots, rollback, cloud/external storage
│   │   ├── backup_config_routes.py # Cloud credentials, retention policies, archives
│   │   ├── setup_routes.py         # First-run admin check and creation
│   │   ├── password_reset_routes.py  # Forgot/verify/reset password flow
│   │   ├── smtp_config_routes.py   # SMTP configuration CRUD + test
│   │   ├── sync_routes.py          # Sync config CRUD, trigger, status, history
│   │   └── swagger_routes.py       # Auto-generated OpenAPI 3.0 spec + Swagger UI
│   ├── services/
│   │   ├── auth.py                 # Password hashing, lockout, role checks, jwt_required_with_role decorator
│   │   ├── email_service.py        # SMTP email sending, password reset HTML templates
│   │   ├── encryption_service.py   # Fernet encryption singleton for secrets at rest
│   │   ├── inventory_helpers_aggregate.py  # Stock creation/dispatch/query helpers per product type
│   │   ├── inventory_operations.py # Thread-safe operations: optimistic locking, reservations,
│   │   │                           # combine spares, revert cut/combine, piece lifecycle events
│   │   ├── scheduler_service.py    # APScheduler auto-snapshot with file lock + IST timezone
│   │   └── sync_service.py         # Sync to rsync/network/R2/S3, pg_dump/pg_basebackup
│   ├── migrations/                 # SQL migration files (auto-applied on Docker startup)
│   ├── scripts/
│   │   ├── setup_db.sh             # Local Postgres setup via Homebrew
│   │   ├── backup_scheduler.py     # JSON snapshot creator for all tables
│   │   ├── backup_scheduler_enhanced.py  # Enhanced with R2/S3 cloud sync + retention
│   │   ├── docker-entrypoint.sh    # Waits for Postgres, applies migrations, starts Gunicorn
│   │   └── docker-entrypoint-scheduler.sh  # Exports env for cron, runs initial backup + cron
│   ├── tests/                      # Backend test suite
│   ├── Dockerfile                  # Python 3.11-slim, Gunicorn, auto-migration
│   ├── Dockerfile.scheduler        # Cron-based daily backup scheduler (2 AM)
│   └── API_SIGNATURES.json         # API endpoint signatures for OpenAPI generation
│
├── docker-compose.yml              # postgres + backend + frontend + cloudflared
├── Dockerfile.frontend             # Multi-stage: Node build → Nginx Alpine
├── nginx.conf                      # Gzip, security headers, /api/ proxy, SPA fallback
├── firebase.json                   # Firebase Hosting config (dist/, SPA rewrite)
├── deploy.sh                       # Full Docker stack deploy
├── deploy-backend.sh               # Backend-only deploy
├── deploy-firebase.sh              # Frontend Firebase deploy
├── setup-production.sh             # Interactive production setup wizard
├── start.sh                        # Quick local Docker start (no tunnel)
├── status.sh                       # Health check dashboard (services, disk, logs)
├── run-migrations.sh               # Local dev migration runner
├── package.json                    # React 19, Vite 5, shadcn/ui, TanStack Query 5
├── vite.config.ts                  # Dev server :8080, @ path alias
├── vitest.config.ts                # jsdom, V8 coverage, 10s timeout
├── tailwind.config.ts              # shadcn/ui theme, HSL colors, custom animations
└── tsconfig.json                   # @ path alias, project references
```

---

## Database Schema

### Enums

| Type | Values |
|---|---|
| `app_role` | `admin`, `user`, `reader` |
| `transaction_type` | `PRODUCTION`, `SALE`, `CUT_ROLL`, `ADJUSTMENT`, `RETURN`, `TRANSFER_OUT`, `TRANSFER_IN`, `INTERNAL_USE`, `CUT`, `CUT_BUNDLE`, `COMBINE_BUNDLE` |

### Core Tables

| Table | Purpose |
|---|---|
| `users` | User accounts with email, username, password hash, lockout tracking |
| `user_roles` | Maps users to roles (`app_role` enum) |
| `product_types` | Product categories (e.g., HDPE Pipe, Sprinkler Pipe) with `parameter_schema` JSONB and `roll_configuration` JSONB |
| `product_variants` | Specific configurations (product_type + brand + parameters JSONB) |
| `product_aliases` | Quick-search aliases for product variants |
| `brands` | Brand master data |
| `units` | Unit of measure (meters, pieces, kg, rolls) |
| `parameter_options` | Allowed values for parameters (PE, PN, OD, Type) |
| `batches` | Production batches with batch_no, batch_code, weight tracking, piece dimensions |
| `inventory_stock` | Individual stock entries (FULL_ROLL, CUT_ROLL, BUNDLE, SPARE) with optimistic locking `version` |
| `hdpe_cut_pieces` | Individual HDPE cut pieces (1:1 with CUT_ROLL stock), lifecycle tracking with `created_by_transaction_id` (immutable) |
| `sprinkler_spare_pieces` | Individual sprinkler spare pieces (1 record per physical piece), reservation support |
| `inventory_transactions` | Modern transaction log: PRODUCTION, CUT_ROLL, SPLIT_BUNDLE, COMBINE_SPARES, DISPATCH, ADJUSTMENT, RETURN, DAMAGE |

### Dispatch & Returns

| Table | Purpose |
|---|---|
| `dispatches` | Dispatch header: customer, bill-to, transport, vehicle, invoice, status (PENDING/DISPATCHED/DELIVERED/CANCELLED/REVERTED) |
| `dispatch_items` | Line items: stock_id, item_type (FULL_ROLL/CUT_ROLL/CUT_PIECE/BUNDLE/SPARE_PIECES), quantity, rate, amount |
| `customers` | Customer master: name, city, GSTIN, address, contact, phone, email, state, pincode |
| `bill_to` | Billing entities |
| `transports` | Transport companies |
| `vehicles` | Vehicles with driver info |
| `returns` | Return header: customer, status (RECEIVED/INSPECTED/RESTOCKED/CANCELLED/REVERTED) |
| `return_items` | Return line items |
| `return_rolls` | Individual returned rolls |
| `return_bundles` | Individual returned bundles |

### Scrap

| Table | Purpose |
|---|---|
| `scraps` | Scrap header: reason, status (SCRAPPED/DISPOSED/CANCELLED), estimated loss |
| `scrap_items` | Scrapped stock entries with original state |
| `scrap_pieces` | Individual scrapped pieces (CUT_PIECE or SPARE_PIECE) |

### Audit & Tracking

| Table | Purpose |
|---|---|
| `audit_logs` | All system activity: user, action, entity, before/after JSONB, IP address, user agent |
| `piece_lifecycle_events` | Immutable event log: CREATED, STATUS_CHANGED, COMBINED, DISPATCHED, RETURNED, REVERTED, RESERVED, RELEASED |
| `locations` | Warehouse locations |

### Backup & System

| Table | Purpose |
|---|---|
| `database_snapshots` | Snapshot metadata: name, table counts, file size, storage path, auto/manual, tags |
| `rollback_history` | Rollback operations log with success/failure and affected tables |
| `cloud_backup_config` | Cloud storage credentials (R2/S3) with Fernet-encrypted secret keys |
| `cloud_credentials` | Extended cloud credential storage |
| `backup_retention_policies` | Auto-delete rules with weekly/monthly grandfathering |
| `backup_deletion_log` | Tracks every backup deletion |
| `archive_buckets` | Named archive storage destinations |
| `archived_backups` | Backups moved to archives |
| `smtp_config` | SMTP server settings with encrypted passwords |
| `password_reset_tokens` | Time-limited reset tokens (1 hour) |

### Materialized Views

| View | Purpose |
|---|---|
| `mv_piece_current_state` | Unified view of all HDPE + Sprinkler pieces with stock/batch/transaction details |
| `mv_product_variant_details` | Denormalized product variant info with type/brand names |

### Standard Views

| View | Purpose |
|---|---|
| `audit_logs_detailed` | Audit logs joined with user info |
| `dispatch_summary` | Dispatch headers with customer, transport, vehicle, item counts |
| `dispatch_items_detailed` | Dispatch items with product/brand/parameter info |
| `return_summary` | Return headers with customer and item counts |
| `return_items_detailed` | Return items with product info |
| `scrap_summary` | Scrap headers with item/batch counts |
| `scrap_items_detailed` | Scrap items with product info |
| `hdpe_stock_details` | HDPE stock with available meters/count |
| `sprinkler_stock_details` | Sprinkler stock with piece/bundle counts |
| `inventory_unified` | All stock types in a single view |
| `piece_tracking_audit` | Debug view for piece transaction tracking |

### Database Functions & Triggers

| Function | Purpose |
|---|---|
| `auto_update_stock_quantity()` | Trigger: auto-recalculates SPARE/CUT_ROLL stock quantity from piece counts |
| `validate_spare_stock_quantity()` | Deferred trigger: validates stock quantity matches actual piece count |
| `log_piece_lifecycle_event()` | Trigger: auto-creates lifecycle events on piece INSERT/UPDATE/DELETE |
| `prevent_transaction_id_mutation()` | Trigger: ensures `created_by_transaction_id` is never changed, increments version |
| `populate_transaction_metadata()` | Trigger: auto-populates roll weight on transaction creation |
| `update_batch_status_on_quantity_change()` | Trigger: sets batch status to CONSUMED when quantity=0, ACTIVE on restore |
| `cleanup_old_lifecycle_events(days)` | Utility: delete old events (except CREATED) for maintenance |
| `refresh_piece_state_view()` | Refresh `mv_piece_current_state` concurrently |
| `refresh_product_variant_details()` | Refresh `mv_product_variant_details` concurrently |

---

## API Reference

### Auth — `/api/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | None | Login with email/username + password. Returns JWT. Lockout after 5 failures (30min) |
| GET | `/api/auth/me` | JWT | Current user info + role |
| POST | `/api/auth/forgot-password` | None | Request password reset email (rate limited: 1 per 2min) |
| POST | `/api/auth/verify-reset-token` | None | Verify reset token validity |
| POST | `/api/auth/reset-password` | None | Reset password with token (min 8 chars) |
| POST | `/api/auth/change-password` | JWT | Change own password (requires current password) |

### Setup — `/api/setup`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/setup/check` | None | Check if admin account exists |
| POST | `/api/setup/admin` | None | Create first admin (one-time, blocked after) |

### Inventory — `/api/inventory`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/inventory/batches` | JWT | All batches with aggregate stock counts |
| GET | `/api/inventory/product-types` | JWT | All product types |
| GET | `/api/inventory/brands` | JWT | All brands |
| GET | `/api/inventory/customers` | JWT | All customers |
| PUT | `/api/inventory/batches/<id>` | Admin | Update batch metadata |
| PUT | `/api/inventory/stock/<id>` | Admin | Update stock entry |
| POST | `/api/inventory/cut-roll` | User | Cut FULL_ROLL/CUT_ROLL into pieces |
| POST | `/api/inventory/split-bundle` | User | Split BUNDLE into individual SPARE pieces |
| POST | `/api/inventory/combine-spares` | User | Combine SPARE pieces into BUNDLE(s) |
| POST | `/api/inventory/search` | JWT | Search available stock by product/brand/parameters |
| GET | `/api/inventory/product-variants/search` | JWT | Search variants by batch code or parameters |

### Production — `/api/production`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/production/batch` | User | Create production batch (multipart for attachments) |
| GET | `/api/production/history` | User | All production batches |
| GET | `/api/production/history/<id>` | User | Detailed batch info with stock items |
| PUT | `/api/production/history/<id>` | Admin | Update batch metadata only |
| GET | `/api/production/attachment/<filename>` | User | Serve uploaded attachment |

### Dispatch — `/api/dispatch`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/dispatch/available-rolls` | JWT | Available rolls/bundles for a product selection |
| POST | `/api/dispatch/create-dispatch` | User | Create dispatch (multi-item, two-phase validation) |
| GET | `/api/dispatch/dispatches` | JWT | All dispatches with summary |
| GET | `/api/dispatch/dispatches/<id>` | JWT | Dispatch detail with items |
| PUT | `/api/dispatch/dispatches/<id>` | JWT | Update dispatch metadata |

### Returns — `/api/returns`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/returns/create` | User | Create return from customer |
| GET | `/api/returns/history` | JWT | Return history with filters |
| GET | `/api/returns/<id>` | JWT | Return detail |
| POST | `/api/returns/<id>/revert` | JWT | Revert/cancel return |
| GET | `/api/returns/stats` | JWT | Return statistics |

### Scraps — `/api/scraps`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/scraps/create` | User | Create scrap record |
| GET | `/api/scraps/history` | JWT | Scrap history with filters |
| GET | `/api/scraps/history/<id>` | JWT | Scrap detail |
| GET | `/api/scraps/reasons` | JWT | Common scrap reasons list |
| POST | `/api/scraps/<id>/revert` | Admin | Revert/cancel scrap |

### Transactions — `/api/transactions`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/transactions/` | User | Create transaction (legacy) |
| GET | `/api/transactions/` | User | Unified history (UNION ALL of all operation types) |
| POST | `/api/transactions/revert` | User | Batch revert by ID array (dispatch, return, scrap, inventory ops, production) |

### Stats — `/api/stats`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/stats/dashboard` | JWT | Dashboard: totals, low stock alerts, recent activity, distribution |

### Admin — `/api/admin`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET/POST/PUT/DELETE | `/api/admin/brands[/<id>]` | Admin | Brand CRUD (soft delete/restore toggle) |
| GET/POST/PUT/DELETE | `/api/admin/product-types[/<id>]` | Admin | Product type CRUD (system types protected) |
| GET/POST/PUT/DELETE | `/api/admin/customers[/<id>]` | Admin | Customer CRUD + CSV import/export/template |
| GET/POST/PUT/DELETE | `/api/admin/units[/<id>]` | Admin | Unit CRUD (system units protected) |
| GET/POST/PUT/DELETE | `/api/admin/users[/<id>]` | Admin | User management (roles, activation, passwords) |
| GET | `/api/admin/audit-logs` | Admin | Audit logs with filters |
| POST | `/api/admin/reset-database` | Admin | Database reset (5 levels, requires confirmation token) |
| GET | `/api/admin/reset-options` | Admin | Available reset options |
| GET | `/api/admin/database-stats` | Admin | Record counts per table |

### Reports — `/api/reports`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/reports/top-selling-products` | JWT | Top 10 by dispatch quantity |
| GET | `/api/reports/customer-sales` | JWT | Per-customer sales breakdown |
| GET | `/api/reports/product-inventory` | JWT | Inventory summary by product type |
| GET | `/api/reports/analytics/overview` | JWT | Comprehensive analytics |
| GET | `/api/reports/analytics/customer-regions` | JWT | Customer distribution by region |

### Parameters — `/api/parameters`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/parameters/options` | JWT | All parameter options grouped by name |
| GET | `/api/parameters/options/<name>` | JWT | Options for specific parameter |
| POST | `/api/parameters/options` | Admin | Add parameter option |
| PUT | `/api/parameters/options/<id>` | Admin | Update parameter option |
| DELETE | `/api/parameters/options/<id>` | Admin | Delete parameter option |
| GET | `/api/parameters/brands` | JWT | All brands |
| GET | `/api/parameters/product-variants` | JWT | Variants by product_type_id + brand_id |

### Dispatch Entities — `/api`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET/POST/PUT/DELETE | `/api/customers[/<id>]` | JWT | Customer CRUD |
| GET/POST/PUT/DELETE | `/api/bill-to[/<id>]` | JWT | Bill-to CRUD |
| GET/POST/PUT/DELETE | `/api/transports[/<id>]` | JWT | Transport CRUD |
| GET/POST/PUT/DELETE | `/api/vehicles[/<id>]` | JWT | Vehicle CRUD |
| GET/POST | `/api/product-aliases` | JWT | Product alias quick-search |

### Version Control — `/api/version-control`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET/POST | `.../snapshots` | Admin | List/create snapshots (35+ tables) |
| DELETE | `.../snapshots/<id>` | Admin | Delete snapshot |
| POST | `.../snapshots/bulk-delete` | Admin | Bulk delete |
| POST | `.../snapshots/cleanup-old` | Admin | Cleanup old automatic snapshots |
| POST | `.../rollback/<id>` | Admin | Full database rollback to snapshot |
| GET | `.../rollback-history` | Admin | Rollback history |
| GET/POST | `.../settings/auto-snapshot` | Admin | Auto-snapshot settings (time, interval) |
| POST | `.../settings/auto-snapshot/test` | Admin | Test auto-snapshot |
| GET | `.../cloud/status` | Admin | Cloud storage status |
| POST | `.../cloud/configure` | Admin | Configure cloud storage |
| GET/POST/DELETE | `.../cloud/snapshots[/<id>]` | Admin | Cloud snapshot CRUD |
| POST | `.../cloud/snapshots/<id>/download` | Admin | Download from cloud |
| POST | `.../cloud/snapshots/<id>/restore` | Admin | Restore from cloud |
| POST | `.../cloud/snapshots/<id>/upload` | Admin | Upload to cloud |
| GET | `.../snapshots/local` | Admin | Local filesystem snapshots |
| GET | `.../snapshots/<id>/download` | Admin | Download snapshot file |
| POST | `.../snapshots/upload` | Admin | Upload snapshot file |
| GET | `.../storage/local/stats` | Admin | Local storage stats |
| GET/POST | `.../external/devices`, `.../external/export`, `.../external/import` | Admin | External device operations |

### Backup Config — `/api/backup-config`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET/POST/PUT/DELETE | `.../cloud-credentials[/<id>]` | Admin | Cloud credential CRUD (encrypted at rest) |
| POST | `.../cloud-credentials/<id>/decrypt` | Admin | Decrypt secrets (audit logged) |
| POST | `.../cloud-credentials/<id>/test` | Admin | Test cloud connection |
| GET/POST/PUT | `.../retention-policies[/<id>]` | Admin | Retention policy CRUD |
| GET/POST | `.../archive-buckets` | Admin | Archive bucket management |
| POST | `.../archive-buckets/archive` | Admin | Cherry-pick archive |
| GET | `.../archived-backups` | Admin | List archived backups |
| GET | `.../deletion-log` | Admin | Deletion audit log |

### SMTP Config — `/api/admin/smtp-config`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/smtp-config` | Admin | Active SMTP config |
| POST | `/api/admin/smtp-config` | Admin | Create/replace SMTP config |
| PUT | `/api/admin/smtp-config/<id>` | Admin | Update config |
| DELETE | `/api/admin/smtp-config/<id>` | Admin | Delete config |
| POST | `/api/admin/smtp-config/test` | Admin | Send test email |
| GET | `/api/admin/smtp-config/all` | Admin | All configs (history) |

### Sync — `/api/sync`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET/POST/PUT/DELETE | `/api/sync/config[/<id>]` | Admin | Sync configuration CRUD (rsync, network, r2, s3) |
| POST | `/api/sync/config/test`, `/api/sync/config/<id>/test` | Admin | Test sync connection |
| POST | `/api/sync/trigger` | Admin | Manual sync trigger |
| GET | `/api/sync/status` | Admin | Sync status for all enabled configs |
| GET | `/api/sync/history` | Admin | Sync operation history |

### Docs — `/api/docs`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/docs` | None | Swagger UI |
| GET | `/api/docs/redoc` | None | ReDoc UI |
| GET | `/api/docs/openapi.json` | None | OpenAPI 3.0 spec |
| GET | `/api/health` | None | Health check |

---

## Frontend Pages & Components

### Routes

| Route | Page | Access |
|---|---|---|
| `/` | Redirect → `/dashboard` | — |
| `/setup` | First-run admin creation | Public |
| `/auth`, `/login` | Login | Public |
| `/forgot-password` | Password reset request | Public |
| `/reset-password` | Reset with token | Public |
| `/dashboard` | Stats, alerts, quick actions | Any role |
| `/production` | New production / history / reverted | User+ |
| `/inventory` | Stock with filters, cut/split/combine/scrap | Any role |
| `/transactions` | Unified activity log with revert | User+ |
| `/dispatch` | New dispatch / history | User+ |
| `/returns` | New return / history | User+ |
| `/reports` | Analytics tabs: products, customers, regions, performance, trends | Any role |
| `/admin` | Full admin panel (12+ sub-tabs) | Admin |
| `/admin/sync-settings` | Sync configuration | Admin |
| `/details` | Master data: customers, vehicles, transports, bill-to | User+ |

### Key Component Features

- **Layout**: Desktop sidebar (264px) + mobile bottom tab bar + hamburger overlay; sticky header with live clock, health indicator, sync indicator, user badge
- **ProductVariantCard**: Expandable card showing all batches for a product variant, with stock entries and action buttons
- **DispatchNewTab**: Cart-based multi-item dispatch with customer/bill-to/transport/vehicle selection, product search, rate/amount entry
- **ReturnNewModular**: Modular return creation with product selection, return cart, customer details
- **TransactionsNew**: Desktop table + mobile card views, checkbox selection, batch revert, detail modal, advanced filters, CSV export, pagination (50/page)
- **VersionControlTab**: Snapshot list with create/delete/rollback, cloud sync, auto-snapshot settings, rollback history
- **WhatsAppShareDialog**: Generates formatted inventory text for sharing
- **KeyboardShortcutsDialog**: Configurable keyboard shortcuts persisted in localStorage

---

## Backend Services

| Service | Purpose |
|---|---|
| `auth.py` | Password hashing (bcrypt), account lockout (5 attempts/30min), role-based JWT decorator (`jwt_required_with_role`), user lookups |
| `email_service.py` | SMTP email sending with DB-stored config (fallback to env vars), HTML templates for password reset |
| `encryption_service.py` | Fernet symmetric encryption singleton; encrypts cloud credentials and SMTP passwords at rest |
| `inventory_helpers_aggregate.py` | Static helpers: create HDPE stock (FULL_ROLL), sprinkler stock (BUNDLE/SPARE), cut rolls, split bundles, dispatch operations, stock queries |
| `inventory_operations.py` | Thread-safe operations with optimistic locking + row versioning. Piece creation (immutable `created_by_transaction_id`), piece reservation (`FOR UPDATE NOWAIT`), combine spares, revert cut/combine using `piece_lifecycle_events` |
| `scheduler_service.py` | APScheduler auto-snapshots with file-based lock for Gunicorn multi-worker, IST timezone, supports hourly/daily/weekly/monthly/custom intervals |
| `sync_service.py` | Sync PostgreSQL backups to remote storage: rsync (SSH), network mounts (SMB/NFS), R2/S3 cloud. Supports `pg_dump` and `pg_basebackup` |

---

## Deployment

### Docker Compose Services

| Service | Image | Port | Purpose |
|---|---|---|---|
| `postgres` | `postgres:15.3-alpine` | 5432 | PostgreSQL database |
| `backend` | `./backend/Dockerfile` | 5500 | Flask API via Gunicorn |
| `frontend` | `./Dockerfile.frontend` | 80 | Nginx serving Vite build |
| `cloudflared` | `cloudflare/cloudflared:2023.8.2` | — | Tunnel to expose backend |

### Deployment Scripts

| Script | Purpose |
|---|---|
| `deploy.sh` | Full stack deploy: generates `.env` secrets, builds all images, starts all services |
| `deploy-backend.sh` | Backend-only: builds postgres + backend, starts with cloudflared |
| `deploy-firebase.sh` | Frontend: validates Firebase, prompts for API URL, builds, deploys to Firebase Hosting |
| `setup-production.sh` | Interactive wizard: checks prerequisites, configures Firebase project, generates secrets |
| `start.sh` | Quick local Docker start (no tunnel) |
| `status.sh` | Health check dashboard: service status, disk usage, recent logs |
| `run-migrations.sh` | Local dev migration runner (psql) |

### Production Setup

```bash
# 1. Interactive setup wizard
./setup-production.sh

# 2. Deploy backend (Docker + Cloudflare Tunnel)
./deploy-backend.sh

# 3. Deploy frontend to Firebase
VITE_API_URL=https://backend.tarko.dpdns.org/api ./deploy-firebase.sh
```

---

## Backup & Version Control

### Snapshot System
- **Manual snapshots**: Admin creates via Version Control tab — exports 35+ tables as JSON with metadata
- **Auto-snapshots**: Configurable via admin settings; APScheduler runs in one Gunicorn worker (file-lock based)
- **Storage**: Local filesystem (`./snapshots/`) + optional cloud (R2/S3)
- **Rollback**: Full database restore from any snapshot; disables FK constraints, clears + restores in dependency order
- **Retention**: Configurable auto-delete with weekly/monthly grandfathering

### Continuous Sync
- **Sync types**: rsync (to NAS/remote server), network (SMB/NFS mount), R2/S3 (cloud)
- **Backup methods**: `pg_dump` (logical), `pg_basebackup` (physical), or both
- **Auto-sync**: Per-config interval setting
- **Scheduled backup**: Cron-based daily backup at 2 AM via `Dockerfile.scheduler`

---

## Migrations

Migrations auto-apply on Docker backend startup via `docker-entrypoint.sh` (runs all `backend/migrations/*.sql`).

| Migration | Purpose |
|---|---|
| `add_system_seed_data.sql` | Seeds system units, user, product types (HDPE/Sprinkler), parameter options, brands |
| `add_batch_revert_tracking.sql` | Adds batch status (ACTIVE/CONSUMED/REVERTED) with auto-update trigger |
| `fix_datetime_columns.sql` | Converts dispatch/return dates from DATE to TIMESTAMPTZ |
| `make_vehicle_number_optional.sql` | Makes vehicle_number nullable with partial unique index |
| `20260206_drop_deprecated_transaction_id_columns.sql` | Removes deprecated `transaction_id` columns from piece tables |
| `20260207_cut_piece_schema_redesign.sql` | Major: migrates to 1:1 piece-to-stock model for cut pieces |
| `20260207_transaction_cleanup.sql` | Creates unified_transaction_history view |

To run migrations locally:
```bash
./run-migrations.sh
```

---

## Key Workflows

### First-Time Setup
1. Start the application
2. Visit the app — redirected to `/setup`
3. Create the first admin account (full name, username, email, password)
4. Log in and start configuring master data (product types, brands, parameters, customers)

### Daily Production Entry
1. Navigate to **Production** → **New Production** tab
2. Select product type (HDPE Pipe or Sprinkler Pipe) and brand
3. Fill in parameters (PE grade, PN rating, OD diameter, Type)
4. Enter batch details: quantity, production date, notes, optional attachment
5. Configure rolls/bundles (standard rolls with length groups, cut rolls, bundles with piece count/length)
6. Submit — creates batch, product variant (if new), inventory stock entries

### Dispatching Products
1. Navigate to **Dispatch** → **New Dispatch** tab
2. Select customer, optionally bill-to, transport, vehicle
3. Search and add products to cart (FULL_ROLL, CUT_PIECE, BUNDLE, SPARE_PIECES)
4. Set rates and amounts per item
5. Submit — validates stock availability, creates dispatch with auto-number (DISP-YYYY-NNNN), updates inventory

### Inventory Operations
- **Cut Roll**: Select a FULL_ROLL → cut into specified lengths → creates CUT_ROLL stock + individual HDPE cut pieces
- **Split Bundle**: Select a BUNDLE → split into individual SPARE pieces (1 record per physical piece)
- **Combine Spares**: Select SPARE pieces → combine into new BUNDLE(s) with specified bundle size
- **Scrap**: Mark stock as scrapped with reason and estimated loss

### Customer Returns
1. Navigate to **Returns** → **New Return** tab
2. Select customer and return date
3. Add items: FULL_ROLL, CUT_ROLL, BUNDLE, or SPARE_PIECES
4. Submit — creates new batches for returned items (RET-prefix), adds inventory stock

### Reverting Operations
- Select transactions in the Activity page → click Revert
- Supports reverting: dispatches (restores stock), returns (removes returned inventory), scraps (restores stock), inventory operations (cuts/splits/combines), production (removes batch)

### Viewing Reports
1. Navigate to **Reports** page
2. Set date range (7/30/90/180/365 days)
3. Browse tabs: Products (top sellers), Customers (sales breakdown), Regions (geographic distribution), Performance (production vs sales), Trends (daily trends)

---

## Testing

### Frontend
```bash
npm test              # Run Vitest
npm run test:coverage # With V8 coverage
```
- Environment: jsdom
- Pool: forks (single fork)
- Timeout: 10s per test/hook

### Backend
```bash
cd backend
./run_tests.sh        # Runs pytest suite
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| **Auth fails / 401 errors** | Check `JWT_SECRET_KEY` in backend `.env` matches across restarts |
| **Database connection errors** | Verify PostgreSQL is running: `docker compose ps` or `pg_isready`. Check `DATABASE_URL` |
| **Migration errors on startup** | Check Docker backend logs: `docker compose logs backend`. Migrations run via `psql` |
| **Build errors** | Clear cache: `rm -rf dist .vite node_modules && npm install` |
| **Backend 500 errors** | Check backend logs: `docker compose logs backend` or console output |
| **Password reset emails not sending** | Configure SMTP via Admin → Backups → Email tab. Test with the test button |
| **Cloud backup failing** | Verify credentials in Admin → Backups → Cloud Credentials. Use the test connection button |
| **Sync not working** | Check sync config in Admin → Sync Settings. Test connection first |
| **Auto-snapshots not running** | Only one Gunicorn worker runs the scheduler (file lock). Check logs for "This worker is running the scheduler" |
| **Account locked** | Wait 30 minutes, or have admin reset via User Management |
| **Health indicator red** | Backend not reachable. Check `VITE_API_URL` and backend status (`./status.sh`) |

---

## Documentation Index

### Deployment & Setup
- [Deployment Guide](./docs/deployment/DEPLOYMENT_GUIDE.md)
- [Docker Setup](./docs/deployment/DOCKER_README.md)
- [Dev Setup](./docs/deployment/DEV_SETUP.md)
- [Production Config](./docs/deployment/PRODUCTION_CONFIG.md)

### Features
- [Cloud Backup Setup](./docs/features/CLOUD_BACKUP_SETUP.md) — R2/S3 backup configuration
- [Version Control](./docs/features/VERSION_CONTROL_README.md) — Database snapshots & rollback
- [Dashboard Features](./docs/features/DASHBOARD_REVAMP.md)
- [Transactions](./docs/features/TRANSACTIONS_PAGE_FEATURES.md)

### Backend
- [Backend README](./backend/README.md) — Backend API documentation
- [Database Schema](./backend/schema.sql) — Complete PostgreSQL schema
- [Dispatch Double Decrement Fix](./backend/docs/DISPATCH_DOUBLE_DECREMENT_FIX.md)
- [Email Configuration](./backend/docs/EMAIL_CONFIGURATION.md)
- [Inventory Revert Implementation](./backend/docs/INVENTORY_REVERT_IMPLEMENTATION.md)
- [One Record Per Piece Migration](./backend/docs/ONE_RECORD_PER_PIECE_MIGRATION.md)
- [Password Reset Feature](./backend/docs/PASSWORD_RESET_FEATURE.md)
- [Production URL Config](./backend/docs/PRODUCTION_URL_CONFIG.md)
- [SMTP Database Config](./backend/docs/SMTP_DATABASE_CONFIG.md)
- [Version Control Guide](./backend/docs/VERSION_CONTROL_GUIDE.md)

---

**Built for Tarko Manufacturing** | Last Updated: February 2026
