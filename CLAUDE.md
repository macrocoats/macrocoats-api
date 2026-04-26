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

Required variables: `DATABASE_URL`, `JWT_PRIVATE_KEY_B64`, `JWT_PUBLIC_KEY_B64`, `COOKIE_SECRET`. All are validated by Zod at startup; the server exits immediately if any are missing or malformed (`src/config/env.ts`).

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
    logAccess()                       ← fire-and-forget access_log INSERT
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

### Auth tokens

Two-token RS256 system:
- **Access token** (15m): JWT carrying full `AuthUser` payload (id, role, companyName, allowedProducts). Verified on every request by decoding the `accessToken` httpOnly cookie. The payload is trusted directly — no DB lookup on each request.
- **Refresh token** (7d): JWT whose `jti` is a UUID matching a row in `refresh_tokens`. The raw token is never stored — only its `bcrypt` hash. Rotation revokes the old row and calls `issueTokens()` to produce a new pair.

`issueTokens()` in `auth.service.ts` is the single function that creates both tokens and inserts the refresh token row. All three login paths (`loginWithCredentials`, `loginWithToken`, `rotateRefreshToken`) funnel through it.

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

`quotation_sequences` uses an `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` pattern (in `src/utils/quotNumber.ts`) for a lock-free atomic per-year counter that produces `UNIK-YYYY-NNN` numbers without deadlocks.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)