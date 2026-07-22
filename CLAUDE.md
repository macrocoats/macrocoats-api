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
npm run seed           # idempotent seed (products, inventory, companies, formulation-variants)
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
| `PROCUREMENT_STORAGE_PATH` | yes | — | Base directory for uploaded document storage, e.g. `company-documents` (created if missing at startup) |
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
| `ZOHO_CLIENT_ID` | no | — | Zoho self-client OAuth client ID (invoice sync disabled until set) |
| `ZOHO_CLIENT_SECRET` | no | — | Zoho self-client OAuth client secret |
| `ZOHO_REFRESH_TOKEN` | no | — | Zoho self-client refresh token (long-lived, doesn't expire unless revoked) |
| `ZOHO_ORG_ID` | no | — | Zoho Invoice organization ID |
| `ZOHO_ACCOUNTS_DOMAIN` | no | https://accounts.zoho.in | Zoho OAuth token endpoint domain (region-specific) |
| `ZOHO_API_DOMAIN` | no | https://www.zohoapis.in | Zoho Invoice API domain (region-specific) |

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
| `auth` | POST /auth/login, /auth/token, /auth/refresh, /auth/logout; GET /auth/me; POST /auth/mobile/login, /auth/mobile/refresh, /auth/mobile/logout |
| `products` | GET /products, GET /products/expiry-summary, GET /products/:productLine/:docType, PUT /products/:productLine/:docType, PATCH /products/:productLine/:docType/status, GET /products/:productLine/:docType/audit |
| `companies` | GET /companies, GET /companies/:id, POST /companies, PATCH /companies/:id, POST /companies/:id/rotate-token, DELETE /companies/:id |
| `company-pricing` | GET /companies/:id/pricing, PUT /companies/:id/pricing |
| `company-documents` | POST /companies/:id/documents, GET /companies/:id/documents, GET /companies/:id/documents/:docId/download, DELETE /companies/:id/documents/:docId |
| `formulation-variants` | GET /formulation-variants, GET /formulation-variants/:variantId, POST /formulation-variants, PUT /formulation-variants/:variantId, PUT /formulation-variants/:variantId/components, PATCH /formulation-variants/:variantId/status, DELETE /formulation-variants/:variantId |
| `quotations` | POST /quotations, GET /quotations, GET /quotations/:id |
| `batches` | POST /batches, GET /batches, GET /batches/:batchNumber, PATCH /batches/:batchNumber/coa, DELETE /batches/:batchNumber/coa, PATCH /batches/:batchNumber/payment, DELETE /batches/:id |
| `inventory` | GET /inventory, GET /inventory/receipt-prices, POST /inventory, PATCH /inventory/:id, DELETE /inventory/:id, POST /inventory/reset |
| `analytics` | GET /analytics/access-log, GET /analytics/summary |
| `salaryRecords` | GET /salary-records, GET /salary-records/:id, POST /salary-records |
| `staff` | GET /staff, GET /staff/:id, POST /staff, PUT /staff/:id, DELETE /staff/:id |
| `vendors` | GET /vendors, GET /vendors/:id, POST /vendors, PUT /vendors/:id, DELETE /vendors/:id, GET /vendors/:id/purchase-summary |
| `vendor-prices` | GET /vendors/:vendorId/prices, GET /vendors/:vendorId/prices/active, GET /vendors/:vendorId/prices/effective, POST /vendors/:vendorId/prices |
| `purchase-entries` | GET /purchase-entries, GET /purchase-entries/:id, POST /purchase-entries |
| `hazard-profiles` | GET /hazard-profiles, GET /hazard-profiles/:id, POST /hazard-profiles, PUT /hazard-profiles/:id, DELETE /hazard-profiles/:id (soft-delete) |
| `finished-goods` | GET /finished-goods, GET /finished-goods/summary, GET /finished-goods/:batchNumber, POST /finished-goods/backfill/:batchNumber, PATCH /finished-goods/:id/status |
| `dispatch` | POST /dispatches, GET /dispatches, GET /dispatches/summary, GET /dispatches/:dispatchNumber, PATCH /dispatches/:id, PATCH /dispatches/:id/void |
| `pdf` | POST /pdf/quotation, POST /pdf/tds, POST /pdf/msds, POST /pdf/coa, POST /pdf/batch, POST /pdf/investor-report, POST /pdf/letterhead |
| `optimizer` | POST /optimizer/analyze |
| `cost-intelligence` | GET /cost-intelligence/overview, /trends, /batches, /materials, /alerts, /profitability, /comparison |
| `customer-purchase-orders` | POST /customer-purchase-orders, GET /customer-purchase-orders, GET /customer-purchase-orders/dashboard-summary, GET /customer-purchase-orders/analytics, GET /customer-purchase-orders/search, GET /customer-purchase-orders/from-quotation/:quotationId, GET /customer-purchase-orders/:id, PUT /customer-purchase-orders/:id, PATCH /customer-purchase-orders/:id/status, DELETE /customer-purchase-orders/:id (soft-delete), POST /customer-purchase-orders/:id/batches, DELETE /customer-purchase-orders/:id/batches/:linkId, GET/POST /customer-purchase-orders/:id/timeline, POST/GET /customer-purchase-orders/:id/documents, GET /customer-purchase-orders/:id/documents/:docId/download, DELETE /customer-purchase-orders/:id/documents/:docId |
| `investor-dashboard` | GET /investor-dashboard/executive-kpis, GET /investor-dashboard/sales-analytics, GET /investor-dashboard/projections, GET /investor-dashboard/insights |
| `letterheads` | GET/POST /letterheads/templates, GET/PUT/DELETE /letterheads/templates/:id, POST /letterheads/templates/:id/duplicate, GET/POST /letterheads/documents, GET/PUT /letterheads/documents/:id, GET/POST /letterheads/documents/:id/versions |
| `zoho-invoice` | GET /zoho-invoices (live list from Zoho), GET /zoho-invoices/:dispatchId (stored status), POST /zoho-invoices/:dispatchId/sync |

All endpoints except auth are `superadmin`-only, except product document reads which use `checkProductAccess` for company users. Within `products`, only `GET /products/:productLine/:docType` uses `checkProductAccess` — every other `products` endpoint (including status transitions, audit trail, and expiry summary) is `requireSuperAdmin`-only. `GET /products/expiry-summary` is registered before the `/:productLine/:docType` route so the literal segment `expiry-summary` never matches as a `:productLine` param.

### Customer purchase order documents (company-documents)

`company_documents` tracks purchase orders that a **customer company** sends to Macro Coats (a sales order received) — the company is the buyer, Macro Coats the supplier. Deliberately minimal: a flat per-company file repository (`orderNumber`, `orderDate`, `orderAmount`, plus the uploaded file) with no status workflow, no line items, no timeline — a reference document list, not an operational tracker. Files are stored on local disk under `PROCUREMENT_STORAGE_PATH`, in a `companies/<companyId>/` subdirectory.

**Multipart upload gotcha:** text fields sent after the file part in a multipart body are not guaranteed to be present on `request.file()`'s returned `.fields` until the file stream has been fully consumed — busboy (the parser underlying `@fastify/multipart`) only finishes parsing a field once everything preceding it in the body is drained. `company-documents.service.ts` exposes a two-phase API (`writeUploadedFile()` then `saveDocumentRecord()`) specifically so the route can drain the file to disk *before* reading `data.fields` — this app's own upload code (`FormData.append('file', ...)` before the metadata fields) sends fields after the file, so reading fields first would silently see them as missing for anything but tiny files. Any new multipart upload route in this codebase should follow the same two-phase pattern rather than reading `data.fields` immediately after `request.file()`.

> **Note:** The `pdf` module has a non-standard directory layout — see `src/modules/pdf/CLAUDE.md` for its structure and conventions.

> **Note:** The `optimizer` module (AI Formulation Optimizer) also deviates from the 3-file pattern — see `src/modules/optimizer/CLAUDE.md` for its structure, including the `VARIANT_STATUS_TRANSITIONS` export that `formulation-variants` imports (see "Formulation variant approval workflow" below).

> **Note:** `document-sanitization` is a service-only module (`*.service.ts` + `*.types.ts`, no `*.routes.ts`) — it is not registered in `app.ts` and exposes no endpoints. It's consumed directly by other modules to derive IP-safe TDS/MSDS composition and hazard sections (via `ingredient_hazard_profiles`) for non-superadmin roles.

### Customer purchase orders (customer-purchase-orders)

Sales orders received from customers — tracks a customer PO from receipt through production, batch manufacturing, and dispatch to completion. This is a separate, more operational concern from `company_documents` above: they coexist deliberately (see the "company_documents" note there) rather than one superseding the other. Not an accounting/invoicing entity — no GST, no ledger; payment tracking stays on `batches`.

- **Tables:** `customer_purchase_orders` (header, soft-deleted via `deletedAt`), `customer_purchase_order_items`, `customer_purchase_order_documents` (attachments with version history via `supersedesDocumentId`), `customer_purchase_order_batches` (batch↔item links — the join that makes Customer Order → Batch → CoA → Label → Dispatch traceability possible), `customer_purchase_order_timeline` (append-only event log), `customer_purchase_order_sequences` (atomic `CPO-YYYY-NNN` counter, mirrors `quotation_sequences`).
- **`customer_purchase_orders` is the first table in this codebase to use soft delete** (`deletedAt` timestamp, filtered `WHERE deleted_at IS NULL`) — every other module either hard-deletes or uses a status flag (e.g. `finished_goods.status = 'Cancelled'`).
- **Status is a mixed manual/automatic state machine.** `draft`→`confirmed`→`production_planned`→`in_production` are the only manually-settable transitions (`PATCH .../status`, validated against `STATUS_TRANSITIONS` in `customer-purchase-orders.service.ts`); `in_production`→`partially_produced`→`ready_for_dispatch`→`partially_dispatched`→`completed` are auto-recomputed by `recomputeStatus()` from item-level production/dispatch aggregates, called after every batch-link and dispatch event. `cancelled` is manual and terminal from any non-terminal state.
- **Dispatch integration:** `dispatches` carries two nullable FKs — `customerPurchaseOrderId` and `customerPurchaseOrderItemId` (mirrors the existing nullable `quotationId` pattern) — rather than a parallel dispatch table, so it reuses the proven atomic stock-safe `incrementDispatchedQuantity`/`reverseDispatchedQuantity` logic in `finished-goods.service.ts`. `dispatch.service.ts` calls `recordDispatchAgainstOrder`/`reverseDispatchAgainstOrder` (from `customer-purchase-orders.service.ts`) inside the same transaction as dispatch create/void/quantity-update.
- **Batch linking auto-populates timeline events:** linking a batch always fires `batch_linked` + `label_generated` (every batch has a `labelSnapshot`); if the batch's `coaSnapshot` is already set, `qc_completed` + `coa_generated` fire too — this is how the full "QC Completed → CoA Generated → Label Generated" timeline chain gets populated without the `batches` module needing to know about customer-order timelines.
- **Quotation conversion is prefill-only, not persisted.** `GET /customer-purchase-orders/from-quotation/:quotationId` returns the quotation header + a best-effort customer match (`companies.displayName` ILIKE `quotations.customerName`) — it never returns line items, because the quotation rate catalogue doesn't map onto real `products.key` values (same reconciliation gap documented for "Generate Batch" in `safteyDataSheet/src/pages/Rates/CLAUDE.md`). The frontend prefills the header only and leaves items for manual entry.
- Upload route follows the same two-phase multipart pattern as `company-documents` (see above).
- **`priority`** — `low`/`normal`/`high`/`urgent`, default `normal`. Set on create, editable via the same PUT full-replace as other header fields while the order is `draft`/`confirmed`; not a workflow-driving field, purely a manual triage/sort hint surfaced on the list page, Kanban board, and detail page.
- **`GET /customer-purchase-orders/analytics`** (Order Management Dashboard) — read-only aggregations, nothing stored: orders-by-customer and orders-by-product (top 10 by value/quantity, excludes cancelled), a 12-month zero-filled orders-by-month series, avg production lead time (`po_received` → first `batch_linked` timeline event), avg dispatch lead time (first non-voided dispatch date → `completed` timeline event), and completion rate (`completed` ÷ non-cancelled orders). All four lead-time/breakdown subqueries explicitly join back to `customer_purchase_orders` and filter `deleted_at IS NULL` — a soft-deleted order's timeline/dispatch rows are not purged, so omitting that join lets deleted orders' data leak into the averages.
- `listOrders()` additionally returns per-order `priority`, `productSummary` (single product name, or `"N products"` for multi-item orders), and `totalQuantityProduced`/`totalQuantityDispatched`/`totalQuantityPending` — aggregated via `LEFT JOIN` subqueries over `customer_purchase_order_batches` and non-voided `dispatches`, not stored columns.

### Investor Dashboard (investor-dashboard)

Read-only business-intelligence layer over existing operational tables — nothing is stored, every figure is derived on request. All four routes are `requireSuperAdmin`-only, `{data: ...}` envelope.

- **"Sales"/"Revenue" means Customer PO order value** (confirmed+ status, excludes cancelled), never invoiced/recognized revenue — this system has no accounting/invoicing layer by design (see root `CLAUDE.md`). Every date-keyed figure groups by `customer_po_date` (the date on the customer's actual PO), not `created_at`, matching the fix applied to the Order Management Dashboard's "Orders by Month" chart.
- **`dashboardFilterSchema`** (`range`: `today`/`week`/`month`/`quarter`/`year`/`custom`, plus optional `from`/`to`/`customerId`/`productKey`) drives `GET /executive-kpis` and `GET /sales-analytics`. `resolveWindow()` in the service turns `range` into a concrete `[from, to]` — `custom` requires both `from` and `to` (enforced by a Zod `.refine`). Date formatting throughout the module uses local `getFullYear()/getMonth()/getDate()` components, never `Date.toISOString()`, which converts to UTC first and shifts a local-midnight date backward by a day whenever the server timezone is ahead of UTC (e.g. IST, UTC+5:30) — this was a real bug caught and fixed during this module's initial build.
- **`GET /executive-kpis`** returns two families of figures: fixed-period ones (`currentMonthSales`/`quarterlySales`/`ytdSales`/`pendingOrderValue`) that always reflect the current calendar month/quarter/year regardless of the `range` filter, and filter-scoped ones (`ordersReceived`/`ordersCompleted`/`activeCustomers`/`averageOrderValue`/`productsSold`/`productionVolume`/`customerGrowthPct`) that respect `range`/`customerId`/`productKey`. `customerGrowthPct` compares customers whose *first-ever* order date falls in the selected window against an equal-length prior window.
- **`GET /sales-analytics`** returns `monthlyTrend`/`quarterlyTrend`/`yearlyTrend` (12 months / 8 quarters / 5 years, zero-filled via `generate_series`), plus top-10 `salesByCustomer`/`salesByProduct`/`salesByRegion` breakdowns. `salesByRegion` is a `companies.state` proxy — there is no dedicated region field in the schema yet.
- **`GET /projections`** (`projectionsQuerySchema`: `conversionRate`, 0–1, default 0.3) computes linear run-rate estimates — clearly labeled as estimates, not a forecasting engine. Month/quarter/year-to-date actuals are extrapolated to `projectedMonthlyRevenue`/`projectedQuarterlyRevenue`/`projectedAnnualRevenue` by dividing by elapsed days and multiplying by the period's total days. `expectedRevenueFromOpenOrders` sums each open order item's `GREATEST(ordered - dispatched, 0) * unitPrice`. `pipelineValue` sums `qty * rate` across line items of quotations from the last 90 days that aren't yet linked to a non-cancelled order via `reference_quotation_id` — quotation line-item `qty` is nullable (many real quotations are rate-only with no committed quantity), so a quotation with no `qty` filled in contributes 0 to the pipeline; this is expected data behavior, not a bug. `pipelineUpside = pipelineValue * conversionRate` is a client-adjustable what-if, never persisted.
- **`GET /insights`** (Executive Insights, reuses `dashboardFilterSchema`) — an auto-generated insights layer composed entirely from `getExecutiveKpis`/`getSalesAnalytics`'s existing output plus `cost-intelligence`'s existing `getProfitability()` (cross-module service-to-service read import, not a new query duplicating that module's logic). No new tables, no changes to the three routes above. Computes: `revenueGrowthPct`/`productionTrendPct` (window vs. prior equal-length window, same pattern as `customerGrowthPct`), `customerConcentration` (top-5-customer share of in-window revenue), `inventoryTurnover` (period COGS ÷ current `inventory_items` value via `stock_qty`, annualized — a point-in-time inventory-value proxy since no historical stock snapshots exist; returns `null` with a `note` if no items have `stockQty` set), `portfolioMargin` (revenue-weighted average margin from `getProfitability`, scoped to the same window), `pendingOrderRisk` (pending order value as a % of this quarter's sales, bucketed low/medium/high), and `businessHealthScore` (an equally-weighted composite of growth/completion/concentration/margin sub-scores, 0–100 — a new judgment-call formula, documented inline in `getExecutiveInsights()`, not a pre-existing business metric). **Deliberately does not compute "Receivables"** — this system has no accounting/invoicing layer (see root `CLAUDE.md`); the frontend shows the existing `pendingOrderValue` KPI labeled "Pending Order Value" instead.

### Letterheads (letterheads)

CRUD backing store for the Company Letterhead document family (superadmin-only, `{data: ...}` envelope) — reusable letter **templates** (`letterhead_templates`) and generated/drafted **documents** (`letterhead_documents`). Follows the standard 3-file module pattern; the actual PDF rendering is a 5th treatment added to the separate `pdf` module (see `src/modules/pdf/CLAUDE.md`), not this module.

- **Templates** (`letterhead_templates`: name, category, bodyHtml) support create/edit/duplicate/delete. `POST /letterheads/templates/:id/duplicate` inserts a copy suffixed `(Copy)` — it does not mutate the source row.
- **Documents** (`letterhead_documents`) carry the reference-info fields (`referenceNo`, `letterDate`, `customerName`, `companyName`, `subject`, `attention`, `preparedBy`, `approvedBy`, `designation`) plus `bodyHtml` (already `{{Variable}}`-resolved by the frontend before it's saved — no server-side substitution) and `status` (`draft`/`final`).
- **Version history is a chain via `supersedesDocumentId`** (mirrors `customer_purchase_order_documents`'s pattern) — `POST /letterheads/documents/:id/versions` inserts a new row pointing back at the document it replaces with `version + 1`, rather than overwriting in place. `GET /letterheads/documents/:id/versions` walks the chain back to the root, newest first. `PUT /letterheads/documents/:id` is a plain in-place update (used for "Save Draft") and does not touch the version chain.

### Middleware

Four middleware files in `src/middleware/` (five functions):

- **`authenticate.ts`** — global `onRequest`; reads `accessToken` cookie, falling back to an `Authorization: Bearer <token>` header when no cookie is present (native/mobile clients have no cookie jar), decodes RS256 JWT, sets `request.authUser` or null. Never throws. Also exports `requireAuth` preHandler (returns 401 if `request.authUser` is null).
- **`requireSuperAdmin.ts`** — preHandler; returns 403 if `request.authUser.role !== 'superadmin'`.
- **`checkProductAccess.ts`** — preHandler; returns 403 if company user requests a `RESTRICTED_DOC_TYPE` (formula/label/coa) or a product not in their `allowedProducts`.
- **`logAccess.ts`** — `onSend` hook; fire-and-forget INSERT into `access_log` after response is sent. Captures userId, companyKey, productKey, docType, IP, userAgent. Never blocks response; errors silently.

### Auth tokens

Two-token RS256 system:
- **Access token** (15m): JWT carrying full `AuthUser` payload (id, role, companyName, allowedProducts). Verified on every request by decoding the `accessToken` httpOnly cookie. The payload is trusted directly — no DB lookup on each request.
- **Refresh token** (7d): JWT whose `jti` is a UUID matching a row in `refresh_tokens`. The raw token is never stored — only its `bcrypt` hash. Rotation revokes the old row and calls `issueTokens()` to produce a new pair.

`issueTokens()` in `auth.service.ts` is the single function that creates both tokens and inserts the refresh token row. Three login paths funnel through it:
- `loginWithCredentials` — username + password (POST /auth/login, POST /auth/mobile/login)
- `loginWithToken` — company magic/QR token (POST /auth/token); token checked against `companies.accessToken`, respects `tokenExpiresAt`
- `rotateRefreshToken` — POST /auth/refresh, POST /auth/mobile/refresh

**Known bug — refresh rotation does not work today (web or mobile).** `issueTokens()` signs a JWT via `signRefreshToken()` but discards it, returning the raw random string (`rawRefresh`) as the client-facing refresh token instead; `rotateRefreshToken()` then calls `verifyRefreshToken()` (a JWT verify) on whatever the client sends back, which always fails since the client never received a JWT. Confirmed via manual testing on both `/auth/refresh` and `/auth/mobile/refresh` — not introduced by the mobile routes, pre-existing and untested (`tests/integration/auth.test.ts` only covers the no-token 401 case, never a real rotation). Left unfixed per explicit user decision when the mobile routes were added — the mobile app forces re-login on a 401 rather than attempting silent refresh, same as the web app's actual (if accidental) behavior. Fix before relying on refresh anywhere.

### Mobile (Bearer-token) auth

`POST /auth/mobile/login`, `POST /auth/mobile/refresh` (`{ refreshToken }` body — currently broken, see bug above), `POST /auth/mobile/logout` (`{ refreshToken }` body) in `auth.routes.ts` return tokens in the JSON body (`{ user, accessToken, refreshToken }`) instead of setting cookies, for native clients with no shared cookie jar. They reuse the exact same service functions as the cookie-based web routes (`loginWithCredentials`, `rotateRefreshToken`, `revokeRefreshToken`) — no service-layer differences, only how the route responds. The web routes are untouched; cookie-based auth remains the browser contract.

### RBAC

Two roles: `superadmin` and `company`.

- `superadmin`: unrestricted access to all routes.
- `company`: can only access TDS/MSDS for products in their `allowedProducts` list. `formula`, `label`, `coa` doc types are always blocked for company users (`RESTRICTED_DOC_TYPES` in `src/types/index.ts`).

`allowedProducts` is loaded from `company_product_access` at login and embedded in the JWT — not re-queried per request.

### Product documents (JSONB)

`product_documents` stores each `(product_key, doc_type)` pair as a single row. The `body` column is `JSONB` with a shape that varies per docType (TDS, MSDS, Formula etc. all differ). `footer` is always `{ left, center, right }`. There is a unique constraint on `(product_key, doc_type)`. Each row also carries `status` (default `published`), `createdAt`, `updatedAt`, `updatedBy` — see "Document approval workflow" below.

### Document approval workflow

`product_documents.status` is a linear approval state machine (`STATUS_TRANSITIONS` in `products.service.ts`):

```
draft → pending_review → qa_review → published → archived
          ↑                  ↓
          └── pending_review ┘   (qa_review can bounce back to pending_review)
draft ← archived                  (archived can only return to draft)
```

- `transitionDocumentStatus(productLine, docType, newStatus, userId, notes?)` validates the requested transition against the document's current status. Return contract: `null` if the document doesn't exist (route returns 404), the string literal `'invalid_transition'` if the transition isn't in the allowed list for the current status (route returns 409 `AppErrors.INVALID_STATUS_TRANSITION`), otherwise the updated document.
- Both `updateDocument` (PUT) and `transitionDocumentStatus` (PATCH .../status) write their DB update and an `document_audit_log` row inside the same `db.transaction()` — never insert the audit row outside the transaction.
- `getDocument(productLine, docType, role)` enforces that **company** role users get `null` (→ 404) for any document whose `status !== 'published'`, regardless of `checkProductAccess`/`allowedProducts`. Redis caching is bypassed entirely for `role === 'company'` requests (`cacheable = role !== 'company'`) so a cached superadmin response of a draft document can never leak to a company user.
- `listAuditTrail(productLine, docType)` returns all `document_audit_log` rows for that document (newest first), left-joined to `users` for `userName`. Returns `null` if the document doesn't exist.
- `listExpirySummary()` computes a `reviewState` per document from `updatedAt` age, independent of `status`: `'expired'` (>365 days), `'due'` (>335 days), else `'ok'`.

### Formulation variant approval workflow

`product_formulation_variants.status` is a second linear state machine, defined as `VARIANT_STATUS_TRANSITIONS` in `src/modules/optimizer/optimizer.types.ts`:

```
draft → reviewed → approved → production
ai_suggested → reviewed | draft      (AI-generated variants enter here)
reviewed → draft                     (bounce back)
approved → reviewed                  (bounce back)
production → approved                (bounce back)
```

`transitionVariantStatus(variantId, newStatus)` in `formulation-variants.service.ts` mirrors the return contract of `transitionDocumentStatus`: `null` (→ 404), `'invalid_transition'` (→ 409), or the updated variant. Variants created directly via POST default to `approved`; variants saved from the AI Optimizer start at `ai_suggested`.

### AI Formulation Optimizer

`POST /optimizer/analyze` (superadmin-only) takes a product/variant's component list plus optimization goals, enriches components with inventory prices (name-normalized: `'LAE 9'` ≡ `'LAE-9'`), and calls an AI provider (`src/modules/optimizer/ai/`) to produce recommendations and financial impact. Suggested variants can then be saved through the normal `formulation-variants` module with status `ai_suggested` and promoted via the approval workflow above.

### Redis caching

Redis is entirely optional. `src/plugins/redis.ts` exports `cacheGet/cacheSet/cacheDel/cacheDelPattern` helpers that no-op silently when `REDIS_URL` is not set. Product documents are cached at key `doc:{productLine}:{docType}` with a 300s TTL, invalidated on PUT.

### Testing

Integration tests use a real PostgreSQL database (the same one in `.env.local`). They must run sequentially (`singleFork: true` in vitest config) because they share DB state. Each test file builds its own Fastify app instance via `buildApp()` and tears it down in `afterAll`. Tests depend on seed data — run `npm run seed` before testing.

### Quotation numbering

`quotation_sequences` uses an `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` pattern (in `src/utils/quotNumber.ts`) for a lock-free atomic per-year counter that produces `UNIK-YYYY-NNN` numbers without deadlocks. Line items are stored in a separate `quotation_line_items` table (FK → quotations, cascade delete).

### Batch numbering

`batch_sequences` uses the same lock-free atomic pattern (in `src/utils/batchNumber.ts`). `nextBatchNumber(db, companyName, productionDate?)` produces `XX-YYYYMMDD-NNN` where XX is the first 2 chars of the company name (uppercase), YYYYMMDD is the production date, and NNN is a per-company per-day counter. `POST /batches` accepts an optional `productionDate` (defaults to today when omitted) so historical/backfilled batches can be recorded with their real production date rather than the entry date — both the batch row and its batch number reflect the same date. Each batch also captures JSONB snapshots at creation time:

- `formulationSnapshot` — full formulation at time of batch creation
- `labelSnapshot` — label data including the assigned batchNumber
- `costSummary` — cost breakdown (per-litre component/loss/transport/handling costs, optional `packagingCostPerL`, selling price, profit)
- `paymentDueDate`, `paymentTermDays` (default 45) — payment tracking
- `paidAt` — nullable timestamp; `NULL` = unpaid, set to `now()` when payment is marked done via `PATCH /batches/:batchNumber/payment` (`{ paid: boolean }`, toggleable). `listBatches` accepts a `paid=true|false` query filter (`isNotNull`/`isNull` on `paidAt`)
- `batchType` — `'Production'` (default) or `'Trial'`; filterable via `listBatches` query param

### Zoho Invoice sync (zoho-invoice)

Read-only mirror of Zoho Invoice's status for a dispatch — not an accounting integration. Deliberately **pull-only** (never creates/pushes invoices to Zoho) and **display-only** (never writes `batches.paidAt` — that stays a manual, independent toggle; see root `CLAUDE.md`'s note that this system has no accounting/invoicing layer by design).

- **Trigger is on-demand only** — `POST /zoho-invoices/:dispatchId/sync`, no background poll/cron. There is no job-scheduling infrastructure anywhere in this backend; adding one was explicitly out of scope for this feature.
- **One row per dispatch** in `zoho_invoice_syncs` (unique FK, cascade-deleted with the dispatch), keyed off the dispatch's existing free-text `invoiceNumber` field — the sync call looks that value up in Zoho via `GET /invoice/v3/invoices?invoice_number=...`. A dispatch with no `invoiceNumber` set yet returns `400 DISPATCH_INVOICE_NUMBER_MISSING`.
- **`GET /zoho-invoices` (list) is a live call, not backed by `zoho_invoice_syncs`** — it hits Zoho's own `GET /invoice/v3/invoices` directly every request (status/date-range/search query params passed through best-effort) and separately looks up `dispatches` by `invoiceNumber` to attach a `linkedDispatch` reference to any matching row. Nothing from this list call is persisted; it's purely a read-through view for the Invoices page. Pagination follows Zoho's own `page`/`per_page`/`has_more_page` — Zoho doesn't return a total count for this endpoint.
- **`status` is stored as free text**, not a constrained DB enum — it mirrors Zoho's own status vocabulary (paid/overdue/sent/void/...), which this codebase doesn't own and shouldn't hardcode against.
- **Auth**: Zoho self-client OAuth2 (server-to-server refresh-token grant, scope `ZohoInvoice.invoices.READ`). Access tokens are cached in-memory only (module-level, not persisted) and refreshed on demand via `${ZOHO_ACCOUNTS_DOMAIN}/oauth/v2/token` — a cold restart just costs one extra refresh round trip. Outbound calls use native `fetch` (Node ≥20) rather than adding a new HTTP client dependency; this is the first outbound third-party API call anywhere in this backend.
- **`ZOHO_NOT_CONFIGURED`** (400) is returned instead of a startup crash when the `ZOHO_*` env vars aren't set — they're optional in `env.ts` specifically so the server keeps booting before the Zoho self-client is set up.
- **`ZOHO_SYNC_FAILED`** uses `502` — a deliberate, documented exception to the status-code list in root `CLAUDE.md` §3, since this is the only route in the codebase proxying a third-party upstream call.

### Database schema

See `DATABASE.md` for the full 33-table schema reference, the canonical migration workflow, entity relationship rules, and failed-migration recovery steps.

### Seed data

`src/seed/` contains idempotent seed scripts (run via `npm run seed`):

- `index.ts` — entry point; runs all seeds in order
- `products.seed.ts` — 14 product lines (uniklean-sp, uniklean-fe, uniprotect-oil, uniflow-ecm, unicool-al, unikoat-lt-700, unisolve-h3, unipass, uniktonner, corroklean, corrcut-100, corrucut-500, uniklean-sf, corrcut-200)
- `companies.seed.ts` — test companies (Rane Madras, TVS, Akshaya) with product access mappings
- `formulationVariants.seed.ts` — formulation variant headers and components
- `inventory.seed.ts` — 23 factory-default raw materials
- `reset.ts` — dev-only; drops all tables (invoked by `npm run db:reset`)

### Seed & Data Integrity

- Seed scripts must be idempotent — always check for existing records before inserting/upserting
- When updating data, propagate changes to both seed files AND the live database; seed-only edits won't reflect in the running DB
- Handle name normalization when matching DB records (e.g., `'LAE 9'` vs `'LAE-9'`)
- For Drizzle ORM: use `.returning()` to get affected rows — `rowCount` does not exist on Drizzle results
- **Verify current DB value BEFORE editing numeric fields** (percentages, quantities, prices) — if the value already matches the request, stop and ask for clarification rather than making a no-op or comment-only change
- **When formulation or variant data changes, propagate to all consumers**: seed file → live DB → any existing batch snapshots (`formulationSnapshot`, `labelSnapshot`, `coaSnapshot` in the `batches` table) — never declare done after updating only one layer

### Utilities

- `src/utils/jwt.ts` — RS256 sign/verify; key function is `tryVerifyAccessToken(token)` which returns the decoded payload or `null` (never throws)
- `src/utils/crypto.ts` — bcrypt hashing, token generation, username normalization
- `src/utils/quotNumber.ts` — atomic quotation number generation (UNIK-YYYY-NNN)
- `src/utils/batchNumber.ts` — atomic batch number generation (XX-YYYYMMDD-NNN)
- `src/utils/customerOrderNumber.ts` — atomic customer PO number generation (CPO-YYYY-NNN)

---

## graphify

See root `CLAUDE.md` §10 (Codebase Navigation & Documentation Sync) for graphify usage rules — this app's graph lives at `graphify-out/`.
