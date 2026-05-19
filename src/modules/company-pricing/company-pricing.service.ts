import { eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { companyProductPrices } from '../../db/schema/index.js'
import type { UpsertPricingBody } from './company-pricing.schema.js'

export async function getCompanyPricing(companyId: string) {
  const rows = await db
    .select()
    .from(companyProductPrices)
    .where(eq(companyProductPrices.companyId, companyId))

  return rows.map((r) => ({
    productKey:    r.productKey,
    pricePerLitre: parseFloat(r.pricePerLitre),
    updatedAt:     r.updatedAt.toISOString(),
  }))
}

export async function upsertCompanyPricing(companyId: string, data: UpsertPricingBody) {
  if (!data.prices.length) return []

  await db
    .insert(companyProductPrices)
    .values(
      data.prices.map((p) => ({
        companyId,
        productKey:    p.productKey,
        pricePerLitre: p.pricePerLitre.toFixed(2),
        updatedAt:     new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: [companyProductPrices.companyId, companyProductPrices.productKey],
      set: {
        pricePerLitre: sql`EXCLUDED.price_per_litre`,
        updatedAt:     sql`NOW()`,
      },
    })

  return getCompanyPricing(companyId)
}
