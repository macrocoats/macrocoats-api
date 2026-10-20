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
and the complete integration/PDF test suite. A successful `main` push then deploys that exact Git
SHA to production through this Ansible role. Production deployments are serialized and are never
cancelled by a newer run. Actions passes `force_deploy=true`, so rerunning a failed deployment
rebuilds and retries migrations even when the VM already checked out the requested SHA.

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

Pulls `repo_version` (default `main`), runs `npm ci && npm run build` only if the checkout changed,
writes `.env`, takes a pre-migration database backup, runs `db:migrate`, restarts the
`macrocoats-api` systemd service, and waits for `/health` to report PostgreSQL and Redis healthy.

Seed data is **not** run by default (it's idempotent but there's no reason to run it every deploy).
To run it explicitly:

```bash
ansible-playbook deploy.yml --ask-vault-pass --tags seed
```

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
