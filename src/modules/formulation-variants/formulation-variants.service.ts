import { eq, and, or, isNull, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  productFormulationVariants,
  formulationVariantComponents,
  companies,
} from '../../db/schema/index.js'
import { cacheGet, cacheSet, cacheDel } from '../../plugins/redis.js'
import { VARIANT_STATUS_TRANSITIONS, type VariantStatus } from '../optimizer/optimizer.types.js'
import type { CreateVariantBody, UpdateVariantBody, ComponentBody } from './formulation-variants.schema.js'

function toComponentResponse(row: typeof formulationVariantComponents.$inferSelect) {
  return {
    id:           row.id,
    variantId:    row.variantId,
    materialName: row.materialName,
    percentage:   row.percentage !== null ? Number(row.percentage) : null,
    unit:         row.unit,
    sortOrder:    row.sortOrder,
  }
}

/**
 * `includeInternal=true` returns the full row (components, optimizationMeta, coaTests,
 * tdsOverrides, msdsOverrides, sourceVariantId) — real formulation data.
 * `includeInternal=false` returns only the fields the frontend's VariantSelector
 * needs to render a dropdown (id/name/status/isDefault/companyDisplayName) — this
 * is what non-superadmin GET responses use, per the leak #2 fix (§7 of the plan).
 */
function toVariantResponse(
  row: typeof productFormulationVariants.$inferSelect,
  companyDisplayName: string | null,
  components: ReturnType<typeof toComponentResponse>[],
  includeInternal: boolean,
) {
  const base = {
    id:                 row.id,
    productKey:         row.productKey,
    companyId:          row.companyId ?? null,
    companyDisplayName,
    variantName:        row.variantName,
    isDefault:          row.isDefault,
    status:             row.status,
    createdAt:          row.createdAt.toISOString(),
    updatedAt:          row.updatedAt.toISOString(),
  }

  if (!includeInternal) return base

  return {
    ...base,
    sourceVariantId:    row.sourceVariantId ?? null,
    optimizationMeta:   (row.optimizationMeta as Record<string, unknown> | null) ?? null,
    coaTests:     (row.coaTests     as Record<string, unknown>[] | null) ?? null,
    tdsOverrides:  (row.tdsOverrides  as Record<string, unknown>   | null) ?? null,
    msdsOverrides: (row.msdsOverrides as Record<string, unknown>   | null) ?? null,
    components,
  }
}

function nonSuperadminScope(companyId: string | null | undefined) {
  return companyId
    ? or(isNull(productFormulationVariants.companyId), eq(productFormulationVariants.companyId, companyId))
    : isNull(productFormulationVariants.companyId)
}

export async function listVariantsForProduct(
  productKey: string,
  scope: { role?: string; companyId?: string | null } = {},
) {
  const isSuperadmin = scope.role === 'superadmin'
  const cacheKey = `variants:${productKey}`

  // Only the unscoped (superadmin) view is cached — company-scoped queries vary
  // per requester, so caching them would need a companyId-keyed cache matrix
  // for little benefit at this data volume.
  if (isSuperadmin) {
    const cached = await cacheGet<ReturnType<typeof toVariantResponse>[]>(cacheKey)
    if (cached) return cached
  }

  const conditions = [eq(productFormulationVariants.productKey, productKey)]
  if (!isSuperadmin) conditions.push(nonSuperadminScope(scope.companyId)!)

  const variants = await db
    .select()
    .from(productFormulationVariants)
    .where(and(...conditions))

  if (!variants.length) return []

  const companyIds = variants
    .map((v) => v.companyId)
    .filter((id): id is string => id !== null)

  const companyMap = new Map<string, string>()
  if (companyIds.length) {
    const cos = await db
      .select({ id: companies.id, displayName: companies.displayName })
      .from(companies)
      .where(inArray(companies.id, companyIds))
    for (const co of cos) companyMap.set(co.id, co.displayName)
  }

  // Fetch components for all variants in one query
  const variantIds = variants.map((v) => v.id)
  const allComponents = await db
    .select()
    .from(formulationVariantComponents)
    .where(inArray(formulationVariantComponents.variantId, variantIds))

  const componentsByVariant = new Map<string, ReturnType<typeof toComponentResponse>[]>()
  for (const comp of allComponents) {
    const list = componentsByVariant.get(comp.variantId) ?? []
    list.push(toComponentResponse(comp))
    componentsByVariant.set(comp.variantId, list)
  }

  const result = variants.map((v) =>
    toVariantResponse(
      v,
      v.companyId ? (companyMap.get(v.companyId) ?? null) : null,
      componentsByVariant.get(v.id) ?? [],
      isSuperadmin,
    ),
  )

  if (isSuperadmin) await cacheSet(cacheKey, result, 300)
  return result
}

/**
 * `includeInternal` defaults to `true` because most callers are either
 * superadmin-only admin routes (create/update/replace/transition) or the
 * internal server-to-server reuse from `products.service.ts` (§5 — the
 * variant-aware TDS/MSDS derivation), which always needs the raw components
 * to run its own sanitization logic regardless of the outer request's role.
 * Only the two non-superadmin-facing HTTP GET routes in *this* module pass
 * `false` explicitly. We always fetch the full row/components from the DB
 * regardless of `includeInternal` — trimming only happens in the response
 * shape — so there's a single query path here rather than two.
 */
export async function getVariantById(variantId: string, includeInternal = true) {
  const [variant] = await db
    .select()
    .from(productFormulationVariants)
    .where(eq(productFormulationVariants.id, variantId))

  if (!variant) return null

  let companyDisplayName: string | null = null
  if (variant.companyId) {
    const [co] = await db
      .select({ displayName: companies.displayName })
      .from(companies)
      .where(eq(companies.id, variant.companyId))
    companyDisplayName = co?.displayName ?? null
  }

  const comps = await db
    .select()
    .from(formulationVariantComponents)
    .where(eq(formulationVariantComponents.variantId, variantId))

  return toVariantResponse(variant, companyDisplayName, comps.map(toComponentResponse), includeInternal)
}

export async function createVariant(data: CreateVariantBody) {
  return db.transaction(async (tx) => {
    const [variant] = await tx
      .insert(productFormulationVariants)
      .values({
        productKey:  data.productKey,
        companyId:   data.companyId ?? null,
        variantName: data.variantName,
        isDefault:   data.isDefault,
        status:            (data.status ?? 'approved') as typeof productFormulationVariants.$inferInsert.status,
        sourceVariantId:   data.sourceVariantId ?? null,
        optimizationMeta:  data.optimizationMeta ?? null,
      })
      .returning()

    const componentRows = data.components.map((c, i) => ({
      variantId:    variant.id,
      materialName: c.materialName,
      percentage:   c.percentage !== null ? String(c.percentage) : null,
      unit:         c.unit as 'L' | 'Kg',
      sortOrder:    c.sortOrder ?? i,
    }))

    const inserted = await tx
      .insert(formulationVariantComponents)
      .values(componentRows)
      .returning()

    let companyDisplayName: string | null = null
    if (variant.companyId) {
      const [co] = await tx
        .select({ displayName: companies.displayName })
        .from(companies)
        .where(eq(companies.id, variant.companyId))
      companyDisplayName = co?.displayName ?? null
    }

    await cacheDel(`variants:${variant.productKey}`)
    return toVariantResponse(variant, companyDisplayName, inserted.map(toComponentResponse), true)
  })
}

export async function updateVariant(variantId: string, data: UpdateVariantBody) {
  const patch: Partial<typeof productFormulationVariants.$inferInsert> = {}
  if (data.variantName !== undefined) patch.variantName = data.variantName
  if (data.isDefault   !== undefined) patch.isDefault   = data.isDefault
  if (data.coaTests     !== undefined) patch.coaTests     = data.coaTests
  if (data.tdsOverrides  !== undefined) patch.tdsOverrides  = data.tdsOverrides
  if (data.msdsOverrides !== undefined) patch.msdsOverrides = data.msdsOverrides

  if (!Object.keys(patch).length) return getVariantById(variantId, true)

  patch.updatedAt = new Date()

  const [updated] = await db
    .update(productFormulationVariants)
    .set(patch)
    .where(eq(productFormulationVariants.id, variantId))
    .returning({ productKey: productFormulationVariants.productKey })

  if (updated) await cacheDel(`variants:${updated.productKey}`)

  return getVariantById(variantId, true)
}

/**
 * Validates and applies a variant status transition against
 * VARIANT_STATUS_TRANSITIONS (optimizer.types.ts).
 *
 * Return contract mirrors products.service.ts transitionDocumentStatus:
 * - `null` — variant not found (route → 404)
 * - `'invalid_transition'` — not allowed from the current status (route → 409)
 * - otherwise — the updated variant response
 */
export async function transitionVariantStatus(variantId: string, newStatus: VariantStatus) {
  const [existing] = await db
    .select({ status: productFormulationVariants.status, productKey: productFormulationVariants.productKey })
    .from(productFormulationVariants)
    .where(eq(productFormulationVariants.id, variantId))

  if (!existing) return null

  const allowedNextStatuses = VARIANT_STATUS_TRANSITIONS[existing.status as VariantStatus] ?? []
  if (!allowedNextStatuses.includes(newStatus)) {
    return 'invalid_transition' as const
  }

  await db
    .update(productFormulationVariants)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(productFormulationVariants.id, variantId))

  await cacheDel(`variants:${existing.productKey}`)

  return getVariantById(variantId, true)
}

export async function replaceComponents(variantId: string, components: ComponentBody[]) {
  const [v] = await db
    .select({ productKey: productFormulationVariants.productKey })
    .from(productFormulationVariants)
    .where(eq(productFormulationVariants.id, variantId))

  const result = await db.transaction(async (tx) => {
    await tx
      .delete(formulationVariantComponents)
      .where(eq(formulationVariantComponents.variantId, variantId))

    const rows = components.map((c, i) => ({
      variantId,
      materialName: c.materialName,
      percentage:   c.percentage !== null ? String(c.percentage) : null,
      unit:         c.unit as 'L' | 'Kg',
      sortOrder:    c.sortOrder ?? i,
    }))

    const inserted = await tx
      .insert(formulationVariantComponents)
      .values(rows)
      .returning()

    return inserted.map(toComponentResponse)
  })

  if (v) await cacheDel(`variants:${v.productKey}`)
  return result
}

export async function deleteVariant(variantId: string): Promise<boolean> {
  const result = await db
    .delete(productFormulationVariants)
    .where(eq(productFormulationVariants.id, variantId))
    .returning({ id: productFormulationVariants.id, productKey: productFormulationVariants.productKey })

  if (result.length > 0) await cacheDel(`variants:${result[0].productKey}`)
  return result.length > 0
}
