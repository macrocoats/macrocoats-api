# Macro Coats API

REST API backend for the **Macro Coats Product Document Portal** — a document management and internal tooling platform for industrial surface treatment chemicals.

Built with **Fastify · TypeScript · Drizzle ORM · PostgreSQL · Redis**.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [1. Clone & Install](#1-clone--install)
  - [2. Generate JWT Keypair](#2-generate-jwt-keypair)
  - [3. Configure Environment](#3-configure-environment)
  - [4. Push Schema & Seed](#4-push-schema--seed)
  - [5. Run Dev Server](#5-run-dev-server)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
  - [Auth](#auth)
  - [Products](#products)
  - [Inventory](#inventory)
  - [Quotations](#quotations)
  - [Companies](#companies)
  - [Analytics](#analytics)
- [Auth Flow](#auth-flow)
  - [Login Flow](#login-flow)
  - [Magic-Link / QR Token Flow](#magic-link--qr-token-flow)
  - [Token Refresh Flow](#token-refresh-flow)
  - [RBAC Middleware Stack](#rbac-middleware-stack)
- [Role-Based Access Control](#role-based-access-control)
- [Caching](#caching)
- [Scripts](#scripts)
- [Testing](#testing)
- [Production Deployment](#production-deployment)
  - [Security Checklist](#security-checklist)
  - [Frontend Integration Checklist](#frontend-integration-checklist)

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│              React + Vite SPA               │
│         (safteyDataSheet frontend)          │
└───────────────────┬─────────────────────────┘
                    │  HTTPS + httpOnly cookie
                    ▼
┌─────────────────────────────────────────────┐
│           macrocoats-api (Fastify)          │
│                                             │
│  /v1/auth        /v1/products               │
│  /v1/inventory   /v1/quotations             │
│  /v1/companies   /v1/analytics              │
└────────┬──────────────────────┬─────────────┘
         │                      │
         ▼                      ▼
  ┌─────────────┐       ┌──────────────┐
  │ PostgreSQL  │       │  Redis       │
  │ (primary)   │       │  (doc cache) │
  └─────────────┘       └──────────────┘
```

The API is the **single source of truth** for all product documents, inventory prices, user accounts, company access control, and quotation history. The frontend talks only to this API — the MSW mock layer is removed once this backend is live.

---

## Tech Stack

| Layer            | Technology                    | Version   |
|------------------|-------------------------------|-----------|
| Runtime          | Node.js                       | ≥ 20 LTS  |
| Language         | TypeScript                    | 5.x       |
| Framework        | Fastify                       | 4.x       |
| ORM              | Drizzle ORM                   | 0.38+     |
| Database         | PostgreSQL                    | 16+       |
| Cache            | Redis (optional)              | 7+        |
| Auth             | JWT RS256 + httpOnly cookies  | —         |
| Password hashing | bcryptjs (cost 12)            | —         |
| Validation       | Zod                           | 3.x       |
| Testing          | Vitest + Supertest            | —         |

---

## Project Structure

```
macrocoats-api/
├── src/
│   ├── app.ts                        # Fastify instance, plugin & route registration
│   ├── server.ts                     # Entry point — listens, graceful shutdown
│   ├── config/
│   │   └── env.ts                    # Zod-validated env schema (fails fast on startup)
│   ├── types/
│   │   ├── index.ts                  # Shared domain types (AuthUser, DocType, etc.)
│   │   └── fastify.d.ts              # Module augmentation — adds authUser to FastifyRequest
│   ├── db/
│   │   ├── index.ts                  # Drizzle client (postgres-js pool)
│   │   └── schema/
│   │       ├── users.ts
│   │       ├── companies.ts
│   │       ├── companyProductAccess.ts
│   │       ├── products.ts
│   │       ├── productDocuments.ts   # JSONB body — one row per (product, docType)
│   │       ├── inventory.ts
│   │       ├── quotations.ts         # + quotation_line_items + quotation_sequences
│   │       ├── accessLog.ts
│   │       ├── refreshTokens.ts
│   │       └── index.ts              # Re-exports all schemas
│   ├── plugins/
│   │   ├── cors.ts                   # @fastify/cors — credentials: true
│   │   ├── cookie.ts                 # @fastify/cookie + cookie option helpers
│   │   └── redis.ts                  # Optional cache-aside helpers (cacheGet/Set/Del)
│   ├── middleware/
│   │   ├── authenticate.ts           # Reads accessToken cookie → sets request.authUser
│   │   ├── requireAuth.ts            # Hard 401 gate — chain after authenticate
│   │   ├── requireSuperAdmin.ts      # 403 unless role === 'superadmin'
│   │   ├── checkProductAccess.ts     # Validates productLine + docType per user role
│   │   └── logAccess.ts              # Fire-and-forget access_log INSERT
│   ├── utils/
│   │   ├── jwt.ts                    # RS256 sign/verify for access + refresh tokens
│   │   ├── crypto.ts                 # bcrypt hash/verify, URL-safe token generation
│   │   └── quotNumber.ts             # Atomic UNIK-YYYY-NNN via upsert + RETURNING
│   ├── modules/
│   │   ├── auth/                     # login, token, refresh, logout, me
│   │   ├── products/                 # GET + PUT /products/:line/:type
│   │   ├── inventory/                # CRUD + reset for raw material prices
│   │   ├── quotations/               # Create + list + get quotations
│   │   ├── companies/                # CRUD + token rotation for client companies
│   │   └── analytics/                # Access log query + 30-day summary
│   └── seed/
│       ├── index.ts                  # Master runner (idempotent)
│       ├── products.seed.ts          # 5 products × TDS/MSDS/Formula/Label documents
│       ├── inventory.seed.ts         # 23 default raw material prices
│       ├── companies.seed.ts         # 5 companies + users + superadmin
│       └── reset.ts                  # Dev-only: drops all tables
├── tests/
│   └── integration/
│       ├── auth.test.ts              # Login, token, me, logout, refresh
│       ├── products.test.ts          # Access gates, RBAC per role
│       └── inventory.test.ts         # CRUD + reset flow
├── .env.example
├── drizzle.config.ts
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── vitest.config.ts
```

---

## Getting Started

### Prerequisites

| Tool       | Minimum version |
|------------|-----------------|
| Node.js    | 20 LTS          |
| npm        | 9+              |
| PostgreSQL | 16+             |
| Redis      | 7+ *(optional)* |
| OpenSSL    | Any             |

---

### 1. Clone & Install

```bash
cd macrocoats-api
npm install
```

---

### 2. Generate JWT Keypair

The API uses **RS256** (asymmetric JWT) so the public key can be shared safely with edge workers or CDN functions without exposing the signing secret.

```bash
# Generate a 4096-bit RSA private key
openssl genrsa -out private.pem 4096

# Extract the public key
openssl rsa -in private.pem -pubout -out public.pem

# Base64-encode both (one-liners — no newlines)
base64 -i private.pem | tr -d '\n'   # → paste into JWT_PRIVATE_KEY_B64
base64 -i public.pem  | tr -d '\n'   # → paste into JWT_PUBLIC_KEY_B64
```

> **Keep `private.pem` out of source control.** It is already in `.gitignore`.

---

### 3. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in at minimum:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/macrocoats
JWT_PRIVATE_KEY_B64=<output from step 2>
JWT_PUBLIC_KEY_B64=<output from step 2>
COOKIE_SECRET=<64-char random hex>
ALLOWED_ORIGIN=http://localhost:5173
```

Generate `COOKIE_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

### 4. Push Schema & Seed

```bash
# Create all 9 tables in your Postgres database
npm run db:push

# Seed products (5 × TDS/MSDS/Formula/Label), inventory (23 items), companies & users
npm run seed
```

The seed is **idempotent** — safe to run multiple times. It uses `onConflictDoUpdate` throughout.

Default credentials created by the seed:

| Username          | Password                       | Role       |
|-------------------|--------------------------------|------------|
| `admin`           | `mc2024Xp7NrK9L3vQeJbF2wTa`   | superadmin |
| `rane`            | `r7Kx9mNpQ2wLvYtA8bZeJ3dF`   | company    |
| `sanmar`          | `sN4wP8tRmXkL2vBqA7cYeJ5G`   | company    |
| `galva`           | `gL3mQ9xNvKpR7wYtA2bZeJ8F`   | company    |
| `tvs`             | `tV5kR2mNpQ8wLxYtA7bZeJ4G`   | company    |
| `sundaramfasteners` | `sf9Np4xRmKvL7wYtA3bZeJ2Q` | company    |

> ⚠️ **Rotate all these tokens immediately after first production deploy.** Use `POST /v1/companies/:id/rotate-token` for company tokens and update the superadmin password via the DB directly.

---

### 5. Run Dev Server

```bash
npm run dev
# Server starts at http://localhost:3001
# Health check: http://localhost:3001/health
```

---

## Environment Variables

All variables are validated by Zod at startup. The server **will not start** if required variables are missing or malformed.

| Variable                 | Required | Default          | Description |
|--------------------------|----------|------------------|-------------|
| `NODE_ENV`               | —        | `development`    | `development` \| `test` \| `production` |
| `PORT`                   | —        | `3001`           | HTTP port |
| `API_VERSION`            | —        | `v1`             | URL prefix (e.g. `/v1/...`) |
| `LOG_LEVEL`              | —        | `info`           | Pino log level |
| `DATABASE_URL`           | ✅       | —                | PostgreSQL connection string |
| `REDIS_URL`              | —        | —                | Redis URL — caching disabled if omitted |
| `JWT_PRIVATE_KEY_B64`    | ✅       | —                | Base64-encoded RS256 private key |
| `JWT_PUBLIC_KEY_B64`     | ✅       | —                | Base64-encoded RS256 public key |
| `JWT_ACCESS_EXPIRES`     | —        | `15m`            | Access token lifetime |
| `JWT_REFRESH_EXPIRES`    | —        | `7d`             | Refresh token lifetime |
| `COOKIE_SECRET`          | ✅       | —                | Min 32-char secret for `@fastify/cookie` |
| `COOKIE_DOMAIN`          | —        | `localhost`      | Cookie domain |
| `COOKIE_SECURE`          | —        | `false`          | Set `true` in production (requires HTTPS) |
| `ALLOWED_ORIGIN`         | —        | `http://localhost:5173` | CORS allowed origin |
| `AUTH_RATE_LIMIT_MAX`    | —        | `10`             | Max auth attempts per window |
| `AUTH_RATE_LIMIT_WINDOW` | —        | `900`            | Rate limit window in seconds (15 min) |

---

## Database Schema

```
users ──────────────────────────────────────────────────────────────────┐
  │ id, name, username (unique), password_hash, role, company_id        │
  │                                                                      │
  ├──< refresh_tokens                                                    │
  │      id, user_id, token_hash, expires_at, revoked_at                │
  │                                                                      │
  └──< access_log                                                        │
         id, user_id, company_key, product_key, doc_type, ip, at        │
                                                                         │
companies ───────────────────────────────────────────────────────────── ┤
  │ id, key, display_name, access_token (unique), token_expires_at      │
  │                                                                      │
  └──< company_product_access                                            │
         company_id, product_key  (composite PK)                        │
                                                                         │
products ────────────────────────────────────────────────────────────── ┘
  │ key (PK), display_name, code, category, subtitle, accent_color
  │
  └──< product_documents
         id, product_key, doc_type, doc_number, revision
         body JSONB,  footer JSONB
         UNIQUE (product_key, doc_type)

inventory_items
  id, material, unit, price, stock, supplier, sort_order, is_default

quotations
  │ id, quot_number (unique), customer_name, quot_date, valid_days, valid_until
  │
  └──< quotation_line_items
         id, quotation_id, sort_order, catalog_id, description, code, qty, rate

quotation_sequences
  year (PK), last_n   ← atomic per-year counter
```

**Key design decisions:**
- Product document bodies are stored as **JSONB** — each docType has a different shape, and JSONB avoids 20+ columns of nullable fields while still being queryable.
- Refresh tokens are **hashed with bcrypt** (cost 10) before storage — a leaked DB dump cannot be used to forge sessions.
- The `quotation_sequences` table uses an `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` pattern for a **lock-free atomic counter** — no deadlocks under concurrent quotation generation.
- `is_default` on `inventory_items` marks the 23 factory-seeded rows so that "reset to defaults" deletes only user-added rows.

---

## API Reference

### Base URL
```
http://localhost:3001/v1
```

All request bodies are JSON. All responses are JSON. Authentication uses httpOnly cookies set on login — no `Authorization` header required.

---

### Auth

| Method | Path                | Auth     | Description |
|--------|---------------------|----------|-------------|
| POST   | `/auth/login`       | Public   | Username + password login |
| POST   | `/auth/token`       | Public   | Magic-link / QR token login |
| POST   | `/auth/refresh`     | Cookie   | Rotate refresh token |
| POST   | `/auth/logout`      | Public   | Revoke refresh token + clear cookies |
| GET    | `/auth/me`          | Required | Return current user from cookie |

#### POST `/auth/login`
```json
// Request
{ "username": "admin", "password": "mc2024Xp7NrK9L3vQeJbF2wTa" }

// Response 200
{
  "user": {
    "id": "uuid",
    "name": "Super Admin",
    "role": "superadmin",
    "companyName": null,
    "allowedProducts": null
  }
}
// Sets: accessToken (15m) + refreshToken (7d) as httpOnly cookies
```

Username matching is **case-insensitive and space-insensitive** — `"Sundaram Fasteners"` → `sundaramfasteners`.

#### POST `/auth/token`
```json
// Request
{ "token": "r7Kx9mNpQ2wLvYtA8bZeJ3dF" }

// Response 200
{
  "user": { ... },
  "redirectTo": "/products/uniklean-sp/tds"
}
```

#### Error responses

| Code | Error key              | Meaning |
|------|------------------------|---------|
| 400  | `VALIDATION_ERROR`     | Missing or invalid fields |
| 401  | `INVALID_CREDENTIALS`  | Wrong username/password |
| 401  | `TOKEN_INVALID`        | Magic-link token not found or expired |
| 401  | `NOT_AUTHENTICATED`    | No valid cookie |
| 429  | `TOO_MANY_REQUESTS`    | Rate limit exceeded (10 attempts / 15 min) |

---

### Products

| Method | Path                              | Auth      | Role        | Description |
|--------|-----------------------------------|-----------|-------------|-------------|
| GET    | `/products`                       | Required  | superadmin  | List all active products |
| GET    | `/products/:productLine/:docType` | Required  | see RBAC    | Fetch a document |
| PUT    | `/products/:productLine/:docType` | Required  | superadmin  | Update a document |

**Valid `productLine` values:** `uniklean-sp` · `uniklean-fe` · `uniprotect-oil` · `uniflow-ecm` · `unicool-al`

**Valid `docType` values:** `tds` · `msds` · `formula` · `label` · `coa`

#### GET `/products/:productLine/:docType`
```json
// Response 200 (TDS example)
{
  "productName": "UNIKLEAN-SP",
  "subtitle": "Industrial Surface Cleaner & Metal Conditioner",
  "accentColor": "#1e6b5a",
  "docNumber": "TDS-USP-001",
  "revision": "Rev 01 — Apr 2026",
  "company": "Macro Coats Pvt Ltd",
  "location": "Chennai · India",
  "contact": "info@macrocoats.in",
  "phone": "+91-9884080377",
  "grade": "Industrial Grade",
  "description": "...",
  "sections": { ... },
  "footer": { "left": "...", "center": "...", "right": "..." }
}
```

| Code | Error key               | Meaning |
|------|-------------------------|---------|
| 403  | `PRODUCT_ACCESS_DENIED` | Company user not assigned to this product |
| 403  | `DOC_TYPE_RESTRICTED`   | Formula/Label/CoA requires superadmin |
| 404  | `DOCUMENT_NOT_FOUND`    | Document not in DB |

---

### Inventory

All endpoints require `superadmin` role.

| Method | Path                  | Description |
|--------|-----------------------|-------------|
| GET    | `/inventory`          | List all items (sorted by sort_order, material) |
| POST   | `/inventory`          | Create a new item |
| PATCH  | `/inventory/:id`      | Update item fields (partial) |
| DELETE | `/inventory/:id`      | Delete item |
| POST   | `/inventory/reset`    | Remove user-added items; restore 23 defaults |

#### Inventory item shape
```json
{
  "id":        "uuid",
  "material":  "Sodium Nitrite (NaNO₂)",
  "unit":      "Kg",
  "price":     48.00,
  "stock":     "",
  "supplier":  "",
  "sortOrder": 17,
  "updatedAt": "2026-04-24T10:00:00.000Z"
}
```

`unit` must be `"Kg"` or `"L"`.

---

### Quotations

All endpoints require `superadmin` role.

| Method | Path                | Description |
|--------|---------------------|-------------|
| POST   | `/quotations`       | Create quotation (auto-assigns `UNIK-YYYY-NNN`) |
| GET    | `/quotations`       | List quotations (paginated, filterable) |
| GET    | `/quotations/:id`   | Fetch a single quotation with line items |

#### POST `/quotations`
```json
// Request
{
  "customerName": "Rane Group",
  "quotDate": "2026-04-24",
  "validDays": 30,
  "lineItems": [
    {
      "catalogId": 6,
      "description": "Iron Phosphate",
      "code": "UNI-IRON PHOSPHATE",
      "qty": 500,
      "rate": 130
    }
  ]
}

// Response 201
{
  "id": "uuid",
  "quotNumber": "UNIK-2026-001",
  "customerName": "Rane Group",
  "quotDate": "2026-04-24",
  "validDays": 30,
  "validUntil": "2026-05-24",
  "createdAt": "2026-04-24T10:00:00.000Z",
  "lineItems": [ { ... } ]
}
```

#### GET `/quotations` query params

| Param          | Type   | Description |
|----------------|--------|-------------|
| `page`         | number | Page number (default: 1) |
| `limit`        | number | Per page, max 100 (default: 20) |
| `customerName` | string | Partial match filter |

---

### Companies

All endpoints require `superadmin` role.

| Method | Path                            | Description |
|--------|---------------------------------|-------------|
| GET    | `/companies`                    | List all companies |
| GET    | `/companies/:id`                | Get company by id |
| POST   | `/companies`                    | Create company + companion user account |
| PATCH  | `/companies/:id`                | Update displayName / allowedProducts / tokenExpiresAt |
| POST   | `/companies/:id/rotate-token`   | Revoke old token, generate new one |
| DELETE | `/companies/:id`                | Delete company + cascade all access rows |

#### POST `/companies`
```json
// Request
{
  "key": "toyota",
  "displayName": "Toyota India",
  "allowedProducts": ["uniklean-sp", "uniklean-fe"],
  "tokenExpiresAt": "2027-01-01T00:00:00Z"   // optional
}

// Response 201
{
  "id": "uuid",
  "key": "toyota",
  "displayName": "Toyota India",
  "allowedProducts": ["uniklean-sp", "uniklean-fe"],
  "accessToken": "<generated-token>",
  "tokenExpiresAt": "2027-01-01T00:00:00.000Z",
  "createdAt": "..."
}
```

Creating a company also creates a companion `users` row with `role: 'company'`. The initial password for the company user is the access token.

#### POST `/companies/:id/rotate-token`
```json
// Response 200
{ "accessToken": "<new-token>" }
```

Send the new token to the company for use in `/access/:token` QR links or direct login.

---

### Analytics

All endpoints require `superadmin` role.

| Method | Path                    | Description |
|--------|-------------------------|-------------|
| GET    | `/analytics/access-log` | Paginated raw access log |
| GET    | `/analytics/summary`    | Aggregated 30-day stats |

#### GET `/analytics/access-log` query params

| Param        | Type   | Description |
|--------------|--------|-------------|
| `companyKey` | string | Filter by company |
| `productKey` | string | Filter by product line |
| `from`       | ISO date | Start of window |
| `to`         | ISO date | End of window |
| `page`       | number | Default: 1 |
| `limit`      | number | Max 500, default: 50 |

#### GET `/analytics/summary`
```json
{
  "windowDays": 30,
  "byCompany": [
    { "companyKey": "rane", "accesses": 142 }
  ],
  "byProduct": [
    { "productKey": "uniklean-sp", "accesses": 89 }
  ],
  "daily": [
    { "day": "2026-04-01", "accesses": 12 }
  ]
}
```

---

## Auth Flow

### Login Flow

```
Browser                           API
  │                                │
  ├─ POST /v1/auth/login ─────────>│ 1. Normalize username (lowercase, no spaces)
  │  { username, password }        │ 2. Lookup user in DB
  │                                │ 3. bcrypt.compare(password, hash)
  │                                │ 4. Build AuthUser (load company + product access)
  │                                │ 5. Generate raw refreshToken (32-byte base64url)
  │                                │ 6. Store bcrypt(refreshToken) in refresh_tokens table
  │                                │ 7. Sign accessToken (RS256, 15m)
  │                                │ 8. Sign refreshToken JWT wrapping token id
  │<── 200 { user } ───────────────│
  │    Set-Cookie: accessToken     │  httpOnly, Secure, SameSite=Strict
  │    Set-Cookie: refreshToken    │  httpOnly, Secure, SameSite=Strict, path=/v1/auth
```

### Magic-Link / QR Token Flow

```
Browser                           API
  │                                │
  ├─ POST /v1/auth/token ─────────>│ 1. Lookup token in companies.access_token
  │  { token: "r7Kx9..." }         │ 2. Check tokenExpiresAt (null = never expires)
  │                                │ 3. Find companion user for that company
  │                                │ 4. Issue tokens (same as login flow, steps 4–8)
  │                                │ 5. Compute redirectTo (first allowedProduct TDS)
  │<── 200 { user, redirectTo } ───│
  │    Set-Cookie: accessToken     │
  │    Set-Cookie: refreshToken    │
  │                                │
  ├─ Redirect to redirectTo ───────│
```

### Token Refresh Flow

```
Browser                           API
  │  (accessToken expired → 401)   │
  │                                │
  ├─ POST /v1/auth/refresh ────────│ 1. Read refreshToken cookie
  │                                │ 2. Verify JWT signature (RS256)
  │                                │ 3. Lookup refresh_tokens row by jti
  │                                │ 4. Check: not revoked, not expired
  │                                │ 5. bcrypt.compare(rawToken, storedHash)
  │                                │ 6. Revoke old row (set revokedAt)
  │                                │ 7. Issue new token pair
  │<── 200 { user } ───────────────│
  │    Set-Cookie: new accessToken │
  │    Set-Cookie: new refreshToken│
```

### RBAC Middleware Stack

Every protected route runs this chain as `preHandler` hooks:

```
authenticate         → reads cookie, sets request.authUser (or null)
    │
requireAuth          → 401 if authUser is null
    │
requireSuperAdmin    → 403 if role ≠ 'superadmin'  (admin-only routes)
    │  OR
checkProductAccess   → 403 if company user lacks access to productLine or docType
    │
logAccess            → fire-and-forget INSERT into access_log
    │
route handler
```

---

## Role-Based Access Control

| Resource                   | `superadmin` | `company` |
|----------------------------|:------------:|:---------:|
| Dashboard / index          | ✅           | ❌        |
| TDS, MSDS (allowed product) | ✅           | ✅        |
| TDS, MSDS (blocked product) | ✅           | ❌        |
| Formula / Label / CoA      | ✅           | ❌        |
| Inventory CRUD             | ✅           | ❌        |
| Rates & Quotations         | ✅           | ❌        |
| Company management         | ✅           | ❌        |
| Analytics                  | ✅           | ❌        |
| Public safety portal (`/safety/:line`) | ✅ | ✅ (no auth) |

Company product access is stored in `company_product_access` and loaded into the JWT payload at login. The API validates access independently of the frontend — the frontend RBAC guards are a UX layer only.

---

## Caching

Product documents are cached in Redis with a **5-minute TTL** using cache-aside:

```
GET /products/:line/:type
    │
    ├─ Hit Redis key "doc:{line}:{type}"? → return cached JSON
    │
    └─ Miss → query Postgres → write to Redis (TTL 300s) → return
```

Cache is **invalidated** on `PUT /products/:line/:type`.

Redis is **entirely optional** — if `REDIS_URL` is not set the server starts normally and all reads go directly to Postgres. This means you can go to production without Redis initially and add it later with zero code changes.

---

## Scripts

| Script              | Description |
|---------------------|-------------|
| `npm run dev`       | Start dev server with hot reload (`tsx watch`) |
| `npm run build`     | Compile TypeScript to `dist/` |
| `npm start`         | Run compiled `dist/server.js` (production) |
| `npm run db:generate` | Generate Drizzle migration files from schema |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:push`   | Push schema directly to DB (dev shortcut, no migration files) |
| `npm run db:studio` | Open Drizzle Studio (DB GUI) |
| `npm run seed`      | Run all seed scripts (idempotent) |
| `npm run db:reset`  | **Dev only** — drop all tables (then re-run db:push + seed) |
| `npm test`          | Run integration tests (Vitest) |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | Coverage report |
| `npm run lint`      | TypeScript type-check (`tsc --noEmit`) |

---

## Testing

Integration tests live in `tests/integration/`. They run against a **real PostgreSQL database** — not mocks. This is intentional: the project's CLAUDE.md notes that mock-DB tests led to a production incident where a migration passed tests but failed in prod.

```bash
# Ensure your .env.local points to a test database, then:
npm test
```

Test files:

| File | Covers |
|------|--------|
| `auth.test.ts`      | Login, token, me, logout, refresh, rate limit |
| `products.test.ts`  | RBAC per role, access gates, 401/403/404 cases |
| `inventory.test.ts` | Full CRUD cycle, reset, validation errors |

---

## Production Deployment

### Security Checklist

- [ ] Set `COOKIE_SECURE=true` — requires HTTPS
- [ ] Set `COOKIE_DOMAIN` to your actual domain (e.g. `macrocoats.in`)
- [ ] Set `ALLOWED_ORIGIN` to the exact frontend URL
- [ ] Rotate all seed tokens via `POST /v1/companies/:id/rotate-token` for each company
- [ ] Change the superadmin password in the DB (`UPDATE users SET password_hash = ... WHERE username = 'admin'`)
- [ ] Remove or restrict the `db:reset` script from production builds
- [ ] Ensure `private.pem` is never committed to source control (it is in `.gitignore`)
- [ ] Set `NODE_ENV=production` — disables pino-pretty, enables prod optimisations
- [ ] Set up Postgres with SSL (`?sslmode=require` in `DATABASE_URL`)
- [ ] Deploy behind a reverse proxy (nginx/Caddy) — set `trustProxy: true` is already enabled

### Frontend Integration Checklist

When pointing the Vite frontend at this API, make these changes in the frontend codebase:

1. **Remove MSW** — delete `src/mocks/`, remove the MSW boot from `src/main.jsx`
2. **Enable cookie credentials** — `axios.defaults.withCredentials = true`
3. **Replace hardcoded auth** — `LoginPage` calls `POST /v1/auth/login`; `AccessPage` calls `POST /v1/auth/token`
4. **Session rehydration** — on app load, call `GET /v1/auth/me` to restore user instead of relying on Zustand `persist`
5. **Move inventory off localStorage** — `useInventoryStore` should use React Query (`GET /v1/inventory`) with optimistic mutations
6. **Persist quotations** — `RatesPage` should call `POST /v1/quotations` instead of `localStorage` counter
7. **Set `VITE_API_URL`** in `.env.local`:
   ```bash
   VITE_API_URL=http://localhost:3001/v1
   VITE_API_MODE=live   # remove 'mock' to skip MSW boot
   ```

---

## Contact

**Macro Coats Pvt Ltd** · Chennai · India
`info@macrocoats.in` · `+91-9884080377`
