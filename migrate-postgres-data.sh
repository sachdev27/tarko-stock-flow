#!/usr/bin/env bash
set -euo pipefail

# Reusable PostgreSQL migration helper for Dockerized DB containers over SSH.
# Typical use case: migrate from an old server/container to OCI postgres container.

SCRIPT_NAME=$(basename "$0")
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

SOURCE_HOST=""
SOURCE_USER=""
SOURCE_KEY=""
SOURCE_CONTAINER="tarko-postgres"
SOURCE_APP_DIR="/opt/tarko-stock-flow"

DEST_HOST=""
DEST_USER=""
DEST_KEY=""
DEST_CONTAINER="tarko-postgres"
DEST_APP_DIR="/opt/tarko-stock-flow"

DB_NAME="tarko_inventory"
DB_USER="tarko_user"

BACKUP_DIR="./backups/migration"
REMOTE_TMP_DIR="/tmp"

STOP_SOURCE_BACKEND="true"
STOP_DEST_BACKEND="true"
START_SOURCE_BACKEND="false"
START_DEST_BACKEND="true"
DELETE_REMOTE_DUMP="true"
DELETE_LOCAL_DUMP="false"
SOURCE_INTERACTIVE="false"
DEST_INTERACTIVE="false"
SKIP_PREFLIGHT_CHECKS="false"
ALLOW_ORPHANS="false"

usage() {
  cat <<EOF
Usage: $SCRIPT_NAME [options]

Required:
  --source-user USER              Source server SSH user
  --source-host HOST              Source server hostname/IP
  --dest-user USER                Destination server SSH user
  --dest-host HOST                Destination server hostname/IP

Optional:
  --source-key PATH               SSH private key for source server
  --dest-key PATH                 SSH private key for destination server
  --source-container NAME         Source postgres container name (default: $SOURCE_CONTAINER)
  --dest-container NAME           Destination postgres container name (default: $DEST_CONTAINER)
  --source-app-dir PATH           Source app directory for docker compose stop/start (default: $SOURCE_APP_DIR)
  --dest-app-dir PATH             Destination app directory for docker compose stop/start (default: $DEST_APP_DIR)
  --db-name NAME                  Database name (default: $DB_NAME)
  --db-user USER                  Database user (default: $DB_USER)
  --backup-dir PATH               Local backup directory (default: $BACKUP_DIR)
  --remote-tmp-dir PATH           Remote temp directory for dump copy (default: $REMOTE_TMP_DIR)

Behavior toggles:
  --no-stop-source-backend        Do not stop source backend before dump
  --no-stop-dest-backend          Do not stop destination backend before restore
  --start-source-backend          Start source backend after migration
  --no-start-dest-backend         Do not start destination backend after migration
  --keep-remote-dump              Keep dump file on destination host
  --delete-local-dump             Delete local dump after successful restore
  --source-interactive            Allow password prompt for source SSH/ SCP
  --dest-interactive              Allow password prompt for destination SSH/ SCP
  --skip-preflight-checks         Skip source FK orphan preflight checks
  --allow-orphans                 Continue even if preflight finds orphan rows

Examples:
  $SCRIPT_NAME \
    --source-user divine --source-host 100.76.255.120 \
    --dest-user ubuntu --dest-host 140.245.211.186 \
    --dest-key /Users/diviine/Projects/tarko-stock-flow/terraform/ssh-key-2026-04-25.key

  $SCRIPT_NAME \
    --source-user divine --source-host 100.76.255.120 \
    --dest-user ubuntu --dest-host 140.245.211.186 \
    --dest-key /path/to/key \
    --db-name tarko_inventory --db-user tarko_user \
    --delete-local-dump
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command not found: $1" >&2
    exit 1
  fi
}

validate_file_if_set() {
  local path="$1"
  local label="$2"
  if [[ -n "$path" && ! -f "$path" ]]; then
    echo "Error: $label does not exist: $path" >&2
    exit 1
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --source-user) SOURCE_USER="$2"; shift 2 ;;
      --source-host) SOURCE_HOST="$2"; shift 2 ;;
      --source-key) SOURCE_KEY="$2"; shift 2 ;;
      --source-container) SOURCE_CONTAINER="$2"; shift 2 ;;
      --source-app-dir) SOURCE_APP_DIR="$2"; shift 2 ;;

      --dest-user) DEST_USER="$2"; shift 2 ;;
      --dest-host) DEST_HOST="$2"; shift 2 ;;
      --dest-key) DEST_KEY="$2"; shift 2 ;;
      --dest-container) DEST_CONTAINER="$2"; shift 2 ;;
      --dest-app-dir) DEST_APP_DIR="$2"; shift 2 ;;

      --db-name) DB_NAME="$2"; shift 2 ;;
      --db-user) DB_USER="$2"; shift 2 ;;
      --backup-dir) BACKUP_DIR="$2"; shift 2 ;;
      --remote-tmp-dir) REMOTE_TMP_DIR="$2"; shift 2 ;;

      --no-stop-source-backend) STOP_SOURCE_BACKEND="false"; shift ;;
      --no-stop-dest-backend) STOP_DEST_BACKEND="false"; shift ;;
      --start-source-backend) START_SOURCE_BACKEND="true"; shift ;;
      --no-start-dest-backend) START_DEST_BACKEND="false"; shift ;;
      --keep-remote-dump) DELETE_REMOTE_DUMP="false"; shift ;;
      --delete-local-dump) DELETE_LOCAL_DUMP="true"; shift ;;
      --source-interactive) SOURCE_INTERACTIVE="true"; shift ;;
      --dest-interactive) DEST_INTERACTIVE="true"; shift ;;
      --skip-preflight-checks) SKIP_PREFLIGHT_CHECKS="true"; shift ;;
      --allow-orphans) ALLOW_ORPHANS="true"; shift ;;

      -h|--help) usage; exit 0 ;;
      *)
        echo "Unknown option: $1" >&2
        usage
        exit 1
        ;;
    esac
  done
}

build_ssh_target() {
  local user="$1"
  local host="$2"
  echo "${user}@${host}"
}

run_ssh() {
  local key="$1"
  local target="$2"
  local interactive="$3"
  local cmd="$4"

  if [[ "$interactive" == "true" ]]; then
    local batch_mode="no"
  else
    local batch_mode="yes"
  fi

  local opts=(
    -o BatchMode="$batch_mode"
    -o ConnectTimeout=30
    -o ServerAliveInterval=10
    -o ServerAliveCountMax=6
    -o StrictHostKeyChecking=accept-new
  )

  if [[ -n "$key" ]]; then
    ssh "${opts[@]}" -i "$key" "$target" "$cmd"
  else
    ssh "${opts[@]}" "$target" "$cmd"
  fi
}

copy_to_dest() {
  local key="$1"
  local local_path="$2"
  local target="$3"
  local remote_path="$4"
  local interactive="$5"

  if [[ "$interactive" == "true" ]]; then
    local batch_mode="no"
  else
    local batch_mode="yes"
  fi

  local opts=(
    -o BatchMode="$batch_mode"
    -o ConnectTimeout=30
    -o StrictHostKeyChecking=accept-new
  )

  if [[ -n "$key" ]]; then
    scp "${opts[@]}" -i "$key" "$local_path" "${target}:${remote_path}"
  else
    scp "${opts[@]}" "$local_path" "${target}:${remote_path}"
  fi
}

main() {
  parse_args "$@"

  if [[ -z "$SOURCE_USER" || -z "$SOURCE_HOST" || -z "$DEST_USER" || -z "$DEST_HOST" ]]; then
    echo "Error: source and destination user/host are required." >&2
    usage
    exit 1
  fi

  require_cmd ssh
  require_cmd scp
  require_cmd date

  validate_file_if_set "$SOURCE_KEY" "source key"
  validate_file_if_set "$DEST_KEY" "destination key"

  local source_target
  local dest_target
  source_target=$(build_ssh_target "$SOURCE_USER" "$SOURCE_HOST")
  dest_target=$(build_ssh_target "$DEST_USER" "$DEST_HOST")

  mkdir -p "$BACKUP_DIR"

  local dump_basename
  local local_dump
  local local_dest_backup
  local remote_dump

  dump_basename="${DB_NAME}_${TIMESTAMP}.dump"
  local_dump="${BACKUP_DIR}/source_${dump_basename}"
  local_dest_backup="${BACKUP_DIR}/dest_pre_restore_${dump_basename}"
  remote_dump="${REMOTE_TMP_DIR}/${dump_basename}"

  echo "==> Migration started at $(date)"
  echo "    Source: ${source_target} (${SOURCE_CONTAINER})"
  echo "    Destination: ${dest_target} (${DEST_CONTAINER})"
  echo "    Database: ${DB_NAME} user ${DB_USER}"

  if [[ "$SKIP_PREFLIGHT_CHECKS" != "true" ]]; then
    echo "==> Running source preflight integrity checks"
    local orphan_counts
    orphan_counts=$(run_ssh "$SOURCE_KEY" "$source_target" "$SOURCE_INTERACTIVE" \
      "docker exec -i '$SOURCE_CONTAINER' psql -U '$DB_USER' -d '$DB_NAME' -At -F '|' -c \"SELECT (SELECT COUNT(*) FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id WHERE a.user_id IS NOT NULL AND u.id IS NULL), (SELECT COUNT(*) FROM piece_lifecycle_events p LEFT JOIN inventory_transactions t ON t.id = p.transaction_id WHERE p.transaction_id IS NOT NULL AND t.id IS NULL);\"")

    local audit_orphans lifecycle_orphans
    audit_orphans=$(echo "$orphan_counts" | cut -d'|' -f1)
    lifecycle_orphans=$(echo "$orphan_counts" | cut -d'|' -f2)
    audit_orphans=${audit_orphans:-0}
    lifecycle_orphans=${lifecycle_orphans:-0}

    echo "    audit_logs -> users orphans: ${audit_orphans}"
    echo "    piece_lifecycle_events -> inventory_transactions orphans: ${lifecycle_orphans}"

    if [[ "$audit_orphans" != "0" || "$lifecycle_orphans" != "0" ]]; then
      if [[ "$ALLOW_ORPHANS" == "true" ]]; then
        echo "Warning: continuing despite orphan rows because --allow-orphans was set."
      else
        echo "Error: source has orphan rows that will break FK restore." >&2
        echo "Fix source data first, or rerun with --allow-orphans (not recommended)." >&2
        exit 1
      fi
    fi
  fi

  if [[ "$STOP_SOURCE_BACKEND" == "true" ]]; then
    echo "==> Stopping source backend"
    run_ssh "$SOURCE_KEY" "$source_target" "$SOURCE_INTERACTIVE" "if [ -d '$SOURCE_APP_DIR' ]; then cd '$SOURCE_APP_DIR' && docker compose stop backend || true; else echo 'source app dir not found, skipping source backend stop'; fi"
  fi

  echo "==> Dumping source database to local file: ${local_dump}"
  run_ssh "$SOURCE_KEY" "$source_target" \
    "$SOURCE_INTERACTIVE" \
    "docker exec -i '$SOURCE_CONTAINER' pg_dump -U '$DB_USER' -d '$DB_NAME' -Fc" > "$local_dump"

  echo "==> Backing up destination database to local file: ${local_dest_backup}"
  run_ssh "$DEST_KEY" "$dest_target" \
    "$DEST_INTERACTIVE" \
    "docker exec -i '$DEST_CONTAINER' pg_dump -U '$DB_USER' -d '$DB_NAME' -Fc" > "$local_dest_backup"

  if [[ "$STOP_DEST_BACKEND" == "true" ]]; then
    echo "==> Stopping destination backend"
    run_ssh "$DEST_KEY" "$dest_target" "$DEST_INTERACTIVE" "if [ -d '$DEST_APP_DIR' ]; then cd '$DEST_APP_DIR' && docker compose stop backend || true; else echo 'destination app dir not found, skipping destination backend stop'; fi"
  fi

  echo "==> Copying dump to destination host: ${remote_dump}"
  copy_to_dest "$DEST_KEY" "$local_dump" "$dest_target" "$remote_dump" "$DEST_INTERACTIVE"

  echo "==> Restoring dump on destination database"
  run_ssh "$DEST_KEY" "$dest_target" \
    "$DEST_INTERACTIVE" \
    "cat '$remote_dump' | docker exec -i '$DEST_CONTAINER' pg_restore -U '$DB_USER' -d '$DB_NAME' --clean --if-exists --no-owner --no-privileges --exit-on-error"

  if [[ "$START_DEST_BACKEND" == "true" ]]; then
    echo "==> Starting destination backend"
    run_ssh "$DEST_KEY" "$dest_target" "$DEST_INTERACTIVE" "cd '$DEST_APP_DIR' && docker compose up -d backend"
  fi

  if [[ "$START_SOURCE_BACKEND" == "true" ]]; then
    echo "==> Starting source backend"
    run_ssh "$SOURCE_KEY" "$source_target" "$SOURCE_INTERACTIVE" "cd '$SOURCE_APP_DIR' && docker compose up -d backend"
  fi

  if [[ "$DELETE_REMOTE_DUMP" == "true" ]]; then
    echo "==> Deleting destination temporary dump"
    run_ssh "$DEST_KEY" "$dest_target" "$DEST_INTERACTIVE" "rm -f '$remote_dump'"
  fi

  if [[ "$DELETE_LOCAL_DUMP" == "true" ]]; then
    echo "==> Deleting local source dump"
    rm -f "$local_dump"
  fi

  echo "==> Migration completed successfully"
  echo "    Source dump: $local_dump"
  echo "    Destination pre-restore backup: $local_dest_backup"
}

main "$@"
