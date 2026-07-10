import { db } from '../db/index.js'
import { ingredientHazardProfiles } from '../db/schema/index.js'
import { normalizeIngredientName } from '../modules/hazard-profiles/hazard-profiles.normalize.js'

/**
 * Seeds the ingredient_hazard_profiles dictionary from every real raw-material
 * name found in src/seed/products.seed.ts (formula composition blocks, which
 * carry CAS numbers) merged with the materialName-only list from
 * src/seed/formulationVariants.seed.ts (no CAS at that layer).
 *
 * ⚠️  SAFETY / QA DISCLAIMER — READ BEFORE TRUSTING THIS DATA FOR REGULATORY USE:
 * `genericDescription`/`functionCategory` are adapted from the existing formula
 * seed's `function` free-text field. `hazardClassifications`/`pictograms`/
 * `thresholdPercent`/`disclosureRequired` are populated from general GHS/
 * chemical knowledge of these substances by CAS number where confidently
 * known. This is a STARTING POINT, not a certified safety determination — it
 * must get a review pass from Macro Coats' safety/QA function before the
 * derived MSDS hazard output is treated as authoritative for regulatory
 * purposes. Entries the author was not confident about are marked
 * `hazardClassifications: []`, `pictograms: []`, and flagged in `notes` with
 * the literal string 'NEEDS SAFETY REVIEW — hazard classification not
 * confidently determined.' Corrections belong in the admin CRUD UI
 * (src/modules/hazard-profiles/), not by re-running this seed with edits —
 * re-running this seed is a no-op for existing rows (onConflictDoNothing).
 */

// ── Standard GHS H-statement text, referenced by code to keep entries below concise ──
const H = {
  H225: 'Highly flammable liquid and vapour',
  H226: 'Flammable liquid and vapour',
  H227: 'Combustible liquid',
  H271: 'May cause fire or explosion; strong oxidizer',
  H272: 'May intensify fire; oxidizer',
  H290: 'May be corrosive to metals',
  H301: 'Toxic if swallowed',
  H302: 'Harmful if swallowed',
  H303: 'May be harmful if swallowed',
  H304: 'May be fatal if swallowed and enters airways',
  H311: 'Toxic in contact with skin',
  H312: 'Harmful in contact with skin',
  H314: 'Causes severe skin burns and eye damage',
  H315: 'Causes skin irritation',
  H317: 'May cause an allergic skin reaction',
  H318: 'Causes serious eye damage',
  H319: 'Causes serious eye irritation',
  H331: 'Toxic if inhaled',
  H332: 'Harmful if inhaled',
  H335: 'May cause respiratory irritation',
  H336: 'May cause drowsiness or dizziness',
  H341: 'Suspected of causing genetic defects',
  H350: 'May cause cancer',
  H351: 'Suspected of causing cancer',
  H360: 'May damage fertility or the unborn child',
  H372: 'Causes damage to organs through prolonged or repeated exposure',
  H373: 'May cause damage to organs through prolonged or repeated exposure',
  H400: 'Very toxic to aquatic life',
  H410: 'Very toxic to aquatic life with long lasting effects',
  H411: 'Toxic to aquatic life with long lasting effects',
  H412: 'Harmful to aquatic life with long lasting effects',
  H413: 'May cause long lasting harmful effects to aquatic life',
} as const

type HCode = keyof typeof H

function cls(
  klass: string,
  category: string,
  tagType: 'danger' | 'warn' | 'neutral',
  hCode: HCode,
  pCodes: string[],
) {
  return {
    class:           klass,
    category,
    tagType,
    hStatementCode:  hCode,
    hStatementText:  H[hCode],
    pStatementCodes: pCodes,
  }
}

interface SeedRow {
  canonicalName?: string   // defaults to normalizeIngredientName(displayName) if omitted
  displayName:    string
  aliases:        string[]
  casNo:          string | null
  genericDescription: string
  functionCategory:   string
  compatNotes?:   string | null
  hazardClassifications?: ReturnType<typeof cls>[]
  pictograms?:    string[]
  thresholdPercent?: number
  disclosureRequired?: boolean
  disclosureThresholdPercent?: number | null
  notes?:         string | null
}

const NEEDS_REVIEW_NOTE = 'NEEDS SAFETY REVIEW — hazard classification not confidently determined.'

const ROWS: SeedRow[] = [
  // ── Water / carrier ────────────────────────────────────────────────────────
  {
    displayName: 'Water',
    aliases: ['Water', 'Water (DI/RO)', 'DI Water', 'DM Water'],
    casNo: '7732-18-5',
    genericDescription: 'Carrier / solvent',
    functionCategory: 'Aqueous carrier / base medium',
    compatNotes: 'All metals',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 100,
    notes: 'Not hazardous — always excluded from hazard aggregation via a threshold above 100%.',
  },

  // ── Alkaline builders / cleaners ───────────────────────────────────────────
  {
    displayName: 'Sodium Metasilicate (SMS)',
    aliases: ['Sodium Metasilicate (SMS)', 'Sodium Metasilicate'],
    casNo: '6834-92-0',
    genericDescription: 'Alkaline builder system',
    functionCategory: 'Strong alkalinity, oil emulsification, corrosion protection',
    compatNotes: 'All metals at working dilution',
    hazardClassifications: [
      cls('Skin Corrosion / Irritation', 'Cat 1B', 'danger', 'H314', ['P260', 'P264', 'P280', 'P301+P330+P331', 'P303+P361+P353', 'P305+P351+P338', 'P310']),
    ],
    pictograms: ['corrosive'],
    thresholdPercent: 1,
    disclosureRequired: true,
    disclosureThresholdPercent: 1,
  },
  {
    displayName: 'Soda Ash (Sodium Carbonate)',
    aliases: ['Soda Ash (Sodium Carbonate)', 'Soda Ash', 'Sodium Carbonate'],
    casNo: '497-19-8',
    genericDescription: 'Alkalinity builder',
    functionCategory: 'Alkalinity builder and buffering',
    compatNotes: 'Ferrous and non-ferrous metals',
    hazardClassifications: [
      cls('Serious Eye Damage', 'Cat 2', 'warn', 'H319', ['P264', 'P280', 'P305+P351+P338', 'P337+P313']),
    ],
    pictograms: ['irritant'],
    thresholdPercent: 1,
    disclosureRequired: true,
    disclosureThresholdPercent: 1,
  },
  {
    displayName: 'Trisodium Phosphate (TSP)',
    aliases: ['Trisodium Phosphate (TSP)', 'Trisodium Phosphate'],
    casNo: '7601-54-9',
    genericDescription: 'Builder / water softener',
    functionCategory: 'Builder, grease removal, water softening',
    compatNotes: 'Ferrous and non-ferrous metals',
    hazardClassifications: [
      cls('Serious Eye Damage', 'Cat 1', 'danger', 'H318', ['P264', 'P280', 'P305+P351+P338', 'P310']),
      cls('Skin Irritation', 'Cat 2', 'warn', 'H315', ['P264', 'P280', 'P332+P313']),
    ],
    pictograms: ['corrosive', 'irritant'],
    thresholdPercent: 1,
    disclosureRequired: true,
    disclosureThresholdPercent: 1,
  },
  {
    displayName: 'EDTA Disodium',
    aliases: ['EDTA Disodium'],
    casNo: '6381-92-6',
    genericDescription: 'Chelating agent',
    functionCategory: 'Chelating agent for hardness control',
    compatNotes: 'Hard and soft water',
    hazardClassifications: [
      cls('Serious Eye Irritation', 'Cat 2', 'warn', 'H319', ['P264', 'P280', 'P305+P351+P338', 'P337+P313']),
    ],
    pictograms: ['irritant'],
    thresholdPercent: 1,
  },
  {
    displayName: 'Alphox 200 (Non-ionic Surfactant)',
    aliases: ['Alphox 200 (Non-ionic Surfactant)', 'Alphox 200'],
    casNo: '68439-50-9',
    genericDescription: 'Non-ionic surfactant blend',
    functionCategory: 'Oil emulsification, wetting and low-foam detergency',
    compatNotes: 'Low foam at ≤65 °C',
    hazardClassifications: [
      cls('Serious Eye Irritation', 'Cat 2', 'warn', 'H319', ['P264', 'P280', 'P305+P351+P338', 'P337+P313']),
      cls('Aquatic Toxicity (Chronic)', 'Cat 3', 'warn', 'H412', ['P273']),
    ],
    pictograms: ['irritant'],
    thresholdPercent: 1,
  },
  {
    displayName: 'Ammonium Hydroxide (25–30%)',
    aliases: ['Ammonium Hydroxide (25%)', 'Ammonium Hydroxide (25–30%)', 'Ammonium Hydroxide'],
    casNo: '1336-21-6',
    genericDescription: 'pH regulator / mild alkalinity booster',
    functionCategory: 'pH regulator — mild alkalinity for enhanced cleaning and degreasing performance',
    compatNotes: 'Not compatible with acids or oxidisers',
    hazardClassifications: [
      cls('Skin Corrosion / Irritation', 'Cat 1B', 'danger', 'H314', ['P260', 'P264', 'P280', 'P301+P330+P331', 'P303+P361+P353', 'P305+P351+P338', 'P310']),
      cls('Acute Toxicity (Inhalation)', 'Cat 4', 'warn', 'H332', ['P261', 'P271', 'P304+P340']),
      cls('Aquatic Toxicity (Acute)', 'Cat 1', 'danger', 'H400', ['P273']),
    ],
    pictograms: ['corrosive', 'irritant', 'environment'],
    thresholdPercent: 1,
    disclosureRequired: true,
    disclosureThresholdPercent: 1,
  },

  // ── Corrosion inhibitors / accelerators ────────────────────────────────────
  {
    displayName: 'Sodium Nitrite (NaNO₂)',
    aliases: ['Sodium Nitrite', 'Sodium Nitrite (NaNO₂)'],
    casNo: '7632-00-0',
    genericDescription: 'Corrosion inhibitor',
    functionCategory: 'Phosphating accelerator / oxidising agent — flash rust inhibitor',
    compatNotes: 'Ferrous surfaces',
    hazardClassifications: [
      cls('Acute Toxicity (Oral)', 'Cat 3', 'danger', 'H301', ['P264', 'P270', 'P301+P312', 'P330']),
      cls('Oxidising Solid', 'Cat 3', 'warn', 'H272', ['P210', 'P220', 'P221']),
      cls('Aquatic Toxicity (Acute)', 'Cat 1', 'danger', 'H400', ['P273']),
    ],
    pictograms: ['oxidiser', 'skull', 'environment'],
    thresholdPercent: 1,
    disclosureRequired: true,
    disclosureThresholdPercent: 1,
  },
  {
    displayName: 'Sodium Nitrate (NaNO₃)',
    aliases: ['Sodium Nitrate', 'Sodium Nitrate (NaNO₃)'],
    casNo: '7631-99-4',
    genericDescription: 'Oxidising accelerator',
    functionCategory: 'Oxidising accelerator for phosphate coating formation',
    compatNotes: 'Not compatible with organics/reducing agents',
    hazardClassifications: [
      cls('Oxidising Solid', 'Cat 3', 'warn', 'H272', ['P210', 'P220', 'P221']),
    ],
    pictograms: ['oxidiser'],
    thresholdPercent: 1,
  },
  {
    displayName: 'BTA (Benzotriazole)',
    aliases: ['BTA (Benzotriazole)'],
    casNo: '95-14-7',
    genericDescription: 'Metal corrosion inhibitor / film former',
    functionCategory: 'Copper corrosion inhibitor / film former',
    compatNotes: 'Copper and copper alloys',
    hazardClassifications: [
      cls('Acute Toxicity (Oral)', 'Cat 4', 'warn', 'H302', ['P264', 'P270', 'P301+P312']),
      cls('Aquatic Toxicity (Chronic)', 'Cat 3', 'warn', 'H412', ['P273']),
    ],
    pictograms: ['irritant'],
    thresholdPercent: 1,
    notes: NEEDS_REVIEW_NOTE + ' Some data suggests possible reproductive toxicity concerns not reflected above.',
  },
  {
    displayName: 'VCI Additive (Vapour Corrosion Inhibitor)',
    aliases: ['VCI Additive', 'Rust Inhibitor Additive (VCI)'],
    casNo: '109-02-4',
    genericDescription: 'Vapour corrosion inhibitor',
    functionCategory: 'Vapour corrosion inhibitor — supplementary vapour-phase protection',
    compatNotes: 'Ferrous metals',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 1,
    notes: NEEDS_REVIEW_NOTE + ' CAS 109-02-4 (4-methylmorpholine) is a flammable, corrosive amine if the raw CAS mapping is correct for this named additive — confirm exact substance identity before relying on any classification.',
  },
  {
    displayName: 'Rust Preventive Additive Package (Barium-free)',
    aliases: ['Rust Preventive Additive Package (Barium-free)'],
    casNo: null,
    genericDescription: 'Corrosion inhibitor package',
    functionCategory: 'Primary corrosion inhibitor package — multi-mechanism rust protection',
    compatNotes: 'Ferrous metals',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 1,
    notes: NEEDS_REVIEW_NOTE + ' Proprietary mixture — exact composition not on file.',
  },
  {
    displayName: 'Corrosion Inhibitor Blend',
    aliases: ['Corrosion Inhibitor Blend'],
    casNo: null,
    genericDescription: 'Corrosion inhibitor blend',
    functionCategory: 'Enhanced protection system — secondary rust inhibitor',
    compatNotes: 'Ferrous, non-ferrous',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 1,
    notes: NEEDS_REVIEW_NOTE + ' Proprietary mixture — exact composition not on file.',
  },
  {
    displayName: 'Polar Additive (Glycol Ether Ester)',
    aliases: ['Polar Additive (Glycol Ether Ester)'],
    casNo: null,
    genericDescription: 'Water displacement / adhesion promoter',
    functionCategory: 'Water displacement and substrate adhesion promoter',
    compatNotes: 'Ferrous metals',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 1,
    notes: NEEDS_REVIEW_NOTE + ' Proprietary mixture — exact composition not on file.',
  },

  // ── Oils / waxes / carriers ─────────────────────────────────────────────────
  {
    displayName: 'Paraffinic Base Oil (100N)',
    aliases: ['Paraffinic Base Oil (100N)'],
    casNo: '8042-47-5',
    genericDescription: 'Carrier oil / film-forming base',
    functionCategory: 'Primary carrier and film-forming base',
    compatNotes: 'Ferrous and non-ferrous metals',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 5,
    notes: 'Severely refined (solvent-refined/hydrotreated) white mineral oil — not typically GHS-classified for health hazards. Retained at a higher threshold as low-priority; confirm refinement grade before final sign-off.',
  },
  {
    displayName: 'Mineral Oil (ISO VG 15)',
    aliases: ['Mineral Oil (ISO VG 15)'],
    casNo: '8042-47-5',
    genericDescription: 'Base oil / film body',
    functionCategory: 'Base oil — builds film body and extends protection duration',
    compatNotes: 'Ferrous and non-ferrous metals',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 5,
    notes: 'Severely refined white mineral oil — not typically GHS-classified for health hazards.',
  },
  {
    displayName: 'Microcrystalline Wax',
    aliases: ['Microcrystalline Wax'],
    casNo: '63231-60-7',
    genericDescription: 'Film former',
    functionCategory: 'Film former — thickens oil film and improves adhesion to substrate',
    compatNotes: 'All metals',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 5,
    notes: 'Not classified as hazardous under GHS in solid/wax form.',
  },
  {
    displayName: 'Diluent / Carrier (Mineral Spirits)',
    aliases: ['Diluent / Carrier (Mineral Spirits)'],
    casNo: '64741-65-7',
    genericDescription: 'Diluent / viscosity control carrier',
    functionCategory: 'Viscosity control and application aid',
    compatNotes: 'Ferrous and non-ferrous metals',
    hazardClassifications: [
      cls('Flammable Liquid', 'Cat 3', 'warn', 'H226', ['P210', 'P233', 'P240', 'P241', 'P242', 'P243', 'P280']),
      cls('Aspiration Hazard', 'Cat 1', 'danger', 'H304', ['P301+P312', 'P331', 'P405']),
      cls('STOT Single Exposure', 'Cat 3', 'warn', 'H336', ['P261', 'P271', 'P304+P340']),
      cls('Aquatic Toxicity (Chronic)', 'Cat 2', 'warn', 'H411', ['P273']),
    ],
    pictograms: ['flammable', 'health', 'environment'],
    thresholdPercent: 1,
    disclosureRequired: true,
    disclosureThresholdPercent: 1,
  },
  {
    displayName: 'Dearomatized Hydrocarbon Solvent (C9–C14 / D60 type)',
    aliases: ['Dearomatized Hydrocarbon Solvent (C9–C14)', 'Dearomatized Hydrocarbon Solvent (D60 type)'],
    casNo: '64742-47-8',
    genericDescription: 'Dearomatized hydrocarbon carrier solvent',
    functionCategory: 'Primary carrier and fast-drying vehicle — low aromatic content minimises odour and toxicity',
    compatNotes: 'Ferrous and non-ferrous metals',
    hazardClassifications: [
      cls('Flammable Liquid', 'Cat 3', 'warn', 'H226', ['P210', 'P233', 'P240', 'P241', 'P242', 'P243', 'P280']),
      cls('Aspiration Hazard', 'Cat 1', 'danger', 'H304', ['P301+P312', 'P331', 'P405']),
      cls('Aquatic Toxicity (Chronic)', 'Cat 2', 'warn', 'H411', ['P273']),
    ],
    pictograms: ['flammable', 'health', 'environment'],
    thresholdPercent: 1,
    disclosureRequired: true,
    disclosureThresholdPercent: 1,
  },
  {
    displayName: 'Calcium Sulfonate (Overbased)',
    aliases: ['Calcium Sulfonate (Overbased)', 'Petroleum Sulfonate (Calcium Salt)'],
    casNo: '61789-86-4',
    genericDescription: 'Secondary corrosion inhibitor',
    functionCategory: 'Secondary rust inhibitor — neutralises acidic corrosion products',
    compatNotes: 'Ferrous and non-ferrous metals',
    hazardClassifications: [
      cls('Aquatic Toxicity (Chronic)', 'Cat 2', 'warn', 'H411', ['P273']),
    ],
    pictograms: ['environment'],
    thresholdPercent: 5,
  },
  {
    displayName: 'Petroleum Sulfonate (Sodium Salt)',
    aliases: ['Petroleum Sulfonate (Sodium Salt)'],
    casNo: '68608-26-4',
    genericDescription: 'Primary corrosion inhibitor',
    functionCategory: 'Primary corrosion inhibitor — forms protective film on metal surface',
    compatNotes: 'Ferrous and non-ferrous metals',
    hazardClassifications: [
      cls('Skin Irritation', 'Cat 2', 'warn', 'H315', ['P264', 'P280', 'P332+P313']),
      cls('Serious Eye Irritation', 'Cat 2', 'warn', 'H319', ['P264', 'P280', 'P305+P351+P338', 'P337+P313']),
      cls('Aquatic Toxicity (Chronic)', 'Cat 2', 'warn', 'H411', ['P273']),
    ],
    pictograms: ['irritant', 'environment'],
    thresholdPercent: 5,
    disclosureRequired: true,
    disclosureThresholdPercent: 5,
  },
  {
    displayName: 'Oil-Soluble Corrosion Inhibitor (TOFA)',
    aliases: ['Oil-Soluble Corrosion Inhibitor (TOFA)'],
    casNo: '61790-12-3',
    genericDescription: 'Oil-soluble rust prevention additive',
    functionCategory: 'Rust prevention additive — tall oil fatty acid derivative providing supplementary barrier',
    compatNotes: 'Ferrous and non-ferrous metals',
    hazardClassifications: [
      cls('Skin Irritation', 'Cat 2', 'warn', 'H315', ['P264', 'P280', 'P332+P313']),
      cls('Serious Eye Irritation', 'Cat 2', 'warn', 'H319', ['P264', 'P280', 'P305+P351+P338', 'P337+P313']),
      cls('Aquatic Toxicity (Chronic)', 'Cat 2', 'warn', 'H411', ['P273']),
    ],
    pictograms: ['irritant', 'environment'],
    thresholdPercent: 5,
  },
  {
    displayName: 'Antioxidant (DBPC / BHT)',
    aliases: ['Antioxidant (DBPC)'],
    casNo: '128-37-0',
    genericDescription: 'Oxidation inhibitor',
    functionCategory: 'Oxidation inhibitor — extends product shelf life and prevents sludge formation',
    compatNotes: 'All metals',
    hazardClassifications: [
      cls('Aquatic Toxicity (Acute)', 'Cat 1', 'danger', 'H400', ['P273']),
      cls('Aquatic Toxicity (Chronic)', 'Cat 1', 'danger', 'H410', ['P273', 'P391']),
    ],
    pictograms: ['environment'],
    thresholdPercent: 1,
  },
  {
    displayName: 'Lanolin Fatty Derivative / Wool Grease',
    aliases: ['Lanolin Fatty Derivative / Wool Grease'],
    casNo: '8006-54-0',
    genericDescription: 'Film adhesion promoter',
    functionCategory: 'Film adhesion promoter — natural wax-like film former, excellent water repellence',
    compatNotes: 'Ferrous and non-ferrous metals',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 5,
    notes: NEEDS_REVIEW_NOTE + ' Lanolin derivatives are a recognized contact-allergen source in some individuals; skin sensitization category not confidently determined for this specific grade.',
  },
  {
    displayName: 'Nonionic Surfactant (Low HLB)',
    aliases: ['Nonionic Surfactant (Low HLB)'],
    casNo: null,
    genericDescription: 'Water displacement / wetting aid',
    functionCategory: 'Water displacement and wetting aid — improves surface penetration',
    compatNotes: 'Ferrous and non-ferrous metals',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 1,
    notes: NEEDS_REVIEW_NOTE + ' Proprietary mixture — exact composition not on file.',
  },
  {
    displayName: 'Non-silicone Defoamer',
    aliases: ['Non-silicone Defoamer'],
    casNo: null,
    genericDescription: 'Foam control agent',
    functionCategory: 'Foam control',
    compatNotes: 'Spray and dip',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 1,
    notes: NEEDS_REVIEW_NOTE + ' Proprietary mixture — exact composition not on file.',
  },
  {
    displayName: 'Silicone-Free Defoamer',
    aliases: ['Silicone-Free Defoamer'],
    casNo: null,
    genericDescription: 'Foam control agent',
    functionCategory: 'Foam control',
    compatNotes: 'Spray and dip',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 1,
    notes: NEEDS_REVIEW_NOTE + ' Proprietary mixture — exact composition not on file.',
  },
  {
    displayName: 'Wetting Agent',
    aliases: ['Wetting Agent'],
    casNo: null,
    genericDescription: 'Wetting / surface-tension reducing agent',
    functionCategory: 'Wetting agent',
    compatNotes: 'Ferrous and non-ferrous metals',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 1,
    notes: NEEDS_REVIEW_NOTE + ' Generic descriptor in seed data — exact substance identity not on file.',
  },

  // ── Acids ────────────────────────────────────────────────────────────────────
  {
    displayName: 'Phosphoric Acid (85%)',
    aliases: ['Phosphoric Acid', 'Phosphoric Acid (85%)'],
    casNo: '7664-38-2',
    genericDescription: 'Primary active acid',
    functionCategory: 'Rust removal / acid cleaning — primary active ingredient',
    compatNotes: 'Ferrous metals',
    hazardClassifications: [
      cls('Skin Corrosion / Irritation', 'Cat 1B', 'danger', 'H314', ['P260', 'P264', 'P280', 'P301+P330+P331', 'P303+P361+P353', 'P305+P351+P338', 'P310']),
    ],
    pictograms: ['corrosive'],
    thresholdPercent: 1,
    disclosureRequired: true,
    disclosureThresholdPercent: 1,
  },
  {
    displayName: 'Citric Acid',
    aliases: ['Citric Acid'],
    casNo: '77-92-9',
    genericDescription: 'Chelating agent / mild passivation initiator',
    functionCategory: 'Chelating agent / mild passivation initiator',
    compatNotes: 'Ferrous and non-ferrous metals',
    hazardClassifications: [
      cls('Serious Eye Irritation', 'Cat 2', 'warn', 'H319', ['P264', 'P280', 'P305+P351+P338', 'P337+P313']),
    ],
    pictograms: ['irritant'],
    thresholdPercent: 5,
  },

  // ── Solvents / alcohols ─────────────────────────────────────────────────────
  {
    displayName: 'Isopropyl Alcohol (IPA)',
    aliases: ['IPA', 'IPA (Isopropyl Alcohol)', 'Isopropyl Alcohol (IPA)'],
    casNo: '67-63-0',
    genericDescription: 'Performance-enhancing volatile solvent',
    functionCategory: 'Primary solvent — rapid evaporation, degreasing and surface preparation',
    compatNotes: 'Ferrous and non-ferrous metals, plastics (check compatibility)',
    hazardClassifications: [
      cls('Flammable Liquid', 'Cat 2', 'danger', 'H225', ['P210', 'P233', 'P240', 'P241', 'P242', 'P243', 'P280']),
      cls('Serious Eye Irritation', 'Cat 2', 'warn', 'H319', ['P264', 'P280', 'P305+P351+P338', 'P337+P313']),
    ],
    pictograms: ['flammable', 'irritant'],
    thresholdPercent: 1,
    disclosureRequired: true,
    disclosureThresholdPercent: 1,
  },
  {
    displayName: 'Ethanol (Industrial Grade)',
    aliases: ['Ethanol (Industrial Grade)', 'Ethanol'],
    casNo: '64-17-5',
    genericDescription: 'Co-solvent / drying accelerant',
    functionCategory: 'Co-solvent — enhances cleaning action and accelerates drying',
    compatNotes: 'Ferrous and non-ferrous metals',
    hazardClassifications: [
      cls('Flammable Liquid', 'Cat 2', 'danger', 'H225', ['P210', 'P233', 'P240', 'P241', 'P242', 'P243', 'P280']),
    ],
    pictograms: ['flammable'],
    thresholdPercent: 1,
    disclosureRequired: true,
    disclosureThresholdPercent: 1,
  },
  {
    displayName: 'Propylene Glycol (PG)',
    aliases: ['Propylene Glycol', 'Propylene Glycol (PG)'],
    casNo: '57-55-6',
    genericDescription: 'Humectant / co-solvent',
    functionCategory: 'Co-solvent and viscosity modifier',
    compatNotes: 'All metals',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 5,
    notes: 'Generally low hazard (widely used, GRAS-adjacent) — not typically GHS-classified.',
  },
  {
    displayName: 'Propylene Glycol Methyl Ether (PGME)',
    aliases: ['Propylene Glycol Methyl Ether (Dowanol PM)', 'Propylene Glycol Methyl Ether (PGME)'],
    casNo: '107-98-2',
    genericDescription: 'Glycol ether co-solvent',
    functionCategory: 'Co-solvent — enhances cleaning and drying performance',
    compatNotes: 'All metals',
    hazardClassifications: [
      cls('Flammable Liquid', 'Cat 3', 'warn', 'H226', ['P210', 'P233', 'P240', 'P241', 'P242', 'P243', 'P280']),
      cls('Serious Eye Irritation', 'Cat 2', 'warn', 'H319', ['P264', 'P280', 'P305+P351+P338', 'P337+P313']),
    ],
    pictograms: ['flammable', 'irritant'],
    thresholdPercent: 1,
  },
  {
    displayName: 'LAE-9 (Lauryl Alcohol Ethoxylate)',
    aliases: ['LAE 9 (Lauryl Alcohol Ethoxylate)', 'LAE-9 (Lauryl Alcohol Ethoxylate)', 'LAE-9', 'LAE 9'],
    casNo: '9002-92-0',
    genericDescription: 'Non-ionic surfactant — wetting and degreasing agent',
    functionCategory: 'Wetting & degreasing agent — non-ionic surfactant',
    compatNotes: 'All metals',
    hazardClassifications: [
      cls('Serious Eye Damage', 'Cat 1', 'danger', 'H318', ['P264', 'P280', 'P305+P351+P338', 'P310']),
      cls('Aquatic Toxicity (Chronic)', 'Cat 3', 'warn', 'H412', ['P273']),
    ],
    pictograms: ['corrosive', 'environment'],
    thresholdPercent: 1,
  },
  {
    displayName: 'LAE-7 (Lauryl Alcohol Ethoxylate)',
    aliases: ['LAE-7', 'LAE 7'],
    casNo: '9002-92-0',
    genericDescription: 'Non-ionic surfactant — wetting and degreasing agent',
    functionCategory: 'Wetting & degreasing agent — non-ionic surfactant',
    compatNotes: 'All metals',
    hazardClassifications: [
      cls('Serious Eye Damage', 'Cat 1', 'danger', 'H318', ['P264', 'P280', 'P305+P351+P338', 'P310']),
      cls('Aquatic Toxicity (Chronic)', 'Cat 3', 'warn', 'H412', ['P273']),
    ],
    pictograms: ['corrosive', 'environment'],
    thresholdPercent: 1,
    notes: NEEDS_REVIEW_NOTE + ' Same CAS family as LAE-9 assumed for this lower-ethoxylation homolog — confirm exact EO count and hazard data.',
  },
  {
    displayName: 'TEA (Triethanolamine)',
    aliases: ['TEA (Triethanolamine)', 'TEA'],
    casNo: '102-71-6',
    genericDescription: 'Neutralizing / pH control agent',
    functionCategory: 'Neutralizing agent / pH control — improves compatibility',
    compatNotes: 'All metals',
    hazardClassifications: [
      cls('Serious Eye Irritation', 'Cat 2', 'warn', 'H319', ['P264', 'P280', 'P305+P351+P338', 'P337+P313']),
    ],
    pictograms: ['irritant'],
    thresholdPercent: 1,
  },

  // ── Other inorganics ─────────────────────────────────────────────────────────
  {
    displayName: 'Mono Sodium Phosphate (NaH₂PO₄)',
    aliases: ['Mono Sodium Phosphate (NaH₂PO₄)', 'Mono Sodium Phosphate'],
    casNo: '7558-80-7',
    genericDescription: 'Phosphate source / acidity control',
    functionCategory: 'Phosphate source and acidity control — forms the conversion coating',
    compatNotes: 'Ferrous metals',
    hazardClassifications: [
      cls('Serious Eye Irritation', 'Cat 2', 'warn', 'H319', ['P264', 'P280', 'P305+P351+P338', 'P337+P313']),
    ],
    pictograms: ['irritant'],
    thresholdPercent: 5,
  },
  {
    displayName: 'Ferrous Sulphate',
    aliases: ['Ferrous Sulphate'],
    casNo: '7720-78-7',
    genericDescription: 'Iron conditioning agent',
    functionCategory: 'Iron conditioning agent — controls coating morphology and crystal size',
    compatNotes: 'Ferrous metals',
    hazardClassifications: [
      cls('Acute Toxicity (Oral)', 'Cat 4', 'warn', 'H302', ['P264', 'P270', 'P301+P312']),
      cls('Serious Eye Irritation', 'Cat 2', 'warn', 'H319', ['P264', 'P280', 'P305+P351+P338', 'P337+P313']),
    ],
    pictograms: ['irritant'],
    thresholdPercent: 1,
  },
  {
    displayName: 'Hydroxylamine Sulphate',
    aliases: ['Hydroxylamine Sulphate'],
    casNo: '10039-54-0',
    genericDescription: 'Coating-formation accelerator',
    functionCategory: 'Accelerator — promotes uniform and rapid coating formation',
    compatNotes: 'Ferrous metals',
    hazardClassifications: [
      cls('Acute Toxicity (Oral)', 'Cat 3', 'danger', 'H301', ['P264', 'P270', 'P301+P312', 'P330']),
      cls('Skin Sensitisation', 'Cat 1', 'warn', 'H317', ['P261', 'P272', 'P280', 'P302+P352']),
      cls('Aquatic Toxicity (Acute)', 'Cat 1', 'danger', 'H400', ['P273']),
    ],
    pictograms: ['skull', 'irritant', 'environment'],
    thresholdPercent: 1,
    disclosureRequired: true,
    disclosureThresholdPercent: 1,
    notes: NEEDS_REVIEW_NOTE + ' Hydroxylamine salts can have self-reactive/decomposition hazards at higher concentrations not captured above — confirm before final sign-off.',
  },
  {
    displayName: 'Zinc Oxide',
    aliases: ['Zinc Oxide'],
    casNo: '1314-13-2',
    genericDescription: 'Zinc ion source',
    functionCategory: 'Zinc ion source — reacts with phosphoric acid to form zinc phosphate coating',
    compatNotes: 'Ferrous metals',
    hazardClassifications: [
      cls('Aquatic Toxicity (Acute)', 'Cat 1', 'danger', 'H400', ['P273']),
      cls('Aquatic Toxicity (Chronic)', 'Cat 1', 'danger', 'H410', ['P273', 'P391']),
    ],
    pictograms: ['environment'],
    thresholdPercent: 1,
  },
  {
    displayName: 'Zinc Phosphate',
    aliases: ['Zinc Phosphate'],
    casNo: '7779-90-0',
    genericDescription: 'Zinc phosphate conversion coating agent',
    functionCategory: 'Zinc phosphate source for conversion coating',
    compatNotes: 'Ferrous metals',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 1,
    notes: NEEDS_REVIEW_NOTE + ' Aquatic toxicity classification for zinc phosphate specifically (vs. free zinc ion) not confidently determined at seed time.',
  },
  {
    displayName: 'Sodium Molybdate',
    aliases: ['Sodium Molybdate'],
    casNo: '7631-95-0',
    genericDescription: 'Corrosion inhibitor',
    functionCategory: 'Molybdate-based corrosion inhibitor',
    compatNotes: 'Ferrous and non-ferrous metals',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 1,
    notes: NEEDS_REVIEW_NOTE + ' Reproductive toxicity (H360) is flagged for some molybdate salts in EU CLH decisions — category/applicability to this specific salt not confidently determined at seed time.',
  },
  {
    displayName: 'Manganese Dioxide',
    aliases: ['Manganese Dioxide'],
    casNo: '1313-13-9',
    genericDescription: 'Coating-formation conditioning agent',
    functionCategory: 'Iron/manganese conditioning agent',
    compatNotes: 'Ferrous metals',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 1,
    notes: NEEDS_REVIEW_NOTE + ' Manganese compounds commonly carry STOT-RE and aquatic hazard classifications; specific category not confidently determined at seed time.',
  },
  {
    displayName: 'Nickel Sulphate',
    aliases: ['Nickel Sulphate'],
    casNo: '10101-97-0',
    genericDescription: 'Metal ion conditioning agent',
    functionCategory: 'Nickel ion source for coating/conditioning',
    compatNotes: 'Ferrous and non-ferrous metals',
    hazardClassifications: [
      cls('Carcinogenicity', 'Cat 1A', 'danger', 'H350', ['P201', 'P202', 'P280', 'P308+P313']),
      cls('Skin Sensitisation', 'Cat 1', 'warn', 'H317', ['P261', 'P272', 'P280', 'P302+P352']),
      cls('Reproductive Toxicity', 'Cat 1B', 'danger', 'H360', ['P201', 'P202', 'P280', 'P308+P313']),
      cls('Aquatic Toxicity (Acute)', 'Cat 1', 'danger', 'H400', ['P273']),
      cls('Aquatic Toxicity (Chronic)', 'Cat 1', 'danger', 'H410', ['P273', 'P391']),
    ],
    pictograms: ['health', 'irritant', 'skull', 'environment'],
    thresholdPercent: 0.1,
    disclosureRequired: true,
    disclosureThresholdPercent: 0.1,
    notes: 'Known SVHC/carcinogen (nickel compounds) — kept at a low threshold deliberately. Still recommend an explicit safety/QA sign-off given the severity of these classifications.',
  },
  {
    displayName: 'PEG 400 (Polyethylene Glycol 400)',
    aliases: ['PEG 400'],
    casNo: '25322-68-3',
    genericDescription: 'Humectant / viscosity modifier',
    functionCategory: 'Co-solvent and viscosity modifier',
    compatNotes: 'All metals',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 5,
    notes: 'Generally low hazard — not typically GHS-classified for health hazards at this molecular weight.',
  },
  {
    displayName: 'Sodium Benzoate',
    aliases: ['Sodium Benzoate'],
    casNo: '532-32-1',
    genericDescription: 'Preservative / corrosion inhibitor',
    functionCategory: 'Mild corrosion inhibitor / preservative',
    compatNotes: 'All metals',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 5,
    notes: 'Not classified as hazardous under GHS (widely used food-grade preservative).',
  },
  {
    displayName: 'Sodium Gluconate',
    aliases: ['Sodium Gluconate'],
    casNo: '527-07-1',
    genericDescription: 'Chelating agent',
    functionCategory: 'Chelating agent for hardness control',
    compatNotes: 'Hard and soft water',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 5,
    notes: 'Not classified as hazardous under GHS.',
  },
  {
    displayName: 'Fluoride Compound',
    aliases: ['Fluoride Compound'],
    casNo: null,
    genericDescription: 'Etching / activation agent',
    functionCategory: 'Surface activation / etching agent',
    compatNotes: 'Ferrous metals',
    hazardClassifications: [],
    pictograms: [],
    thresholdPercent: 1,
    notes: NEEDS_REVIEW_NOTE + ' Generic descriptor in seed data — exact fluoride compound identity not on file. Fluoride salts range from low hazard to highly toxic/corrosive depending on identity (e.g. ammonium bifluoride) — do NOT treat this entry as safe until identity is confirmed.',
  },
]

export async function seedHazardProfiles() {
  console.log('🧪 Seeding ingredient hazard profiles...')

  let inserted = 0
  for (const row of ROWS) {
    const canonicalName = normalizeIngredientName(row.canonicalName ?? row.displayName)
    const result = await db
      .insert(ingredientHazardProfiles)
      .values({
        canonicalName,
        displayName:        row.displayName,
        aliases:            row.aliases,
        casNo:              row.casNo,
        genericDescription: row.genericDescription,
        functionCategory:   row.functionCategory,
        compatNotes:        row.compatNotes ?? null,
        hazardClassifications: (row.hazardClassifications ?? []) as any,
        pictograms:         row.pictograms ?? [],
        thresholdPercent:   String(row.thresholdPercent ?? 1),
        disclosureRequired: row.disclosureRequired ?? false,
        disclosureThresholdPercent: row.disclosureThresholdPercent != null ? String(row.disclosureThresholdPercent) : null,
        notes:              row.notes ?? null,
        isActive:           true,
      })
      .onConflictDoNothing({ target: ingredientHazardProfiles.canonicalName })
      .returning({ id: ingredientHazardProfiles.id })

    if (result.length > 0) inserted++
  }

  console.log(`   ${inserted} new hazard profile(s) inserted (${ROWS.length - inserted} already existed).`)
}
