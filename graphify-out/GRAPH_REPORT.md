# Graph Report - .  (2026-05-29)

## Corpus Check
- 94 files · ~73,826 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 368 nodes · 575 edges · 35 communities detected
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 43 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Architecture & Dev Guidelines|Architecture & Dev Guidelines]]
- [[_COMMUNITY_PDF Helpers & Template Utils|PDF Helpers & Template Utils]]
- [[_COMMUNITY_Route Registration & Middleware|Route Registration & Middleware]]
- [[_COMMUNITY_Seeding, Pricing & Crypto|Seeding, Pricing & Crypto]]
- [[_COMMUNITY_RBAC, Features & Lifecycle|RBAC, Features & Lifecycle]]
- [[_COMMUNITY_Analytics & Access Logging|Analytics & Access Logging]]
- [[_COMMUNITY_Auth Service & Token Issuance|Auth Service & Token Issuance]]
- [[_COMMUNITY_Auth Concepts & Graph Meta|Auth Concepts & Graph Meta]]
- [[_COMMUNITY_Future Product Features|Future Product Features]]
- [[_COMMUNITY_App Bootstrap & Plugins|App Bootstrap & Plugins]]
- [[_COMMUNITY_Batch Service|Batch Service]]
- [[_COMMUNITY_Atomic Counters & Sequences|Atomic Counters & Sequences]]
- [[_COMMUNITY_Inventory Service|Inventory Service]]
- [[_COMMUNITY_Formulation Variants|Formulation Variants]]
- [[_COMMUNITY_Staff Management|Staff Management]]
- [[_COMMUNITY_Companies Service|Companies Service]]
- [[_COMMUNITY_Salary Records|Salary Records]]
- [[_COMMUNITY_DB Schema (Ops Tables)|DB Schema (Ops Tables)]]
- [[_COMMUNITY_Core DB Schema|Core DB Schema]]
- [[_COMMUNITY_Inventory Integration Tests|Inventory Integration Tests]]
- [[_COMMUNITY_Auth Integration Tests|Auth Integration Tests]]
- [[_COMMUNITY_Products Integration Tests|Products Integration Tests]]
- [[_COMMUNITY_Drizzle Config|Drizzle Config]]
- [[_COMMUNITY_Vitest Config|Vitest Config]]
- [[_COMMUNITY_Fastify Type Augmentation|Fastify Type Augmentation]]
- [[_COMMUNITY_Inventory DB Schema|Inventory DB Schema]]
- [[_COMMUNITY_Salary Records DB Schema|Salary Records DB Schema]]
- [[_COMMUNITY_Company Product Access|Company Product Access]]
- [[_COMMUNITY_Staff DB Schema|Staff DB Schema]]
- [[_COMMUNITY_Vendors DB Schema|Vendors DB Schema]]
- [[_COMMUNITY_Quotations DB Schema|Quotations DB Schema]]
- [[_COMMUNITY_Auth Zod Schema|Auth Zod Schema]]
- [[_COMMUNITY_Quotations Zod Schema|Quotations Zod Schema]]
- [[_COMMUNITY_Crypto Utilities|Crypto Utilities]]
- [[_COMMUNITY_AI Feature Proposal|AI Feature Proposal]]

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

### Community 0 - "Architecture & Dev Guidelines"
Cohesion: 0.05
Nodes (54): Entity Relationship Rules (staff/vendors standalone), Environment Variables (Zod-validated at startup), Integration Testing (real PostgreSQL, singleFork), Drizzle Migration Workflow (canonical), Module Layout (routes/service/schema per module), Product Documents JSONB Storage, Redis Caching (optional, doc 300s TTL), Feature: Document Versioning (TDS/MSDS revisions) (+46 more)

### Community 1 - "PDF Helpers & Template Utils"
Cohesion: 0.08
Nodes (14): amountInWords(), wordsBelow1000(), formatDate(), formatTime(), nowFormatted(), registerHelpers(), buildFooterTemplate(), buildHeaderTemplate() (+6 more)

### Community 2 - "Route Registration & Middleware"
Cohesion: 0.11
Nodes (0): 

### Community 3 - "Seeding, Pricing & Crypto"
Cohesion: 0.09
Nodes (14): seedCompanies(), getCompanyPricing(), upsertCompanyPricing(), hashPassword(), seedFormulationVariants(), main(), seedInventory(), seedProducts() (+6 more)

### Community 4 - "RBAC, Features & Lifecycle"
Cohesion: 0.13
Nodes (24): RBAC Roles (superadmin / company), Request Lifecycle (onRequest to preHandler to handler), Feature: Activity Logs (audit trail), Feature: Advanced Search, Feature: Client Portal (company-scoped access), Feature: Profit Intelligence Dashboard, access_log Table, Analytics Module (+16 more)

### Community 5 - "Analytics & Access Logging"
Cohesion: 0.14
Nodes (10): buildSummary(), getAccessSummary(), cacheKey(), getDocument(), updateDocument(), cacheDel(), cacheDelPattern(), cacheGet() (+2 more)

### Community 6 - "Auth Service & Token Issuance"
Cohesion: 0.16
Nodes (19): buildAuthUser(), getMeById(), issueTokens(), loginWithCredentials(), loginWithToken(), revokeRefreshToken(), rotateRefreshToken(), authenticate() (+11 more)

### Community 7 - "Auth Concepts & Graph Meta"
Cohesion: 0.17
Nodes (20): Two-Token RS256 Auth System (access + refresh), Feature: Mobile Operator Mode, Feature: QR Code Smart Safety Page, Graph Report: God Nodes (most connected), Auth Module, bcryptjs Password Hashing, crypto.ts Utility, Getting Started Guide (+12 more)

### Community 8 - "Future Product Features"
Cohesion: 0.14
Nodes (16): Feature: Advanced Inventory Module, Feature: Batch Traceability System, Feature: Certificate of Analysis (COA) Generator, Feature: Dispatch Tracking, Feature: Automatic Label Generation, Feature: Price Sensitivity Calculator, Feature: Production Planning Tool, Feature: Quality Control (QC) Module (+8 more)

### Community 9 - "App Bootstrap & Plugins"
Cohesion: 0.17
Nodes (5): buildApp(), registerCookies(), registerCors(), connectRedis(), main()

### Community 10 - "Batch Service"
Cohesion: 0.22
Nodes (3): getBatchByNumber(), saveCoaSnapshot(), toBatchResponse()

### Community 11 - "Atomic Counters & Sequences"
Cohesion: 0.31
Nodes (11): Batch Numbering (XX-YYYYMMDD-NNN atomic), Quotation Numbering (UNIK-YYYY-NNN atomic), Atomic Counter Rationale (INSERT ON CONFLICT lock-free), batchNumber.ts Utility (XX-YYYYMMDD-NNN), batch_sequences Table, quotNumber.ts Utility, quotNumber.ts Utility (UNIK-YYYY-NNN), quotation_line_items Table (+3 more)

### Community 12 - "Inventory Service"
Cohesion: 0.31
Nodes (7): computeStockStatus(), createItem(), getAllItems(), getItemById(), resetToDefaults(), toResponse(), updateItem()

### Community 13 - "Formulation Variants"
Cohesion: 0.28
Nodes (3): getVariantById(), toVariantResponse(), updateVariant()

### Community 14 - "Staff Management"
Cohesion: 0.36
Nodes (4): createStaff(), getStaffById(), toResponse(), updateStaff()

### Community 15 - "Companies Service"
Cohesion: 0.33
Nodes (2): getCompanyById(), toResponse()

### Community 16 - "Salary Records"
Cohesion: 0.47
Nodes (3): getSalaryRecordById(), saveSalaryRecord(), toResponse()

### Community 17 - "DB Schema (Ops Tables)"
Cohesion: 0.33
Nodes (0): 

### Community 18 - "Core DB Schema"
Cohesion: 0.67
Nodes (0): 

### Community 19 - "Inventory Integration Tests"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Auth Integration Tests"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Products Integration Tests"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Drizzle Config"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Vitest Config"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Fastify Type Augmentation"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Inventory DB Schema"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Salary Records DB Schema"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Company Product Access"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Staff DB Schema"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Vendors DB Schema"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Quotations DB Schema"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Auth Zod Schema"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Quotations Zod Schema"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Crypto Utilities"
Cohesion: 1.0
Nodes (1): crypto.ts Utility (bcrypt, tokens)

### Community 34 - "AI Feature Proposal"
Cohesion: 1.0
Nodes (1): Feature: AI Formulation Optimizer

## Knowledge Gaps
- **35 isolated node(s):** `TypeScript`, `Supertest`, `React + Vite SPA Frontend`, `CORS Plugin (@fastify/cors)`, `Superadmin Role` (+30 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Inventory Integration Tests`** (2 nodes): `req()`, `inventory.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth Integration Tests`** (2 nodes): `request()`, `auth.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Products Integration Tests`** (2 nodes): `req()`, `products.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Drizzle Config`** (1 nodes): `drizzle.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vitest Config`** (1 nodes): `vitest.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Fastify Type Augmentation`** (1 nodes): `fastify.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Inventory DB Schema`** (1 nodes): `inventory.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Salary Records DB Schema`** (1 nodes): `salaryRecords.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Company Product Access`** (1 nodes): `companyProductAccess.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Staff DB Schema`** (1 nodes): `staff.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vendors DB Schema`** (1 nodes): `vendors.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Quotations DB Schema`** (1 nodes): `quotations.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth Zod Schema`** (1 nodes): `auth.schema.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Quotations Zod Schema`** (1 nodes): `quotations.schema.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Crypto Utilities`** (1 nodes): `crypto.ts Utility (bcrypt, tokens)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `AI Feature Proposal`** (1 nodes): `Feature: AI Formulation Optimizer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Macro Coats API` connect `Architecture & Dev Guidelines` to `Future Product Features`, `Atomic Counters & Sequences`, `RBAC, Features & Lifecycle`, `Auth Concepts & Graph Meta`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `authenticate()` connect `Auth Service & Token Issuance` to `Route Registration & Middleware`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `rotateCompanyToken()` connect `Auth Service & Token Issuance` to `Companies Service`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `issueTokens()` (e.g. with `signAccessToken()` and `signRefreshToken()`) actually correct?**
  _`issueTokens()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `TypeScript`, `Supertest`, `React + Vite SPA Frontend` to the rest of the system?**
  _35 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Architecture & Dev Guidelines` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `PDF Helpers & Template Utils` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._