import { eq, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  productFormulationVariants,
  formulationVariantComponents,
  companies,
} from '../../db/schema/index.js'
import { cacheGet, cacheSet, cacheDel } from '../../plugins/redis.js'
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

function toVariantResponse(
  row: typeof productFormulationVariants.$inferSelect,
  companyDisplayName: string | null,
  components: ReturnType<typeof toComponentResponse>[],
) {
  return {
    id:                 row.id,
    productKey:         row.productKey,
    companyId:          row.companyId ?? null,
    companyDisplayName,
    variantName:        row.variantName,
    isDefault:          row.isDefault,
    coaTests:     (row.coaTests     as Record<string, unknown>[] | null) ?? null,
    tdsOverrides:  (row.tdsOverrides  as Record<string, unknown>   | null) ?? null,
    msdsOverrides: (row.msdsOverrides as Record<string, unknown>   | null) ?? null,
    createdAt:          row.createdAt.toISOString(),
    components,
  }
}

export async function listVariantsForProduct(productKey: string) {
  const cacheKey = `variants:${productKey}`
  const cached = await cacheGet<ReturnType<typeof toVariantResponse>[]>(cacheKey)
  if (cached) return cached

  const variants = await db
    .select()
    .from(productFormulationVariants)
    .where(eq(productFormulationVariants.productKey, productKey))

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
    ),
  )

  await cacheSet(cacheKey, result, 300)
  return result
}

export async function getVariantById(variantId: string) {
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

  return toVariantResponse(variant, companyDisplayName, comps.map(toComponentResponse))
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
    return toVariantResponse(variant, companyDisplayName, inserted.map(toComponentResponse))
  })
}

export async function updateVariant(variantId: string, data: UpdateVariantBody) {
  const patch: Partial<typeof productFormulationVariants.$inferInsert> = {}
  if (data.variantName !== undefined) patch.variantName = data.variantName
  if (data.isDefault   !== undefined) patch.isDefault   = data.isDefault
  if (data.coaTests     !== undefined) patch.coaTests     = data.coaTests
  if (data.tdsOverrides  !== undefined) patch.tdsOverrides  = data.tdsOverrides
  if (data.msdsOverrides !== undefined) patch.msdsOverrides = data.msdsOverrides

  if (!Object.keys(patch).length) return getVariantById(variantId)

  const [updated] = await db
    .update(productFormulationVariants)
    .set(patch)
    .where(eq(productFormulationVariants.id, variantId))
    .returning({ productKey: productFormulationVariants.productKey })

  if (updated) await cacheDel(`variants:${updated.productKey}`)

  return getVariantById(variantId)
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
