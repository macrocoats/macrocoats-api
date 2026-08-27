import { and, desc, eq, ilike, inArray, ne } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  companyFormulaAssignments,
  companyProductAccess,
  productFormulationVariants,
  formulationVariantComponents,
  companies,
} from '../../db/schema/index.js'
import { cacheGet, cacheSet, cacheDel } from '../../plugins/redis.js'
import { VARIANT_STATUS_TRANSITIONS, type VariantStatus } from '../optimizer/optimizer.types.js'
import type { CreateVariantBody, UpdateVariantBody, ComponentBody, ListVariantsQuery } from './formulation-variants.schema.js'

type AssignmentSummary = {
  assignmentId: string
  companyId: string
  companyDisplayName: string
  isDefaultForCompany: boolean
  assignedAt: string
}

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
  assignedCompanies: AssignmentSummary[] = [],
) {
  const base = {
    id:                 row.id,
    productKey:         row.productKey,
    companyId:          row.companyId ?? null,
    companyDisplayName: companyDisplayName ?? (assignedCompanies.length === 1 ? assignedCompanies[0].companyDisplayName : null),
    assignedCompanies,
    assignedCompanyCount: assignedCompanies.length,
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

async function getAssignmentsByVariantIds(variantIds: string[], scopeCompanyId?: string | null) {
  const assignmentMap = new Map<string, AssignmentSummary[]>()
  if (!variantIds.length) return assignmentMap

  const conditions = [inArray(companyFormulaAssignments.variantId, variantIds)]
  if (scopeCompanyId) conditions.push(eq(companyFormulaAssignments.companyId, scopeCompanyId))

  const rows = await db
    .select({
      variantId:            companyFormulaAssignments.variantId,
      assignmentId:         companyFormulaAssignments.id,
      companyId:            companyFormulaAssignments.companyId,
      companyDisplayName:   companies.displayName,
      isDefaultForCompany:  companyFormulaAssignments.isDefaultForCompany,
      assignedAt:           companyFormulaAssignments.assignedAt,
    })
    .from(companyFormulaAssignments)
    .innerJoin(companies, eq(companies.id, companyFormulaAssignments.companyId))
    .where(and(...conditions))

  for (const row of rows) {
    const list = assignmentMap.get(row.variantId) ?? []
    list.push({
      assignmentId: row.assignmentId,
      companyId: row.companyId,
      companyDisplayName: row.companyDisplayName,
      isDefaultForCompany: row.isDefaultForCompany,
      assignedAt: row.assignedAt.toISOString(),
    })
    assignmentMap.set(row.variantId, list)
  }
  return assignmentMap
}

async function getLegacyCompanyDisplayMap(variants: typeof productFormulationVariants.$inferSelect[]) {
  const companyIds = variants
    .map((v) => v.companyId)
    .filter((id): id is string => id !== null)

  const companyMap = new Map<string, string>()
  if (!companyIds.length) return companyMap

  const rows = await db
    .select({ id: companies.id, displayName: companies.displayName })
    .from(companies)
    .where(inArray(companies.id, companyIds))

  for (const row of rows) companyMap.set(row.id, row.displayName)
  return companyMap
}

async function getComponentsByVariantIds(variantIds: string[]) {
  const componentsByVariant = new Map<string, ReturnType<typeof toComponentResponse>[]>()
  if (!variantIds.length) return componentsByVariant

  const allComponents = await db
    .select()
    .from(formulationVariantComponents)
    .where(inArray(formulationVariantComponents.variantId, variantIds))

  for (const comp of allComponents) {
    const list = componentsByVariant.get(comp.variantId) ?? []
    list.push(toComponentResponse(comp))
    componentsByVariant.set(comp.variantId, list)
  }
  return componentsByVariant
}

export async function listVariantsForProduct(
  productKey: string,
  scope: { role?: string; companyId?: string | null } = {},
) {
  return listFormulaLibrary({ productKey }, scope)
}

export async function listFormulaLibrary(
  query: ListVariantsQuery = {},
  scope: { role?: string; companyId?: string | null } = {},
) {
  const isSuperadmin = scope.role === 'superadmin'
  const scopedCompanyId = !isSuperadmin ? scope.companyId : query.companyId

  // Only the unscoped (superadmin) view is cached — company-scoped queries vary
  // per requester, so caching them would need a companyId-keyed cache matrix
  // for little benefit at this data volume.
  if (isSuperadmin && query.productKey && !query.companyId && !query.status && !query.q) {
    const cacheKey = `variants:${query.productKey}`
    const cached = await cacheGet<ReturnType<typeof toVariantResponse>[]>(cacheKey)
    if (cached) return cached
  }

  const conditions: SQL[] = []
  if (query.productKey) conditions.push(eq(productFormulationVariants.productKey, query.productKey))
  if (query.status) conditions.push(eq(productFormulationVariants.status, query.status as VariantStatus))
  if (query.q) conditions.push(ilike(productFormulationVariants.variantName, `%${query.q}%`))

  let variants: typeof productFormulationVariants.$inferSelect[]
  if (isSuperadmin && scopedCompanyId) {
    const rows = await db
      .select({ variant: productFormulationVariants })
      .from(productFormulationVariants)
      .innerJoin(companyFormulaAssignments, eq(companyFormulaAssignments.variantId, productFormulationVariants.id))
      .where(and(eq(companyFormulaAssignments.companyId, scopedCompanyId), ...conditions))
      .orderBy(desc(productFormulationVariants.updatedAt))
    variants = rows.map((r) => r.variant)
  } else if (isSuperadmin) {
    const q = db
      .select()
      .from(productFormulationVariants)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(productFormulationVariants.updatedAt))
    variants = await q
  } else {
    if (!scopedCompanyId) return []
    const rows = await db
      .select({ variant: productFormulationVariants })
      .from(productFormulationVariants)
      .innerJoin(companyFormulaAssignments, eq(companyFormulaAssignments.variantId, productFormulationVariants.id))
      .where(and(eq(companyFormulaAssignments.companyId, scopedCompanyId), ...conditions))
      .orderBy(desc(productFormulationVariants.updatedAt))
    variants = rows.map((r) => r.variant)
  }

  if (!variants.length) return []

  const variantIds = variants.map((v) => v.id)
  const assignmentsByVariant = await getAssignmentsByVariantIds(variantIds, isSuperadmin ? query.companyId : scopedCompanyId)
  const companyMap = await getLegacyCompanyDisplayMap(variants)
  const componentsByVariant = isSuperadmin ? await getComponentsByVariantIds(variantIds) : new Map()

  const result = variants.map((v) =>
    toVariantResponse(
      v,
      v.companyId ? (companyMap.get(v.companyId) ?? null) : null,
      componentsByVariant.get(v.id) ?? [],
      isSuperadmin,
      assignmentsByVariant.get(v.id) ?? [],
    ),
  )

  if (isSuperadmin && query.productKey && !query.companyId && !query.status && !query.q) {
    await cacheSet(`variants:${query.productKey}`, result, 300)
  }
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

  const assignments = await getAssignmentsByVariantIds([variantId])
  return toVariantResponse(variant, companyDisplayName, comps.map(toComponentResponse), includeInternal, assignments.get(variantId) ?? [])
}

export async function createVariant(data: CreateVariantBody) {
  return db.transaction(async (tx) => {
    const assignedCompanyIds = Array.from(new Set([
      ...(data.assignedCompanyIds ?? []),
      ...(data.companyId ? [data.companyId] : []),
    ]))

    const [variant] = await tx
      .insert(productFormulationVariants)
      .values({
        productKey:  data.productKey,
        companyId:   null,
        variantName: data.variantName,
        isDefault:   data.isDefault,
        status:            (data.status ?? 'approved') as typeof productFormulationVariants.$inferInsert.status,
        sourceVariantId:   data.sourceVariantId ?? null,
        optimizationMeta:  data.optimizationMeta ?? null,
      })
      .returning()

    if (assignedCompanyIds.length) {
      await tx.insert(companyFormulaAssignments).values(
        assignedCompanyIds.map((companyId) => ({
          companyId,
          variantId: variant.id,
          productKey: variant.productKey,
          isDefaultForCompany: Boolean(data.companyId && companyId === data.companyId && data.isDefault),
        })),
      ).onConflictDoNothing()

      await tx.insert(companyProductAccess).values(
        assignedCompanyIds.map((companyId) => ({ companyId, productKey: variant.productKey })),
      ).onConflictDoNothing()
    }

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
    const assignmentSummaries: AssignmentSummary[] = []
    if (assignedCompanyIds.length) {
      const rows = await tx
        .select({
          assignmentId: companyFormulaAssignments.id,
          companyId: companyFormulaAssignments.companyId,
          companyDisplayName: companies.displayName,
          isDefaultForCompany: companyFormulaAssignments.isDefaultForCompany,
          assignedAt: companyFormulaAssignments.assignedAt,
        })
        .from(companyFormulaAssignments)
        .innerJoin(companies, eq(companies.id, companyFormulaAssignments.companyId))
        .where(eq(companyFormulaAssignments.variantId, variant.id))

      assignmentSummaries.push(...rows.map((row) => ({
        assignmentId: row.assignmentId,
        companyId: row.companyId,
        companyDisplayName: row.companyDisplayName,
        isDefaultForCompany: row.isDefaultForCompany,
        assignedAt: row.assignedAt.toISOString(),
      })))
    }

    return toVariantResponse(variant, companyDisplayName, inserted.map(toComponentResponse), true, assignmentSummaries)
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

export async function deleteVariant(variantId: string): Promise<boolean | 'assigned' | 'protected_status'> {
  const [existing] = await db
    .select({
      id: productFormulationVariants.id,
      productKey: productFormulationVariants.productKey,
      status: productFormulationVariants.status,
    })
    .from(productFormulationVariants)
    .where(eq(productFormulationVariants.id, variantId))

  if (!existing) return false
  if (existing.status === 'production') return 'protected_status'

  const assigned = await db
    .select({ id: companyFormulaAssignments.id })
    .from(companyFormulaAssignments)
    .where(eq(companyFormulaAssignments.variantId, variantId))

  if (assigned.length) return 'assigned'

  const result = await db
    .delete(productFormulationVariants)
    .where(eq(productFormulationVariants.id, variantId))
    .returning({ id: productFormulationVariants.id, productKey: productFormulationVariants.productKey })

  if (result.length > 0) await cacheDel(`variants:${existing.productKey}`)
  return result.length > 0
}

export async function isFormulaAssignedToCompany(variantId: string, companyId: string) {
  const rows = await db
    .select({ id: companyFormulaAssignments.id })
    .from(companyFormulaAssignments)
    .where(and(
      eq(companyFormulaAssignments.variantId, variantId),
      eq(companyFormulaAssignments.companyId, companyId),
    ))
  return rows.length > 0
}

async function getAssignmentResponse(assignmentId: string) {
  const rows = await db
    .select({
      assignmentId: companyFormulaAssignments.id,
      companyId: companyFormulaAssignments.companyId,
      productKey: companyFormulaAssignments.productKey,
      variantId: productFormulationVariants.id,
      variantName: productFormulationVariants.variantName,
      status: productFormulationVariants.status,
      isDefault: productFormulationVariants.isDefault,
      isDefaultForCompany: companyFormulaAssignments.isDefaultForCompany,
      assignedAt: companyFormulaAssignments.assignedAt,
      companyDisplayName: companies.displayName,
    })
    .from(companyFormulaAssignments)
    .innerJoin(productFormulationVariants, eq(productFormulationVariants.id, companyFormulaAssignments.variantId))
    .innerJoin(companies, eq(companies.id, companyFormulaAssignments.companyId))
    .where(eq(companyFormulaAssignments.id, assignmentId))

  const row = rows[0]
  if (!row) return null
  return { ...row, assignedAt: row.assignedAt.toISOString() }
}

export async function listCompanyFormulaAssignments(companyId: string) {
  const rows = await db
    .select({
      assignmentId: companyFormulaAssignments.id,
      companyId: companyFormulaAssignments.companyId,
      productKey: companyFormulaAssignments.productKey,
      variantId: productFormulationVariants.id,
      variantName: productFormulationVariants.variantName,
      status: productFormulationVariants.status,
      isDefault: productFormulationVariants.isDefault,
      isDefaultForCompany: companyFormulaAssignments.isDefaultForCompany,
      assignedAt: companyFormulaAssignments.assignedAt,
      companyDisplayName: companies.displayName,
    })
    .from(companyFormulaAssignments)
    .innerJoin(productFormulationVariants, eq(productFormulationVariants.id, companyFormulaAssignments.variantId))
    .innerJoin(companies, eq(companies.id, companyFormulaAssignments.companyId))
    .where(eq(companyFormulaAssignments.companyId, companyId))
    .orderBy(desc(companyFormulaAssignments.assignedAt))

  return rows.map((row) => ({ ...row, assignedAt: row.assignedAt.toISOString() }))
}

export async function assignFormulaToCompany(
  companyId: string,
  variantId: string,
  isDefaultForCompany: boolean,
  assignedBy?: string,
) {
  const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId))
  if (!company) return null

  const [variant] = await db
    .select({ id: productFormulationVariants.id, productKey: productFormulationVariants.productKey })
    .from(productFormulationVariants)
    .where(eq(productFormulationVariants.id, variantId))
  if (!variant) return null

  const [existing] = await db
    .select({ id: companyFormulaAssignments.id })
    .from(companyFormulaAssignments)
    .where(and(
      eq(companyFormulaAssignments.companyId, companyId),
      eq(companyFormulaAssignments.variantId, variantId),
    ))

  if (isDefaultForCompany) {
    const defaultConditions: SQL[] = [
      eq(companyFormulaAssignments.companyId, companyId),
      eq(companyFormulaAssignments.productKey, variant.productKey),
      eq(companyFormulaAssignments.isDefaultForCompany, true),
    ]
    if (existing) defaultConditions.push(ne(companyFormulaAssignments.id, existing.id))

    const [defaultAssignment] = await db
      .select({ id: companyFormulaAssignments.id })
      .from(companyFormulaAssignments)
      .where(and(...defaultConditions))
    if (defaultAssignment) return 'default_exists' as const
  }

  const assignmentId = await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(companyFormulaAssignments)
        .set({ isDefaultForCompany })
        .where(eq(companyFormulaAssignments.id, existing.id))
      await tx
        .insert(companyProductAccess)
        .values({ companyId, productKey: variant.productKey })
        .onConflictDoNothing()
      return existing.id
    }

    const [created] = await tx
      .insert(companyFormulaAssignments)
      .values({
        companyId,
        variantId,
        productKey: variant.productKey,
        isDefaultForCompany,
        assignedBy,
      })
      .returning({ id: companyFormulaAssignments.id })

    await tx
      .insert(companyProductAccess)
      .values({ companyId, productKey: variant.productKey })
      .onConflictDoNothing()

    return created.id
  })

  await cacheDel(`variants:${variant.productKey}`)
  return getAssignmentResponse(assignmentId)
}

export async function updateCompanyFormulaAssignment(assignmentId: string, isDefaultForCompany: boolean) {
  const [assignment] = await db
    .select({
      id: companyFormulaAssignments.id,
      companyId: companyFormulaAssignments.companyId,
      productKey: companyFormulaAssignments.productKey,
    })
    .from(companyFormulaAssignments)
    .where(eq(companyFormulaAssignments.id, assignmentId))

  if (!assignment) return null

  await db.transaction(async (tx) => {
    if (isDefaultForCompany) {
      await tx
        .update(companyFormulaAssignments)
        .set({ isDefaultForCompany: false })
        .where(and(
          eq(companyFormulaAssignments.companyId, assignment.companyId),
          eq(companyFormulaAssignments.productKey, assignment.productKey),
          ne(companyFormulaAssignments.id, assignment.id),
        ))
    }

    await tx
      .update(companyFormulaAssignments)
      .set({ isDefaultForCompany })
      .where(eq(companyFormulaAssignments.id, assignment.id))
  })

  await cacheDel(`variants:${assignment.productKey}`)
  return getAssignmentResponse(assignment.id)
}

export async function unassignFormulaFromCompany(companyId: string, assignmentId: string) {
  const [assignment] = await db
    .select({
      id: companyFormulaAssignments.id,
      companyId: companyFormulaAssignments.companyId,
      productKey: companyFormulaAssignments.productKey,
    })
    .from(companyFormulaAssignments)
    .where(and(
      eq(companyFormulaAssignments.id, assignmentId),
      eq(companyFormulaAssignments.companyId, companyId),
    ))

  if (!assignment) return null

  const removedProductAccess = await db.transaction(async (tx) => {
    await tx
      .delete(companyFormulaAssignments)
      .where(eq(companyFormulaAssignments.id, assignment.id))

    const remaining = await tx
      .select({ id: companyFormulaAssignments.id })
      .from(companyFormulaAssignments)
      .where(and(
        eq(companyFormulaAssignments.companyId, companyId),
        eq(companyFormulaAssignments.productKey, assignment.productKey),
      ))

    if (!remaining.length) {
      await tx
        .delete(companyProductAccess)
        .where(and(
          eq(companyProductAccess.companyId, companyId),
          eq(companyProductAccess.productKey, assignment.productKey),
        ))
      return true
    }
    return false
  })

  await cacheDel(`variants:${assignment.productKey}`)
  return { deleted: true, removedProductAccess, productKey: assignment.productKey }
}
