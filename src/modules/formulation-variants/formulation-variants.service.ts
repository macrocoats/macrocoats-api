import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  productFormulationVariants,
  formulationVariantComponents,
  companies,
} from '../../db/schema/index.js'
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
    createdAt:          row.createdAt.toISOString(),
    components,
  }
}

export async function listVariantsForProduct(productKey: string) {
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
    const allCos = await db.select({ id: companies.id, displayName: companies.displayName }).from(companies)
    for (const co of allCos) companyMap.set(co.id, co.displayName)
  }

  // Fetch components for all variants
  const componentsByVariant = new Map<string, ReturnType<typeof toComponentResponse>[]>()
  for (const variant of variants) {
    const comps = await db
      .select()
      .from(formulationVariantComponents)
      .where(eq(formulationVariantComponents.variantId, variant.id))
    componentsByVariant.set(variant.id, comps.map(toComponentResponse))
  }

  return variants.map((v) =>
    toVariantResponse(
      v,
      v.companyId ? (companyMap.get(v.companyId) ?? null) : null,
      componentsByVariant.get(v.id) ?? [],
    ),
  )
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

    return toVariantResponse(variant, companyDisplayName, inserted.map(toComponentResponse))
  })
}

export async function updateVariant(variantId: string, data: UpdateVariantBody) {
  const patch: Partial<typeof productFormulationVariants.$inferInsert> = {}
  if (data.variantName !== undefined) patch.variantName = data.variantName
  if (data.isDefault   !== undefined) patch.isDefault   = data.isDefault

  if (!Object.keys(patch).length) return getVariantById(variantId)

  await db
    .update(productFormulationVariants)
    .set(patch)
    .where(eq(productFormulationVariants.id, variantId))

  return getVariantById(variantId)
}

export async function replaceComponents(variantId: string, components: ComponentBody[]) {
  return db.transaction(async (tx) => {
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
}

export async function deleteVariant(variantId: string): Promise<boolean> {
  const result = await db
    .delete(productFormulationVariants)
    .where(eq(productFormulationVariants.id, variantId))
    .returning({ id: productFormulationVariants.id })

  return result.length > 0
}
