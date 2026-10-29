import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  productDocuments,
  productFormulationVariants,
  formulationVariantComponents,
} from '../db/schema/index.js'

/**
 * Fills formulation_variant_components.material_function — what the material
 * does in that formulation — where it is still NULL.
 *
 * Source order per row:
 *  1. The product's formula document composition `function`, matched the same
 *     way FormulaPage's lookupCasFunction matched it before this column existed
 *     (lower-cased, trimmed; equal or either name containing the other), so the
 *     backfill reproduces exactly what the formula sheet already showed.
 *  2. DRAFT_FUNCTIONS below, for materials the document doesn't list. These are
 *     drafts written from the variant's composition and its TDS override text —
 *     R&D should review them and correct any in the variant editor. A key of
 *     `<material> @ <variant name>` applies to that variant only and wins over
 *     the plain `<material>` key, for a material whose role differs by variant.
 * Never overwrites a set value.
 */
const DRAFT_FUNCTIONS: Record<string, Record<string, string>> = {
  'corrcut-200': {
    // Formula document lists it as 'Exxsol D145'; production's component says 'Exxol'
    'exxol d145': 'Secondary carrier solvent — dearomatized, higher flash point hydrocarbon for controlled evaporation and low odour',
  },
  'corrucut-500': {
    // Formula document text for 'Exxsol D60' (57% in the base formula)
    'exxol d60': 'Primary carrier solvent — dearomatized aliphatic hydrocarbon, principal film-forming vehicle',
    // At 20% next to 35% MTO it is not the primary carrier — wording from the variant's TDS
    'exxol d60 @ exxsol blend grade': 'Dearomatized co-solvent — controlled-evaporation carrier alongside the MTO',
    // Same, for environments still carrying the pre-rename variant name
    'exxol d60 @ corrucut 500 - water-displacing rpo': 'Dearomatized co-solvent — controlled-evaporation carrier alongside the MTO',
    'mineral turpentine oil (mto)': 'Primary carrier solvent — dissolves the inhibitor and film formers, penetrates and displaces moisture, then evaporates to leave the protective film',
    'light paraffinic mineral oil': 'Mineral base oil — non-volatile film oil that carries the corrosion inhibitor as a continuous, lightly oily protective film',
    'exxol 32d': 'Light, fast-evaporating fraction — aids initial wetting and penetration',
    'exxol d145': 'Higher-flash-point hydrocarbon fraction — slows evaporation and helps the film level out',
    'sodium petroleum sulfonate': 'Primary corrosion inhibitor (80% of the sulfonate) — polar sulfonate adsorbs on the metal to form the rust-preventive film and aids water displacement',
    'barium petroleum sulfonate': 'Secondary corrosion inhibitor (20% of the sulfonate, replacing calcium sulfonate) — reinforces the inhibitor film and its resistance to water and humidity',
  },
  'unicool-al': {
    'ammonium  hydroxide': 'pH regulator — mild alkalinity for enhanced cleaning and degreasing performance',
    'tea': 'Corrosion inhibitor and pH buffer — mild alkaline amine that protects the metal between operations',
    'propylene glycol': 'Humectant co-solvent — slows evaporation and adds lubricity and corrosion protection',
    'propylene glycol (pg)': 'Co-solvent — lubricity, corrosion protection and evaporation control',
    'peg 400': 'Humectant and lubricity aid — reduces the evaporation rate and adds slip',
    'sodium gluconate': 'Chelating agent — sequesters hardness and metal ions to keep the solution clear',
    'non-silicone defoamer': 'Foam control — prevents foaming during spraying or agitation, without silicone residue',
    'propylene glycol methyl ether (pgme)': 'Wetting co-solvent — wetting, residue reduction, improved surface finish and chip flushing',
    'propylene glycol methyl ether (dowanol pm)': 'Wetting co-solvent — wetting, residue reduction, chip flushing and improved surface finish',
  },
  'uniklean-sp': {
    'lae-9': 'Non-ionic surfactant — wetting and oil emulsification',
    'lae-7': 'Lower-HLB non-ionic surfactant — oil emulsification with less foam',
    'tea': 'Alkalinity source and corrosion inhibitor — low-foam amine alkalinity with rust protection',
    'sodium gluconate': 'Chelating agent — sequesters hardness ions and aids rinse-off',
    'sodium molybdate': 'Corrosion inhibitor — works with the nitrite to strengthen flash-rust protection',
    'sodium benzoate': 'Corrosion inhibitor — supports the nitrite in preventing flash rust',
    'silicone-free defoamer': 'Foam control — keeps foam low in spray and agitated systems, without silicone residue',
  },
  'unikoat-lt-700': {
    'zinc phosphate': 'Zinc and phosphate source for the phosphate conversion coating',
    'manganese dioxide': 'Manganese source — co-deposits for a harder, more wear-resistant phosphate coating',
    'sodium nitrite': 'Accelerator — speeds coating formation by depolarising the metal surface',
    'nickel sulphate': 'Coating refiner — promotes finer, more uniform crystals and better adhesion',
    'fluoride compound': 'Activator — helps break down oxide films for even coating and controls bath sludge',
    'wetting agent': 'Surfactant — improves wetting of the parts by the bath',
  },
}

const key = (name: string) => (name ?? '').toLowerCase().trim()

export async function seedVariantFunctions({ apply = true } = {}) {
  console.log(`🌱 ${apply ? 'Filling' : 'Dry run —'} missing formulation variant material functions...`)

  const docs = await db
    .select({ productKey: productDocuments.productKey, body: productDocuments.body })
    .from(productDocuments)
    .where(eq(productDocuments.docType, 'formula'))
  const docComposition = new Map<string, { name: string; function?: string }[]>()
  for (const d of docs) {
    const composition = (d.body as { composition?: unknown })?.composition
    if (Array.isArray(composition)) docComposition.set(d.productKey, composition)
  }

  const rows = await db
    .select({
      id:           formulationVariantComponents.id,
      materialName: formulationVariantComponents.materialName,
      productKey:   productFormulationVariants.productKey,
      variantName:  productFormulationVariants.variantName,
    })
    .from(formulationVariantComponents)
    .innerJoin(productFormulationVariants, eq(productFormulationVariants.id, formulationVariantComponents.variantId))
    .where(isNull(formulationVariantComponents.materialFunction))

  const fills: { id: string; productKey: string; variantName: string; materialName: string; text: string; source: string }[] = []
  for (const r of rows) {
    const k = key(r.materialName)
    const match = (docComposition.get(r.productKey) ?? []).find((c) => {
      const ck = key(c.name)
      return ck === k || ck.includes(k) || k.includes(ck)
    })
    const drafts = DRAFT_FUNCTIONS[r.productKey] ?? {}
    const text = match?.function || drafts[`${k} @ ${key(r.variantName)}`] || drafts[k]
    if (!text) continue
    fills.push({ ...r, text, source: match?.function ? 'formula doc' : 'draft' })
  }

  if (apply) {
    await db.transaction(async (tx) => {
      for (const f of fills) {
        await tx
          .update(formulationVariantComponents)
          .set({ materialFunction: f.text })
          .where(and(eq(formulationVariantComponents.id, f.id), isNull(formulationVariantComponents.materialFunction)))
      }
    })
  }

  console.log(`   ${apply ? '✅ Filled' : 'ℹ️  Would fill'} ${fills.length} of ${rows.length} components with no function`)
  return fills.map(({ id: _id, ...f }) => f)
}
