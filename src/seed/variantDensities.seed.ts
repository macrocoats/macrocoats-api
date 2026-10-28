import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  productDocuments,
  productFormulationVariants,
  formulationVariantComponents,
} from '../db/schema/index.js'

/**
 * Fills formulation_variant_components.density where it is still NULL, so the
 * Formula page can show kg alongside litres and a real calculated SG.
 *
 * Source order per row: the product's own authored formula document density
 * (same material name), then DENSITY_G_PER_ML below. Dissolved powders and
 * solid additives (salts, acids in crystal form, BTA, BHT/DBPC, MnO₂, …) are
 * deliberately left NULL — they are weighed in kg and a litre figure for them
 * is meaningless in solution; SG counts Kg rows by weight regardless.
 * Values are typical @ 25 °C, not measured. Never overwrites a set density.
 */
const DENSITY_G_PER_ML: Record<string, number> = {
  // Water
  'water': 1.0, 'di water': 1.0, 'dm water': 1.0, 'water (di/ro)': 1.0,
  // Alcohols / glycols / glycol ethers
  'ipa': 0.786, 'ipa (isopropyl alcohol)': 0.786, 'isopropyl alcohol (ipa)': 0.786,
  'ethanol': 0.789,
  'propylene glycol': 1.036, 'propylene glycol (pg)': 1.036,
  'peg 400': 1.128,
  'propylene glycol methyl ether (pgme)': 0.92, 'propylene glycol methyl ether (dowanol pm)': 0.92,
  'dowanol pm (propylene glycol methyl ether)': 0.92,
  'dipropylene glycol methyl ether (dowanol dpm)': 0.951,
  'butyl glycol': 0.902,
  // Amines / alkalis / acids (liquid grades)
  'tea': 1.124, 'tea (triethanolamine)': 1.124, 'triethanolamine (tea)': 1.124,
  'ammonium hydroxide': 0.91, 'ammonium hydroxide (25%)': 0.91,
  'phosphoric acid': 1.685, 'phosphoric acid (85%)': 1.685,
  'hydrogen peroxide (50%)': 1.196,
  // Surfactants / defoamers
  'lae-9': 0.95, 'lae 9 (lauryl alcohol ethoxylate)': 0.95, 'lae-9 (lauryl alcohol ethoxylate)': 0.95,
  'lae-7': 0.95, 'alcohol ethoxylate (lae-7)': 0.95,
  'alphox 200': 1.02, 'alphox 200 (non-ionic surfactant)': 1.02,
  'nonionic surfactant (low hlb)': 0.96,
  'non-silicone defoamer': 1.0, 'non silicone defoamer': 1.0, 'silicone-free defoamer': 1.0,
  // Hydrocarbon solvents / oils
  'mineral turpentine oil (mto)': 0.785,
  'exxsol d60': 0.79, 'exxol d60': 0.79, 'exxsol 32d': 0.76, 'exxol 32d': 0.76,
  'exxsol d145': 0.795, 'exxol d145': 0.795,
  'dearomatized hydrocarbon solvent (d60 type)': 0.79,
  'diluent / carrier (mineral spirits)': 0.78,
  'light paraffinic mineral oil': 0.86, 'mineral oil (iso vg 15)': 0.86,
  'paraffinic base oil (100n)': 0.86,
  // Sulfonates / inhibitor packages
  'calcium petroleum sulfonate': 0.98, 'petroleum sulfonate (calcium salt)': 1.02,
  'calcium sulfonate (overbased)': 1.02,
  'sodium petroleum sulfonate': 1.05, 'petroleum sulfonate (sodium salt)': 0.95,
  'barium petroleum sulfonate': 1.10,
  'corrosion inhibitor blend': 0.98, 'rust preventive additive package (barium-free)': 0.98,
  'vci additive': 0.98, 'rust inhibitor additive (vci)': 0.98,
  // Semi-solid film formers (melted in)
  'white petroleum jelly': 0.87, 'microcrystalline wax': 0.92,
  'lanolin': 0.94, 'lanolin fatty derivative / wool grease': 0.94,
  'span 80 (sorbitan monooleate)': 0.99,
}

/** Solids that keep a NULL density even if a formula document lists one. */
const KG_ONLY = new Set(['bht (butylated hydroxytoluene)', 'antioxidant (dbpc)', 'borax', 'sodium gluconate'])

const norm = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim()

export type DensityFill = {
  productKey: string; variantName: string; materialName: string; unit: string
  density: number; source: 'formula doc' | 'table'
}

export async function seedVariantDensities({ apply = true } = {}): Promise<DensityFill[]> {
  console.log(`🌱 ${apply ? 'Filling' : 'Dry run —'} missing formulation variant densities...`)

  const docs = await db
    .select({ productKey: productDocuments.productKey, body: productDocuments.body })
    .from(productDocuments)
    .where(eq(productDocuments.docType, 'formula'))
  const docDensity = new Map<string, number>()
  for (const d of docs) {
    const composition = (d.body as { composition?: unknown })?.composition
    if (!Array.isArray(composition)) continue
    for (const c of composition as { name?: string; density?: number | null }[]) {
      const value = Number(c.density)
      if (c.name && value > 0) docDensity.set(`${d.productKey}|${norm(c.name)}`, value)
    }
  }

  const rows = await db
    .select({
      id:           formulationVariantComponents.id,
      materialName: formulationVariantComponents.materialName,
      unit:         formulationVariantComponents.unit,
      productKey:   productFormulationVariants.productKey,
      variantName:  productFormulationVariants.variantName,
    })
    .from(formulationVariantComponents)
    .innerJoin(productFormulationVariants, eq(productFormulationVariants.id, formulationVariantComponents.variantId))
    .where(isNull(formulationVariantComponents.density))

  const fills: (DensityFill & { id: string })[] = []
  for (const r of rows) {
    const key = norm(r.materialName)
    if (KG_ONLY.has(key)) continue
    const fromDoc = docDensity.get(`${r.productKey}|${key}`)
    const density = fromDoc ?? DENSITY_G_PER_ML[key]
    if (density === undefined) continue
    fills.push({ ...r, density, source: fromDoc !== undefined ? 'formula doc' : 'table' })
  }

  if (apply) {
    await db.transaction(async (tx) => {
      for (const f of fills) {
        await tx
          .update(formulationVariantComponents)
          .set({ density: String(f.density) })
          .where(and(eq(formulationVariantComponents.id, f.id), isNull(formulationVariantComponents.density)))
      }
    })
  }

  console.log(`   ${apply ? '✅ Filled' : 'ℹ️  Would fill'} ${fills.length} of ${rows.length} components with no density`)
  return fills.map(({ id: _id, ...f }) => f)
}
