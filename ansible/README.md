# Ansible deploy — macrocoats-api on OCI

Targets the checklist: Ubuntu 22.04, self-hosted PostgreSQL, optional Redis, Nginx + Let's Encrypt,
systemd-managed app process. Frontend (Vercel/Netlify) is out of scope here.

## One-time setup (control machine)

```bash
cd macrocoats-api/ansible
ansible-galaxy collection install -r requirements.yml

cp group_vars/vault.yml.example group_vars/vault.yml
# fill in vault_db_password, vault_jwt_private_key_b64, vault_jwt_public_key_b64,
# vault_cookie_secret (generation commands are in vault.yml.example)
ansible-vault encrypt group_vars/vault.yml

# edit inventory.ini with the real instance IP
# confirm repo_url in group_vars/all.yml has deploy-key access from this host
```

DNS: point `api.macrocoats.in` (A record) at the instance's public IP before running `nginx` role
(certbot needs the domain resolving to this host to issue a certificate).

## Provision (run once, safe to re-run)

```bash
ansible-playbook provision.yml --ask-vault-pass
```

Installs Node 20, Postgres, Redis, Nginx, opens ufw for 80/443/22, and requests a TLS cert via
certbot. Re-running is safe — every task is idempotent.

The first play (`oci-network.yml`, auto-imported) manages the OCI Security List + NSG rules
directly via the OCI API — not SSH — so it needs `~/.oci/config` (run `oci setup config` once)
and the `oci` Python SDK in Ansible's own interpreter (`pip install oci` using the same Python
Ansible reports via `ansible --version`, not necessarily your system `python3`). It targets the
Security List/NSG OCIDs hardcoded in `group_vars/all.yml` — if the VCN/subnet ever changes, update
those. This does not create a VCN/subnet/NSG from scratch; a from-scratch rebuild still needs that
provisioned first (console or `oci` CLI), same as getting a fresh instance up in the first place.
To run just this part: `ansible-playbook oci-network.yml`.

The second play (`oci-monitoring.yml`, also auto-imported) codifies the uptime-monitoring stack:
an OCI Health Checks HTTP monitor (3 global vantage points, probes `/v1/products` every 60s), a
Monitoring alarm that fires on 5+ minutes of no successful response, and a Notifications email
subscription. Same OCI-API/localhost mechanics as `oci-network.yml`, and same caveat: it updates
the *existing* topic/subscription/monitor/alarm (OCIDs hardcoded in `group_vars/all.yml`), it
doesn't create them from zero on a fresh tenancy. A new email subscription needs manual
confirmation via the link OCI emails to it before alerts actually deliver — `is-enabled`/
`lifecycle-state` won't tell you that from the CLI, check `oci ons subscription list`.
To run just this part: `ansible-playbook oci-monitoring.yml`.

## Automated CI/CD (GitHub Actions)

`.github/workflows/backend-ci-cd.yml` is the normal release path. Pull requests and pushes to
`main` run typechecking, the production build, migrations and seeds against clean PostgreSQL 16,
and the complete integration/PDF test suite. On a `main` push, that tested `dist` directory is
uploaded as a workflow artifact and installed on the production VM, so production does not repeat
the TypeScript build. A successful push deploys that exact Git SHA through this Ansible role.
Production deployments are serialized and are never cancelled by a newer run. Actions passes
`force_deploy=true`, so rerunning a failed deployment reinstalls the artifact and retries migrations
even when the VM already checked out the requested SHA. `npm ci` runs only when `package-lock.json`
changed or the VM's installed dependency tree is missing.

Create a GitHub environment named `production` before enabling the workflow. It needs these
environment secrets:

| Secret | Value |
|---|---|
| `OCI_SSH_PRIVATE_KEY` | Contents of `~/.ssh/macrocoats-oci.key` |
| `OCI_SSH_KNOWN_HOSTS` | Pinned `known_hosts` entry for `92.4.91.25` |
| `ANSIBLE_VAULT_FILE_B64` | Base64-encoded encrypted `group_vars/vault.yml` |
| `ANSIBLE_VAULT_PASSWORD` | Contents of `.vault_pass.txt` |

Generate the vault secret without decrypting or printing it:

```bash
base64 < group_vars/vault.yml | tr -d '\n' | gh secret set ANSIBLE_VAULT_FILE_B64 --env production
gh secret set ANSIBLE_VAULT_PASSWORD --env production < .vault_pass.txt
gh secret set OCI_SSH_PRIVATE_KEY --env production < ~/.ssh/macrocoats-oci.key
ssh-keyscan -H 92.4.91.25 | gh secret set OCI_SSH_KNOWN_HOSTS --env production
```

Confirm the SSH host-key fingerprint through OCI before accepting a new or changed key. Protect
`main` so it requires one approving review, an up-to-date branch, and the `Backend verification`
status, with direct pushes, force pushes, and deletion disabled.

Each deployment captures the previously running SHA, takes a database backup, runs migrations,
restarts the service, and verifies both the checked-out SHA and `https://api.macrocoats.in/health`.
If verification fails, the workflow stops and reports the captured SHA; it does not automatically
rollback code or data.

### Manual rollback

Run the `Rollback production` workflow, provide the full prior 40-character SHA from the failed
deployment summary, and enter `ROLLBACK` as confirmation. The workflow performs a forward deploy
of that older code through the same Ansible role. It does not reverse migrations or restore the
database; schema/data rollback remains a separate, explicitly approved operation.

## Local deploy (run on every release)

```bash
ansible-playbook deploy.yml --ask-vault-pass
```

Pulls `repo_version` (default `main`), installs dependencies only if needed, and builds on the VM
when no CI release artifact was supplied. It writes `.env`, takes a pre-migration database backup
and runs `db:migrate` only when the database is behind the migration journal, restarts the
`macrocoats-api` systemd service, and waits for `/health` to report PostgreSQL and Redis healthy.

The `db-backup` and `supabase-replica` roles run only when their inputs change: their role files,
`group_vars/all.yml`, `database_mode` or the Supabase vault URL. A fingerprint of those inputs is
stored on the VM at `/var/lib/macrocoats/deploy-infra.sha256`. To run them anyway, for example if
the VM's backup script was changed by hand, pass `-e force_infra_setup=true`.

CI runs `deploy.yml` unless the only differences from the commit running in production are tests,
`.github/`, `scripts/` or `*.md` files. Changes to `scripts/supabase-lockdown.sql` always deploy.
A push that only changes `*.md` files doesn't start the workflow, so after changing a secret, run
`ansible-playbook deploy.yml` manually or re-run the workflow on a commit that deploys.

Seed data is **not** run by default (it's idempotent but there's no reason to run it every deploy).
To run it explicitly:

```bash
ansible-playbook deploy.yml --ask-vault-pass --tags seed
```

## Supabase cutover (local PostgreSQL → Supabase, one-time)

`database_mode` in `group_vars/all.yml` decides where production data lives: `local` (PostgreSQL
on this host, the default) or `supabase` (project **macrocoats-portal**, `ap-south-1` Mumbai —
same city as this OCI host). The app connects through Supabase's **session pooler** on port
5432: the direct `db.<ref>.supabase.co` host is IPv6-only and this box has no IPv6, and the
transaction pooler (6543) breaks the server-side prepared statements `postgres-js` uses.

What `database_mode: supabase` changes:

| | local | supabase |
|---|---|---|
| `DATABASE_URL` | `localhost:5432` with `vault_db_password` | `vault_supabase_database_url` |
| `DB_POOL_MAX` | 20 | 10 (stay under the pooler's pool size) |
| systemd unit | `After=postgresql.service` | `After=network-online.target` |
| backups (`roles/db-backup`) | `sudo -u postgres pg_dump` | `pg_dump` 17 (PGDG) over the pooler, `public` + `drizzle` schemas only |
| after `db:migrate` | — | `scripts/supabase-lockdown.sql` (keeps the Data API closed over new tables) |
| `provision.yml` | runs the `postgres` role | skips it |

A deploy refuses to change `database_mode` relative to what production currently uses unless
`-e allow_db_mode_change=true` is passed — so a branch still saying `local` can't quietly point
production back at the stale local copy after the cutover.

### Hourly Supabase replica (while `database_mode: local`)

`roles/supabase-replica` copies the local production database into Supabase every hour at
:17 — a warm standby and off-host backup that is at most an hour old. It is **one-way**:
anything written directly in Supabase is overwritten on the next run.

Each run (`/usr/local/bin/sync-supabase-replica.sh`, cron as root):
1. takes a lock (runs never overlap) and skips if paused or if production already points at Supabase
2. `pg_dump -Fc` of the local database → `pg_restore --clean --single-transaction` into Supabase,
   so the replica is always a complete copy, never half-loaded
3. reruns `scripts/supabase-lockdown.sql`
4. compares every table's row count with production (skipped, and logged, if writes happened
   during the dump) and records the time in `/var/lib/macrocoats/supabase-replica.last-success`

```bash
sudo tail -n 20 /var/log/macrocoats/supabase-replica.log        # recent runs
sudo cat /var/lib/macrocoats/supabase-replica.last-success       # last good copy
sudo /usr/local/bin/sync-supabase-replica.sh                     # run one now
```

- Needs `vault_supabase_database_url` in the vault — and in the `ANSIBLE_VAULT_FILE_B64` secret,
  since CI deploys use that copy. Without it the deploy prints a warning and the replica doesn't run.
- `supabase_replica_enabled: false` in `group_vars/all.yml` removes the cron job on the next deploy.
- `scripts/cutover-to-supabase.sh` pauses it (`/var/lib/macrocoats/supabase-replica.paused`) and
  waits for a running copy before it starts; deploying with `database_mode: supabase` removes it.
- Failures only go to the log for now — there is no alert.

### Prerequisites

1. **Supabase Pro plan.** Free projects pause after a week without activity (production would go
   down) and have no downloadable backups.
2. **This PR merged and deployed** — the cutover redeploys the running commit and needs
   `scripts/supabase-lockdown.sql` on the host. The script checks this.
3. **Vault value:** `ansible-vault edit group_vars/vault.yml` → add
   `vault_supabase_database_url: "postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"`
   (Dashboard → Connect → Session pooler; percent-encode special characters in the password).
4. **No other deploys in flight** — don't merge to `main` until "After the switch" is done.

### Run it

```bash
# working copy only — do not push yet
sed -i '' 's/^database_mode: local/database_mode: supabase/' ansible/group_vars/all.yml
scripts/cutover-to-supabase.sh
```

The script preflights (Supabase reachable from here and from the OCI host, matching pg tool
versions, running commit), asks you to type `cutover`, then: stops the API → dumps with the
server's own `pg_dump` → restores into Supabase in one transaction → runs the lockdown → compares
every table's row count with production → redeploys the running commit with
`database_mode=supabase` → checks `/health`. Downtime is the copy plus one deploy (a few minutes
at today's ~14 MB).

**If anything fails before the deploy step, the script restarts the API on the local database —
production is exactly as it was.** Dumps are kept in `/var/backups/macrocoats/cutover-*.dump`
on the host and `~/macrocoats-backups/cutover/` locally.

### After the switch

1. Update the CI copy of the vault **before** pushing, or the next CI deploy fails:
   `base64 -i ansible/group_vars/vault.yml | tr -d '\n' | gh secret set ANSIBLE_VAULT_FILE_B64 -R macrocoats/macrocoats-api`
2. Commit and push the `database_mode: supabase` change.
3. Leave the local PostgreSQL running and untouched for at least a week as the rollback copy.
   Then stop it (`sudo systemctl disable --now postgresql`) and delete the cutover dumps.

### Rolling back

Writes made after the switch exist only in Supabase. To go back, freeze writes, copy Supabase →
local (`pg_dump --schema=public --schema=drizzle` with a v17 client, `pg_restore --clean` into the
local database), then:

```bash
sed -i '' 's/^database_mode: supabase/database_mode: local/' group_vars/all.yml
ansible-playbook deploy.yml --vault-password-file .vault_pass.txt -e force_deploy=true -e allow_db_mode_change=true
```

If the switch itself failed seconds ago and nothing was written yet, skip the copy.

### Restoring a backup (supabase mode)

`scripts/restore-db.sh` only targets the local database and refuses to run in supabase mode.
Backups are plain SQL (`.sql.gz`), so restore with
`gunzip -c <file> | psql "<vault_supabase_database_url>"` into a cleared schema, then run
`psql "<url>" -f scripts/supabase-lockdown.sql`.

## Notes / things to double check after first run

- `postgres` role's `listen_addresses` task guesses the PostgreSQL version path
  (`/etc/postgresql/<version>/main/postgresql.conf`); it's set to `ignore_errors` because the
  version can vary — verify manually with `sudo -u postgres psql -c 'show config_file;'` if unsure.
- The systemd unit runs as `app_user` (defaults to the same user Ansible connects as). If you'd
  rather run the app as a dedicated non-login service account, add a user-creation task and change
  `app_user` in `group_vars/all.yml`.
- `deploy.yml` assumes brief downtime during `systemctl restart` (a few seconds) — fine for a
  low-traffic internal portal, not zero-downtime. Revisit if that stops being acceptable.
- Never commit `group_vars/vault.yml` unencrypted. `vault.yml.example` is the only one meant to be
  tracked in git.
