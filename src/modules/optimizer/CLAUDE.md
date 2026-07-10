# CLAUDE.md — optimizer module

AI Formulation Optimizer: `POST /optimizer/analyze` (superadmin-only) takes a product/variant's component list plus optimization goals, enriches components with inventory prices, and returns recommendations + financial impact. This module deviates from the standard 3-file pattern — it adds `optimizer.types.ts` and an `ai/` sub-directory.

---

## Structure

```
optimizer.routes.ts     POST /optimizer/analyze
optimizer.service.ts    Enrichment + orchestration: matches components to inventory, calls the AI provider, computes financial impact
optimizer.schema.ts     Zod request validation
optimizer.types.ts      Shared types + the VARIANT_STATUS_TRANSITIONS state machine (see below)
ai/
  index.ts              getAIProvider(name?) — provider selection, VALID_AI_PROVIDERS, AIProviderName
  heuristic.provider.ts Default/fallback provider — rule-based, no external LLM call
  knowledge.ts           Domain knowledge used by the heuristic provider (material properties, goal weighting, etc.)
```

## Cross-module exception

`optimizer.types.ts` exports `VARIANT_STATUS_TRANSITIONS` (and `VariantStatus`, `USABLE_VARIANT_STATUSES`), which the **`formulation-variants`** module imports and uses as the authoritative approval state machine for `product_formulation_variants.status`. This is a deliberate, single exception to "routes never import from another module's service" (see root `CLAUDE.md` §2) — it's a type/constant import, not a service call, and it exists because the optimizer is the entry point that creates variants in the `ai_suggested` state. Do not add further cross-module imports without the same justification; if you need to add one, prefer moving the shared type to `src/types/` instead of reaching into another module.

## Conventions

- Inventory price matching is name-normalized (`'LAE 9'` ≡ `'LAE-9'`) before enrichment — see `optimizer.service.ts`. If you add a new raw material naming convention, extend the normalization there, not in the AI provider.
- `getAIProvider()` defaults to `'heuristic'` — adding a new provider means adding a file alongside `heuristic.provider.ts` implementing the `AIProvider` interface (`optimizer.types.ts`) and registering it in `ai/index.ts`'s `VALID_AI_PROVIDERS`.
- Variants saved from the optimizer always start at `ai_suggested` status and must be promoted through the normal `formulation-variants` approval workflow — the optimizer module itself never writes `product_formulation_variants` rows directly.
