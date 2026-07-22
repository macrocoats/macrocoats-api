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

## Deploy (run on every release)

```bash
ansible-playbook deploy.yml --ask-vault-pass
```

Pulls `repo_version` (default `main`), runs `npm ci && npm run build` only if the checkout changed,
writes `.env`, runs `db:migrate`, restarts the `macrocoats-api` systemd service.

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
