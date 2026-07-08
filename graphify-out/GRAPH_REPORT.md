# Graph Report - /Users/kumaraswins/Desktop/MACROCOATS/webApps/portal/macrocoats-api  (2026-07-08)

## Corpus Check
- 97 files · ~99,897 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 405 nodes · 685 edges · 29 communities detected
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 58 edges (avg confidence: 0.81)
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

## God Nodes (most connected - your core abstractions)
1. `Macro Coats API` - 35 edges
2. `JWT RS256 Authentication` - 12 edges
3. `Auth Module` - 11 edges
4. `generateRecommendations()` - 10 edges
5. `Batches Module` - 10 edges
6. `issueTokens()` - 9 edges
7. `PDFService` - 9 edges
8. `TemplateService` - 9 edges
9. `Products Module` - 9 edges
10. `cacheDel()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Redis Cache` --semantically_similar_to--> `Redis Caching (optional, doc 300s TTL)`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `Analytics Module` --semantically_similar_to--> `Feature: Advanced Search`  [INFERRED] [semantically similar]
  README.md → features.md
- `Drizzle Migration Workflow` --semantically_similar_to--> `Drizzle Migration Workflow (canonical)`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `signAccessToken()` --calls--> `issueTokens()`  [INFERRED]
  src/utils/jwt.ts → /Users/kumaraswins/Desktop/MACROCOATS/webApps/portal/macrocoats-api/src/modules/auth/auth.service.ts
- `signRefreshToken()` --calls--> `issueTokens()`  [INFERRED]
  src/utils/jwt.ts → /Users/kumaraswins/Desktop/MACROCOATS/webApps/portal/macrocoats-api/src/modules/auth/auth.service.ts

## Hyperedges (group relationships)
- **Core Tech Stack** — readme_fastify, readme_typescript, readme_drizzle_orm, readme_postgresql, readme_redis, readme_jwt_rs256, readme_bcryptjs, readme_zod, readme_puppeteer_handlebars, readme_vitest_supertest [EXTRACTED 1.00]
- **RBAC Middleware Chain** — readme_authenticate_middleware, readme_require_auth_middleware, readme_require_super_admin_middleware, readme_check_product_access_middleware, readme_log_access_middleware [EXTRACTED 1.00]
- **Authentication Flows** — readme_login_flow, readme_magic_link_qr_token_flow, readme_token_refresh_flow, readme_issue_tokens, readme_jwt_rs256 [EXTRACTED 1.00]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (71): Entity Relationship Rules (staff/vendors standalone), Environment Variables (Zod-validated at startup), Integration Testing (real PostgreSQL, singleFork), Drizzle Migration Workflow (canonical), Module Layout (routes/service/schema per module), Product Documents JSONB Storage, Redis Caching (optional, doc 300s TTL), Feature: Advanced Inventory Module (+63 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (4): buildApp(), registerCookies(), registerCors(), main()

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (43): RBAC Roles (superadmin / company), Request Lifecycle (onRequest to preHandler to handler), Two-Token RS256 Auth System (access + refresh), Feature: Activity Logs (audit trail), Feature: Advanced Search, Feature: Client Portal (company-scoped access), Feature: Mobile Operator Mode, Feature: Profit Intelligence Dashboard (+35 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (15): amountInWords(), wordsBelow1000(), formatDate(), formatTime(), nowFormatted(), registerHelpers(), buildFooterTemplate(), buildHeaderTemplate() (+7 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (15): seedCompanies(), hashPassword(), seedFormulationVariants(), main(), seedInventory(), seedProducts(), getQuotationById(), toQuotationResponse() (+7 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (20): buildSummary(), getAccessSummary(), deleteVariant(), getVariantById(), listVariantsForProduct(), replaceComponents(), toComponentResponse(), toVariantResponse() (+12 more)

### Community 6 - "Community 6"
Cohesion: 0.15
Nodes (19): buildAuthUser(), getMeById(), issueTokens(), loginWithCredentials(), loginWithToken(), revokeRefreshToken(), rotateRefreshToken(), authenticate() (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.19
Nodes (4): getCompanyById(), toResponse(), getCompanyPricing(), upsertCompanyPricing()

### Community 8 - "Community 8"
Cohesion: 0.21
Nodes (0): 

### Community 9 - "Community 9"
Cohesion: 0.3
Nodes (10): getAIProvider(), analyzeFormulation(), buildPriceContext(), computeVariantCostPerL(), enrichComponents(), loadHistoricalVariants(), loadVariantWithComponents(), normalizeName() (+2 more)

### Community 10 - "Community 10"
Cohesion: 0.41
Nodes (10): applyRecommendations(), generateRecommendations(), money(), pct(), round2(), classifyRole(), densityFor(), isIPA() (+2 more)

### Community 11 - "Community 11"
Cohesion: 0.24
Nodes (4): getBatchByNumber(), saveCoaSnapshot(), setPaymentStatus(), toBatchResponse()

### Community 12 - "Community 12"
Cohesion: 0.31
Nodes (11): Batch Numbering (XX-YYYYMMDD-NNN atomic), Quotation Numbering (UNIK-YYYY-NNN atomic), Atomic Counter Rationale (INSERT ON CONFLICT lock-free), batchNumber.ts Utility (XX-YYYYMMDD-NNN), batch_sequences Table, quotNumber.ts Utility, quotNumber.ts Utility (UNIK-YYYY-NNN), quotation_line_items Table (+3 more)

### Community 13 - "Community 13"
Cohesion: 0.36
Nodes (7): computeStockStatus(), createItem(), getAllItems(), getItemById(), resetToDefaults(), toResponse(), updateItem()

### Community 14 - "Community 14"
Cohesion: 0.43
Nodes (4): createStaff(), getStaffById(), toResponse(), updateStaff()

### Community 15 - "Community 15"
Cohesion: 0.4
Nodes (0): 

### Community 16 - "Community 16"
Cohesion: 1.0
Nodes (2): forceStatus(), req()

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

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (1): crypto.ts Utility (bcrypt, tokens)

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (1): Feature: AI Formulation Optimizer

## Knowledge Gaps
- **35 isolated node(s):** `TypeScript`, `Supertest`, `React + Vite SPA Frontend`, `CORS Plugin (@fastify/cors)`, `Superadmin Role` (+30 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 17`** (2 nodes): `req()`, `inventory.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (2 nodes): `request()`, `auth.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (1 nodes): `drizzle.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (1 nodes): `vitest.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (1 nodes): `fastify.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (1 nodes): `salaryRecords.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (1 nodes): `products.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `staff.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `vendors.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `quotations.schema.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `crypto.ts Utility (bcrypt, tokens)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `Feature: AI Formulation Optimizer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Macro Coats API` connect `Community 0` to `Community 2`, `Community 12`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `generateRecommendations()` (e.g. with `analyzeFormulation()` and `normalizeMaterialName()`) actually correct?**
  _`generateRecommendations()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `TypeScript`, `Supertest`, `React + Vite SPA Frontend` to the rest of the system?**
  _35 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._