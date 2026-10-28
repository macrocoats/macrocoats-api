#!/usr/bin/env bash
# Asks for the macrocoats-portal database password (hidden), finds the Mumbai
# session pooler host that accepts it, and writes the full connection string
# into .env.local as SUPABASE_DATABASE_URL. The password is never echoed or logged.
set -euo pipefail
cd "$(dirname "$0")/.."

REF=usaagtpoltjoetajvyvp
HOSTS=(aws-1-ap-south-1.pooler.supabase.com aws-0-ap-south-1.pooler.supabase.com)

read -rsp "Supabase database password for macrocoats-portal (input hidden): " pw
echo
[[ -n "$pw" ]] || { echo "✗ Nothing was entered." >&2; exit 1; }

# Percent-encode so characters like @ : / # ? in the password don't break the URL
enc="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$pw")"

url=""
for host in "${HOSTS[@]}"; do
  candidate="postgresql://postgres.$REF:$enc@$host:5432/postgres?sslmode=require"
  if PGCONNECT_TIMEOUT=10 psql "$candidate" -Atqc 'select 1' >/dev/null 2>"${TMPDIR:-/tmp}/sb-conn.err"; then
    url="$candidate"; echo "✓ Connected via $host"; break
  fi
done

if [[ -z "$url" ]]; then
  echo "✗ Couldn't connect with that password:" >&2
  sed -E 's/password=[^ ]*/password=****/' "${TMPDIR:-/tmp}/sb-conn.err" | head -3 >&2
  echo "  If it says 'password authentication failed', re-check the password you set on" >&2
  echo "  Settings → Database → Reset database password." >&2
  rm -f "${TMPDIR:-/tmp}/sb-conn.err"; exit 1
fi
rm -f "${TMPDIR:-/tmp}/sb-conn.err"

python3 - "$url" <<'EOF'
import re, sys
url, path = sys.argv[1], '.env.local'
s = open(path).read()
if re.search(r'^SUPABASE_DATABASE_URL=', s, flags=re.M):
    s = re.sub(r'^SUPABASE_DATABASE_URL=.*$', lambda m: 'SUPABASE_DATABASE_URL=' + url, s, count=1, flags=re.M)
else:
    s += '\nSUPABASE_DATABASE_URL=' + url + '\n'
open(path, 'w').write(s)
EOF
echo "✓ Saved SUPABASE_DATABASE_URL to .env.local"
