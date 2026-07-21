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
