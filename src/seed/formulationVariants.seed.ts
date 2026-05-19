import { eq, and } from 'drizzle-orm'
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

const COA_TESTS_PEG_GLYCOL = [
  { parameter: 'Appearance',               method: 'Visual',              specification: 'Clear, colourless to pale liquid', result: '', status: 'Pass' },
  { parameter: 'pH (neat, 25 °C)',         method: 'pH Electrode',        specification: '7.0 – 9.0',                        result: '', status: 'Pass' },
  { parameter: 'Flash Point',              method: 'Pensky-Martens (PM)', specification: '> 100 °C',                         result: '', status: 'Pass' },
  { parameter: 'Specific Gravity (25 °C)', method: 'ISO 2811',            specification: '1.00 – 1.04',                      result: '', status: 'Pass' },
  { parameter: 'Evaporation Residue',      method: 'ASTM D2369',          specification: '0.5 – 2.0 %',                      result: '', status: 'Pass' },
  { parameter: 'Dry Time (ambient)',       method: 'Cotton Wipe Method',  specification: '60 – 180 s',                       result: '', status: 'Pass' },
  { parameter: 'Aluminium Compatibility',  method: 'Coupon test (24 h)',  specification: 'No staining, no etching',          result: '', status: 'Pass' },
]

const COA_TESTS_ALCOHOL_PRECISION = [
  { parameter: 'Appearance',               method: 'Visual',              specification: 'Clear, colourless liquid',          result: '', status: 'Pass' },
  { parameter: 'pH (neat, 25 °C)',         method: 'pH Electrode',        specification: '7.0 – 9.0',                        result: '', status: 'Pass' },
  { parameter: 'Flash Point',              method: 'Pensky-Martens (PM)', specification: '38 – 50 °C',                       result: '', status: 'Pass' },
  { parameter: 'Specific Gravity (25 °C)', method: 'ISO 2811',            specification: '0.94 – 0.97',                      result: '', status: 'Pass' },
  { parameter: 'Evaporation Residue',      method: 'ASTM D2369',          specification: '≤ 0.01 %',                         result: '', status: 'Pass' },
  { parameter: 'Dry Time (ambient)',       method: 'Cotton Wipe Method',  specification: '20 – 60 s',                        result: '', status: 'Pass' },
  { parameter: 'Aluminium Compatibility',  method: 'Coupon test (24 h)',  specification: 'No staining, no etching',          result: '', status: 'Pass' },
]

const COA_TESTS_HIGH_IPA = [
  { parameter: 'Appearance',               method: 'Visual',              specification: 'Clear, colourless liquid',          result: '', status: 'Pass' },
  { parameter: 'pH (neat, 25 °C)',         method: 'pH Electrode',        specification: '7.0 – 9.0',                        result: '', status: 'Pass' },
  { parameter: 'Flash Point',             method: 'Pensky-Martens (PM)',  specification: '26 – 38 °C',                       result: '', status: 'Pass' },
  { parameter: 'Specific Gravity (25 °C)', method: 'ISO 2811',            specification: '0.90 – 0.94',                      result: '', status: 'Pass' },
  { parameter: 'Evaporation Residue',      method: 'ASTM D2369',          specification: '≤ 0.001 %',                        result: '', status: 'Pass' },
  { parameter: 'Dry Time (ambient)',       method: 'Cotton Wipe Method',  specification: '15 – 40 s',                        result: '', status: 'Pass' },
  { parameter: 'Aluminium Compatibility',  method: 'Coupon test (24 h)',  specification: 'No staining, no etching',          result: '', status: 'Pass' },
]

/**
 * PEG Glycol Variant for UNICool AL.
 * Reference batch: 18.537 L.  Percentages derived from absolute quantities:
 *   Water 17.9 L | TEA 90 mL | Propylene Glycol 350 mL | PEG 400 70 mL
 *   LAE-9 80 mL | Sodium Gluconate 45 g | Non-silicone Defoamer 2 g
 * Units stored as L (liquids) and Kg (solids); fmtQty auto-converts to mL/g on display.
 */

/**
 * Alcohol Precision Variant for UNICool AL.
 * Percentage-based formulation; Water is auto-calculated (~84.98%).
 * LAE-9 and Ammonium Hydroxide stored as L; fmtQty shows them as mL at typical batch sizes.
 * Ammonium Hydroxide is specified at 0.001% but stored as 0.01% (DB precision limit: numeric(5,2)).
 */
const PEG_GLYCOL_COMPONENTS = [
  { materialName: 'Water',                  percentage: null, unit: 'L'  as const },  // auto-calc ~96.56%
  { materialName: 'TEA',                    percentage: 0.49, unit: 'L'  as const },  // 90 mL / 18.537 L
  { materialName: 'Propylene Glycol',       percentage: 1.89, unit: 'L'  as const },  // 350 mL
  { materialName: 'PEG 400',               percentage: 0.38, unit: 'L'  as const },  // 70 mL
  { materialName: 'LAE-9',                 percentage: 0.43, unit: 'L'  as const },  // 80 mL
  { materialName: 'Sodium Gluconate',      percentage: 0.24, unit: 'Kg' as const },  // 45 g
  { materialName: 'Non-silicone Defoamer', percentage: 0.01, unit: 'Kg' as const },  // 2 g
]

const ALCOHOL_PRECISION_COMPONENTS = [
  { materialName: 'Water',               percentage: null, unit: 'L' as const },  // auto-calc ~84.98%
  { materialName: 'IPA',                 percentage: 5.00, unit: 'L' as const },
  { materialName: 'Ethanol',             percentage: 10.00, unit: 'L' as const },
  { materialName: 'LAE-9',              percentage: 0.01, unit: 'L' as const },  // ~10 mL per 100 L
  { materialName: 'Ammonium Hydroxide', percentage: 0.01, unit: 'L' as const },  // 0.001% specified; stored as 0.01% (numeric(5,2) min)
]

/**
 * High IPA Variant for UNICool AL.
 * Percentage-based; Water is auto-calculated (~79.96%).
 * IPA at 20% gives fast-drying, high-purity cleaning action.
 * LAE-9 and Ammonium Hydroxide at 0.01% L each (~10 mL per 100 L batch).
 */
const HIGH_IPA_COMPONENTS = [
  { materialName: 'Water',               percentage: null,  unit: 'L' as const },  // auto-calc ~79.96%
  { materialName: 'IPA',                 percentage: 20.00, unit: 'L' as const },
  { materialName: 'LAE-9',              percentage: 0.01,  unit: 'L' as const },  // ~20 mL per 100 L
  { materialName: 'Ammonium Hydroxide', percentage: 0.01,  unit: 'L' as const },  // ~20 mL per 100 L
]

export async function seedFormulationVariants() {
  console.log('🌱 Seeding formulation variants...')

  // ── UNIKOAT LT 700 — UNIROLS Standard ────────────────────────────────────
  const [lt700Product] = await db
    .select()
    .from(products)
    .where(eq(products.key, 'unikoat-lt-700'))

  if (!lt700Product) {
    console.warn('   ⚠️  Product unikoat-lt-700 not found — skipping UNIROLS variant seed')
  } else {
    const allCompanies = await db.select().from(companies)
    const unirols = allCompanies.find(
      (c) => c.key === 'unirols' || c.displayName.toLowerCase().includes('unirols'),
    )

    if (!unirols) {
      console.warn('   ⚠️  Company "unirols" not found — skipping UNIROLS Standard variant.')
      console.warn('       Create the UNIROLS company first, then re-run the seed or use the admin UI.')
    } else {
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
        console.log(`   ↩️  UNIROLS Standard variant for UNIKOAT LT 700 already exists (id: ${existing.id})`)
      } else {
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
    }
  }

  // ── UNICool AL — PEG Glycol Variant ──────────────────────────────────────
  const [unicoolProduct] = await db
    .select()
    .from(products)
    .where(eq(products.key, 'unicool-al'))

  if (!unicoolProduct) {
    console.warn('   ⚠️  Product unicool-al not found — skipping PEG Glycol Variant seed')
    return
  }

  const [existingPEG] = await db
    .select()
    .from(productFormulationVariants)
    .where(
      and(
        eq(productFormulationVariants.productKey, 'unicool-al'),
        eq(productFormulationVariants.variantName, 'PEG Glycol Variant'),
      ),
    )

  if (existingPEG) {
    console.log(`   ↩️  PEG Glycol Variant for UNICool AL already exists (id: ${existingPEG.id})`)
    if (!existingPEG.coaTests) {
      await db
        .update(productFormulationVariants)
        .set({ coaTests: COA_TESTS_PEG_GLYCOL })
        .where(eq(productFormulationVariants.id, existingPEG.id))
      console.log('   ✅ Backfilled coaTests for PEG Glycol Variant')
    }
  } else {
    const [pegVariant] = await db
      .insert(productFormulationVariants)
      .values({
        productKey:  'unicool-al',
        companyId:   null,
        variantName: 'PEG Glycol Variant',
        isDefault:   true,
        coaTests:    COA_TESTS_PEG_GLYCOL,
      })
      .returning()

    await db.insert(formulationVariantComponents).values(
      PEG_GLYCOL_COMPONENTS.map((c, i) => ({
        variantId:    pegVariant.id,
        materialName: c.materialName,
        percentage:   c.percentage !== null ? String(c.percentage) : null,
        unit:         c.unit,
        sortOrder:    i,
      })),
    )

    console.log(`   ✅ Created PEG Glycol Variant for UNICool AL (id: ${pegVariant.id})`)
  }

  // ── UNICool AL — Alcohol Precision Variant ────────────────────────────────
  const [existingAlcohol] = await db
    .select()
    .from(productFormulationVariants)
    .where(
      and(
        eq(productFormulationVariants.productKey, 'unicool-al'),
        eq(productFormulationVariants.variantName, 'Alcohol Precision Variant'),
      ),
    )

  if (existingAlcohol) {
    console.log(`   ↩️  Alcohol Precision Variant for UNICool AL already exists (id: ${existingAlcohol.id})`)
    if (!existingAlcohol.coaTests) {
      await db
        .update(productFormulationVariants)
        .set({ coaTests: COA_TESTS_ALCOHOL_PRECISION })
        .where(eq(productFormulationVariants.id, existingAlcohol.id))
      console.log('   ✅ Backfilled coaTests for Alcohol Precision Variant')
    }
  } else {
    const [alcoholVariant] = await db
      .insert(productFormulationVariants)
      .values({
        productKey:  'unicool-al',
        companyId:   null,
        variantName: 'Alcohol Precision Variant',
        isDefault:   false,
        coaTests:    COA_TESTS_ALCOHOL_PRECISION,
      })
      .returning()

    await db.insert(formulationVariantComponents).values(
      ALCOHOL_PRECISION_COMPONENTS.map((c, i) => ({
        variantId:    alcoholVariant.id,
        materialName: c.materialName,
        percentage:   c.percentage !== null ? String(c.percentage) : null,
        unit:         c.unit,
        sortOrder:    i,
      })),
    )

    console.log(`   ✅ Created Alcohol Precision Variant for UNICool AL (id: ${alcoholVariant.id})`)
  }

  // ── UNICool AL — High IPA Variant ────────────────────────────────────────
  const [existingHighIPA] = await db
    .select()
    .from(productFormulationVariants)
    .where(
      and(
        eq(productFormulationVariants.productKey, 'unicool-al'),
        eq(productFormulationVariants.variantName, 'High IPA Variant'),
      ),
    )

  if (existingHighIPA) {
    console.log(`   ↩️  High IPA Variant for UNICool AL already exists (id: ${existingHighIPA.id})`)
    if (!existingHighIPA.coaTests) {
      await db
        .update(productFormulationVariants)
        .set({ coaTests: COA_TESTS_HIGH_IPA })
        .where(eq(productFormulationVariants.id, existingHighIPA.id))
      console.log('   ✅ Backfilled coaTests for High IPA Variant')
    }
  } else {
    const [highIPAVariant] = await db
      .insert(productFormulationVariants)
      .values({
        productKey:  'unicool-al',
        companyId:   null,
        variantName: 'High IPA Variant',
        isDefault:   false,
        coaTests:    COA_TESTS_HIGH_IPA,
      })
      .returning()

    await db.insert(formulationVariantComponents).values(
      HIGH_IPA_COMPONENTS.map((c, i) => ({
        variantId:    highIPAVariant.id,
        materialName: c.materialName,
        percentage:   c.percentage !== null ? String(c.percentage) : null,
        unit:         c.unit,
        sortOrder:    i,
      })),
    )

    console.log(`   ✅ Created High IPA Variant for UNICool AL (id: ${highIPAVariant.id})`)
  }
}
