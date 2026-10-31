import { eq, and, inArray, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  companies,
  products,
  productFormulationVariants,
  formulationVariantComponents,
} from '../db/schema/index.js'
import {
  TDS_OVERRIDES_CORRUCUT_500_WDRPO, MSDS_OVERRIDES_CORRUCUT_500_WDRPO,
  TDS_OVERRIDES_CORRUCUT_500_MTO_BASED, MSDS_OVERRIDES_CORRUCUT_500_MTO_BASED,
} from './corrucut500Overrides.data.js'
import { CORRUCUT_500_FORMULA_OVERRIDES } from './corrucut500FormulaOverrides.data.js'

/**
 * Earlier names of seeded variants (renamed in 502bfd3). An environment where the
 * rename was never applied still carries the old name, so every existence check
 * must match either one — an exact-name check misses it and inserts a duplicate.
 */
const LEGACY_VARIANT_NAMES: Record<string, string[]> = {
  'MTO-LLP High-Oil Grade':                      ['Solvent Carrier Grade', 'MTO Based'],
  'Exxsol Blend Grade':                          ['CORRUCUT 500 - Water-Displacing RPO'],
  'Na-Ba Sulfonate Grade':                       ['Mixed Sulfonate Grade'],
  'MTO-LLP Low-Oil Grade':                       ['MTO-LLP Based'],
  'Fast-Dry Variant':                            ['High IPA Variant'],
  'Low-Evaporation Variant':                     ['PEG Glycol Variant'],
  'UNICool AL – High Lubricity Variant':         ['UNICool AL – PG High Lubricity Variant'],
  'UNICool AL – Enhanced Wetting Variant':       ['UNICool AL – PGME Enhanced Variant'],
  'UNIKLEAN SP – Heavy Duty Alkaline Variant':   ['UNIKLEAN SP – Heavy Duty Alkaline SMS Variant'],
}

const variantNameIs = (name: string) =>
  inArray(productFormulationVariants.variantName, [name, ...(LEGACY_VARIANT_NAMES[name] ?? [])])

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

/* ── TDS overrides — UNICool AL variants ──────────────────────────────────── */

const TDS_OVERRIDES_PEG_GLYCOL = {
  physicalProperties: [
    { property: 'Appearance',             value: 'Clear, colourless to pale liquid', unit: '—',    method: 'Visual' },
    { property: 'Odour',                  value: 'Mild glycol, neutral',              unit: '—',    method: '—' },
    { property: 'Flash Point',            value: '> 100',                             unit: '°C',   method: 'Pensky-Martens' },
    { property: 'Density',                value: '1.00 – 1.04',                       unit: 'g/mL', method: 'ISO 2811' },
    { property: 'Evaporation Rate',       value: 'Slow (water-based)',                unit: '—',    method: 'vs diethyl ether = 1' },
    { property: 'Dry Time',               value: '60 – 180',                          unit: 's',    method: 'Ambient, cotton wipe' },
    { property: 'Residue on Evaporation', value: '0.5 – 2.0%',                       unit: '—',    method: 'ASTM D2369' },
  ],
  composition: [
    { name: 'Deionised Water',     function: 'Primary carrier',                    percent: '> 90%', compat: 'All substrates' },
    { name: 'Co-solvent',    function: 'Co-solvent and humectant',            percent: '1 – 3%', compat: 'Metals, plastics' },
    { name: 'Viscosity modifier',             function: 'Viscosity modifier and wetting aid', percent: '< 1%',   compat: 'Metals, plastics' },
    { name: 'pH regulator',                 function: 'pH regulator (mild alkalinity)',     percent: '< 1%',   compat: 'Metals, glass' },
    { name: 'Non-ionic surfactant', function: 'Wetting and degreasing aid',        percent: '< 1%',   compat: 'All substrates' },
  ],
  performance: [
    { label: 'Evaporation residue',     val: '0.5 – 2.0% (ASTM D2369)' },
    { label: 'Dry time',               val: '60 – 180 s (ambient)' },
    { label: 'Aluminium compatibility', val: 'No staining or etching at ambient' },
  ],
  safetyNote: 'Water-based formulation — low flammability risk (flash point > 100 °C). Avoid contact with eyes and skin. Use in ventilated area. Refer to SDS-UCL-001.',
}

const TDS_OVERRIDES_ALCOHOL_PRECISION = {
  physicalProperties: [
    { property: 'Appearance',             value: 'Clear, colourless liquid', unit: '—',    method: 'Visual' },
    { property: 'Odour',                  value: 'Mild alcohol',              unit: '—',    method: '—' },
    { property: 'Flash Point',            value: '38 – 50',                   unit: '°C',   method: 'Pensky-Martens' },
    { property: 'Density',                value: '0.94 – 0.97',               unit: 'g/mL', method: 'ISO 2811' },
    { property: 'Evaporation Rate',       value: 'Moderate',                  unit: '—',    method: 'vs diethyl ether = 1' },
    { property: 'Dry Time',               value: '20 – 60',                   unit: 's',    method: 'Ambient, cotton wipe' },
    { property: 'Residue on Evaporation', value: '≤ 0.01%',                  unit: '—',    method: 'ASTM D2369' },
  ],
  composition: [
    { name: 'Deionised Water',          function: 'Primary carrier',           percent: '~ 85%',   compat: 'All substrates' },
    { name: 'Volatile co-solvent',                  function: 'Co-solvent, fast drying',   percent: '10%',     compat: 'Metals, PCBs' },
    { name: 'Volatile solvent',  function: 'Co-solvent, degreasing',    percent: '5%',      compat: 'Metals, PCBs' },
    { name: 'Non-ionic surfactant',     function: 'Wetting aid',               percent: '< 0.1%',  compat: 'All substrates' },
    { name: 'pH regulator',             function: 'Mild alkalinity buffer',    percent: '< 0.1%',  compat: 'All substrates' },
  ],
  performance: [
    { label: 'Evaporation residue',     val: '≤ 0.01% (ASTM D2369)' },
    { label: 'Dry time',               val: '20 – 60 s (ambient)' },
    { label: 'Aluminium compatibility', val: 'No staining or etching at ambient' },
  ],
  safetyNote: 'Flammable liquid — flash point 38 – 50 °C. Keep away from heat, sparks, and open flames. Use in well-ventilated area. Refer to SDS-UCL-001.',
}

const TDS_OVERRIDES_HIGH_IPA = {
  physicalProperties: [
    { property: 'Appearance',             value: 'Clear, colourless liquid', unit: '—',    method: 'Visual' },
    { property: 'Odour',                  value: 'Strong alcohol',     unit: '—',    method: '—' },
    { property: 'Flash Point',            value: '26 – 38',                   unit: '°C',   method: 'Pensky-Martens' },
    { property: 'Density',                value: '0.90 – 0.94',               unit: 'g/mL', method: 'ISO 2811' },
    { property: 'Evaporation Rate',       value: 'Fast',                      unit: '—',    method: 'vs diethyl ether = 1' },
    { property: 'Dry Time',               value: '15 – 40',                   unit: 's',    method: 'Ambient, cotton wipe' },
    { property: 'Residue on Evaporation', value: '≤ 0.001%',                 unit: '—',    method: 'ASTM D1353' },
  ],
  composition: [
    { name: 'Deionised Water',          function: 'Primary carrier',               percent: '~ 80%',   compat: 'All substrates' },
    { name: 'Volatile solvent',  function: 'Primary solvent, fast drying',  percent: '20%',     compat: 'Metals, PCBs' },
    { name: 'Non-ionic surfactant',     function: 'Wetting aid',                   percent: '< 0.1%',  compat: 'All substrates' },
    { name: 'pH regulator',             function: 'Mild alkalinity buffer',        percent: '< 0.1%',  compat: 'All substrates' },
  ],
  performance: [
    { label: 'Evaporation residue',     val: '≤ 0.001% (ASTM D1353)' },
    { label: 'Dry time',               val: '15 – 40 s (ambient)' },
    { label: 'Aluminium compatibility', val: 'No staining or etching at ambient' },
  ],
  safetyNote: 'Flammable liquid — flash point 26 – 38 °C. High volatile-solvent content — keep away from all ignition sources. Use only in well-ventilated areas. Refer to SDS-UCL-001.',
}

const TDS_OVERRIDES_PGME_ENHANCED = {
  physicalProperties: [
    { property: 'Appearance',             value: 'Clear, colourless liquid',      unit: '—',    method: 'Visual' },
    { property: 'Odour',                  value: 'Mild alcohol with faint ether note', unit: '—', method: '—' },
    { property: 'Flash Point',            value: '35 – 45',                       unit: '°C',   method: 'Pensky-Martens' },
    { property: 'Density',                value: '0.95 – 0.98',                   unit: 'g/mL', method: 'ISO 2811' },
    { property: 'Evaporation Rate',       value: 'Moderate to fast',              unit: '—',    method: 'vs diethyl ether = 1' },
    { property: 'Dry Time',               value: '20 – 60',                       unit: 's',    method: 'Ambient, cotton wipe' },
    { property: 'Residue on Evaporation', value: '1.0 – 3.0%',                   unit: '—',    method: 'ASTM D2369' },
  ],
  composition: [
    { name: 'Deionised Water',                       function: 'Primary carrier and cooling medium',                                    percent: '~ 82%', compat: 'All substrates' },
    { name: 'Volatile solvent',               function: 'Fast evaporation, cooling, improved drying',                            percent: '15%',   compat: 'Metals, aluminium' },
    { name: 'Co-solvent',                      function: 'Lubricity, corrosion protection, evaporation control',                  percent: '~ 2%',  compat: 'Metals, plastics' },
    { name: 'Wetting co-solvent',  function: 'Wetting agent, residue reduction, improved surface finish and chip flushing', percent: '~ 1%', compat: 'Metals, aluminium' },
  ],
  performance: [
    { label: 'Evaporation residue',      val: '1.0 – 3.0% (ASTM D2369) — lubricity film' },
    { label: 'Dry time',                val: '20 – 60 s (ambient)' },
    { label: 'Wetting / chip flushing',  val: 'Improved wetting and chip flushing on aluminium' },
    { label: 'Aluminium compatibility',  val: 'No staining or etching at ambient' },
  ],
  safetyNote: 'Flammable liquid — flash point 35 – 45 °C. Keep away from heat, sparks, and open flames. Use in well-ventilated area. Refer to SDS-UCL-001.',
}

const TDS_OVERRIDES_PG_HIGH_LUBRICITY = {
  physicalProperties: [
    { property: 'Appearance',             value: 'Clear, colourless liquid',       unit: '—',    method: 'Visual' },
    { property: 'Odour',                  value: 'Mild, faint ether note',         unit: '—',    method: '—' },
    { property: 'Flash Point',            value: '> 90',                           unit: '°C',   method: 'Pensky-Martens' },
    { property: 'Density',                value: '1.00 – 1.02',                    unit: 'g/mL', method: 'ISO 2811' },
    { property: 'Evaporation Rate',       value: 'Slow (water-based)',             unit: '—',    method: 'vs diethyl ether = 1' },
    { property: 'Dry Time',               value: '90 – 200',                       unit: 's',    method: 'Ambient, cotton wipe' },
    { property: 'Residue on Evaporation', value: '2.0 – 4.5%',                    unit: '—',    method: 'ASTM D2369' },
  ],
  composition: [
    { name: 'Deionised Water',                                     function: 'Primary cooling medium',                                                percent: '95.60%', compat: 'All substrates' },
    { name: 'Co-solvent',                                function: 'Lubricity, corrosion protection, evaporation control',                 percent: '2.80%',  compat: 'Metals, aluminium' },
    { name: 'Wetting co-solvent',          function: 'Wetting agent, residue reduction, chip flushing, improved surface finish', percent: '1.60%', compat: 'Metals, aluminium' },
  ],
  performance: [
    { label: 'Evaporation residue',     val: '2.0 – 4.5% (ASTM D2369) — lubricity film' },
    { label: 'Dry time',               val: '90 – 200 s (ambient)' },
    { label: 'Wetting / chip flushing', val: 'Enhanced wetting and chip flushing for aluminium machining' },
    { label: 'Aluminium compatibility', val: 'No staining or etching at ambient' },
  ],
  safetyNote: 'Water-based formulation — non-flammable at ambient (flash point > 90 °C). Avoid contact with eyes and skin. Use in ventilated area. Refer to SDS-UCL-001.',
}

/* ── MSDS overrides — UNICool AL variants ─────────────────────────────────── */

const MSDS_OVERRIDES_PEG_GLYCOL = {
  signalWord: 'Warning',
  hazards: {
    pictograms:      ['irritant'],
    classifications: [
      { class: 'Eye Irritation',  category: 'Cat 2', tagType: 'warn' },
      { class: 'Skin Irritation', category: 'Cat 3', tagType: 'warn' },
    ],
    hStatements: 'H319 — Causes serious eye irritation. H316 — Causes mild skin irritation.',
    pStatements: 'P261 · P264 · P280 · P305+P351+P338',
  },
  composition: {
    ingredients: [
      { name: 'Water',                description: 'Primary carrier — major component',   percent: '> 90%', ghsClass: '—',       tagType: 'safe' },
      { name: 'Co-solvent',     description: 'Co-solvent and humectant',            percent: '1 – 3%', ghsClass: 'Irritant', tagType: 'warn' },
      { name: 'Viscosity modifier',              description: 'Viscosity modifier and wetting aid', percent: '< 1%',   ghsClass: '—',        tagType: 'safe' },
      { name: 'pH regulator',                  description: 'pH regulator — mild alkalinity',     percent: '< 1%',   ghsClass: 'Irritant', tagType: 'warn' },
      { name: 'Non-ionic surfactant', description: 'Wetting and degreasing aid',          percent: '< 1%',   ghsClass: 'Irritant', tagType: 'warn' },
    ],
    note: 'Exact formulation is proprietary. Functional ingredient descriptions are provided for safety and emergency purposes only.',
  },
  fireFighting: {
    flammability:       'Non-flammable water-based product. Flash point > 100 °C.',
    extinguishingMedia: 'Use media appropriate to surrounding fire.',
    fireHazard:         'Not applicable. Product does not support combustion under normal conditions.',
    ppe:                'Standard PPE appropriate to surrounding hazards.',
  },
  physical: [
    { key: 'Appearance',    val: 'Clear, colourless to pale liquid' },
    { key: 'Odour',         val: 'Mild glycol, neutral' },
    { key: 'Flash Point',   val: '> 100 °C (non-flammable)' },
    { key: 'Density',       val: '1.00 – 1.04 g/mL' },
    { key: 'pH',            val: '7.0 – 9.0' },
    { key: 'Solubility',    val: 'Fully miscible with water' },
    { key: 'Evaporation',   val: 'Slow (water-based)' },
    { key: 'Boiling Point', val: '> 100 °C' },
  ],
  accidentalRelease: [
    'No ignition source elimination required — non-flammable product',
    'Contain spill with absorbent material (sand, cloth, paper)',
    'Prevent runoff from entering drains or waterways',
    'Collect spilled material and dispose per CPCB/SPCB guidelines',
    'Clean area with water',
  ],
  handling: {
    handling:    'Avoid contact with eyes and skin. Use in well-ventilated areas. No ignition source control required.',
    storageTemp: '5 °C – 40 °C; cool, dry area; away from direct sunlight',
    containers:  'HDPE bottles or jerrycans; keep tightly sealed when not in use',
    segregation: 'Store separately from strong acids and strong alkalis',
    shelfLife:   '24 months from date of manufacture in original sealed containers',
  },
}

const MSDS_OVERRIDES_ALCOHOL_PRECISION = {
  signalWord: 'Warning',
  hazards: {
    pictograms:      ['flammable', 'irritant'],
    classifications: [
      { class: 'Flammable Liquid', category: 'Cat 3', tagType: 'warn' },
      { class: 'Eye Irritation',   category: 'Cat 2', tagType: 'warn' },
    ],
    hStatements: 'H226 — Flammable liquid and vapour. H319 — Causes serious eye irritation.',
    pStatements: 'P210 · P233 · P261 · P280 · P305+P351+P338 · P370+P378',
  },
  composition: {
    ingredients: [
      { name: 'Water',                   description: 'Primary carrier — major component',  percent: '~ 85%',   ghsClass: '—',         tagType: 'safe' },
      { name: 'Volatile co-solvent',                 description: 'Co-solvent, fast drying',            percent: '10%',     ghsClass: 'Flammable', tagType: 'warn' },
      { name: 'Volatile solvent', description: 'Co-solvent, degreasing',             percent: '5%',      ghsClass: 'Flammable', tagType: 'warn' },
      { name: 'Non-ionic surfactant',    description: 'Wetting aid',                        percent: '< 0.1%',  ghsClass: 'Irritant',  tagType: 'warn' },
      { name: 'pH regulator',            description: 'Mild alkalinity buffer',             percent: '< 0.1%',  ghsClass: 'Irritant',  tagType: 'warn' },
    ],
    note: 'Exact formulation is proprietary. Functional ingredient descriptions are provided for safety and emergency purposes only.',
  },
  fireFighting: {
    flammability:       'Flammable liquid. Flash point 38 – 50 °C (Pensky-Martens).',
    extinguishingMedia: 'CO₂, dry powder, alcohol-resistant foam.',
    fireHazard:         'Alcohol vapours may accumulate in enclosed spaces and ignite. Avoid vapour accumulation.',
    ppe:                'SCBA and fire-resistant clothing for enclosed-space fires.',
  },
  physical: [
    { key: 'Appearance',    val: 'Clear, colourless liquid' },
    { key: 'Odour',         val: 'Mild alcohol' },
    { key: 'Flash Point',   val: '38 – 50 °C' },
    { key: 'Density',       val: '0.94 – 0.97 g/mL' },
    { key: 'pH',            val: '7.0 – 9.0' },
    { key: 'Solubility',    val: 'Fully miscible with water' },
    { key: 'Evaporation',   val: 'Moderate' },
    { key: 'Boiling Point', val: '85 – 95 °C' },
  ],
  accidentalRelease: [
    'Eliminate ignition sources — flammable vapour risk at elevated temperatures',
    'Ventilate area well to prevent vapour accumulation',
    'Contain spill with inert absorbent material (sand, vermiculite)',
    'Prevent runoff from entering drains or waterways',
    'Collect spilled material and dispose per CPCB/SPCB guidelines',
  ],
  handling: {
    handling:    'Keep away from ignition sources above 38 °C. Use in well-ventilated areas. Avoid contact with eyes and skin.',
    storageTemp: '5 °C – 35 °C; cool, dry, ventilated area; away from heat and direct sunlight',
    containers:  'HDPE bottles or jerrycans; keep tightly sealed when not in use',
    segregation: 'Store separately from oxidising agents, strong acids, and strong alkalis',
    shelfLife:   '24 months from date of manufacture in original sealed containers',
  },
}

const MSDS_OVERRIDES_HIGH_IPA = {
  // Warning, not Danger: Flam. Liq. 3 / Eye Irrit. 2 / STOT SE 3 carry no Danger-level class.
  // No GHS09: no aquatic classification.
  signalWord: 'Warning',
  hazards: {
    pictograms:      ['flammable', 'irritant'],
    classifications: [
      { class: 'Flammable Liquid',      category: 'Cat 3',        tagType: 'warn' },
      { class: 'Eye Irritation',        category: 'Cat 2',        tagType: 'warn' },
      { class: 'Specific Target Organ', category: 'Cat 3 (CNS)', tagType: 'warn' },
    ],
    hStatements: 'H226 — Flammable liquid and vapour. H319 — Causes serious eye irritation. H336 — May cause drowsiness or dizziness.',
    pStatements: 'P210 · P233 · P261 · P280 · P305+P351+P338 · P370+P378',
  },
  composition: {
    ingredients: [
      { name: 'Water',                   description: 'Primary carrier',                           percent: '~ 80%',   ghsClass: '—',         tagType: 'safe'   },
      { name: 'Volatile solvent', description: 'Primary solvent — fast-drying, degreasing', percent: '20%',     ghsClass: 'Flammable', tagType: 'danger' },
      { name: 'Non-ionic surfactant',    description: 'Wetting aid',                               percent: '< 0.1%',  ghsClass: 'Irritant',  tagType: 'warn'   },
      { name: 'pH regulator',            description: 'Mild alkalinity buffer',                    percent: '< 0.1%',  ghsClass: 'Irritant',  tagType: 'warn'   },
    ],
    note: 'Exact formulation is proprietary. Functional ingredient descriptions are provided for safety and emergency purposes only.',
  },
  fireFighting: {
    flammability:       'Flammable liquid. Flash point 26 – 38 °C. High volatile-solvent content increases fire risk.',
    extinguishingMedia: 'CO₂, dry powder, alcohol-resistant foam.',
    fireHazard:         'Solvent vapours may travel to ignition source and flashback. Vapour accumulation in enclosed spaces is dangerous.',
    ppe:                'SCBA and full fire-resistant clothing.',
  },
  physical: [
    { key: 'Appearance',    val: 'Clear, colourless liquid' },
    { key: 'Odour',         val: 'Strong alcohol characteristic' },
    { key: 'Flash Point',   val: '26 – 38 °C' },
    { key: 'Density',       val: '0.90 – 0.94 g/mL' },
    { key: 'pH',            val: '7.0 – 9.0' },
    { key: 'Solubility',    val: 'Fully miscible with water' },
    { key: 'Evaporation',   val: 'Fast (high volatile-solvent content)' },
    { key: 'Boiling Point', val: '~ 82 °C' },
  ],
  accidentalRelease: [
    'Eliminate all ignition sources immediately — high flammability risk',
    'Ventilate area thoroughly to prevent vapour accumulation',
    'Contain spill with inert absorbent material (sand, vermiculite)',
    'Prevent runoff from entering drains or waterways',
    'Collect spilled material and dispose per CPCB/SPCB guidelines',
  ],
  handling: {
    handling:    'Keep away from all ignition sources. Use only in well-ventilated areas or with mechanical exhaust.',
    storageTemp: '5 °C – 30 °C; cool, dry, ventilated flammable storage area; away from heat and direct sunlight',
    containers:  'HDPE bottles or HDPE jerrycans with antistatic grounding; keep tightly sealed when not in use',
    segregation: 'Store separately from oxidising agents, strong acids, strong alkalis, and heat sources',
    shelfLife:   '24 months from date of manufacture in original sealed containers',
  },
}

const MSDS_OVERRIDES_PGME_ENHANCED = {
  signalWord: 'Warning',
  hazards: {
    pictograms:      ['flammable', 'irritant'],
    classifications: [
      { class: 'Flammable Liquid',      category: 'Cat 3',       tagType: 'warn' },
      { class: 'Eye Irritation',        category: 'Cat 2',       tagType: 'warn' },
      { class: 'Specific Target Organ', category: 'Cat 3 (CNS)', tagType: 'warn' },
    ],
    hStatements: 'H226 — Flammable liquid and vapour. H319 — Causes serious eye irritation. H336 — May cause drowsiness or dizziness.',
    pStatements: 'P210 · P233 · P261 · P280 · P305+P351+P338 · P370+P378',
  },
  composition: {
    ingredients: [
      { name: 'Water',                                description: 'Primary carrier and cooling medium',                       percent: '~ 82%', ghsClass: '—',         tagType: 'safe' },
      { name: 'Volatile solvent',              description: 'Fast evaporation, cooling, improved drying',               percent: '15%',   ghsClass: 'Flammable', tagType: 'warn' },
      { name: 'Co-solvent',                     description: 'Lubricity, corrosion protection, evaporation control',     percent: '~ 2%',  ghsClass: '—',         tagType: 'safe' },
      { name: 'Wetting co-solvent', description: 'Wetting agent, residue reduction, improved surface finish', percent: '~ 1%', ghsClass: 'Flammable', tagType: 'warn' },
    ],
    note: 'Exact formulation is proprietary. Functional ingredient descriptions are provided for safety and emergency purposes only.',
  },
  fireFighting: {
    flammability:       'Flammable liquid. Flash point 35 – 45 °C (Pensky-Martens).',
    extinguishingMedia: 'CO₂, dry powder, alcohol-resistant foam.',
    fireHazard:         'Solvent vapours may accumulate in enclosed spaces and ignite. Avoid vapour accumulation.',
    ppe:                'SCBA and fire-resistant clothing for enclosed-space fires.',
  },
  physical: [
    { key: 'Appearance',    val: 'Clear, colourless liquid' },
    { key: 'Odour',         val: 'Mild alcohol with faint ether note' },
    { key: 'Flash Point',   val: '35 – 45 °C' },
    { key: 'Density',       val: '0.95 – 0.98 g/mL' },
    { key: 'pH',            val: '6.5 – 8.5' },
    { key: 'Solubility',    val: 'Fully miscible with water' },
    { key: 'Evaporation',   val: 'Moderate to fast' },
    { key: 'Boiling Point', val: '82 – 100 °C' },
  ],
  accidentalRelease: [
    'Eliminate ignition sources — flammable vapour risk at elevated temperatures',
    'Ventilate area well to prevent vapour accumulation',
    'Contain spill with inert absorbent material (sand, vermiculite)',
    'Prevent runoff from entering drains or waterways',
    'Collect spilled material and dispose per CPCB/SPCB guidelines',
  ],
  handling: {
    handling:    'Keep away from ignition sources. Use in well-ventilated areas. Avoid contact with eyes and skin.',
    storageTemp: '5 °C – 35 °C; cool, dry, ventilated area; away from heat and direct sunlight',
    containers:  'HDPE bottles or jerrycans; keep tightly sealed when not in use',
    segregation: 'Store separately from oxidising agents, strong acids, and strong alkalis',
    shelfLife:   '24 months from date of manufacture in original sealed containers',
  },
}

const MSDS_OVERRIDES_PG_HIGH_LUBRICITY = {
  signalWord: 'Warning',
  hazards: {
    pictograms:      ['irritant'],
    classifications: [
      { class: 'Eye Irritation', category: 'Cat 2B', tagType: 'warn' },
    ],
    hStatements: 'H320 — Causes eye irritation.',
    pStatements: 'P264 · P280 · P305+P351+P338 · P337+P313',
  },
  composition: {
    ingredients: [
      { name: 'Water',                                            description: 'Primary cooling medium',                                              percent: '95.60%', ghsClass: '—',        tagType: 'safe' },
      { name: 'Co-solvent',                             description: 'Lubricity, corrosion protection, evaporation control',                percent: '2.80%',  ghsClass: '—',        tagType: 'safe' },
      { name: 'Wetting co-solvent',       description: 'Wetting agent, residue reduction, chip flushing, improved surface finish', percent: '1.60%', ghsClass: 'Irritant', tagType: 'warn' },
    ],
    note: 'Exact formulation is proprietary. Functional ingredient descriptions are provided for safety and emergency purposes only.',
  },
  fireFighting: {
    flammability:       'Non-flammable aqueous formulation. Flash point > 90 °C (Pensky-Martens).',
    extinguishingMedia: 'Water fog, CO₂, dry powder, foam — use media appropriate to surrounding fire.',
    fireHazard:         'No unusual fire hazard. Product itself does not sustain combustion.',
    ppe:                'Standard fire-fighting PPE; SCBA for large fires in enclosed spaces.',
  },
  physical: [
    { key: 'Appearance',    val: 'Clear, colourless liquid' },
    { key: 'Odour',         val: 'Mild, faint ether note' },
    { key: 'Flash Point',   val: '> 90 °C' },
    { key: 'Density',       val: '1.00 – 1.02 g/mL' },
    { key: 'pH',            val: '7.0 – 8.5' },
    { key: 'Solubility',    val: 'Fully miscible with water' },
    { key: 'Evaporation',   val: 'Slow' },
    { key: 'Boiling Point', val: '95 – 100 °C' },
  ],
  accidentalRelease: [
    'Wipe or mop up spillage — floors may become slippery',
    'Ventilate area to disperse any vapour',
    'Contain spill with inert absorbent material (sand, vermiculite)',
    'Prevent runoff from entering drains or waterways',
    'Collect spilled material and dispose per CPCB/SPCB guidelines',
  ],
  handling: {
    handling:    'Avoid contact with eyes and skin. Use in well-ventilated area. Wash hands after handling.',
    storageTemp: '5 °C – 35 °C; cool, dry, ventilated area; away from direct sunlight',
    containers:  'HDPE bottles or jerrycans; keep tightly sealed when not in use',
    segregation: 'Store separately from strong oxidising agents',
    shelfLife:   '24 months from date of manufacture in original sealed containers',
  },
}

/* ── CoA tests — UNICool AL variants ─────────────────────────────────────── */

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

const COA_TESTS_PGME_ENHANCED = [
  { parameter: 'Appearance',               method: 'Visual',              specification: 'Clear, colourless liquid',  result: '', status: 'Pass' },
  { parameter: 'pH (neat, 25 °C)',         method: 'pH Electrode',        specification: '6.5 – 8.5',                result: '', status: 'Pass' },
  { parameter: 'Flash Point',              method: 'Pensky-Martens (PM)', specification: '35 – 45 °C',               result: '', status: 'Pass' },
  { parameter: 'Specific Gravity (25 °C)', method: 'ISO 2811',            specification: '0.95 – 0.98',              result: '', status: 'Pass' },
  { parameter: 'Evaporation Residue',      method: 'ASTM D2369',          specification: '1.0 – 3.0 %',              result: '', status: 'Pass' },
  { parameter: 'Dry Time (ambient)',       method: 'Cotton Wipe Method',  specification: '20 – 60 s',                result: '', status: 'Pass' },
  { parameter: 'Aluminium Compatibility',  method: 'Coupon test (24 h)',  specification: 'No staining, no etching',  result: '', status: 'Pass' },
]

const COA_TESTS_PG_HIGH_LUBRICITY = [
  { parameter: 'Appearance',               method: 'Visual',              specification: 'Clear, colourless liquid',  result: '', status: 'Pass' },
  { parameter: 'pH (neat, 25 °C)',         method: 'pH Electrode',        specification: '7.0 – 8.5',                result: '', status: 'Pass' },
  { parameter: 'Flash Point',              method: 'Pensky-Martens (PM)', specification: '> 90 °C',                  result: '', status: 'Pass' },
  { parameter: 'Specific Gravity (25 °C)', method: 'ISO 2811',            specification: '1.00 – 1.02',              result: '', status: 'Pass' },
  { parameter: 'Evaporation Residue',      method: 'ASTM D2369',          specification: '2.0 – 4.5 %',              result: '', status: 'Pass' },
  { parameter: 'Dry Time (ambient)',       method: 'Cotton Wipe Method',  specification: '90 – 200 s',                result: '', status: 'Pass' },
  { parameter: 'Aluminium Compatibility',  method: 'Coupon test (24 h)',  specification: 'No staining, no etching',  result: '', status: 'Pass' },
]

/**
 * Low-Evaporation Variant for UNICool AL.
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
 * Fast-Dry Variant for UNICool AL.
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

/**
 * Enhanced Wetting Variant for UNICool AL.
 * Percentage-based; Water is auto-calculated (100 − 18.20 = 81.80%).
 * Optimised for aluminium machining: IPA for fast drying, Propylene Glycol
 * for lubricity and corrosion protection, PGME (Dowanol PM) for wetting,
 * residue reduction, and chip flushing. All components stored in litres.
 * Material names match inventory_items exactly so batch inventory deduction
 * (exact lower-case match in batches.service.ts) and FormulaPage price
 * matching both resolve.
 */
const PGME_ENHANCED_COMPONENTS = [
  { materialName: 'Water',                                 percentage: null,  unit: 'L' as const },  // auto-calc 81.80%
  { materialName: 'IPA (Isopropyl Alcohol)',               percentage: 15.00, unit: 'L' as const },
  { materialName: 'Propylene Glycol (PG)',                 percentage: 2.10,  unit: 'L' as const },
  { materialName: 'Propylene Glycol Methyl Ether (PGME)',  percentage: 1.10,  unit: 'L' as const },
]

/**
 * High Lubricity Variant for UNICool AL.
 * Percentage-based; Water is auto-calculated (100 − 4.40 = 95.60%).
 * Optimised for aluminium machining requiring enhanced lubricity, excellent
 * wetting, and a residue-free finish, without any alcohol content: Propylene
 * Glycol for lubricity/corrosion protection/evaporation control, Propylene
 * Glycol Methyl Ether (Dowanol PM) for wetting, residue reduction, chip
 * flushing, and improved surface finish. All components stored in litres.
 * "Dowanol PM" is kept as a distinct inventory SKU from the existing "(PGME)"
 * item (see inventory.seed.ts) — material names match inventory_items
 * exactly so batch inventory deduction and FormulaPage price matching resolve.
 */
const PG_HIGH_LUBRICITY_COMPONENTS = [
  { materialName: 'Water',                                            percentage: null, unit: 'L' as const },  // auto-calc 95.60%
  { materialName: 'Propylene Glycol (PG)',                            percentage: 2.80, unit: 'L' as const },
  { materialName: 'Propylene Glycol Methyl Ether (Dowanol PM)',      percentage: 1.60, unit: 'L' as const },
]

/**
 * Low Foam Rust Inhibiting Variant for UNIKLEAN SP.
 * Percentage-based; DM Water is auto-calculated (~88.18%) so the 8 active
 * components below (summing to 11.82%) are preserved exactly as specified.
 */
const UNIKLEAN_SP_LOW_FOAM_COMPONENTS = [
  { materialName: 'DM Water',              percentage: null, unit: 'L'  as const },  // auto-calc ~88.18%
  { materialName: 'TEA',                   percentage: 5.09, unit: 'Kg' as const },
  { materialName: 'LAE-9',                percentage: 1.70, unit: 'Kg' as const },
  { materialName: 'LAE-7',                percentage: 1.02, unit: 'Kg' as const },
  { materialName: 'Sodium Nitrite',         percentage: 1.70, unit: 'Kg' as const },
  { materialName: 'Sodium Benzoate',        percentage: 1.36, unit: 'Kg' as const },
  { materialName: 'Sodium Gluconate',       percentage: 0.68, unit: 'Kg' as const },
  { materialName: 'Sodium Molybdate',       percentage: 0.07, unit: 'Kg' as const },
  { materialName: 'Silicone-Free Defoamer', percentage: 0.20, unit: 'Kg' as const },
]

/**
 * Heavy Duty Alkaline Variant for UNIKLEAN SP.
 * Percentage-based (% w/v); Water is auto-calculated (~84.48%).
 * Reference batch: 100 L. Active components sum to 15.52%.
 * Uses Sodium Metasilicate as primary builder for heavy alkaline degreasing,
 * Sodium Nitrite for flash rust protection, Alphox 200 for low-foam surfactancy.
 */
const UNIKLEAN_SP_HEAVY_DUTY_SMS_COMPONENTS = [
  { materialName: 'Water',                             percentage: null, unit: 'L'  as const },  // auto-calc ~84.48%
  { materialName: 'Sodium Metasilicate (SMS)',          percentage: 5.50, unit: 'Kg' as const },
  { materialName: 'Soda Ash (Sodium Carbonate)',        percentage: 5.00, unit: 'Kg' as const },
  { materialName: 'Trisodium Phosphate (TSP)',          percentage: 3.50, unit: 'Kg' as const },
  { materialName: 'EDTA Disodium',                     percentage: 0.50, unit: 'Kg' as const },
  { materialName: 'Alphox 200 (Non-ionic Surfactant)', percentage: 0.20, unit: 'Kg' as const },
  { materialName: 'Sodium Nitrite (NaNO₂)',            percentage: 0.80, unit: 'Kg' as const },
  { materialName: 'Non-silicone Defoamer',             percentage: 0.02, unit: 'Kg' as const },
]

/**
 * Enhanced Flash Rust Protection Variant for UNIKLEAN SP.
 * Reference batch: 150 L. Active components sum to ~13.95% (water is balance).
 * Sodium Nitrite (1.20%) is the primary flash rust inhibitor;
 * Sodium Molybdate (0.08%, rounded from specified 0.075%) is the secondary inhibitor.
 * LAE-9 provides low-foam non-ionic wetting and emulsification.
 */
const UNIKLEAN_SP_ENHANCED_FLASH_RUST_COMPONENTS = [
  { materialName: 'DM Water',                    percentage: null, unit: 'L'  as const },  // auto-calc balance
  { materialName: 'Sodium Metasilicate (SMS)',    percentage: 4.50, unit: 'Kg' as const },
  { materialName: 'Soda Ash (Sodium Carbonate)', percentage: 4.00, unit: 'Kg' as const },
  { materialName: 'Trisodium Phosphate (TSP)',   percentage: 3.50, unit: 'Kg' as const },
  { materialName: 'LAE-9',                       percentage: 0.15, unit: 'Kg' as const },
  { materialName: 'Sodium Nitrite',              percentage: 1.20, unit: 'Kg' as const },
  { materialName: 'Sodium Gluconate',            percentage: 0.50, unit: 'Kg' as const },
  { materialName: 'Sodium Molybdate',            percentage: 0.08, unit: 'Kg' as const },  // 0.075% rounded to 2dp
  { materialName: 'Non-silicone Defoamer',       percentage: 0.02, unit: 'Kg' as const },
]

/**
 * UNISOLVE H3 - 30 KG Variant (concentrated phosphoric acid cleaner).
 * Reference batch: 30 kg. Phosphoric Acid (85%) 9.000 kg (30%) + Water 21.000 kg (70%).
 * Water is auto-calculated (percentage: null) to preserve the exact 30/70 split.
 * materialName values match existing inventory_items exactly ('Phosphoric Acid',
 * 'DM Water') — no new inventory items created — so batch inventory deduction
 * (exact lower-case match in batches.service.ts) and FormulaPage price matching
 * both resolve. Both names also match aliases in ingredient_hazard_profiles.seed.ts
 * ('Phosphoric Acid (85%)' → alias 'Phosphoric Acid'; 'Water' → alias 'DM Water'),
 * so TDS/MSDS composition and hazard sections derive automatically from the real
 * components — no tdsOverrides/msdsOverrides needed for this variant.
 */
const UNISOLVE_H3_30KG_COMPONENTS = [
  { materialName: 'Phosphoric Acid', percentage: 30.00, unit: 'Kg' as const },  // 9.000 kg / 30 kg batch
  { materialName: 'DM Water',        percentage: null,  unit: 'L'  as const },  // auto-calc 70% — 21.000 kg / 30 kg batch
]

/**
 * UNIKBRIGHTNER — Base Formula variant, mirroring the real composition supplied
 * for the product (see FRM-UB-001 in products.seed.ts): 20.0 kg Citric Acid,
 * 3.35 L Hydrogen Peroxide (50%), 96.65 L DM Water per 100 L reference batch.
 * DM Water is given its exact supplied percentage (not `null`/auto-calculated)
 * because this formula mixes a % w/v solid with % v/v liquids that together
 * already sum to 100% on their own — auto-calculating water as
 * `100 - sum(others)` would silently produce 76.65% instead of the supplied
 * 96.65%. This is not a placeholder — it is the actual supplied formulation.
 */
const UNIKBRIGHTNER_BASE_COMPONENTS = [
  { materialName: 'Citric Acid (solid)',     percentage: 20.0,  unit: 'Kg' as const },
  { materialName: 'Hydrogen Peroxide (50%)', percentage: 3.35,  unit: 'L'  as const },
  { materialName: 'DM Water',                percentage: 96.65, unit: 'L'  as const },
]

/**
 * UNIKSTRIP-HD — Base Formula variant, mirroring FRM-USH-001 in products.seed.ts
 * (% w/w, supplied as a 2.857 kg laboratory batch). materialName values match
 * inventory_items names exactly.
 */
const UNIKSTRIP_HD_BASE_COMPONENTS = [
  { materialName: 'Benzyl Alcohol',    percentage: 70,   unit: 'Kg' as const },
  { materialName: 'Butyl Glycol',      percentage: 20,   unit: 'Kg' as const },
  { materialName: 'LAE-7',             percentage: 2,    unit: 'Kg' as const },
  { materialName: 'DM Water',          percentage: null, unit: 'L'  as const },  // auto-calc 3%
  { materialName: 'Formic Acid (85%)', percentage: 5,    unit: 'Kg' as const },
]

/**
 * CORROCUT 500 — Water-Displacing Rust Preventive Oil variant, from the supplied
 * costing sheet (400 L reference batch): MTO 140 L, LLP 80 L, Exxsol D60 80 L,
 * Exxsol 32D 24 L, Calcium Petroleum Sulfonate 52 kg, White Petroleum Jelly 24 kg.
 * Percentages are the sheet's nominal recipe shares (mixed L/kg units, sum 100%).
 * materialName values match existing inventory_items names exactly (incl. the
 * inventory's 'Exxol' spelling for Exxsol D60/32D) so batch inventory deduction
 * and FormulaPage price matching resolve.
 */
const CORRUCUT_500_WDRPO_COMPONENTS = [
  { materialName: 'Mineral Turpentine Oil (MTO)', percentage: 35.0, unit: 'L'  as const },  // 140 L / 400 L
  { materialName: 'Light Paraffinic Mineral Oil', percentage: 20.0, unit: 'L'  as const },  //  80 L — LLP
  { materialName: 'Exxol D60',                    percentage: 20.0, unit: 'L'  as const },  //  80 L — Exxsol D60
  { materialName: 'Exxol 32D',                    percentage: 6.0,  unit: 'L'  as const },  //  24 L — Exxsol 32D
  { materialName: 'Calcium Petroleum Sulfonate',  percentage: 13.0, unit: 'Kg' as const },  //  52 kg
  { materialName: 'White petroleum jelly',        percentage: 6.0,  unit: 'Kg' as const },  //  24 kg
]

/**
 * CORROCUT 500 — MTO Based alternate formulation supplied from the formulation
 * editor. Zero-percent Exxol D60 and Exxol 32D rows are intentionally omitted.
 */
const CORRUCUT_500_MTO_BASED_COMPONENTS = [
  { materialName: 'Mineral Turpentine Oil (MTO)', percentage: 55.0, unit: 'L'  as const },
  { materialName: 'Light Paraffinic Mineral Oil', percentage: 26.0, unit: 'L'  as const },
  { materialName: 'Calcium Petroleum Sulfonate',  percentage: 13.0, unit: 'Kg' as const },
  { materialName: 'White petroleum jelly',        percentage: 6.0,  unit: 'Kg' as const },
]

/**
 * CORROCUT 500 — Sodium + Barium Sulfonate formulation. Calcium Petroleum
 * Sulfonate is replaced entirely by Barium Petroleum Sulfonate at an 80:20
 * Na:Ba sulfonate ratio. Supplied sheet (nominal 75 L batch) by weight:
 * MTO 37.920 kg, 32D Oil 9.350 kg, Exxsol D145 1.418 kg, Sodium Petroleum
 * Sulfonate 7.800 kg, Barium Petroleum Sulfonate 1.950 kg, White petroleum jelly 4.500 kg —
 * 62.938 kg total. Converted to litres with typical densities (g/mL @ 25 °C,
 * not measured): 76.096 L calculated volume, so calculated SG ≈ 0.827.
 * Percentages are % v/v of that volume (the FormulaPage convention — SG is
 * Σ v/v × density), so every row is in L with its density. '32D Oil' /
 * 'Exxsol D145' use the inventory's 'Exxol 32D' / 'Exxol D145' names.
 */
const CORRUCUT_500_NA_BA_SULFONATE_COMPONENTS = [
  { materialName: 'Mineral Turpentine Oil (MTO)', percentage: 63.48, unit: 'L' as const, density: 0.785 },  // 37.920 kg → 48.306 L
  { materialName: 'Exxol 32D',                    percentage: 15.36, unit: 'L' as const, density: 0.80  },  //  9.350 kg → 11.687 L — 32D Oil
  { materialName: 'Exxol D145',                   percentage: 2.27,  unit: 'L' as const, density: 0.82  },  //  1.418 kg →  1.729 L — Exxsol D145
  { materialName: 'Sodium Petroleum Sulfonate',   percentage: 9.76,  unit: 'L' as const, density: 1.05  },  //  7.800 kg →  7.429 L
  { materialName: 'Barium Petroleum Sulfonate',   percentage: 2.33,  unit: 'L' as const, density: 1.10  },  //  1.950 kg →  1.773 L
  { materialName: 'White petroleum jelly',        percentage: 6.80,  unit: 'L' as const, density: 0.87  },  //  4.500 kg →  5.172 L
]

/**
 * CORROCUT 500 — MTO-only formulation for 30-day temporary rust protection.
 * Supplied costing sheet (50 kg batch) by weight: MTO 85% (42.5 kg = 54.14 L),
 * Calcium Petroleum Sulfonate 12% (6.00 kg), White petroleum jelly 3% (1.50 kg). Converted
 * to % v/v with the same typical densities as the Na-Ba Sulfonate Grade:
 * 61.578 L calculated volume, so calculated SG ≈ 0.812.
 */
const CORRUCUT_500_MTO_ONLY_COMPONENTS = [
  { materialName: 'Mineral Turpentine Oil (MTO)', percentage: 87.92, unit: 'L' as const, density: 0.785 },  // 42.500 kg → 54.140 L
  { materialName: 'Calcium Petroleum Sulfonate',  percentage: 9.28,  unit: 'L' as const, density: 1.05  },  //  6.000 kg →  5.714 L
  { materialName: 'White petroleum jelly',        percentage: 2.80,  unit: 'L' as const, density: 0.87  },  //  1.500 kg →  1.724 L
]

/**
 * CORROCUT 500 — MTO-LLP based formulation. Supplied costing sheet (50 kg batch)
 * by weight: MTO 80% (40.00 kg), Light Liquid Paraffin 5% (2.50 kg), Calcium
 * Petroleum Sulfonate 12% (6.00 kg), White petroleum jelly 3% (1.50 kg). Converted
 * to % v/v with the same typical densities as the MTO Only Grade (LLP 0.86 per
 * variantDensities.seed.ts): 61.301 L calculated volume, so calculated SG ≈ 0.816.
 * LLP uses the inventory's 'Light Paraffinic Mineral Oil' name.
 */
const CORRUCUT_500_MTO_LLP_COMPONENTS = [
  { materialName: 'Mineral Turpentine Oil (MTO)', percentage: 83.13, unit: 'L' as const, density: 0.785 },  // 40.000 kg → 50.955 L
  { materialName: 'Light Paraffinic Mineral Oil', percentage: 4.74,  unit: 'L' as const, density: 0.86  },  //  2.500 kg →  2.907 L — LLP
  { materialName: 'Calcium Petroleum Sulfonate',  percentage: 9.32,  unit: 'L' as const, density: 1.05  },  //  6.000 kg →  5.714 L
  { materialName: 'White petroleum jelly',        percentage: 2.81,  unit: 'L' as const, density: 0.87  },  //  1.500 kg →  1.724 L
]

/**
 * CORROCUT 500 — High-Barium MTO-LLP formulation. Development trial for improved
 * water resistance and corrosion protection, not a validated performance
 * improvement. Supplied sheet by weight: MTO 274.080 kg, Light Paraffinic Mineral
 * Oil 17.121 kg, Sodium Petroleum Sulfonate 14.000 kg, Barium Petroleum Sulfonate
 * 17.000 kg, Calcium Petroleum Sulfonate 4.200 kg, White petroleum jelly
 * 10.268 kg — 336.669 kg total. Converted to % v/v with the same typical
 * densities as the Na-Ba Sulfonate Grade: 413.645 L calculated volume, so
 * calculated SG ≈ 0.814.
 */
const CORRUCUT_500_HIGH_BARIUM_MTO_LLP_COMPONENTS = [
  { materialName: 'Mineral Turpentine Oil (MTO)', percentage: 84.41, unit: 'L' as const, density: 0.785 },  // 274.080 kg → 349.146 L
  { materialName: 'Light Paraffinic Mineral Oil', percentage: 4.81,  unit: 'L' as const, density: 0.86  },  //  17.121 kg →  19.908 L — LLP
  { materialName: 'Sodium Petroleum Sulfonate',   percentage: 3.22,  unit: 'L' as const, density: 1.05  },  //  14.000 kg →  13.333 L
  { materialName: 'Barium Petroleum Sulfonate',   percentage: 3.74,  unit: 'L' as const, density: 1.10  },  //  17.000 kg →  15.455 L
  // Set here because the formula document's "Primary" wording would otherwise win over DRAFT_FUNCTIONS
  { materialName: 'Calcium Petroleum Sulfonate',  percentage: 0.97,  unit: 'L' as const, density: 1.05, materialFunction: 'Supplementary corrosion inhibitor (about 12% of the sulfonate) — adds to the rust-preventive film; development trial, not yet validated' },  //   4.200 kg →   4.000 L
  { materialName: 'White petroleum jelly',        percentage: 2.85,  unit: 'L' as const, density: 0.87  },  //  10.268 kg →  11.802 L
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

  // ── UNIKLEAN SP — Low Foam Rust Inhibiting Variant ───────────────────────
  const [uniklenSpProduct] = await db
    .select()
    .from(products)
    .where(eq(products.key, 'uniklean-sp'))

  if (!uniklenSpProduct) {
    console.warn('   ⚠️  Product uniklean-sp not found — skipping Low Foam Rust Inhibiting Variant seed')
  } else {
    const [existingLowFoam] = await db
      .select()
      .from(productFormulationVariants)
      .where(
        and(
          eq(productFormulationVariants.productKey, 'uniklean-sp'),
          variantNameIs('UNIKLEAN SP – Low Foam Rust Inhibiting Variant'),
        ),
      )

    if (existingLowFoam) {
      console.log(`   ↩️  Low Foam Rust Inhibiting Variant for UNIKLEAN SP already exists (id: ${existingLowFoam.id})`)
    } else {
      const [lowFoamVariant] = await db
        .insert(productFormulationVariants)
        .values({
          productKey:  'uniklean-sp',
          companyId:   null,
          variantName: 'UNIKLEAN SP – Low Foam Rust Inhibiting Variant',
          isDefault:   false,
        })
        .returning()

      await db.insert(formulationVariantComponents).values(
        UNIKLEAN_SP_LOW_FOAM_COMPONENTS.map((c, i) => ({
          variantId:    lowFoamVariant.id,
          materialName: c.materialName,
          percentage:   c.percentage !== null ? String(c.percentage) : null,
          unit:         c.unit,
          sortOrder:    i,
        })),
      )

      console.log(`   ✅ Created Low Foam Rust Inhibiting Variant for UNIKLEAN SP (id: ${lowFoamVariant.id})`)
    }
  }

  // ── UNIKLEAN SP — Heavy Duty Alkaline Variant ─────────────────────────
  if (!uniklenSpProduct) {
    console.warn('   ⚠️  Product uniklean-sp not found — skipping Heavy Duty Alkaline Variant seed')
  } else {
    const HEAVY_DUTY_SMS_NAME = 'UNIKLEAN SP – Heavy Duty Alkaline Variant'
    const [existingHeavyDutySMS] = await db
      .select()
      .from(productFormulationVariants)
      .where(
        and(
          eq(productFormulationVariants.productKey, 'uniklean-sp'),
          variantNameIs(HEAVY_DUTY_SMS_NAME),
        ),
      )

    if (existingHeavyDutySMS) {
      console.log(`   ↩️  Heavy Duty Alkaline Variant for UNIKLEAN SP already exists (id: ${existingHeavyDutySMS.id})`)
    } else {
      const [heavyDutySMSVariant] = await db
        .insert(productFormulationVariants)
        .values({
          productKey:  'uniklean-sp',
          companyId:   null,
          variantName: HEAVY_DUTY_SMS_NAME,
          isDefault:   false,
        })
        .returning()

      await db.insert(formulationVariantComponents).values(
        UNIKLEAN_SP_HEAVY_DUTY_SMS_COMPONENTS.map((c, i) => ({
          variantId:    heavyDutySMSVariant.id,
          materialName: c.materialName,
          percentage:   c.percentage !== null ? String(c.percentage) : null,
          unit:         c.unit,
          sortOrder:    i,
        })),
      )

      console.log(`   ✅ Created Heavy Duty Alkaline Variant for UNIKLEAN SP (id: ${heavyDutySMSVariant.id})`)
    }
  }

  // ── UNIKLEAN SP — Enhanced Flash Rust Protection Variant ─────────────────
  const ENHANCED_FLASH_RUST_NAME = 'UNIKLEAN SP – Enhanced Flash Rust Protection Variant'
  if (!uniklenSpProduct) {
    console.warn('   ⚠️  Product uniklean-sp not found — skipping Enhanced Flash Rust Protection Variant seed')
  } else {
    const [existingEnhancedFlashRust] = await db
      .select()
      .from(productFormulationVariants)
      .where(
        and(
          eq(productFormulationVariants.productKey, 'uniklean-sp'),
          variantNameIs(ENHANCED_FLASH_RUST_NAME),
        ),
      )

    if (existingEnhancedFlashRust) {
      console.log(`   ↩️  Enhanced Flash Rust Protection Variant for UNIKLEAN SP already exists (id: ${existingEnhancedFlashRust.id})`)
    } else {
      const [enhancedFlashRustVariant] = await db
        .insert(productFormulationVariants)
        .values({
          productKey:  'uniklean-sp',
          companyId:   null,
          variantName: ENHANCED_FLASH_RUST_NAME,
          isDefault:   false,
        })
        .returning()

      await db.insert(formulationVariantComponents).values(
        UNIKLEAN_SP_ENHANCED_FLASH_RUST_COMPONENTS.map((c, i) => ({
          variantId:    enhancedFlashRustVariant.id,
          materialName: c.materialName,
          percentage:   c.percentage !== null ? String(c.percentage) : null,
          unit:         c.unit,
          sortOrder:    i,
        })),
      )

      console.log(`   ✅ Created Enhanced Flash Rust Protection Variant for UNIKLEAN SP (id: ${enhancedFlashRustVariant.id})`)
    }
  }

  // ── UNICool AL — Low-Evaporation Variant ──────────────────────────────────────
  const [unicoolProduct] = await db
    .select()
    .from(products)
    .where(eq(products.key, 'unicool-al'))

  if (!unicoolProduct) {
    console.warn('   ⚠️  Product unicool-al not found — skipping Low-Evaporation Variant seed')
    return
  }

  const [existingPEG] = await db
    .select()
    .from(productFormulationVariants)
    .where(
      and(
        eq(productFormulationVariants.productKey, 'unicool-al'),
        variantNameIs('Low-Evaporation Variant'),
      ),
    )

  if (existingPEG) {
    console.log(`   ↩️  Low-Evaporation Variant for UNICool AL already exists (id: ${existingPEG.id})`)
    if (!existingPEG.coaTests || !existingPEG.tdsOverrides || !existingPEG.msdsOverrides) {
      await db
        .update(productFormulationVariants)
        .set({
          coaTests:     existingPEG.coaTests     ?? COA_TESTS_PEG_GLYCOL,
          tdsOverrides: existingPEG.tdsOverrides  ?? TDS_OVERRIDES_PEG_GLYCOL,
          msdsOverrides: existingPEG.msdsOverrides ?? MSDS_OVERRIDES_PEG_GLYCOL,
        })
        .where(eq(productFormulationVariants.id, existingPEG.id))
      console.log('   ✅ Backfilled coaTests / tdsOverrides / msdsOverrides for Low-Evaporation Variant')
    }
  } else {
    const [pegVariant] = await db
      .insert(productFormulationVariants)
      .values({
        productKey:   'unicool-al',
        companyId:    null,
        variantName:  'Low-Evaporation Variant',
        isDefault:    false,
        coaTests:     COA_TESTS_PEG_GLYCOL,
        tdsOverrides: TDS_OVERRIDES_PEG_GLYCOL,
        msdsOverrides: MSDS_OVERRIDES_PEG_GLYCOL,
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

    console.log(`   ✅ Created Low-Evaporation Variant for UNICool AL (id: ${pegVariant.id})`)
  }

  // ── UNICool AL — Alcohol Precision Variant ────────────────────────────────
  const [existingAlcohol] = await db
    .select()
    .from(productFormulationVariants)
    .where(
      and(
        eq(productFormulationVariants.productKey, 'unicool-al'),
        variantNameIs('Alcohol Precision Variant'),
      ),
    )

  if (existingAlcohol) {
    console.log(`   ↩️  Alcohol Precision Variant for UNICool AL already exists (id: ${existingAlcohol.id})`)
    if (!existingAlcohol.coaTests || !existingAlcohol.tdsOverrides || !existingAlcohol.msdsOverrides) {
      await db
        .update(productFormulationVariants)
        .set({
          coaTests:     existingAlcohol.coaTests     ?? COA_TESTS_ALCOHOL_PRECISION,
          tdsOverrides: existingAlcohol.tdsOverrides  ?? TDS_OVERRIDES_ALCOHOL_PRECISION,
          msdsOverrides: existingAlcohol.msdsOverrides ?? MSDS_OVERRIDES_ALCOHOL_PRECISION,
        })
        .where(eq(productFormulationVariants.id, existingAlcohol.id))
      console.log('   ✅ Backfilled coaTests / tdsOverrides / msdsOverrides for Alcohol Precision Variant')
    }
  } else {
    const [alcoholVariant] = await db
      .insert(productFormulationVariants)
      .values({
        productKey:    'unicool-al',
        companyId:     null,
        variantName:   'Alcohol Precision Variant',
        isDefault:     false,
        coaTests:      COA_TESTS_ALCOHOL_PRECISION,
        tdsOverrides:  TDS_OVERRIDES_ALCOHOL_PRECISION,
        msdsOverrides: MSDS_OVERRIDES_ALCOHOL_PRECISION,
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

  // ── UNICool AL — Fast-Dry Variant ────────────────────────────────────────
  const [existingHighIPA] = await db
    .select()
    .from(productFormulationVariants)
    .where(
      and(
        eq(productFormulationVariants.productKey, 'unicool-al'),
        variantNameIs('Fast-Dry Variant'),
      ),
    )

  if (existingHighIPA) {
    console.log(`   ↩️  Fast-Dry Variant for UNICool AL already exists (id: ${existingHighIPA.id})`)
    if (!existingHighIPA.coaTests || !existingHighIPA.tdsOverrides || !existingHighIPA.msdsOverrides) {
      await db
        .update(productFormulationVariants)
        .set({
          coaTests:     existingHighIPA.coaTests     ?? COA_TESTS_HIGH_IPA,
          tdsOverrides: existingHighIPA.tdsOverrides  ?? TDS_OVERRIDES_HIGH_IPA,
          msdsOverrides: existingHighIPA.msdsOverrides ?? MSDS_OVERRIDES_HIGH_IPA,
        })
        .where(eq(productFormulationVariants.id, existingHighIPA.id))
      console.log('   ✅ Backfilled coaTests / tdsOverrides / msdsOverrides for Fast-Dry Variant')
    }
  } else {
    // Only take the default slot if it's free — pfv_product_global_default_unique
    // allows one global default per product, and another variant may hold it.
    const [unicoolDefault] = await db
      .select({ id: productFormulationVariants.id })
      .from(productFormulationVariants)
      .where(
        and(
          eq(productFormulationVariants.productKey, 'unicool-al'),
          isNull(productFormulationVariants.companyId),
          eq(productFormulationVariants.isDefault, true),
        ),
      )

    const [highIPAVariant] = await db
      .insert(productFormulationVariants)
      .values({
        productKey:    'unicool-al',
        companyId:     null,
        variantName:   'Fast-Dry Variant',
        isDefault:     !unicoolDefault,
        coaTests:      COA_TESTS_HIGH_IPA,
        tdsOverrides:  TDS_OVERRIDES_HIGH_IPA,
        msdsOverrides: MSDS_OVERRIDES_HIGH_IPA,
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

    console.log(`   ✅ Created Fast-Dry Variant for UNICool AL (id: ${highIPAVariant.id})`)
  }

  // ── UNICool AL — Enhanced Wetting Variant ───────────────────────────────────
  const PGME_ENHANCED_NAME = 'UNICool AL – Enhanced Wetting Variant'
  const [existingPGME] = await db
    .select()
    .from(productFormulationVariants)
    .where(
      and(
        eq(productFormulationVariants.productKey, 'unicool-al'),
        variantNameIs(PGME_ENHANCED_NAME),
      ),
    )

  if (existingPGME) {
    console.log(`   ↩️  Enhanced Wetting Variant for UNICool AL already exists (id: ${existingPGME.id})`)
    if (!existingPGME.coaTests || !existingPGME.tdsOverrides || !existingPGME.msdsOverrides) {
      await db
        .update(productFormulationVariants)
        .set({
          coaTests:      existingPGME.coaTests      ?? COA_TESTS_PGME_ENHANCED,
          tdsOverrides:  existingPGME.tdsOverrides  ?? TDS_OVERRIDES_PGME_ENHANCED,
          msdsOverrides: existingPGME.msdsOverrides ?? MSDS_OVERRIDES_PGME_ENHANCED,
        })
        .where(eq(productFormulationVariants.id, existingPGME.id))
      console.log('   ✅ Backfilled coaTests / tdsOverrides / msdsOverrides for Enhanced Wetting Variant')
    }
  } else {
    const [pgmeVariant] = await db
      .insert(productFormulationVariants)
      .values({
        productKey:    'unicool-al',
        companyId:     null,
        variantName:   PGME_ENHANCED_NAME,
        isDefault:     false,
        coaTests:      COA_TESTS_PGME_ENHANCED,
        tdsOverrides:  TDS_OVERRIDES_PGME_ENHANCED,
        msdsOverrides: MSDS_OVERRIDES_PGME_ENHANCED,
      })
      .returning()

    await db.insert(formulationVariantComponents).values(
      PGME_ENHANCED_COMPONENTS.map((c, i) => ({
        variantId:    pgmeVariant.id,
        materialName: c.materialName,
        percentage:   c.percentage !== null ? String(c.percentage) : null,
        unit:         c.unit,
        sortOrder:    i,
      })),
    )

    console.log(`   ✅ Created Enhanced Wetting Variant for UNICool AL (id: ${pgmeVariant.id})`)
  }

  // ── UNICool AL — High Lubricity Variant ───────────────────────────────
  const PG_HIGH_LUBRICITY_NAME = 'UNICool AL – High Lubricity Variant'
  const [existingPGHighLubricity] = await db
    .select()
    .from(productFormulationVariants)
    .where(
      and(
        eq(productFormulationVariants.productKey, 'unicool-al'),
        variantNameIs(PG_HIGH_LUBRICITY_NAME),
      ),
    )

  if (existingPGHighLubricity) {
    console.log(`   ↩️  High Lubricity Variant for UNICool AL already exists (id: ${existingPGHighLubricity.id})`)
    if (!existingPGHighLubricity.coaTests || !existingPGHighLubricity.tdsOverrides || !existingPGHighLubricity.msdsOverrides) {
      await db
        .update(productFormulationVariants)
        .set({
          coaTests:      existingPGHighLubricity.coaTests      ?? COA_TESTS_PG_HIGH_LUBRICITY,
          tdsOverrides:  existingPGHighLubricity.tdsOverrides  ?? TDS_OVERRIDES_PG_HIGH_LUBRICITY,
          msdsOverrides: existingPGHighLubricity.msdsOverrides ?? MSDS_OVERRIDES_PG_HIGH_LUBRICITY,
        })
        .where(eq(productFormulationVariants.id, existingPGHighLubricity.id))
      console.log('   ✅ Backfilled coaTests / tdsOverrides / msdsOverrides for High Lubricity Variant')
    }
  } else {
    const [pgHighLubricityVariant] = await db
      .insert(productFormulationVariants)
      .values({
        productKey:    'unicool-al',
        companyId:     null,
        variantName:   PG_HIGH_LUBRICITY_NAME,
        isDefault:     false,
        coaTests:      COA_TESTS_PG_HIGH_LUBRICITY,
        tdsOverrides:  TDS_OVERRIDES_PG_HIGH_LUBRICITY,
        msdsOverrides: MSDS_OVERRIDES_PG_HIGH_LUBRICITY,
      })
      .returning()

    await db.insert(formulationVariantComponents).values(
      PG_HIGH_LUBRICITY_COMPONENTS.map((c, i) => ({
        variantId:    pgHighLubricityVariant.id,
        materialName: c.materialName,
        percentage:   c.percentage !== null ? String(c.percentage) : null,
        unit:         c.unit,
        sortOrder:    i,
      })),
    )

    console.log(`   ✅ Created High Lubricity Variant for UNICool AL (id: ${pgHighLubricityVariant.id})`)
  }

  // ── UNISOLVE H3 — 30 KG Variant ──────────────────────────────────────────
  const [unisolveH3Product] = await db
    .select()
    .from(products)
    .where(eq(products.key, 'unisolve-h3'))

  if (!unisolveH3Product) {
    console.warn('   ⚠️  Product unisolve-h3 not found — skipping UNISOLVE H3 - 30 KG variant seed')
  } else {
    const UNISOLVE_H3_30KG_NAME = 'UNISOLVE H3 - 30 KG'
    const [existingUnisolveH3_30KG] = await db
      .select()
      .from(productFormulationVariants)
      .where(
        and(
          eq(productFormulationVariants.productKey, 'unisolve-h3'),
          variantNameIs(UNISOLVE_H3_30KG_NAME),
        ),
      )

    if (existingUnisolveH3_30KG) {
      console.log(`   ↩️  UNISOLVE H3 - 30 KG variant already exists (id: ${existingUnisolveH3_30KG.id})`)
    } else {
      const [unisolveH3_30KGVariant] = await db
        .insert(productFormulationVariants)
        .values({
          productKey:  'unisolve-h3',
          companyId:   null,
          variantName: UNISOLVE_H3_30KG_NAME,
          isDefault:   false,
        })
        .returning()

      await db.insert(formulationVariantComponents).values(
        UNISOLVE_H3_30KG_COMPONENTS.map((c, i) => ({
          variantId:    unisolveH3_30KGVariant.id,
          materialName: c.materialName,
          percentage:   c.percentage !== null ? String(c.percentage) : null,
          unit:         c.unit,
          sortOrder:    i,
        })),
      )

      console.log(`   ✅ Created UNISOLVE H3 - 30 KG variant (id: ${unisolveH3_30KGVariant.id})`)
    }
  }

  // ── UNIKBRIGHTNER — Base Formula ──────────────────────────────────────────
  const [unikbrightnerProduct] = await db
    .select()
    .from(products)
    .where(eq(products.key, 'unikbrightner'))

  if (!unikbrightnerProduct) {
    console.warn('   ⚠️  Product unikbrightner not found — skipping Base Formula variant seed')
  } else {
    const UNIKBRIGHTNER_BASE_NAME = 'UNIKBRIGHTNER Base Formula'
    const [existingUnikbrightnerBase] = await db
      .select()
      .from(productFormulationVariants)
      .where(
        and(
          eq(productFormulationVariants.productKey, 'unikbrightner'),
          variantNameIs(UNIKBRIGHTNER_BASE_NAME),
        ),
      )

    if (existingUnikbrightnerBase) {
      console.log(`   ↩️  Base Formula variant for UNIKBRIGHTNER already exists (id: ${existingUnikbrightnerBase.id})`)
    } else {
      const [unikbrightnerBaseVariant] = await db
        .insert(productFormulationVariants)
        .values({
          productKey:  'unikbrightner',
          companyId:   null,
          variantName: UNIKBRIGHTNER_BASE_NAME,
          isDefault:   false,
          // Deliberately 'draft', not the 'approved' default: resolveActiveVariant
          // (frontend) falls back to the first *usable* (approved/production)
          // variant whenever nothing is explicitly selected — regardless of
          // isDefault — and since this would be the product's only variant, it
          // would always be auto-picked on every TDS/MSDS/Formula page visit.
          // That silently replaces the base document's hand-authored, correctly
          // classified hazard content with this variant's auto-derived hazard
          // aggregate, which is missing the Oxidizing Liquid/Skin Corrosion Cat 1
          // classifications (the hazard-profile lookup has no entry matching
          // these raw material names) — a real safety-documentation regression.
          // 'draft' excludes it from that auto-selection entirely while still
          // listing it in the Formula Library; a superadmin can still review and
          // approve it manually via the admin UI if it should become selectable.
          status:      'draft',
        })
        .returning()

      await db.insert(formulationVariantComponents).values(
        UNIKBRIGHTNER_BASE_COMPONENTS.map((c, i) => ({
          variantId:    unikbrightnerBaseVariant.id,
          materialName: c.materialName,
          percentage:   c.percentage !== null ? String(c.percentage) : null,
          unit:         c.unit,
          sortOrder:    i,
        })),
      )

      console.log(`   ✅ Created Base Formula variant for UNIKBRIGHTNER (id: ${unikbrightnerBaseVariant.id})`)
    }
  }

  // ── UNIKSTRIP-HD — Base Formula ───────────────────────────────────────────
  const [unikstripHdProduct] = await db
    .select()
    .from(products)
    .where(eq(products.key, 'unikstrip-hd'))

  if (!unikstripHdProduct) {
    console.warn('   ⚠️  Product unikstrip-hd not found — skipping Base Formula variant seed')
  } else {
    const UNIKSTRIP_HD_BASE_NAME = 'UNIKSTRIP-HD Base Formula'
    const [existingUnikstripHdBase] = await db
      .select()
      .from(productFormulationVariants)
      .where(
        and(
          eq(productFormulationVariants.productKey, 'unikstrip-hd'),
          variantNameIs(UNIKSTRIP_HD_BASE_NAME),
        ),
      )

    if (existingUnikstripHdBase) {
      console.log(`   ↩️  Base Formula variant for UNIKSTRIP-HD already exists (id: ${existingUnikstripHdBase.id})`)
    } else {
      const [unikstripHdBaseVariant] = await db
        .insert(productFormulationVariants)
        .values({
          productKey:  'unikstrip-hd',
          companyId:   null,
          variantName: UNIKSTRIP_HD_BASE_NAME,
          isDefault:   false,
          // 'draft' for the same reason as UNIKBRIGHTNER above, and because this
          // formulation is for laboratory evaluation only, not production use.
          status:      'draft',
        })
        .returning()

      await db.insert(formulationVariantComponents).values(
        UNIKSTRIP_HD_BASE_COMPONENTS.map((c, i) => ({
          variantId:    unikstripHdBaseVariant.id,
          materialName: c.materialName,
          percentage:   c.percentage !== null ? String(c.percentage) : null,
          unit:         c.unit,
          sortOrder:    i,
        })),
      )

      console.log(`   ✅ Created Base Formula variant for UNIKSTRIP-HD (id: ${unikstripHdBaseVariant.id})`)
    }
  }

  // ── CORROCUT 500 — Exxsol Blend Grade ─────────────────────────────────────
  const [corrucut500Product] = await db
    .select()
    .from(products)
    .where(eq(products.key, 'corrucut-500'))

  if (!corrucut500Product) {
    console.warn('   ⚠️  Product corrucut-500 not found — skipping Exxsol Blend Grade variant seed')
  } else {
    const CORRUCUT_500_WDRPO_NAME = 'Exxsol Blend Grade'
    const [existingCorrucut500Wdrpo] = await db
      .select()
      .from(productFormulationVariants)
      .where(
        and(
          eq(productFormulationVariants.productKey, 'corrucut-500'),
          variantNameIs(CORRUCUT_500_WDRPO_NAME),
        ),
      )

    if (existingCorrucut500Wdrpo) {
      await db.update(productFormulationVariants)
        .set({ formulaOverrides: CORRUCUT_500_FORMULA_OVERRIDES[CORRUCUT_500_WDRPO_NAME] })
        .where(eq(productFormulationVariants.id, existingCorrucut500Wdrpo.id))
      console.log(`   ↩️  Exxsol Blend Grade variant for CORROCUT 500 already exists (id: ${existingCorrucut500Wdrpo.id})`)
    } else {
      // Non-default: the existing default 'Base Formula' variant stays the one
      // resolveActiveVariant auto-picks, so TDS/MSDS content doesn't change.
      const [corrucut500WdrpoVariant] = await db
        .insert(productFormulationVariants)
        .values({
          productKey:  'corrucut-500',
          companyId:   null,
          variantName: CORRUCUT_500_WDRPO_NAME,
          isDefault:   false,
          tdsOverrides:  TDS_OVERRIDES_CORRUCUT_500_WDRPO,
          msdsOverrides: MSDS_OVERRIDES_CORRUCUT_500_WDRPO,
          formulaOverrides: CORRUCUT_500_FORMULA_OVERRIDES[CORRUCUT_500_WDRPO_NAME],
        })
        .returning()

      await db.insert(formulationVariantComponents).values(
        CORRUCUT_500_WDRPO_COMPONENTS.map((c, i) => ({
          variantId:    corrucut500WdrpoVariant.id,
          materialName: c.materialName,
          percentage:   c.percentage !== null ? String(c.percentage) : null,
          unit:         c.unit,
          sortOrder:    i,
        })),
      )

      console.log(`   ✅ Created Exxsol Blend Grade variant for CORROCUT 500 (id: ${corrucut500WdrpoVariant.id})`)
    }

    // Customer-visible name deliberately avoids naming the carrier material.
    const CORRUCUT_500_MTO_BASED_NAME = 'MTO-LLP High-Oil Grade'
    const [existingCorrucut500MtoBased] = await db
      .select()
      .from(productFormulationVariants)
      .where(
        and(
          eq(productFormulationVariants.productKey, 'corrucut-500'),
          variantNameIs(CORRUCUT_500_MTO_BASED_NAME),
        ),
      )

    if (existingCorrucut500MtoBased) {
      await db.update(productFormulationVariants)
        .set({ formulaOverrides: CORRUCUT_500_FORMULA_OVERRIDES[CORRUCUT_500_MTO_BASED_NAME] })
        .where(eq(productFormulationVariants.id, existingCorrucut500MtoBased.id))
      console.log(`   ↩️  MTO-LLP High-Oil Grade variant for CORROCUT 500 already exists (id: ${existingCorrucut500MtoBased.id})`)
    } else {
      const [corrucut500MtoBasedVariant] = await db
        .insert(productFormulationVariants)
        .values({
          productKey:  'corrucut-500',
          companyId:   null,
          variantName: CORRUCUT_500_MTO_BASED_NAME,
          isDefault:   false,
          tdsOverrides:  TDS_OVERRIDES_CORRUCUT_500_MTO_BASED,
          msdsOverrides: MSDS_OVERRIDES_CORRUCUT_500_MTO_BASED,
          formulaOverrides: CORRUCUT_500_FORMULA_OVERRIDES[CORRUCUT_500_MTO_BASED_NAME],
        })
        .returning()

      await db.insert(formulationVariantComponents).values(
        CORRUCUT_500_MTO_BASED_COMPONENTS.map((c, i) => ({
          variantId:    corrucut500MtoBasedVariant.id,
          materialName: c.materialName,
          percentage:   String(c.percentage),
          unit:         c.unit,
          sortOrder:    i,
        })),
      )

      console.log(`   ✅ Created MTO-LLP High-Oil Grade variant for CORROCUT 500 (id: ${corrucut500MtoBasedVariant.id})`)
    }

    // No TDS/MSDS overrides yet — barium sulfonate hazard data is pending.
    const CORRUCUT_500_NA_BA_SULFONATE_NAME = 'Na-Ba Sulfonate Grade'
    const [existingCorrucut500NaBa] = await db
      .select()
      .from(productFormulationVariants)
      .where(
        and(
          eq(productFormulationVariants.productKey, 'corrucut-500'),
          variantNameIs(CORRUCUT_500_NA_BA_SULFONATE_NAME),
        ),
      )

    if (existingCorrucut500NaBa) {
      await db.update(productFormulationVariants)
        .set({ formulaOverrides: CORRUCUT_500_FORMULA_OVERRIDES[CORRUCUT_500_NA_BA_SULFONATE_NAME] })
        .where(eq(productFormulationVariants.id, existingCorrucut500NaBa.id))
      console.log(`   ↩️  Na-Ba Sulfonate Grade variant for CORROCUT 500 already exists (id: ${existingCorrucut500NaBa.id})`)
    } else {
      const [corrucut500NaBaVariant] = await db
        .insert(productFormulationVariants)
        .values({
          productKey:  'corrucut-500',
          companyId:   null,
          variantName: CORRUCUT_500_NA_BA_SULFONATE_NAME,
          isDefault:   false,
          formulaOverrides: CORRUCUT_500_FORMULA_OVERRIDES[CORRUCUT_500_NA_BA_SULFONATE_NAME],
        })
        .returning()

      await db.insert(formulationVariantComponents).values(
        CORRUCUT_500_NA_BA_SULFONATE_COMPONENTS.map((c, i) => ({
          variantId:    corrucut500NaBaVariant.id,
          materialName: c.materialName,
          percentage:   String(c.percentage),
          unit:         c.unit,
          density:      String(c.density),
          sortOrder:    i,
        })),
      )

      console.log(`   ✅ Created Na-Ba Sulfonate Grade variant for CORROCUT 500 (id: ${corrucut500NaBaVariant.id})`)
    }

    // No TDS/MSDS overrides yet — 30-day protection claims are unverified.
    const CORRUCUT_500_MTO_ONLY_NAME = 'MTO Only Grade'
    const [existingCorrucut500MtoOnly] = await db
      .select()
      .from(productFormulationVariants)
      .where(
        and(
          eq(productFormulationVariants.productKey, 'corrucut-500'),
          variantNameIs(CORRUCUT_500_MTO_ONLY_NAME),
        ),
      )

    if (existingCorrucut500MtoOnly) {
      await db.update(productFormulationVariants)
        .set({ formulaOverrides: CORRUCUT_500_FORMULA_OVERRIDES[CORRUCUT_500_MTO_ONLY_NAME] })
        .where(eq(productFormulationVariants.id, existingCorrucut500MtoOnly.id))
      console.log(`   ↩️  MTO Only Grade variant for CORROCUT 500 already exists (id: ${existingCorrucut500MtoOnly.id})`)
    } else {
      const [corrucut500MtoOnlyVariant] = await db
        .insert(productFormulationVariants)
        .values({
          productKey:  'corrucut-500',
          companyId:   null,
          variantName: CORRUCUT_500_MTO_ONLY_NAME,
          isDefault:   false,
          formulaOverrides: CORRUCUT_500_FORMULA_OVERRIDES[CORRUCUT_500_MTO_ONLY_NAME],
        })
        .returning()

      await db.insert(formulationVariantComponents).values(
        CORRUCUT_500_MTO_ONLY_COMPONENTS.map((c, i) => ({
          variantId:    corrucut500MtoOnlyVariant.id,
          materialName: c.materialName,
          percentage:   String(c.percentage),
          unit:         c.unit,
          density:      String(c.density),
          sortOrder:    i,
        })),
      )

      console.log(`   ✅ Created MTO Only Grade variant for CORROCUT 500 (id: ${corrucut500MtoOnlyVariant.id})`)
    }

    // No TDS/MSDS overrides yet.
    const CORRUCUT_500_MTO_LLP_NAME = 'MTO-LLP Low-Oil Grade'
    const [existingCorrucut500MtoLlp] = await db
      .select()
      .from(productFormulationVariants)
      .where(
        and(
          eq(productFormulationVariants.productKey, 'corrucut-500'),
          variantNameIs(CORRUCUT_500_MTO_LLP_NAME),
        ),
      )

    if (existingCorrucut500MtoLlp) {
      await db.update(productFormulationVariants)
        .set({ formulaOverrides: CORRUCUT_500_FORMULA_OVERRIDES[CORRUCUT_500_MTO_LLP_NAME] })
        .where(eq(productFormulationVariants.id, existingCorrucut500MtoLlp.id))
      console.log(`   ↩️  MTO-LLP Low-Oil Grade variant for CORROCUT 500 already exists (id: ${existingCorrucut500MtoLlp.id})`)
    } else {
      const [corrucut500MtoLlpVariant] = await db
        .insert(productFormulationVariants)
        .values({
          productKey:  'corrucut-500',
          companyId:   null,
          variantName: CORRUCUT_500_MTO_LLP_NAME,
          isDefault:   false,
          formulaOverrides: CORRUCUT_500_FORMULA_OVERRIDES[CORRUCUT_500_MTO_LLP_NAME],
        })
        .returning()

      await db.insert(formulationVariantComponents).values(
        CORRUCUT_500_MTO_LLP_COMPONENTS.map((c, i) => ({
          variantId:    corrucut500MtoLlpVariant.id,
          materialName: c.materialName,
          percentage:   String(c.percentage),
          unit:         c.unit,
          density:      String(c.density),
          sortOrder:    i,
        })),
      )

      console.log(`   ✅ Created MTO-LLP Low-Oil Grade variant for CORROCUT 500 (id: ${corrucut500MtoLlpVariant.id})`)
    }

    // No TDS/MSDS overrides yet — development trial, performance not validated.
    const CORRUCUT_500_HIGH_BARIUM_MTO_LLP_NAME = 'High-Barium MTO-LLP Grade'
    const [existingCorrucut500HighBarium] = await db
      .select()
      .from(productFormulationVariants)
      .where(
        and(
          eq(productFormulationVariants.productKey, 'corrucut-500'),
          variantNameIs(CORRUCUT_500_HIGH_BARIUM_MTO_LLP_NAME),
        ),
      )

    if (existingCorrucut500HighBarium) {
      await db.update(productFormulationVariants)
        .set({ formulaOverrides: CORRUCUT_500_FORMULA_OVERRIDES[CORRUCUT_500_HIGH_BARIUM_MTO_LLP_NAME] })
        .where(eq(productFormulationVariants.id, existingCorrucut500HighBarium.id))
      console.log(`   ↩️  High-Barium MTO-LLP Grade variant for CORROCUT 500 already exists (id: ${existingCorrucut500HighBarium.id})`)
    } else {
      const [corrucut500HighBariumVariant] = await db
        .insert(productFormulationVariants)
        .values({
          productKey:  'corrucut-500',
          companyId:   null,
          variantName: CORRUCUT_500_HIGH_BARIUM_MTO_LLP_NAME,
          isDefault:   false,
          formulaOverrides: CORRUCUT_500_FORMULA_OVERRIDES[CORRUCUT_500_HIGH_BARIUM_MTO_LLP_NAME],
        })
        .returning()

      await db.insert(formulationVariantComponents).values(
        CORRUCUT_500_HIGH_BARIUM_MTO_LLP_COMPONENTS.map((c, i) => ({
          variantId:    corrucut500HighBariumVariant.id,
          materialName: c.materialName,
          percentage:   String(c.percentage),
          unit:         c.unit,
          density:      String(c.density),
          materialFunction: c.materialFunction ?? null,
          sortOrder:    i,
        })),
      )

      console.log(`   ✅ Created High-Barium MTO-LLP Grade variant for CORROCUT 500 (id: ${corrucut500HighBariumVariant.id})`)
    }
  }
}
