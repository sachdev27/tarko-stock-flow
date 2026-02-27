# Database Migration Guide: Raspberry Pi to MacMini

This guide provides the steps to replicate your Tarko Stock Flow database from a Raspberry Pi (Docker) to a local PostgreSQL installation on a MacMini.

## 1. Prerequisites
- **Local Postgres**: Installed on MacMini (e.g., via Homebrew: `brew install postgresql@15`).
- **SSH Access**: Ability to SCP/SSH between MacMini and Raspberry Pi.
- **Database Configuration**:
  - **User**: `tarko_user`
  - **Database**: `tarko_inventory`

---

## 2. Step-by-Step Migration

### Step 1: Create local User and Database (MacMini)
In your Mac terminal, ensure the Postgres role and database exist. **The user must be created before the database.**

```bash
# 1. Create the tarko_user role (superuser for convenience)
createuser -h localhost -s tarko_user

# 2. Create the tarko_inventory database owned by tarko_user
createdb -h localhost -U tarko_user tarko_inventory
```
*Note: If `createuser` fails because the role already exists, you can proceed directly to `createdb`.*

### Step 2: Export Dump (Raspberry Pi)
On your Raspberry Pi, run `pg_dump` from within the Docker container:
```bash
# Replace <pi_container_name> with your actual container name
docker exec -t <pi_container_name> pg_dump -U tarko_user tarko_inventory > tarko_dump.sql
```

### Step 3: Transfer Dump (MacMini Terminal)
On your MacMini, pull the dump file using SCP:
```bash
scp pi@<raspberry-pi-ip>:~/tarko_dump.sql ~/Downloads/
```

### Step 4: Import Dump (MacMini)
Import the data into your local database instance:
```bash
psql -h localhost -U tarko_user -d tarko_inventory -f ~/Downloads/tarko_dump.sql
```

---

## 3. Application Connection (Docker to Host)
To allow the Tarko Docker container to communicate with this local database:
1. Ensure `DB_HOST` is set to `host.docker.internal` in your environment files.
2. In `docker-compose.yml`, ensure the backend service has the following mapping:
   ```yaml
   extra_hosts:
     - "host.docker.internal:host-gateway"
   ```
3. Ensure your Mac's firewall allows incoming connections on port `5432` from your local network.
