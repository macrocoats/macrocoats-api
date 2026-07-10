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
    { name: 'Propylene Glycol',    function: 'Co-solvent and humectant',            percent: '1 – 3%', compat: 'Metals, plastics' },
    { name: 'PEG 400',             function: 'Viscosity modifier and wetting aid', percent: '< 1%',   compat: 'Metals, plastics' },
    { name: 'TEA',                 function: 'pH regulator (mild alkalinity)',     percent: '< 1%',   compat: 'Metals, glass' },
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
    { name: 'Ethanol',                  function: 'Co-solvent, fast drying',   percent: '10%',     compat: 'Metals, PCBs' },
    { name: 'Isopropyl Alcohol (IPA)',  function: 'Co-solvent, degreasing',    percent: '5%',      compat: 'Metals, PCBs' },
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
    { property: 'Odour',                  value: 'Strong IPA / alcohol',     unit: '—',    method: '—' },
    { property: 'Flash Point',            value: '26 – 38',                   unit: '°C',   method: 'Pensky-Martens' },
    { property: 'Density',                value: '0.90 – 0.94',               unit: 'g/mL', method: 'ISO 2811' },
    { property: 'Evaporation Rate',       value: 'Fast',                      unit: '—',    method: 'vs diethyl ether = 1' },
    { property: 'Dry Time',               value: '15 – 40',                   unit: 's',    method: 'Ambient, cotton wipe' },
    { property: 'Residue on Evaporation', value: '≤ 0.001%',                 unit: '—',    method: 'ASTM D1353' },
  ],
  composition: [
    { name: 'Deionised Water',          function: 'Primary carrier',               percent: '~ 80%',   compat: 'All substrates' },
    { name: 'Isopropyl Alcohol (IPA)',  function: 'Primary solvent, fast drying',  percent: '20%',     compat: 'Metals, PCBs' },
    { name: 'Non-ionic surfactant',     function: 'Wetting aid',                   percent: '< 0.1%',  compat: 'All substrates' },
    { name: 'pH regulator',             function: 'Mild alkalinity buffer',        percent: '< 0.1%',  compat: 'All substrates' },
  ],
  performance: [
    { label: 'Evaporation residue',     val: '≤ 0.001% (ASTM D1353)' },
    { label: 'Dry time',               val: '15 – 40 s (ambient)' },
    { label: 'Aluminium compatibility', val: 'No staining or etching at ambient' },
  ],
  safetyNote: 'Flammable liquid — flash point 26 – 38 °C. High IPA content — keep away from all ignition sources. Use only in well-ventilated areas. Refer to SDS-UCL-001.',
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
    { name: 'Isopropyl Alcohol (IPA)',               function: 'Fast evaporation, cooling, improved drying',                            percent: '15%',   compat: 'Metals, aluminium' },
    { name: 'Propylene Glycol',                      function: 'Lubricity, corrosion protection, evaporation control',                  percent: '~ 2%',  compat: 'Metals, plastics' },
    { name: 'Propylene Glycol Methyl Ether (PGME)',  function: 'Wetting agent, residue reduction, improved surface finish and chip flushing', percent: '~ 1%', compat: 'Metals, aluminium' },
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
    { name: 'Propylene Glycol (PG)',                                function: 'Lubricity, corrosion protection, evaporation control',                 percent: '2.80%',  compat: 'Metals, aluminium' },
    { name: 'Propylene Glycol Methyl Ether (Dowanol PM)',          function: 'Wetting agent, residue reduction, chip flushing, improved surface finish', percent: '1.60%', compat: 'Metals, aluminium' },
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
      { name: 'Propylene Glycol',     description: 'Co-solvent and humectant',            percent: '1 – 3%', ghsClass: 'Irritant', tagType: 'warn' },
      { name: 'PEG 400',              description: 'Viscosity modifier and wetting aid', percent: '< 1%',   ghsClass: '—',        tagType: 'safe' },
      { name: 'TEA',                  description: 'pH regulator — mild alkalinity',     percent: '< 1%',   ghsClass: 'Irritant', tagType: 'warn' },
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
      { name: 'Ethanol',                 description: 'Co-solvent, fast drying',            percent: '10%',     ghsClass: 'Flammable', tagType: 'warn' },
      { name: 'Isopropyl Alcohol (IPA)', description: 'Co-solvent, degreasing',             percent: '5%',      ghsClass: 'Flammable', tagType: 'warn' },
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
  signalWord: 'Danger',
  hazards: {
    pictograms:      ['flammable', 'irritant', 'environment'],
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
      { name: 'Isopropyl Alcohol (IPA)', description: 'Primary solvent — fast-drying, degreasing', percent: '20%',     ghsClass: 'Flammable', tagType: 'danger' },
      { name: 'Non-ionic surfactant',    description: 'Wetting aid',                               percent: '< 0.1%',  ghsClass: 'Irritant',  tagType: 'warn'   },
      { name: 'pH regulator',            description: 'Mild alkalinity buffer',                    percent: '< 0.1%',  ghsClass: 'Irritant',  tagType: 'warn'   },
    ],
    note: 'Exact formulation is proprietary. Functional ingredient descriptions are provided for safety and emergency purposes only.',
  },
  fireFighting: {
    flammability:       'Flammable liquid. Flash point 26 – 38 °C. High IPA content increases fire risk.',
    extinguishingMedia: 'CO₂, dry powder, alcohol-resistant foam.',
    fireHazard:         'IPA vapours may travel to ignition source and flashback. Vapour accumulation in enclosed spaces is dangerous.',
    ppe:                'SCBA and full fire-resistant clothing.',
  },
  physical: [
    { key: 'Appearance',    val: 'Clear, colourless liquid' },
    { key: 'Odour',         val: 'Strong IPA / alcohol characteristic' },
    { key: 'Flash Point',   val: '26 – 38 °C' },
    { key: 'Density',       val: '0.90 – 0.94 g/mL' },
    { key: 'pH',            val: '7.0 – 9.0' },
    { key: 'Solubility',    val: 'Fully miscible with water' },
    { key: 'Evaporation',   val: 'Fast (high IPA content)' },
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
      { name: 'Isopropyl Alcohol (IPA)',              description: 'Fast evaporation, cooling, improved drying',               percent: '15%',   ghsClass: 'Flammable', tagType: 'warn' },
      { name: 'Propylene Glycol',                     description: 'Lubricity, corrosion protection, evaporation control',     percent: '~ 2%',  ghsClass: '—',         tagType: 'safe' },
      { name: 'Propylene Glycol Methyl Ether (PGME)', description: 'Wetting agent, residue reduction, improved surface finish', percent: '~ 1%', ghsClass: 'Flammable', tagType: 'warn' },
    ],
    note: 'Exact formulation is proprietary. Functional ingredient descriptions are provided for safety and emergency purposes only.',
  },
  fireFighting: {
    flammability:       'Flammable liquid. Flash point 35 – 45 °C (Pensky-Martens).',
    extinguishingMedia: 'CO₂, dry powder, alcohol-resistant foam.',
    fireHazard:         'Alcohol and glycol ether vapours may accumulate in enclosed spaces and ignite. Avoid vapour accumulation.',
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
      { name: 'Propylene Glycol (PG)',                             description: 'Lubricity, corrosion protection, evaporation control',                percent: '2.80%',  ghsClass: '—',        tagType: 'safe' },
      { name: 'Propylene Glycol Methyl Ether (Dowanol PM)',       description: 'Wetting agent, residue reduction, chip flushing, improved surface finish', percent: '1.60%', ghsClass: 'Irritant', tagType: 'warn' },
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

/**
 * PGME Enhanced Variant for UNICool AL.
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
 * PG High Lubricity Variant for UNICool AL.
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
 * Heavy Duty Alkaline SMS Variant for UNIKLEAN SP.
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
          eq(productFormulationVariants.variantName, 'UNIKLEAN SP – Low Foam Rust Inhibiting Variant'),
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

  // ── UNIKLEAN SP — Heavy Duty Alkaline SMS Variant ─────────────────────────
  if (!uniklenSpProduct) {
    console.warn('   ⚠️  Product uniklean-sp not found — skipping Heavy Duty Alkaline SMS Variant seed')
  } else {
    const HEAVY_DUTY_SMS_NAME = 'UNIKLEAN SP – Heavy Duty Alkaline SMS Variant'
    const [existingHeavyDutySMS] = await db
      .select()
      .from(productFormulationVariants)
      .where(
        and(
          eq(productFormulationVariants.productKey, 'uniklean-sp'),
          eq(productFormulationVariants.variantName, HEAVY_DUTY_SMS_NAME),
        ),
      )

    if (existingHeavyDutySMS) {
      console.log(`   ↩️  Heavy Duty Alkaline SMS Variant for UNIKLEAN SP already exists (id: ${existingHeavyDutySMS.id})`)
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

      console.log(`   ✅ Created Heavy Duty Alkaline SMS Variant for UNIKLEAN SP (id: ${heavyDutySMSVariant.id})`)
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
          eq(productFormulationVariants.variantName, ENHANCED_FLASH_RUST_NAME),
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
    if (!existingPEG.coaTests || !existingPEG.tdsOverrides || !existingPEG.msdsOverrides) {
      await db
        .update(productFormulationVariants)
        .set({
          coaTests:     existingPEG.coaTests     ?? COA_TESTS_PEG_GLYCOL,
          tdsOverrides: existingPEG.tdsOverrides  ?? TDS_OVERRIDES_PEG_GLYCOL,
          msdsOverrides: existingPEG.msdsOverrides ?? MSDS_OVERRIDES_PEG_GLYCOL,
        })
        .where(eq(productFormulationVariants.id, existingPEG.id))
      console.log('   ✅ Backfilled coaTests / tdsOverrides / msdsOverrides for PEG Glycol Variant')
    }
  } else {
    const [pegVariant] = await db
      .insert(productFormulationVariants)
      .values({
        productKey:   'unicool-al',
        companyId:    null,
        variantName:  'PEG Glycol Variant',
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
    if (!existingHighIPA.coaTests || !existingHighIPA.tdsOverrides || !existingHighIPA.msdsOverrides) {
      await db
        .update(productFormulationVariants)
        .set({
          coaTests:     existingHighIPA.coaTests     ?? COA_TESTS_HIGH_IPA,
          tdsOverrides: existingHighIPA.tdsOverrides  ?? TDS_OVERRIDES_HIGH_IPA,
          msdsOverrides: existingHighIPA.msdsOverrides ?? MSDS_OVERRIDES_HIGH_IPA,
        })
        .where(eq(productFormulationVariants.id, existingHighIPA.id))
      console.log('   ✅ Backfilled coaTests / tdsOverrides / msdsOverrides for High IPA Variant')
    }
  } else {
    const [highIPAVariant] = await db
      .insert(productFormulationVariants)
      .values({
        productKey:    'unicool-al',
        companyId:     null,
        variantName:   'High IPA Variant',
        isDefault:     true,
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

    console.log(`   ✅ Created High IPA Variant for UNICool AL (id: ${highIPAVariant.id})`)
  }

  // ── UNICool AL — PGME Enhanced Variant ───────────────────────────────────
  const PGME_ENHANCED_NAME = 'UNICool AL – PGME Enhanced Variant'
  const [existingPGME] = await db
    .select()
    .from(productFormulationVariants)
    .where(
      and(
        eq(productFormulationVariants.productKey, 'unicool-al'),
        eq(productFormulationVariants.variantName, PGME_ENHANCED_NAME),
      ),
    )

  if (existingPGME) {
    console.log(`   ↩️  PGME Enhanced Variant for UNICool AL already exists (id: ${existingPGME.id})`)
    if (!existingPGME.coaTests || !existingPGME.tdsOverrides || !existingPGME.msdsOverrides) {
      await db
        .update(productFormulationVariants)
        .set({
          coaTests:      existingPGME.coaTests      ?? COA_TESTS_PGME_ENHANCED,
          tdsOverrides:  existingPGME.tdsOverrides  ?? TDS_OVERRIDES_PGME_ENHANCED,
          msdsOverrides: existingPGME.msdsOverrides ?? MSDS_OVERRIDES_PGME_ENHANCED,
        })
        .where(eq(productFormulationVariants.id, existingPGME.id))
      console.log('   ✅ Backfilled coaTests / tdsOverrides / msdsOverrides for PGME Enhanced Variant')
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

    console.log(`   ✅ Created PGME Enhanced Variant for UNICool AL (id: ${pgmeVariant.id})`)
  }

  // ── UNICool AL — PG High Lubricity Variant ───────────────────────────────
  const PG_HIGH_LUBRICITY_NAME = 'UNICool AL – PG High Lubricity Variant'
  const [existingPGHighLubricity] = await db
    .select()
    .from(productFormulationVariants)
    .where(
      and(
        eq(productFormulationVariants.productKey, 'unicool-al'),
        eq(productFormulationVariants.variantName, PG_HIGH_LUBRICITY_NAME),
      ),
    )

  if (existingPGHighLubricity) {
    console.log(`   ↩️  PG High Lubricity Variant for UNICool AL already exists (id: ${existingPGHighLubricity.id})`)
    if (!existingPGHighLubricity.coaTests || !existingPGHighLubricity.tdsOverrides || !existingPGHighLubricity.msdsOverrides) {
      await db
        .update(productFormulationVariants)
        .set({
          coaTests:      existingPGHighLubricity.coaTests      ?? COA_TESTS_PG_HIGH_LUBRICITY,
          tdsOverrides:  existingPGHighLubricity.tdsOverrides  ?? TDS_OVERRIDES_PG_HIGH_LUBRICITY,
          msdsOverrides: existingPGHighLubricity.msdsOverrides ?? MSDS_OVERRIDES_PG_HIGH_LUBRICITY,
        })
        .where(eq(productFormulationVariants.id, existingPGHighLubricity.id))
      console.log('   ✅ Backfilled coaTests / tdsOverrides / msdsOverrides for PG High Lubricity Variant')
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

    console.log(`   ✅ Created PG High Lubricity Variant for UNICool AL (id: ${pgHighLubricityVariant.id})`)
  }
}
