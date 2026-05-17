# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

```bash
# Development
npm run dev            # tsx watch with .env.local loaded (hot reload)
npm run lint           # tsc --noEmit type-check only

# Testing — runs against a real PostgreSQL DB, not mocks
npm test               # all integration tests (sequential, single fork)
npm run test:watch
npm run test:coverage

# Run a single test file
npx vitest run tests/integration/auth.test.ts

# Database
npm run db:push        # push schema to DB (dev, no migration files)
npm run db:generate    # generate Drizzle migration files
npm run db:migrate     # run pending migrations
npm run db:studio      # open Drizzle Studio GUI
npm run seed           # idempotent seed (products, inventory, companies)
npm run db:reset       # dev-only: drop all tables

# Build
npm run build          # tsc -p tsconfig.build.json → dist/
npm start              # run compiled dist/server.js
```

### Environment setup

All db:* and seed scripts load `.env.local` via `dotenv` inside `drizzle.config.ts` or via `tsx --env-file=.env.local`. The dev server uses `tsx watch --env-file=.env.local`. Do not use `NODE_OPTIONS=--env-file` — it is blocked by Node for security.

All variables are validated by Zod at startup (`src/config/env.ts`); the server exits immediately if any required ones are missing or malformed.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `JWT_PRIVATE_KEY_B64` | yes | — | RS256 private key, base64-encoded |
| `JWT_PUBLIC_KEY_B64` | yes | — | RS256 public key, base64-encoded |
| `COOKIE_SECRET` | yes | — | Cookie signing secret (≥32 chars) |
| `NODE_ENV` | no | development | development \| test \| production |
| `PORT` | no | 3001 | HTTP server port |
| `API_VERSION` | no | v1 | Route prefix |
| `LOG_LEVEL` | no | info | Pino log level |
| `REDIS_URL` | no | — | Redis connection; caching disabled if absent |
| `JWT_ACCESS_EXPIRES` | no | 15m | Access token TTL |
| `JWT_REFRESH_EXPIRES` | no | 7d | Refresh token TTL |
| `COOKIE_DOMAIN` | no | localhost | Cookie domain |
| `COOKIE_SECURE` | no | false | Set Secure flag on cookies |
| `ALLOWED_ORIGIN` | no | http://localhost:5173 | CORS allowed origin |

---

## Architecture

### Request lifecycle

Every request flows through:

```
onRequest hook: authenticate()        ← always runs, sets request.authUser or null
    ↓
preHandler (route-specific):
    requireAuth()                     ← 401 if no authUser
    requireSuperAdmin() OR checkProductAccess()
    logAccess()                       ← fire-and-forget access_log INSERT (onSend)
    ↓
route handler → service function → DB / Redis
```

`authenticate` is a global `onRequest` hook (not per-route) — `request.authUser` is always available in handlers. The `requireAuth` preHandler is what actually rejects unauthenticated requests.

### Module layout

Each module under `src/modules/<name>/` has three files with strict roles:
- `*.routes.ts` — Fastify route registration + preHandler chain + input validation (Zod safeParse)
- `*.service.ts` — all DB queries and business logic, no Fastify types
- `*.schema.ts` — Zod schemas for request validation

Routes never import from other modules' services. Cross-cutting concerns (auth, access log) live in `src/middleware/`.

**Modules and their endpoints** (all prefixed with `/v1`):

| Module | Endpoints |
|---|---|
| `auth` | POST /auth/login, /auth/token, /auth/refresh, /auth/logout; GET /auth/me |
| `products` | GET /products, GET /products/:productLine/:docType, PUT /products/:productLine/:docType |
| `companies` | GET /companies, GET /companies/:id, POST /companies, PATCH /companies/:id, POST /companies/:id/rotate-token, DELETE /companies/:id |
| `quotations` | POST /quotations, GET /quotations, GET /quotations/:id |
| `batches` | POST /batches, GET /batches, GET /batches/:batchNumber, DELETE /batches/:id |
| `inventory` | GET /inventory, POST /inventory, PATCH /inventory/:id, DELETE /inventory/:id, POST /inventory/reset |
| `analytics` | GET /analytics/access-log, GET /analytics/summary |

All endpoints except auth are `superadmin`-only, except product document reads which use `checkProductAccess` for company users.

### Middleware

Four preHandler / hook functions in `src/middleware/`:

- **`authenticate.ts`** — global `onRequest`; reads `accessToken` cookie, decodes RS256 JWT, sets `request.authUser` or null. Never throws.
- **`requireAuth.ts`** — preHandler; returns 401 if `request.authUser` is null.
- **`requireSuperAdmin.ts`** — preHandler; returns 403 if `request.authUser.role !== 'superadmin'`.
- **`checkProductAccess.ts`** — preHandler; returns 403 if company user requests a `RESTRICTED_DOC_TYPE` (formula/label/coa) or a product not in their `allowedProducts`.
- **`logAccess.ts`** — `onSend` hook; fire-and-forget INSERT into `access_log` after response is sent. Captures userId, companyKey, productKey, docType, IP, userAgent. Never blocks response; errors silently.

### Auth tokens

Two-token RS256 system:
- **Access token** (15m): JWT carrying full `AuthUser` payload (id, role, companyName, allowedProducts). Verified on every request by decoding the `accessToken` httpOnly cookie. The payload is trusted directly — no DB lookup on each request.
- **Refresh token** (7d): JWT whose `jti` is a UUID matching a row in `refresh_tokens`. The raw token is never stored — only its `bcrypt` hash. Rotation revokes the old row and calls `issueTokens()` to produce a new pair.

`issueTokens()` in `auth.service.ts` is the single function that creates both tokens and inserts the refresh token row. Three login paths funnel through it:
- `loginWithCredentials` — username + password (POST /auth/login)
- `loginWithToken` — company magic/QR token (POST /auth/token); token checked against `companies.accessToken`, respects `tokenExpiresAt`
- `rotateRefreshToken` — POST /auth/refresh

### RBAC

Two roles: `superadmin` and `company`.

- `superadmin`: unrestricted access to all routes.
- `company`: can only access TDS/MSDS for products in their `allowedProducts` list. `formula`, `label`, `coa` doc types are always blocked for company users (`RESTRICTED_DOC_TYPES` in `src/types/index.ts`).

`allowedProducts` is loaded from `company_product_access` at login and embedded in the JWT — not re-queried per request.

### Product documents (JSONB)

`product_documents` stores each `(product_key, doc_type)` pair as a single row. The `body` column is `JSONB` with a shape that varies per docType (TDS, MSDS, Formula etc. all differ). `footer` is always `{ left, center, right }`. There is a unique constraint on `(product_key, doc_type)`.

### Redis caching

Redis is entirely optional. `src/plugins/redis.ts` exports `cacheGet/cacheSet/cacheDel/cacheDelPattern` helpers that no-op silently when `REDIS_URL` is not set. Product documents are cached at key `doc:{productLine}:{docType}` with a 300s TTL, invalidated on PUT.

### Testing

Integration tests use a real PostgreSQL database (the same one in `.env.local`). They must run sequentially (`singleFork: true` in vitest config) because they share DB state. Each test file builds its own Fastify app instance via `buildApp()` and tears it down in `afterAll`. Tests depend on seed data — run `npm run seed` before testing.

### Quotation numbering

`quotation_sequences` uses an `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` pattern (in `src/utils/quotNumber.ts`) for a lock-free atomic per-year counter that produces `UNIK-YYYY-NNN` numbers without deadlocks. Line items are stored in a separate `quotation_line_items` table (FK → quotations, cascade delete).

### Batch numbering

`batch_sequences` uses the same lock-free atomic pattern (in `src/utils/batchNumber.ts`). `nextBatchNumber(db, companyName)` produces `XX-YYYYMMDD-NNN` where XX is the first 2 chars of the company name (uppercase), YYYYMMDD is the production date, and NNN is a per-company per-day counter. Each batch also captures JSONB snapshots at creation time:

- `formulationSnapshot` — full formulation at time of batch creation
- `labelSnapshot` — label data including the assigned batchNumber
- `costSummary` — cost breakdown
- `paymentDueDate`, `paymentTermDays` (default 45) — payment tracking

### Database schema

13 tables across `src/db/schema/`:

| Table | Purpose |
|---|---|
| `users` | User accounts; roles superadmin or company |
| `companies` | Client companies; holds `accessToken` + `tokenExpiresAt` for magic-link login |
| `company_product_access` | Junction: which products each company may view |
| `products` | Product line definitions (5 chemical products) |
| `product_documents` | TDS/MSDS/Formula/Label/COA per product (JSONB body) |
| `inventory` | Raw materials: price, stock, supplier, reorder threshold |
| `quotations` | Sales quotations with auto-generated UNIK-YYYY-NNN numbers |
| `quotation_line_items` | Line items in a quotation (FK → quotations, cascade delete) |
| `quotation_sequences` | Per-year atomic counter for quotation numbering |
| `batches` | Manufacturing batch records with formulation/label/cost snapshots |
| `batch_sequences` | Per-company per-day atomic counter for batch numbering |
| `access_log` | Audit trail: who accessed which product/docType, when, from where |
| `refresh_tokens` | Valid refresh token bcrypt hashes; null `revokedAt` = still valid |

### Seed data

`src/seed/` contains idempotent seed scripts (run via `npm run seed`):

- `index.ts` — entry point; runs all seeds in order
- `products.seed.ts` — 5 product lines (uniklean-sp, uniklean-fe, uniprotect-oil, uniflow-ecm, unicool-al)
- `companies.seed.ts` — test companies (Rane Madras, TVS, Akshaya) with product access mappings
- `inventory.seed.ts` — 23 factory-default raw materials
- `reset.ts` — dev-only; drops all tables (invoked by `npm run db:reset`)

### Utilities

- `src/utils/jwt.ts` — RS256 sign/verify for access and refresh tokens
- `src/utils/crypto.ts` — bcrypt hashing, token generation, username normalization
- `src/utils/quotNumber.ts` — atomic quotation number generation (UNIK-YYYY-NNN)
- `src/utils/batchNumber.ts` — atomic batch number generation (XX-YYYYMMDD-NNN)

## Database & Migrations

### Migration workflow (canonical)

Always use Drizzle's generator — **never hand-write migration SQL files**. Hand-written files are not registered in the Drizzle journal and cause schema drift and 500 errors.

```
# Correct flow for any schema change:
1. Edit the schema file in src/db/schema/
2. npm run db:generate   # generates a versioned migration file + updates journal
3. npm run db:migrate    # applies pending migrations
4. npm run seed          # re-seed if new tables were added
```

**Before generating a new migration:**
- Run `npm run db:studio` or inspect the DB to check if the column/table already exists — avoid duplicate-column errors from re-applying changes that were applied manually earlier.
- Check `drizzle/` folder: every `.sql` file must have a matching entry in `drizzle/meta/_journal.json`. If they are out of sync, resolve that before generating new migrations.

### Entity relationship rules

- **Staff** and **Vendors** are standalone entities — they are NOT linked to the `companies` table and have no FK to it.
- `companies` links only to: `users`, `company_product_access`, `quotations`, `batches`, `access_log`.
- When building new modules, confirm relationship assumptions before writing the schema — do not assume a new entity belongs to a company unless the user explicitly says so.

### Recovery from a failed migration

If a migration left tables partially created or the journal is out of sync:
1. Inspect actual DB state: `npm run db:studio`
2. Compare against `drizzle/meta/_journal.json` to identify unregistered files
3. Use `npm run db:generate` to create a corrective migration — do not manually edit `.sql` files in `drizzle/`
4. As a last resort in dev only: `npm run db:reset` then `npm run db:migrate` then `npm run seed`

---

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
