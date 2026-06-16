#!/usr/bin/env bash
# Macro Coats — PostgreSQL backup script
# Runs twice daily via cron (00:00 and 12:00).
# Keeps the last 30 backups; older ones are pruned automatically.

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
DB_URL="postgresql://macrocoats:password@localhost:5432/macrocoats"
BACKUP_DIR="$HOME/macrocoats-backups/db"
LOG_FILE="$HOME/macrocoats-backups/backup.log"
KEEP=30          # number of backup files to retain
PG_DUMP="/opt/homebrew/Cellar/libpq/17.2/bin/pg_dump"

# ── Setup ─────────────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="macrocoats_${TIMESTAMP}.dump"
FILEPATH="$BACKUP_DIR/$FILENAME"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

log "Starting backup → $FILENAME"

# ── Dump ──────────────────────────────────────────────────────────────────────
# -Fc = custom compressed format; restore with: pg_restore -d <db> <file>
if "$PG_DUMP" --format=custom --no-password "$DB_URL" --file="$FILEPATH"; then
  SIZE=$(du -sh "$FILEPATH" | cut -f1)
  log "Backup complete: $FILENAME ($SIZE)"
else
  log "ERROR: pg_dump failed — backup aborted"
  exit 1
fi

# ── Prune old backups ─────────────────────────────────────────────────────────
COUNT=$(ls -1 "$BACKUP_DIR"/*.dump 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$KEEP" ]; then
  DELETE=$(( COUNT - KEEP ))
  log "Pruning $DELETE old backup(s) (keeping $KEEP)"
  ls -1t "$BACKUP_DIR"/*.dump | tail -n "$DELETE" | xargs rm -f
fi

log "Done. Total backups on disk: $(ls -1 "$BACKUP_DIR"/*.dump 2>/dev/null | wc -l | tr -d ' ')"
