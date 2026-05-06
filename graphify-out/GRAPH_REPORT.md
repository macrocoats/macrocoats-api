# Graph Report - /Users/kumaraswins/Desktop/MACROCOATS/webApps/portal/macrocoats-api  (2026-05-06)

## Corpus Check
- 65 files · ~54,886 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 227 nodes · 325 edges · 26 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]

## God Nodes (most connected - your core abstractions)
1. `Macro Coats API` - 23 edges
2. `issueTokens()` - 9 edges
3. `Auth Module` - 9 edges
4. `JWT RS256 Authentication` - 8 edges
5. `Getting Started Guide` - 7 edges
6. `Products Module` - 6 edges
7. `RBAC Middleware Stack` - 6 edges
8. `Seed Scripts` - 6 edges
9. `Integration Tests` - 6 edges
10. `getRedis()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `buildApp()` --calls--> `main()`  [INFERRED]
  /Users/kumaraswins/Desktop/MACROCOATS/webApps/portal/macrocoats-api/src/app.ts → src/server.ts
- `buildApp()` --calls--> `registerCors()`  [INFERRED]
  /Users/kumaraswins/Desktop/MACROCOATS/webApps/portal/macrocoats-api/src/app.ts → src/plugins/cors.ts
- `buildApp()` --calls--> `registerCookies()`  [INFERRED]
  /Users/kumaraswins/Desktop/MACROCOATS/webApps/portal/macrocoats-api/src/app.ts → src/plugins/cookie.ts
- `seedCompanies()` --calls--> `hashPassword()`  [INFERRED]
  /Users/kumaraswins/Desktop/MACROCOATS/webApps/portal/macrocoats-api/src/seed/companies.seed.ts → src/utils/crypto.ts
- `main()` --calls--> `seedInventory()`  [INFERRED]
  /Users/kumaraswins/Desktop/MACROCOATS/webApps/portal/macrocoats-api/src/seed/index.ts → src/seed/inventory.seed.ts

## Hyperedges (group relationships)
- **API Modules** — readme_auth_module, readme_products_module, readme_inventory_module, readme_quotations_module, readme_companies_module, readme_analytics_module [EXTRACTED 1.00]
- **RBAC Middleware Chain** — readme_authenticate_middleware, readme_require_auth_middleware, readme_require_super_admin_middleware, readme_check_product_access_middleware, readme_log_access_middleware [EXTRACTED 1.00]
- **Database Schema Tables** — readme_users_table, readme_companies_table, readme_products_table, readme_product_documents_table, readme_company_product_access_table, readme_refresh_tokens_table, readme_access_log_table, readme_inventory_items_table, readme_quotations_table, readme_quotation_line_items_table, readme_quotation_sequences_table [EXTRACTED 1.00]
- **Authentication Flows** — readme_login_flow, readme_magic_link_qr_token_flow, readme_token_refresh_flow [EXTRACTED 1.00]
- **Core Tech Stack** — readme_fastify, readme_typescript, readme_drizzle_orm, readme_postgresql, readme_redis, readme_jwt_rs256, readme_bcryptjs, readme_zod [EXTRACTED 1.00]
- **Design Rationale Decisions** — readme_jsonb_design_rationale, readme_hashed_refresh_tokens_rationale, readme_atomic_counter_rationale, readme_real_db_tests_rationale, readme_httonly_cookie_rationale, readme_rs256_asymmetric_rationale [EXTRACTED 1.00]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (38): DB Schema Push and Seed, Dev Server, .env.local Configuration, File Map Summary, Getting Started Guide, RS256 Keypair Generation, Key Security Notes, app.ts (Fastify Entry) (+30 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (3): authenticate(), getQuotationById(), toQuotationResponse()

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (22): access_log Table, Analytics Module, Auth Module, bcryptjs Password Hashing, checkProductAccess Middleware, Companies Module, companies Table, company_product_access Table (+14 more)

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (7): getBatchByNumber(), toBatchResponse(), seedCompanies(), hashPassword(), main(), seedInventory(), seedProducts()

### Community 4 - "Community 4"
Cohesion: 0.17
Nodes (18): buildAuthUser(), getMeById(), issueTokens(), loginWithCredentials(), loginWithToken(), revokeRefreshToken(), rotateRefreshToken(), rotateCompanyToken() (+10 more)

### Community 5 - "Community 5"
Cohesion: 0.16
Nodes (10): cacheKey(), getDocument(), updateDocument(), cacheDel(), cacheDelPattern(), cacheGet(), cacheSet(), connectRedis() (+2 more)

### Community 6 - "Community 6"
Cohesion: 0.22
Nodes (3): buildApp(), registerCookies(), registerCors()

### Community 7 - "Community 7"
Cohesion: 0.29
Nodes (4): createVendor(), getVendorById(), toResponse(), updateVendor()

### Community 8 - "Community 8"
Cohesion: 0.31
Nodes (7): computeStockStatus(), createItem(), getAllItems(), getItemById(), resetToDefaults(), toResponse(), updateItem()

### Community 9 - "Community 9"
Cohesion: 0.29
Nodes (4): createStaff(), getStaffById(), toResponse(), updateStaff()

### Community 10 - "Community 10"
Cohesion: 0.25
Nodes (2): buildResponse(), getCompanyById()

### Community 11 - "Community 11"
Cohesion: 0.47
Nodes (6): Atomic Counter (quotation_sequences) Rationale, quotNumber.ts Utility, quotation_line_items Table, quotation_sequences Table, Quotations Module, quotations Table

### Community 12 - "Community 12"
Cohesion: 0.4
Nodes (0): 

### Community 13 - "Community 13"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "Community 14"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Community 15"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Community 16"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Community 17"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Community 18"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **15 isolated node(s):** `TypeScript`, `Supertest`, `React + Vite SPA Frontend`, `requireAuth Middleware`, `requireSuperAdmin Middleware` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 13`** (2 nodes): `req()`, `inventory.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (2 nodes): `request()`, `auth.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (2 nodes): `req()`, `products.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (2 nodes): `reset()`, `reset.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (1 nodes): `drizzle.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (1 nodes): `vitest.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (1 nodes): `fastify.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (1 nodes): `inventory.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (1 nodes): `batches.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (1 nodes): `companies.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (1 nodes): `companyProductAccess.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `staff.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `vendors.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `buildApp()` connect `Community 6` to `Community 5`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `rotateCompanyToken()` connect `Community 4` to `Community 10`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `issueTokens()` (e.g. with `generateToken()` and `hashToken()`) actually correct?**
  _`issueTokens()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `TypeScript`, `Supertest`, `React + Vite SPA Frontend` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._