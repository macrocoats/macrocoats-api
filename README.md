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
  - [Batches](#batches)
  - [Companies](#companies)
  - [Company Pricing](#company-pricing)
  - [Formulation Variants](#formulation-variants)
  - [Staff](#staff)
  - [Salary Records](#salary-records)
  - [Vendors](#vendors)
  - [Analytics](#analytics)
  - [PDF Generation](#pdf-generation)
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
│  /v1/auth          /v1/products             │
│  /v1/inventory     /v1/quotations           │
│  /v1/batches       /v1/companies            │
│  /v1/analytics     /v1/staff                │
│  /v1/vendors       /v1/salary-records       │
│  /v1/formulation-variants   /v1/pdf         │
└────────┬──────────────────────┬─────────────┘
         │                      │
         ▼                      ▼
  ┌─────────────┐       ┌──────────────┐
  │ PostgreSQL  │       │  Redis       │
  │ (primary)   │       │  (doc cache) │
  └─────────────┘       └──────────────┘
```

The API is the **single source of truth** for all product documents, inventory prices, user accounts, company access control, quotations, batches, and HR data.

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
| PDF generation   | Puppeteer + Handlebars        | —         |
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
│   │   ├── index.ts                  # Shared domain types (AuthUser, DocType, PRODUCT_KEYS, etc.)
│   │   ├── errors.ts                 # AppErrors enum
│   │   └── fastify.d.ts              # Module augmentation — adds authUser to FastifyRequest
│   ├── db/
│   │   ├── index.ts                  # Drizzle client (postgres-js pool)
│   │   └── schema/
│   │       ├── users.ts
│   │       ├── companies.ts
│   │       ├── companyProductAccess.ts
│   │       ├── companyProductPrices.ts
│   │       ├── products.ts
│   │       ├── productDocuments.ts       # JSONB body — one row per (product, docType)
│   │       ├── productFormulationVariants.ts
│   │       ├── formulationVariantComponents.ts
│   │       ├── inventory.ts
│   │       ├── quotations.ts             # + quotation_line_items + quotation_sequences
│   │       ├── batches.ts                # + batch_sequences; JSONB snapshots
│   │       ├── accessLog.ts
│   │       ├── refreshTokens.ts
│   │       ├── salaryRecords.ts
│   │       ├── staff.ts
│   │       ├── vendors.ts
│   │       └── index.ts                  # Re-exports all schemas
│   ├── plugins/
│   │   ├── cors.ts                   # @fastify/cors — credentials: true
│   │   ├── cookie.ts                 # @fastify/cookie + cookie option helpers
│   │   └── redis.ts                  # Optional cache-aside helpers (cacheGet/Set/Del)
│   ├── middleware/
│   │   ├── authenticate.ts           # Reads accessToken cookie → sets request.authUser
│   │   ├── requireAuth.ts            # Hard 401 gate — chain after authenticate
│   │   ├── requireSuperAdmin.ts      # 403 unless role === 'superadmin'
│   │   ├── checkProductAccess.ts     # Validates productLine + docType per user role
│   │   └── logAccess.ts              # Fire-and-forget access_log INSERT (onSend hook)
│   ├── utils/
│   │   ├── jwt.ts                    # RS256 sign/verify for access + refresh tokens
│   │   ├── crypto.ts                 # bcrypt hash/verify, URL-safe token generation
│   │   ├── quotNumber.ts             # Atomic UNIK-YYYY-NNN via upsert + RETURNING
│   │   └── batchNumber.ts            # Atomic XX-YYYYMMDD-NNN via upsert + RETURNING
│   ├── modules/
│   │   ├── auth/                     # login, token, refresh, logout, me
│   │   ├── products/                 # GET + PUT /products/:line/:type
│   │   ├── inventory/                # CRUD + reset for raw material prices
│   │   ├── quotations/               # Create + list + get quotations
│   │   ├── batches/                  # Create, list, get, CoA snapshot, delete
│   │   ├── companies/                # CRUD + token rotation for client companies
│   │   ├── company-pricing/          # Per-company product price overrides
│   │   ├── formulation-variants/     # Variant headers + component replacement
│   │   ├── staff/                    # Staff directory CRUD
│   │   ├── salaryRecords/            # Salary payment records
│   │   ├── vendors/                  # Vendor/supplier CRUD
│   │   ├── analytics/                # Access log query + 30-day summary
│   │   └── pdf/                      # Server-side PDF (Puppeteer + Handlebars)
│   │       ├── helpers/              #   Currency, date, Handlebars helpers
│   │       ├── partials/             #   Reusable Handlebars partials
│   │       ├── styles/               #   PDF-specific CSS
│   │       ├── templates/            #   Handlebars templates per docType
│   │       ├── pdf.routes.ts
│   │       ├── pdf.service.ts
│   │       ├── pdf.types.ts
│   │       └── template.service.ts
│   └── seed/
│       ├── index.ts                  # Master runner (idempotent)
│       ├── products.seed.ts          # 9 products × 5 doc-type rows each
│       ├── inventory.seed.ts         # 23 default raw material prices
│       ├── companies.seed.ts         # Test companies + product access + users
│       ├── formulationVariants.seed.ts # Default formulation variants per product
│       └── reset.ts                  # Dev-only: drops all tables
├── tests/
│   └── integration/
│       ├── auth.test.ts
│       ├── products.test.ts
│       └── inventory.test.ts
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
# Create all 19 tables in your Postgres database
npm run db:push

# Seed products (9 × 5 doc-type rows), inventory (23 items), companies, formulation variants
npm run seed
```

The seed is **idempotent** — safe to run multiple times.

Default credentials created by the seed:

| Username          | Password                       | Role       |
|-------------------|--------------------------------|------------|
| `admin`           | `mc2024Xp7NrK9L3vQeJbF2wTa`   | superadmin |
| `rane`            | `r7Kx9mNpQ2wLvYtA8bZeJ3dF`   | company    |
| `sanmar`          | `sN4wP8tRmXkL2vBqA7cYeJ5G`   | company    |
| `galva`           | `gL3mQ9xNvKpR7wYtA2bZeJ8F`   | company    |
| `tvs`             | `tV5kR2mNpQ8wLxYtA7bZeJ4G`   | company    |
| `sundaramfasteners` | `sf9Np4xRmKvL7wYtA3bZeJ2Q` | company    |

> ⚠️ **Rotate all these tokens immediately after first production deploy.**

---

### 5. Run Dev Server

```bash
npm run dev
# Server starts at http://localhost:3001
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

---

## Database Schema

19 tables across `src/db/schema/`.

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
  ├──< company_product_access                                            │
  │      company_id, product_key  (composite PK)                        │
  │                                                                      │
  └──< company_product_prices                                            │
         company_id, product_key, price_per_litre                       │
                                                                         │
products ────────────────────────────────────────────────────────────── ┘
  │ key (PK), display_name, code, category, subtitle, accent_color
  │
  ├──< product_documents
  │      id, product_key, doc_type, body JSONB, footer JSONB
  │      UNIQUE (product_key, doc_type)
  │
  └──< product_formulation_variants
         id, product_key, company_key, variant_name, description
         │
         └──< formulation_variant_components
                id, variant_id, material_name, quantity, unit, notes

inventory
  id, material, unit, price, stock, supplier, sort_order, is_default

quotations
  │ id, quot_number (unique), customer_name, quot_date, valid_days, valid_until
  │
  ├──< quotation_line_items
  │      id, quotation_id, sort_order, catalog_id, description, code, qty, rate
  │
  └── quotation_sequences
        year (PK), last_n   ← atomic per-year counter

batches
  │ id, batch_number (unique), company_key, product_key, production_date, volume
  │ formulation_snapshot JSONB, label_snapshot JSONB, coa_snapshot JSONB
  │ cost_summary JSONB, payment_due_date, payment_term_days
  │
  └── batch_sequences
        company_key, date (composite PK), counter   ← per-company per-day counter

staff
  id, name, designation, department, phone, email, joined_at

salary_records
  id, staff_id, month, year, basic, allowances, deductions, net, paid_on, notes

vendors
  id, name, contact, phone, email, address, notes
```

**Key design decisions:**
- Product document bodies are stored as **JSONB** — each docType has a different shape, avoiding nullable column sprawl.
- Refresh tokens are **hashed with bcrypt** before storage — a leaked DB dump cannot forge sessions.
- Quotation and batch sequence counters use **`INSERT ... ON CONFLICT DO UPDATE ... RETURNING`** for lock-free atomic increments.
- Batch records capture **JSONB snapshots** at creation — formulation, label, and cost data are frozen at production time.
- `is_default` on `inventory` marks factory-seeded rows for the "reset to defaults" operation.

---

## API Reference

### Base URL
```
http://localhost:3001/v1
```

All request bodies are JSON. Authentication uses httpOnly cookies — no `Authorization` header required.

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

Username matching is **case-insensitive and space-insensitive**.

---

### Products

| Method | Path                              | Auth      | Role        | Description |
|--------|-----------------------------------|-----------|-------------|-------------|
| GET    | `/products`                       | Required  | superadmin  | List all active products |
| GET    | `/products/:productLine/:docType` | Required  | see RBAC    | Fetch a document |
| PUT    | `/products/:productLine/:docType` | Required  | superadmin  | Update a document |

**Valid `productLine` values:** `uniklean-sp` · `uniklean-fe` · `uniprotect-oil` · `uniflow-ecm` · `unicool-al` · `unikoat-lt-700` · `unisolve-h3` · `unipass` · `uniktonner`

**Valid `docType` values:** `tds` · `msds` · `formula` · `label` · `coa`

Company users may only access `tds` and `msds` for products in their `allowedProducts` list. `formula`, `label`, and `coa` require superadmin.

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

---

### Quotations

All endpoints require `superadmin` role.

| Method | Path                | Description |
|--------|---------------------|-------------|
| POST   | `/quotations`       | Create quotation (auto-assigns `UNIK-YYYY-NNN`) |
| GET    | `/quotations`       | List quotations (paginated, filterable by `customerName`) |
| GET    | `/quotations/:id`   | Fetch a single quotation with line items |

---

### Batches

All endpoints require `superadmin` role.

| Method | Path                               | Description |
|--------|------------------------------------|-------------|
| POST   | `/batches`                         | Create batch record with JSONB snapshots |
| GET    | `/batches`                         | List batches (filterable, paginated) |
| GET    | `/batches/:batchNumber`            | Full batch detail including snapshots |
| PATCH  | `/batches/:batchNumber/coa`        | Save CoA snapshot to an existing batch |
| DELETE | `/batches/:batchNumber/coa`        | Clear CoA snapshot |
| DELETE | `/batches/:id`                     | Permanently delete batch record |

#### POST `/batches`

Batch creation captures three immutable JSONB snapshots at the moment of production:

```json
{
  "companyKey": "rane",
  "productKey": "uniklean-sp",
  "productionDate": "2026-05-01",
  "volume": 200,
  "formulationSnapshot": { ... },
  "labelSnapshot": { "batchNumber": "RA-20260501-001", ... },
  "costSummary": { "totalCost": 4200, "costPerLitre": 21, ... },
  "paymentTermDays": 45
}
```

The `batchNumber` (`XX-YYYYMMDD-NNN`) is generated atomically by the server.

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

---

### Company Pricing

All endpoints require `superadmin` role.

| Method | Path                       | Description |
|--------|----------------------------|-------------|
| GET    | `/companies/:id/pricing`   | Get custom product pricing for a company |
| PUT    | `/companies/:id/pricing`   | Upsert price overrides for one or more products |

---

### Formulation Variants

| Method | Path                                          | Auth | Description |
|--------|-----------------------------------------------|------|-------------|
| GET    | `/formulation-variants?productKey=<key>`      | Any  | List variants for a product |
| GET    | `/formulation-variants/:variantId`            | Any  | Single variant with components |
| POST   | `/formulation-variants`                       | SA   | Create variant header |
| PUT    | `/formulation-variants/:variantId`            | SA   | Update variant header |
| PUT    | `/formulation-variants/:variantId/components` | SA   | Replace component list |
| DELETE | `/formulation-variants/:variantId`            | SA   | Delete variant |

SA = superadmin required. "Any" = any logged-in user.

Returns 409 if a variant already exists for the same `productKey` + `companyKey` combination.

---

### Staff

All endpoints require `superadmin` role.

| Method | Path            | Description |
|--------|-----------------|-------------|
| GET    | `/staff`        | List all staff members |
| GET    | `/staff/:id`    | Get staff member by id |
| POST   | `/staff`        | Add a new staff member |
| PUT    | `/staff/:id`    | Update staff member |
| DELETE | `/staff/:id`    | Remove staff member |

---

### Salary Records

All endpoints require `superadmin` role.

| Method | Path                    | Description |
|--------|-------------------------|-------------|
| GET    | `/salary-records`       | List all salary records (filterable by staff, month, year) |
| GET    | `/salary-records/:id`   | Get a single salary record |
| POST   | `/salary-records`       | Create a salary payment record |

---

### Vendors

All endpoints require `superadmin` role.

| Method | Path              | Description |
|--------|-------------------|-------------|
| GET    | `/vendors`        | List all vendors |
| GET    | `/vendors/:id`    | Get vendor by id |
| POST   | `/vendors`        | Add a new vendor |
| PUT    | `/vendors/:id`    | Update vendor |
| DELETE | `/vendors/:id`    | Remove vendor |

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

---

### PDF Generation

All endpoints require `superadmin` role. Responses are `application/pdf` with a `Content-Disposition: attachment` header.

| Method | Path              | Description |
|--------|-------------------|-------------|
| POST   | `/pdf/quotation`  | Generate quotation PDF |
| POST   | `/pdf/tds`        | Generate TDS document PDF |
| POST   | `/pdf/msds`       | Generate MSDS document PDF |
| POST   | `/pdf/coa`        | Generate CoA document PDF |
| POST   | `/pdf/batch`      | Generate batch record PDF |

PDFs are rendered server-side using Puppeteer + Handlebars templates. The module lives at `src/modules/pdf/` and has a non-standard directory layout (templates/, partials/, styles/, helpers/).

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
  │                                │ 6. Store bcrypt(refreshToken) in refresh_tokens
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
logAccess            → fire-and-forget INSERT into access_log (onSend hook)
    │
route handler
```

---

## Role-Based Access Control

| Resource                            | `superadmin` | `company` |
|-------------------------------------|:------------:|:---------:|
| Dashboard / all tools               | ✅           | ❌        |
| TDS, MSDS (allowed product)         | ✅           | ✅        |
| TDS, MSDS (not in allowedProducts)  | ✅           | ❌        |
| Formula / Label / CoA               | ✅           | ❌        |
| Inventory CRUD                      | ✅           | ❌        |
| Quotations                          | ✅           | ❌        |
| Batches                             | ✅           | ❌        |
| Companies & pricing                 | ✅           | ❌        |
| Formulation variants (read)         | ✅           | ✅        |
| Formulation variants (write)        | ✅           | ❌        |
| Staff / salary records              | ✅           | ❌        |
| Vendors                             | ✅           | ❌        |
| Analytics                           | ✅           | ❌        |
| PDF generation                      | ✅           | ❌        |
| Public safety portal (`/safety/:line`) | ✅       | ✅ (no auth) |

Company product access is stored in `company_product_access` and embedded in the JWT at login. The API validates access independently of the frontend — frontend guards are a UX layer only.

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

Redis is **entirely optional** — if `REDIS_URL` is not set, all reads go directly to Postgres. Add Redis later with zero code changes.

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

Integration tests live in `tests/integration/`. They run against a **real PostgreSQL database** — never mocks. Run `npm run seed` before running tests.

```bash
npm run seed
npm test

# Single file
npx vitest run tests/integration/auth.test.ts
```

Tests run sequentially (`singleFork: true`) because they share DB state. Never add `parallel` or `concurrent` to vitest config.

---

## Production Deployment

### Security Checklist

- [ ] Set `COOKIE_SECURE=true` — requires HTTPS
- [ ] Set `COOKIE_DOMAIN` to your actual domain (e.g. `macrocoats.in`)
- [ ] Set `ALLOWED_ORIGIN` to the exact frontend URL
- [ ] Rotate all seed tokens via `POST /v1/companies/:id/rotate-token` for each company
- [ ] Change the superadmin password in the DB
- [ ] Remove or restrict the `db:reset` script from production builds
- [ ] Ensure `private.pem` is never committed to source control (it is in `.gitignore`)
- [ ] Set `NODE_ENV=production`
- [ ] Set up Postgres with SSL (`?sslmode=require` in `DATABASE_URL`)
- [ ] Deploy behind a reverse proxy (nginx/Caddy) — `trustProxy: true` is already enabled

---

**Macro Coats Pvt Ltd** · Chennai · India
`info@macrocoats.in` · `+91-9884080377`
