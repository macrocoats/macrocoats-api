# Graph Report - /Users/kumaraswins/Desktop/MACROCOATS/webApps/portal/macrocoats-api  (2026-05-29)

## Corpus Check
- 88 files · ~79,180 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 368 nodes · 575 edges · 35 communities detected
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 43 edges (avg confidence: 0.82)
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
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]

## God Nodes (most connected - your core abstractions)
1. `Macro Coats API` - 35 edges
2. `JWT RS256 Authentication` - 12 edges
3. `Auth Module` - 11 edges
4. `Batches Module` - 10 edges
5. `issueTokens()` - 9 edges
6. `PDFService` - 9 edges
7. `TemplateService` - 9 edges
8. `Products Module` - 9 edges
9. `PostgreSQL` - 8 edges
10. `issueTokens() Function` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Redis Cache` --semantically_similar_to--> `Redis Caching (optional, doc 300s TTL)`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `Analytics Module` --semantically_similar_to--> `Feature: Advanced Search`  [INFERRED] [semantically similar]
  README.md → features.md
- `Drizzle Migration Workflow` --semantically_similar_to--> `Drizzle Migration Workflow (canonical)`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `JWT RS256 Authentication` --conceptually_related_to--> `RS256 Keypair Generation`  [EXTRACTED]
  README.md → first.md
- `Inventory Module` --conceptually_related_to--> `Feature: Production Planning Tool`  [INFERRED]
  README.md → features.md

## Hyperedges (group relationships)
- **Core Tech Stack** — readme_fastify, readme_typescript, readme_drizzle_orm, readme_postgresql, readme_redis, readme_jwt_rs256, readme_bcryptjs, readme_zod, readme_puppeteer_handlebars, readme_vitest_supertest [EXTRACTED 1.00]
- **RBAC Middleware Chain** — readme_authenticate_middleware, readme_require_auth_middleware, readme_require_super_admin_middleware, readme_check_product_access_middleware, readme_log_access_middleware [EXTRACTED 1.00]
- **Authentication Flows** — readme_login_flow, readme_magic_link_qr_token_flow, readme_token_refresh_flow, readme_issue_tokens, readme_jwt_rs256 [EXTRACTED 1.00]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (54): Entity Relationship Rules (staff/vendors standalone), Environment Variables (Zod-validated at startup), Integration Testing (real PostgreSQL, singleFork), Drizzle Migration Workflow (canonical), Module Layout (routes/service/schema per module), Product Documents JSONB Storage, Redis Caching (optional, doc 300s TTL), Feature: Document Versioning (TDS/MSDS revisions) (+46 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (14): amountInWords(), wordsBelow1000(), formatDate(), formatTime(), nowFormatted(), registerHelpers(), buildFooterTemplate(), buildHeaderTemplate() (+6 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (0): 

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (14): seedCompanies(), getCompanyPricing(), upsertCompanyPricing(), hashPassword(), seedFormulationVariants(), main(), seedInventory(), seedProducts() (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (24): RBAC Roles (superadmin / company), Request Lifecycle (onRequest to preHandler to handler), Feature: Activity Logs (audit trail), Feature: Advanced Search, Feature: Client Portal (company-scoped access), Feature: Profit Intelligence Dashboard, access_log Table, Analytics Module (+16 more)

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (10): buildSummary(), getAccessSummary(), cacheKey(), getDocument(), updateDocument(), cacheDel(), cacheDelPattern(), cacheGet() (+2 more)

### Community 6 - "Community 6"
Cohesion: 0.16
Nodes (19): buildAuthUser(), getMeById(), issueTokens(), loginWithCredentials(), loginWithToken(), revokeRefreshToken(), rotateRefreshToken(), authenticate() (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.17
Nodes (20): Two-Token RS256 Auth System (access + refresh), Feature: Mobile Operator Mode, Feature: QR Code Smart Safety Page, Graph Report: God Nodes (most connected), Auth Module, bcryptjs Password Hashing, crypto.ts Utility, Getting Started Guide (+12 more)

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (16): Feature: Advanced Inventory Module, Feature: Batch Traceability System, Feature: Certificate of Analysis (COA) Generator, Feature: Dispatch Tracking, Feature: Automatic Label Generation, Feature: Price Sensitivity Calculator, Feature: Production Planning Tool, Feature: Quality Control (QC) Module (+8 more)

### Community 9 - "Community 9"
Cohesion: 0.17
Nodes (5): buildApp(), registerCookies(), registerCors(), connectRedis(), main()

### Community 10 - "Community 10"
Cohesion: 0.22
Nodes (3): getBatchByNumber(), saveCoaSnapshot(), toBatchResponse()

### Community 11 - "Community 11"
Cohesion: 0.31
Nodes (11): Batch Numbering (XX-YYYYMMDD-NNN atomic), Quotation Numbering (UNIK-YYYY-NNN atomic), Atomic Counter Rationale (INSERT ON CONFLICT lock-free), batchNumber.ts Utility (XX-YYYYMMDD-NNN), batch_sequences Table, quotNumber.ts Utility, quotNumber.ts Utility (UNIK-YYYY-NNN), quotation_line_items Table (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.31
Nodes (7): computeStockStatus(), createItem(), getAllItems(), getItemById(), resetToDefaults(), toResponse(), updateItem()

### Community 13 - "Community 13"
Cohesion: 0.28
Nodes (3): getVariantById(), toVariantResponse(), updateVariant()

### Community 14 - "Community 14"
Cohesion: 0.36
Nodes (4): createStaff(), getStaffById(), toResponse(), updateStaff()

### Community 15 - "Community 15"
Cohesion: 0.33
Nodes (2): getCompanyById(), toResponse()

### Community 16 - "Community 16"
Cohesion: 0.47
Nodes (3): getSalaryRecordById(), saveSalaryRecord(), toResponse()

### Community 17 - "Community 17"
Cohesion: 0.33
Nodes (0): 

### Community 18 - "Community 18"
Cohesion: 0.67
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

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (1): crypto.ts Utility (bcrypt, tokens)

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (1): Feature: AI Formulation Optimizer

## Knowledge Gaps
- **35 isolated node(s):** `TypeScript`, `Supertest`, `React + Vite SPA Frontend`, `CORS Plugin (@fastify/cors)`, `Superadmin Role` (+30 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 19`** (2 nodes): `req()`, `inventory.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (2 nodes): `request()`, `auth.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (2 nodes): `req()`, `products.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (1 nodes): `drizzle.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (1 nodes): `vitest.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `fastify.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `inventory.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `salaryRecords.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `companyProductAccess.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `staff.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `vendors.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `quotations.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `auth.schema.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `quotations.schema.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `crypto.ts Utility (bcrypt, tokens)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `Feature: AI Formulation Optimizer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Macro Coats API` connect `Community 0` to `Community 8`, `Community 11`, `Community 4`, `Community 7`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `authenticate()` connect `Community 6` to `Community 2`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `rotateCompanyToken()` connect `Community 6` to `Community 15`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `issueTokens()` (e.g. with `generateToken()` and `hashToken()`) actually correct?**
  _`issueTokens()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `TypeScript`, `Supertest`, `React + Vite SPA Frontend` to the rest of the system?**
  _35 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._