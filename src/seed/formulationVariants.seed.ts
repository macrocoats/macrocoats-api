import { eq, and, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  companies,
  products,
  productFormulationVariants,
  formulationVariantComponents,
} from '../db/schema/index.js'

/**
 * Seeds a default UNIROLS formulation variant for UNIKOAT LT 700.
 * Components are placeholder rows — update via the admin UI with real values.
 * Safe to re-run: skips if the variant already exists.
 */
const UNIROLS_COMPONENTS = [
  { materialName: 'Zinc Phosphate',        percentage: 3.5,  unit: 'Kg' as const },
  { materialName: 'Phosphoric Acid',        percentage: 5.0,  unit: 'L'  as const },
  { materialName: 'Manganese Dioxide',      percentage: 1.5,  unit: 'Kg' as const },
  { materialName: 'Sodium Nitrite',         percentage: 0.5,  unit: 'Kg' as const },
  { materialName: 'Nickel Sulphate',        percentage: 0.3,  unit: 'Kg' as const },
  { materialName: 'Fluoride Compound',      percentage: 0.2,  unit: 'Kg' as const },
  { materialName: 'Wetting Agent',          percentage: 0.5,  unit: 'L'  as const },
  { materialName: 'Water',                  percentage: null, unit: 'L'  as const },  // auto-calculated
]

export async function seedFormulationVariants() {
  console.log('🌱 Seeding formulation variants...')

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.key, 'unikoat-lt-700'))

  if (!product) {
    console.warn('   ⚠️  Product unikoat-lt-700 not found — skipping formulation variant seed')
    return
  }

  // Try to find UNIROLS by key or by partial display name match
  const allCompanies = await db.select().from(companies)
  const unirols = allCompanies.find(
    (c) => c.key === 'unirols' || c.displayName.toLowerCase().includes('unirols'),
  )

  if (!unirols) {
    console.warn('   ⚠️  Company "unirols" not found in DB — skipping variant seed.')
    console.warn('       Create the UNIROLS company first, then re-run the seed or use the admin UI.')
    return
  }

  // Check if variant already exists
  const [existing] = await db
    .select()
    .from(productFormulationVariants)
    .where(
      and(
        eq(productFormulationVariants.productKey, 'unikoat-lt-700'),
        eq(productFormulationVariants.companyId, unirols.id),
      ),
    )

  if (existing) {
    console.log(`   ↩️  Formulation variant for UNIROLS × UNIKOAT LT 700 already exists (id: ${existing.id})`)
    return
  }

  const [variant] = await db
    .insert(productFormulationVariants)
    .values({
      productKey:  'unikoat-lt-700',
      companyId:   unirols.id,
      variantName: 'UNIROLS Standard',
      isDefault:   false,
    })
    .returning()

  await db.insert(formulationVariantComponents).values(
    UNIROLS_COMPONENTS.map((c, i) => ({
      variantId:    variant.id,
      materialName: c.materialName,
      percentage:   c.percentage !== null ? String(c.percentage) : null,
      unit:         c.unit,
      sortOrder:    i,
    })),
  )

  console.log(`   ✅ Created UNIROLS Standard variant for UNIKOAT LT 700 (id: ${variant.id})`)
  console.log('   ℹ️  Placeholder components inserted — update via /formulation-variants admin UI')
}
