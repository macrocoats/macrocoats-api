#!/usr/bin/env bash
# Macro Coats — move production data from the OCI host's PostgreSQL to Supabase.
#
# Run from macrocoats-api/ on the machine that holds ansible/.vault_pass.txt.
# Full procedure, prerequisites and rollback: ansible/README.md → "Supabase cutover".
#
#   1. preflight (nothing is stopped yet — any failure here is harmless)
#   2. stop the API (write freeze)
#   3. dump production with the server's own pg_dump, restore into Supabase
#   4. lock down Supabase's Data API, compare every table's row count
#   5. deploy the running commit with database_mode=supabase, verify /health
#
# If anything fails before step 5 starts, the API is restarted on the local
# database automatically — production is exactly as it was.

set -euo pipefail
cd "$(dirname "$0")/.."

SSH_KEY="$HOME/.ssh/macrocoats-oci.key"
REMOTE_HOST="ubuntu@92.4.91.25"
REMOTE_DB_NAME="macrocoats"
APP_DIR="/var/www/macrocoats-api"
ANSIBLE_DIR="ansible"
VAULT_PASS="$ANSIBLE_DIR/.vault_pass.txt"
HEALTH_URL="https://api.macrocoats.in/health"
LOCAL_DIR="$HOME/macrocoats-backups/cutover"
STAMP=$(date +%Y%m%d-%H%M%S)

ssh_run() { ssh -i "$SSH_KEY" -o ConnectTimeout=15 "$REMOTE_HOST" "cd /tmp && $*" 2> >(grep -v "Permission denied" >&2); }
step()    { echo; echo "── $*"; }
die()     { echo "✗ $*" >&2; exit 1; }

ROWCOUNT_SQL="select table_schema||'.'||table_name,
  (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint
  from information_schema.tables
  where table_type='BASE TABLE' and table_schema in ('public','drizzle') order by 1"

# ── 1. Preflight ──────────────────────────────────────────────────────────────
step "1/5 Preflight"

grep -Eq '^database_mode:[[:space:]]*supabase' "$ANSIBLE_DIR/group_vars/all.yml" \
  || die "Set 'database_mode: supabase' in ansible/group_vars/all.yml first (don't push it yet)."
[ -f "$VAULT_PASS" ] || die "$VAULT_PASS not found."

SUPABASE_URL=$(ansible-vault view "$ANSIBLE_DIR/group_vars/vault.yml" --vault-password-file "$VAULT_PASS" \
  | sed -nE "s/^vault_supabase_database_url:[[:space:]]*[\"']?([^\"']*)[\"']?[[:space:]]*\$/\\1/p")
[[ "$SUPABASE_URL" == postgres*pooler.supabase.com:5432/* ]] \
  || die "vault_supabase_database_url missing or not a session pooler URL (ansible-vault edit group_vars/vault.yml)."

psql "$SUPABASE_URL" -Atqc 'select 1' >/dev/null || die "Can't connect to Supabase from this machine."
echo "✓ Supabase reachable from here ($(psql "$SUPABASE_URL" -Atqc 'show server_version'))"

ssh_run 'read -r U; PGCONNECT_TIMEOUT=10 psql "$U" -Atqc "select 1" >/dev/null' <<< "$SUPABASE_URL" \
  || die "The OCI host can't connect to Supabase with the vault URL."
echo "✓ Supabase reachable from the OCI host"

SERVER_PG_MAJOR=$(ssh_run "pg_dump --version" | sed -E 's/.* ([0-9]+)\..*/\1/')
LOCAL_PG_MAJOR=$(pg_restore --version | sed -E 's/.* ([0-9]+)\..*/\1/')
[ "$LOCAL_PG_MAJOR" -ge "$SERVER_PG_MAJOR" ] \
  || die "Local pg_restore $LOCAL_PG_MAJOR is older than the server's pg_dump $SERVER_PG_MAJOR."
echo "✓ pg_dump $SERVER_PG_MAJOR on the server, pg_restore $LOCAL_PG_MAJOR here"

PROD_SHA=$(ssh_run "git -C $APP_DIR rev-parse HEAD")
[[ "$PROD_SHA" =~ ^[0-9a-f]{40}$ ]] || die "Couldn't read the deployed commit."
echo "✓ Production is running ${PROD_SHA:0:7} — this exact commit is redeployed in step 5"

# The deploy in step 5 runs the lockdown SQL from the deployed checkout, and needs the
# DB_POOL_MAX / database_mode support — i.e. the cutover PR must already be live.
ssh_run "test -f $APP_DIR/scripts/supabase-lockdown.sql" \
  || die "Production (${PROD_SHA:0:7}) predates the cutover PR — merge and deploy it first."
echo "✓ Production already has the cutover support (scripts/supabase-lockdown.sql)"

echo
echo "This stops the production API (write freeze) until step 5 completes — a few minutes."
read -r -p "Type 'cutover' to continue: " CONFIRM
[ "$CONFIRM" = "cutover" ] || die "Aborted — nothing was changed."

# From here until the switch, any failure brings the API back on the local database.
SWITCHED=false
restore_local() {
  if [ "$SWITCHED" = false ]; then
    echo; echo "↩ Restarting the API on the local database (nothing was switched)."
    ssh_run "sudo systemctl start macrocoats-api" || echo "  ⚠ restart failed — run: sudo systemctl start macrocoats-api" >&2
  fi
}
trap restore_local EXIT

# ── 2. Write freeze ───────────────────────────────────────────────────────────
step "2/5 Stopping the API"
ssh_run "sudo systemctl stop macrocoats-api && ! systemctl is-active --quiet macrocoats-api"
echo "✓ macrocoats-api stopped"

# ── 3. Copy ───────────────────────────────────────────────────────────────────
step "3/5 Dump → restore"
REMOTE_DUMP="/var/backups/macrocoats/cutover-$STAMP.dump"
ssh_run "sudo -u postgres pg_dump -Fc --no-owner --no-acl $REMOTE_DB_NAME -f /tmp/cutover-$STAMP.dump \
  && sudo mv /tmp/cutover-$STAMP.dump $REMOTE_DUMP && sudo chmod 600 $REMOTE_DUMP && sudo test -s $REMOTE_DUMP"
mkdir -p "$LOCAL_DIR" && chmod 700 "$LOCAL_DIR"
LOCAL_DUMP="$LOCAL_DIR/macrocoats-$STAMP.dump"
ssh_run "sudo cat $REMOTE_DUMP" > "$LOCAL_DUMP"
chmod 600 "$LOCAL_DUMP"
[ -s "$LOCAL_DUMP" ] || die "Downloaded dump is empty."
pg_restore -l "$LOCAL_DUMP" >/dev/null || die "Downloaded dump is unreadable."
echo "✓ Dump: $REMOTE_DUMP (server) and $LOCAL_DUMP"

ssh_run "sudo -u postgres psql -d $REMOTE_DB_NAME -At -F '|' -c \"$ROWCOUNT_SQL\"" > "$LOCAL_DIR/rowcounts-prod-$STAMP.txt"

pg_restore --clean --if-exists --no-owner --no-acl --single-transaction --exit-on-error \
  -d "$SUPABASE_URL" "$LOCAL_DUMP"
echo "✓ Restored into Supabase (single transaction)"

# ── 4. Lock down + verify ─────────────────────────────────────────────────────
step "4/5 Lockdown + verification"
psql "$SUPABASE_URL" -q -f scripts/supabase-lockdown.sql
echo "✓ Data API closed (no anon/authenticated grants, RLS on every public table)"

psql "$SUPABASE_URL" -At -F '|' -c "$ROWCOUNT_SQL" > "$LOCAL_DIR/rowcounts-supabase-$STAMP.txt"
if ! diff "$LOCAL_DIR/rowcounts-prod-$STAMP.txt" "$LOCAL_DIR/rowcounts-supabase-$STAMP.txt"; then
  die "Row counts differ (diff above) — not switching."
fi
echo "✓ Row counts identical: $(wc -l < "$LOCAL_DIR/rowcounts-prod-$STAMP.txt" | tr -d ' ') tables, $(awk -F'|' '{s+=$2} END {print s}' "$LOCAL_DIR/rowcounts-prod-$STAMP.txt") rows"

# ── 5. Switch ─────────────────────────────────────────────────────────────────
step "5/5 Deploying ${PROD_SHA:0:7} with database_mode=supabase"
SWITCHED=true   # from here the local database is no longer the source of truth
trap - EXIT
(cd "$ANSIBLE_DIR" && ansible-playbook deploy.yml --vault-password-file .vault_pass.txt \
  -e "repo_version=$PROD_SHA" -e force_deploy=true -e allow_db_mode_change=true)

HEALTH=$(curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-all-errors "$HEALTH_URL")
echo "$HEALTH" | grep -q '"db":"ok"' || die "Health check failed after the switch: $HEALTH — see README rollback."
ssh_run "grep -q 'pooler.supabase.com' $APP_DIR/.env" || die "Deployed .env doesn't point at Supabase."
echo "✓ $HEALTH_URL → $HEALTH"

cat <<EOF

✓ Cutover complete — production runs on Supabase.

Do these now, in this order (README → "Supabase cutover" → "After the switch"):
  1. Update the CI copy of the vault, or the next CI deploy fails:
       base64 -i ansible/group_vars/vault.yml | tr -d '\n' | gh secret set ANSIBLE_VAULT_FILE_B64 -R macrocoats/macrocoats-api
  2. Commit and push 'database_mode: supabase' in ansible/group_vars/all.yml.
  3. Leave the local PostgreSQL running untouched for a week as the rollback copy.
EOF
