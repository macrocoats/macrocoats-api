#!/usr/bin/env bash
# Macro Coats — restore a local pg_dump backup into the production (OCI) database.
# Connects over an SSH tunnel rather than requiring matching pg_restore on the
# server — the server's client tools are an older major version than the dump
# format backup-db.sh produces (see PG_DUMP path there), so restoring locally
# through a tunnel avoids a client/archive version mismatch.

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
PG_RESTORE="/opt/homebrew/Cellar/libpq/17.2/bin/pg_restore"
SSH_KEY="$HOME/.ssh/macrocoats-oci.key"
REMOTE_HOST="ubuntu@92.4.91.25"
REMOTE_DB_USER="macrocoats"
REMOTE_DB_NAME="macrocoats"
TUNNEL_PORT=15432
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANSIBLE_DIR="$SCRIPT_DIR/../ansible"

DUMP_FILE="${1:?Usage: restore-db.sh <path-to-dump-file>}"

if [ ! -f "$DUMP_FILE" ]; then
  echo "ERROR: dump file not found: $DUMP_FILE" >&2
  exit 1
fi

echo "This will REPLACE all data in the production database ($REMOTE_DB_NAME @ $REMOTE_HOST)."
read -r -p "Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

REMOTE_PW=$(ansible-vault view "$ANSIBLE_DIR/group_vars/vault.yml" \
  --vault-password-file "$ANSIBLE_DIR/.vault_pass.txt" \
  | grep vault_db_password | sed -E 's/.*"(.*)"/\1/')

echo "Opening SSH tunnel on port $TUNNEL_PORT..."
ssh -f -N -L "${TUNNEL_PORT}:localhost:5432" -i "$SSH_KEY" "$REMOTE_HOST"
TUNNEL_PID=$(lsof -ti "tcp:${TUNNEL_PORT}" -sTCP:LISTEN | head -1)
cleanup() { [ -n "${TUNNEL_PID:-}" ] && kill "$TUNNEL_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "Restoring $DUMP_FILE into production..."
PGPASSWORD="$REMOTE_PW" "$PG_RESTORE" -h localhost -p "$TUNNEL_PORT" \
  -U "$REMOTE_DB_USER" -d "$REMOTE_DB_NAME" \
  --no-owner --no-privileges --clean --if-exists \
  "$DUMP_FILE"

echo "Restore complete."
