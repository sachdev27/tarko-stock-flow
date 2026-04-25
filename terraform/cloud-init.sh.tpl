#!/bin/bash
# cloud-init.sh.tpl — bootstraps the OCI ARM instance
# Templated values are injected by Terraform's templatefile()
# This runs as root on first boot.

set -euo pipefail
exec > >(tee /var/log/tarko-init.log | logger -t tarko-init) 2>&1

echo "=== Tarko Stock Flow — OCI bootstrap starting ==="

# ─── System update ─────────────────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

# ─── Docker ───────────────────────────────────────────────────────────────────
apt-get install -y ca-certificates curl gnupg lsb-release git

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add ubuntu user to docker group
usermod -aG docker ubuntu

systemctl enable --now docker

# ─── Mount block volume ───────────────────────────────────────────────────────
# OCI paravirtualized block volumes appear as /dev/sdb on x86 E2.1.Micro instances
DATA_DEVICE="/dev/sdb"
DATA_MOUNT="/data"

if [ -b "$DATA_DEVICE" ]; then
  if ! blkid "$DATA_DEVICE" | grep -q ext4; then
    echo "Formatting block volume..."
    mkfs.ext4 "$DATA_DEVICE"
  fi
  mkdir -p "$DATA_MOUNT"
  mount "$DATA_DEVICE" "$DATA_MOUNT"
  echo "$DATA_DEVICE $DATA_MOUNT ext4 defaults,nofail 0 2" >> /etc/fstab
fi

# ─── App directories ─────────────────────────────────────────────────────────
APP_DIR="/opt/tarko-stock-flow"
mkdir -p "$APP_DIR"

mkdir -p \
  "$${DATA_MOUNT:-/data}/postgres" \
  "$${DATA_MOUNT:-/data}/uploads" \
  "$${DATA_MOUNT:-/data}/snapshots" \
  "$${DATA_MOUNT:-/data}/backups"

# ─── Clone repository ─────────────────────────────────────────────────────────
GIT_TOKEN="${git_token}"
if [ -n "$GIT_TOKEN" ]; then
  REPO_URL="https://$GIT_TOKEN@github.com/sachdev27/tarko-stock-flow.git"
else
  REPO_URL="https://github.com/sachdev27/tarko-stock-flow.git"
fi

if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch main "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" pull --ff-only
fi

chown -R ubuntu:ubuntu "$APP_DIR"

# ─── Environment file ─────────────────────────────────────────────────────────
cat > "$APP_DIR/.env" <<EOF
DB_PASSWORD=${db_password}
JWT_SECRET_KEY=${jwt_secret_key}
DB_HOST=host.docker.internal
DB_PORT=5432
FLASK_ENV=production
CORS_ORIGINS=${cors_origins}
APP_URL=${app_url}
VITE_API_URL=/api
TUNNEL_TOKEN=${tunnel_token}
SNAPSHOT_STORAGE_PATH=/app/snapshots
UPLOAD_STORAGE_PATH=/app/uploads
BACKUP_RETENTION_DAYS=30
EOF

chmod 600 "$APP_DIR/.env"

# ─── Override docker-compose paths to use block volume ────────────────────────
cat > "$APP_DIR/docker-compose.override.yml" <<'OVERRIDE'
services:
  postgres:
    volumes:
      - /data/postgres:/var/lib/postgresql/data
      - ./backend/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
      - /data/backups:/backups
  backend:
    volumes:
      - /data/uploads:/app/uploads
      - /data/snapshots:/app/snapshots
      - /data/backups:/backups
    extra_hosts:
      - "host.docker.internal:host-gateway"
OVERRIDE

# ─── OCI iptables — open backend API port ─────────────────────────────────────
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 5500 -j ACCEPT
# Persist iptables rules
apt-get install -y iptables-persistent
netfilter-persistent save

# ─── Start application ────────────────────────────────────────────────────────
cd "$APP_DIR"
docker compose pull --quiet postgres backend || true
docker compose up -d --build postgres backend

echo "=== Bootstrap complete. App should be available shortly. ==="
echo "=== Run: docker compose -f /opt/tarko-stock-flow/docker-compose.yml logs -f ==="
