# Graph Report - .  (2026-04-25)

## Corpus Check
- Corpus is ~20,218 words - fits in a single context window. You may not need a graph.

## Summary
- 192 nodes · 323 edges · 14 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_App Bootstrap & Config|App Bootstrap & Config]]
- [[_COMMUNITY_Auth & Access Control|Auth & Access Control]]
- [[_COMMUNITY_Seed & Utility Functions|Seed & Utility Functions]]
- [[_COMMUNITY_Middleware & JWT Tokens|Middleware & JWT Tokens]]
- [[_COMMUNITY_App Factory & Plugins|App Factory & Plugins]]
- [[_COMMUNITY_Auth Service Logic|Auth Service Logic]]
- [[_COMMUNITY_Product Cache & Redis|Product Cache & Redis]]
- [[_COMMUNITY_Inventory CRUD|Inventory CRUD]]
- [[_COMMUNITY_Company Management|Company Management]]
- [[_COMMUNITY_Database Schema|Database Schema]]
- [[_COMMUNITY_Quotation Module|Quotation Module]]
- [[_COMMUNITY_Quotation Sequences|Quotation Sequences]]
- [[_COMMUNITY_Drizzle Config|Drizzle Config]]
- [[_COMMUNITY_Vitest Config|Vitest Config]]

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
- `RS256 Keypair Generation` --conceptually_related_to--> `JWT RS256 Authentication`  [EXTRACTED]
  first.md → README.md
- `issueTokens()` --calls--> `signAccessToken()`  [INFERRED]
  src/modules/auth/auth.service.ts → src/utils/jwt.ts
- `issueTokens()` --calls--> `signRefreshToken()`  [INFERRED]
  src/modules/auth/auth.service.ts → src/utils/jwt.ts
- `File Map Summary` --references--> `Macro Coats API`  [EXTRACTED]
  first.md → README.md
- `Dev Server` --conceptually_related_to--> `Fastify`  [INFERRED]
  first.md → README.md

## Hyperedges (group relationships)
- **API Modules** — readme_auth_module, readme_products_module, readme_inventory_module, readme_quotations_module, readme_companies_module, readme_analytics_module [EXTRACTED 1.00]
- **RBAC Middleware Chain** — readme_authenticate_middleware, readme_require_auth_middleware, readme_require_super_admin_middleware, readme_check_product_access_middleware, readme_log_access_middleware [EXTRACTED 1.00]
- **Database Schema Tables** — readme_users_table, readme_companies_table, readme_products_table, readme_product_documents_table, readme_company_product_access_table, readme_refresh_tokens_table, readme_access_log_table, readme_inventory_items_table, readme_quotations_table, readme_quotation_line_items_table, readme_quotation_sequences_table [EXTRACTED 1.00]
- **Authentication Flows** — readme_login_flow, readme_magic_link_qr_token_flow, readme_token_refresh_flow [EXTRACTED 1.00]
- **Core Tech Stack** — readme_fastify, readme_typescript, readme_drizzle_orm, readme_postgresql, readme_redis, readme_jwt_rs256, readme_bcryptjs, readme_zod [EXTRACTED 1.00]
- **Design Rationale Decisions** — readme_jsonb_design_rationale, readme_hashed_refresh_tokens_rationale, readme_atomic_counter_rationale, readme_real_db_tests_rationale, readme_httonly_cookie_rationale, readme_rs256_asymmetric_rationale [EXTRACTED 1.00]

## Communities

### Community 0 - "App Bootstrap & Config"
Cohesion: 0.1
Nodes (31): DB Schema Push and Seed, Dev Server, .env.local Configuration, File Map Summary, Getting Started Guide, RS256 Keypair Generation, app.ts (Fastify Entry), Redis Cache-Aside Strategy (+23 more)

### Community 1 - "Auth & Access Control"
Cohesion: 0.1
Nodes (29): Key Security Notes, access_log Table, Analytics Module, Auth Module, authenticate Middleware, bcryptjs Password Hashing, checkProductAccess Middleware, Companies Module (+21 more)

### Community 2 - "Seed & Utility Functions"
Cohesion: 0.14
Nodes (5): seedCompanies(), hashPassword(), main(), seedInventory(), seedProducts()

### Community 3 - "Middleware & JWT Tokens"
Cohesion: 0.14
Nodes (5): authenticate(), signAccessToken(), signRefreshToken(), tryVerifyAccessToken(), verifyAccessToken()

### Community 4 - "App Factory & Plugins"
Cohesion: 0.14
Nodes (5): buildApp(), registerCookies(), registerCors(), connectRedis(), main()

### Community 5 - "Auth Service Logic"
Cohesion: 0.22
Nodes (14): buildAuthUser(), getMeById(), issueTokens(), loginWithCredentials(), loginWithToken(), revokeRefreshToken(), rotateRefreshToken(), rotateCompanyToken() (+6 more)

### Community 6 - "Product Cache & Redis"
Cohesion: 0.32
Nodes (8): cacheKey(), getDocument(), updateDocument(), cacheDel(), cacheDelPattern(), cacheGet(), cacheSet(), getRedis()

### Community 7 - "Inventory CRUD"
Cohesion: 0.27
Nodes (6): createItem(), getAllItems(), getItemById(), resetToDefaults(), toResponse(), updateItem()

### Community 8 - "Company Management"
Cohesion: 0.24
Nodes (2): buildResponse(), getCompanyById()

### Community 9 - "Database Schema"
Cohesion: 0.29
Nodes (0): 

### Community 10 - "Quotation Module"
Cohesion: 0.32
Nodes (2): getQuotationById(), toQuotationResponse()

### Community 11 - "Quotation Sequences"
Cohesion: 0.47
Nodes (6): Atomic Counter (quotation_sequences) Rationale, quotNumber.ts Utility, quotation_line_items Table, quotation_sequences Table, Quotations Module, quotations Table

### Community 12 - "Drizzle Config"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Vitest Config"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **15 isolated node(s):** `TypeScript`, `Supertest`, `React + Vite SPA Frontend`, `requireAuth Middleware`, `requireSuperAdmin Middleware` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Drizzle Config`** (1 nodes): `drizzle.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vitest Config`** (1 nodes): `vitest.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Macro Coats API` connect `App Bootstrap & Config` to `Auth & Access Control`, `Quotation Sequences`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Why does `Auth Module` connect `Auth & Access Control` to `App Bootstrap & Config`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `JWT RS256 Authentication` connect `Auth & Access Control` to `App Bootstrap & Config`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `issueTokens()` (e.g. with `generateToken()` and `hashToken()`) actually correct?**
  _`issueTokens()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `TypeScript`, `Supertest`, `React + Vite SPA Frontend` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Bootstrap & Config` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Auth & Access Control` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._