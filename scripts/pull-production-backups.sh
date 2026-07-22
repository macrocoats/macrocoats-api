#!/usr/bin/env bash
# Macro Coats — pull production DB backups off the OCI instance.
# The instance's own nightly cron (see ansible/roles/postgres) writes backups
# to /var/backups/macrocoats on the SAME disk it's protecting — a disk or
# instance failure loses the data and the backups together. This copies them
# down to the local machine as a second, independent copy.

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
SSH_KEY="$HOME/.ssh/macrocoats-oci.key"
REMOTE_HOST="ubuntu@92.4.91.25"
REMOTE_DIR="/var/backups/macrocoats"
LOCAL_DIR="$HOME/macrocoats-backups/db-production"
LOG_FILE="$HOME/macrocoats-backups/pull-production.log"
KEEP=30

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

mkdir -p "$LOCAL_DIR"

log "Pulling backups from $REMOTE_HOST:$REMOTE_DIR..."

# sudo is required on the remote side — the backup dir is root-owned (0700 script,
# root-created files) — so this reads the file list and streams contents via sudo cat
# rather than relying on rsync/scp needing direct read access as the ubuntu user.
ssh -i "$SSH_KEY" "$REMOTE_HOST" "sudo find $REMOTE_DIR -name '*.sql.gz' -printf '%f\n'" | while read -r FILE; do
  if [ ! -f "$LOCAL_DIR/$FILE" ]; then
    log "Fetching $FILE"
    ssh -i "$SSH_KEY" "$REMOTE_HOST" "sudo cat $REMOTE_DIR/$FILE" > "$LOCAL_DIR/$FILE"
  fi
done

COUNT=$(ls -1 "$LOCAL_DIR"/*.sql.gz 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$KEEP" ]; then
  DELETE=$(( COUNT - KEEP ))
  log "Pruning $DELETE old local copy/copies (keeping $KEEP)"
  ls -1t "$LOCAL_DIR"/*.sql.gz | tail -n "$DELETE" | xargs rm -f
fi

log "Done. $(ls -1 "$LOCAL_DIR"/*.sql.gz 2>/dev/null | wc -l | tr -d ' ') backup(s) on disk locally."
