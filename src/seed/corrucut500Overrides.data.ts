/**
 * CORRUCUT 500 variant TDS/MSDS override content. Kept free of DB imports so
 * scripts/replay-2026-10-variant-docs.ts can load it without a database.
 */

/* ── TDS overrides — CORRUCUT 500 Water-Displacing RPO ─────────────────────── */

/*
 * CORRUCUT 500 MTO-carrier variants — values are calculated from the variant
 * composition, not measured (flash point: Le Chatelier/Raoult estimate;
 * viscosity: Refutas blend; density: volume-additive). Hazards: GHS mixture
 * rules over typical ingredient classifications (MTO taken as C9–C12
 * white spirit, 2–25% aromatics, benzene < 0.1%). Replace with test data
 * once available.
 */
const CORRUCUT_500_MTO_HAZARD_OVERRIDE = {
  signalWord: 'DANGER' as const,
  pictograms: ['flammable', 'healthhazard', 'environment'],
  classifications: [
    { class: 'Flammable Liquid',                    category: 'Category 3',                       tagType: 'warn'   },
    { class: 'Aspiration Hazard',                   category: 'Category 1',                       tagType: 'danger' },
    { class: 'STOT – Single Exposure',              category: 'Category 3 (narcotic effects)',    tagType: 'warn'   },
    { class: 'STOT – Repeated Exposure',            category: 'Category 1 (central nervous system)', tagType: 'danger' },
    { class: 'Aquatic Toxicity (Chronic)',          category: 'Category 2',                       tagType: 'warn'   },
  ],
  hStatements: 'H226 — Flammable liquid and vapour. H304 — May be fatal if swallowed and enters airways. H336 — May cause drowsiness or dizziness. H372 — Causes damage to the central nervous system through prolonged or repeated exposure. H411 — Toxic to aquatic life with long lasting effects.',
  pStatements: 'P210 — Keep away from heat, hot surfaces, sparks, open flames and other ignition sources. No smoking. · P233 — Keep container tightly closed. · P240 — Ground and bond container and receiving equipment. · P260 — Do not breathe mist/vapours/spray. · P273 — Avoid release to the environment. · P280 — Wear protective gloves/protective clothing/eye protection/face protection. · P301+P310 — IF SWALLOWED: Immediately call a POISON CENTER or doctor/physician. · P331 — Do NOT induce vomiting. · P304+P340 — IF INHALED: Remove person to fresh air and keep comfortable for breathing. · P314 — Get medical advice/attention if you feel unwell. · P370+P378 — In case of fire: Use CO₂, dry chemical powder or foam to extinguish. · P391 — Collect spillage. · P403+P235 — Store in a well-ventilated place. Keep cool. · P405 — Store locked up. · P501 — Dispose of contents/container in accordance with the Hazardous Waste Management Rules.',
}

const CORRUCUT_500_MTO_IDENTIFICATION = (productType: string) => ({
  productType,
  intendedUse:  'Temporary rust prevention of ferrous and non-ferrous components during in-process handling, transit, and storage.',
  manufacturer: 'Macro Coats Pvt. Ltd., Chennai, India',
  emergency:    'AIIMS Poison Control Centre: 1800-11-6117 (24/7 Toll-Free)',
})

const CORRUCUT_500_MTO_FIRE_FIGHTING = (flashPoint: string) => ({
  flammability:       `Flammable liquid, Category 3 (flash point ${flashPoint}, calculated). Vapours are heavier than air and may travel to an ignition source.`,
  extinguishingMedia: 'Carbon dioxide (CO₂), dry chemical powder, or foam. Water spray only to cool exposed containers.',
  fireHazard:         'Combustion produces carbon monoxide, carbon dioxide and dense smoke. Do not use a direct water jet — it spreads the burning liquid.',
  ppe:                'SCBA and full fire-resistant protective clothing.',
})

const CORRUCUT_500_MTO_TOXICOLOGY = 'Classification is calculated from ingredient data under GHS mixture rules; no product-level toxicity tests. Aspiration hazard Category 1: low-viscosity hydrocarbon liquid (≈ 3 – 5 cSt @ 40 °C) — if swallowed, aspiration into the lungs can cause chemical pneumonitis. STOT SE 3: solvent vapour may cause drowsiness, dizziness and headache. STOT RE 1: prolonged or repeated overexposure to hydrocarbon solvents of this type is associated with central nervous system effects. Repeated skin contact may cause dryness or cracking (EUH066).'

const CORRUCUT_500_MTO_ECOLOGY = 'Aquatic Chronic Category 2 by the GHS summation method (hydrocarbon solvent and corrosion-inhibitor components). Insoluble in water; forms surface films that impair oxygen transfer. Prevent entry into drains, soil and watercourses.'

const CORRUCUT_500_MTO_TRANSPORT = 'UN 1268, PETROLEUM DISTILLATES, N.O.S. (hydrocarbon solvent), Class 3, Packing Group III. Environmentally hazardous substance (Aquatic Chronic 2) — marine pollutant mark applies to sea transport.'

const CORRUCUT_500_PERFORMANCE = [
  { label: 'Salt spray resistance', val: 'Typical ≥ 96 h (ASTM B117)' },
  { label: 'Indoor Protection',     val: '3–6 Months' },
  { label: 'Outdoor Covered',       val: '1–3 Months' },
  { label: 'Water displacement',    val: 'Passes (IS 1154)' },
]

export const TDS_OVERRIDES_CORRUCUT_500_WDRPO = {
  description: 'CORRUCUT 500 – Water-Displacing RPO is a solvent-based rust preventive built on a hydrocarbon solvent carrier with a dearomatized co-solvent. The fast-evaporating carrier penetrates and displaces moisture from wet or freshly washed components, leaving a thin, lightly oily film of mineral base oil, corrosion inhibitor and film-forming barrier agent. Suited for inter-operational protection, transit, and indoor or covered storage.',
  features: [
    { head: 'Water-Displacing Action',        body: 'Low-surface-tension solvent carrier gets under water films and lifts moisture off wet or freshly washed parts.' },
    { head: 'Inhibited Oil Film',             body: 'A polar corrosion inhibitor adsorbs on the metal surface while the mineral base oil carries it as a continuous protective film.' },
    { head: 'Barrier-Reinforced Film',        body: 'A film-forming barrier agent improves film cohesion and water resistance versus a solvent-only carrier.' },
    { head: 'Flexible Application',           body: 'Suitable for immersion tanks, spray lines, or manual brush application.' },
  ],
  physicalProperties: [
    { property: 'Appearance',                  value: 'Clear, pale amber fluid',  unit: '—',     method: 'Visual' },
    { property: 'Density @ 25°C',              value: '≈ 0.84',                   unit: 'g/mL',  method: 'Calculated (volume-additive)' },
    { property: 'Kinematic Viscosity @ 40°C',  value: '≈ 3 – 5',                  unit: 'cSt',   method: 'Calculated (Refutas blend)' },
    { property: 'Flash Point (PMCC)',          value: '≈ 43',                     unit: '°C',    method: 'Calculated (Le Chatelier)' },
    { property: 'Non-volatile Film Content',   value: '≈ 39',                     unit: '% v/v', method: 'Calculated' },
    { property: 'Protective Film Classification', value: 'Thin, lightly oily protective film', unit: '—', method: 'Internal' },
    { property: 'Indoor Protection Period',    value: '3 – 6',                    unit: 'months', method: 'Environmental — guidance only' },
    { property: 'Outdoor Covered Protection Period', value: '1 – 3',              unit: 'months', method: 'Environmental — guidance only' },
  ],
  composition: [
    { name: 'Hydrocarbon carrier solvent',     function: 'Primary carrier and water-displacing vehicle', percent: '30 – 40%', compat: 'Ferrous and non-ferrous metals' },
    { name: 'Mineral base oil',                function: 'Lubricating base oil',                         percent: '15 – 25%', compat: 'Ferrous and non-ferrous metals' },
    { name: 'Dearomatized solvent',            function: 'Controlled-evaporation carrier',               percent: '15 – 25%', compat: 'Ferrous and non-ferrous metals' },
    { name: 'Light wetting solvent',           function: 'Wetting and penetration aid',                  percent: '< 10%',    compat: 'Ferrous and non-ferrous metals' },
    { name: 'Corrosion inhibitor',             function: 'Polar film-forming rust inhibitor',            percent: '10 – 15%', compat: 'Ferrous and non-ferrous metals' },
    { name: 'Film-forming barrier agent',      function: 'Protective film former',                       percent: '< 10%',    compat: 'Ferrous and non-ferrous metals' },
  ],
  performance: CORRUCUT_500_PERFORMANCE,
  safetyNote: 'Flammable liquid (flash point ≈ 43 °C, calculated) — keep away from heat and ignition sources. Contains hydrocarbon solvents: use only with adequate ventilation, as vapours may cause drowsiness. Refer to the CORRUCUT 500 – Water-Displacing RPO Safety Data Sheet before use.',
}

export const TDS_OVERRIDES_CORRUCUT_500_MTO_BASED = {
  description: 'This CORRUCUT 500 grade is a solvent-based rust preventive built on a hydrocarbon solvent carrier. The carrier penetrates and evaporates quickly, leaving a lightly oily film of mineral base oil, corrosion inhibitor and film-forming barrier agent — slightly heavier than the standard grade owing to its higher non-volatile oil content. Suited for inter-operational protection, transit, and indoor or covered storage.',
  features: [
    { head: 'Fast-Penetrating Solvent Carrier', body: 'The hydrocarbon solvent carrier wets and penetrates recesses quickly, then evaporates to leave the protective film.' },
    { head: 'Heavier Protective Film',         body: 'Higher mineral base oil content gives a slightly heavier, more persistent film than the standard grade.' },
    { head: 'Barrier-Reinforced Film',         body: 'A film-forming barrier agent improves film cohesion and water resistance versus a solvent-only carrier.' },
    { head: 'Flexible Application',            body: 'Suitable for immersion tanks, spray lines, or manual brush application.' },
  ],
  physicalProperties: [
    { property: 'Appearance',                  value: 'Clear, pale amber fluid',  unit: '—',     method: 'Visual' },
    { property: 'Density @ 25°C',              value: '≈ 0.84',                   unit: 'g/mL',  method: 'Calculated (volume-additive)' },
    { property: 'Kinematic Viscosity @ 40°C',  value: '≈ 3 – 5',                  unit: 'cSt',   method: 'Calculated (Refutas blend)' },
    { property: 'Flash Point (PMCC)',          value: '≈ 39',                     unit: '°C',    method: 'Calculated (Le Chatelier)' },
    { property: 'Non-volatile Film Content',   value: '≈ 45',                     unit: '% v/v', method: 'Calculated' },
    { property: 'Protective Film Classification', value: 'Lightly oily protective film', unit: '—', method: 'Internal' },
    { property: 'Indoor Protection Period',    value: '3 – 6',                    unit: 'months', method: 'Environmental — guidance only' },
    { property: 'Outdoor Covered Protection Period', value: '1 – 3',              unit: 'months', method: 'Environmental — guidance only' },
  ],
  composition: [
    { name: 'Hydrocarbon carrier solvent',     function: 'Primary carrier and penetration vehicle', percent: '50 – 60%', compat: 'Ferrous and non-ferrous metals' },
    { name: 'Mineral base oil',                function: 'Lubricating base oil',                    percent: '20 – 30%', compat: 'Ferrous and non-ferrous metals' },
    { name: 'Corrosion inhibitor',             function: 'Polar film-forming rust inhibitor',       percent: '10 – 15%', compat: 'Ferrous and non-ferrous metals' },
    { name: 'Film-forming barrier agent',      function: 'Protective film former',                  percent: '< 10%',    compat: 'Ferrous and non-ferrous metals' },
  ],
  performance: CORRUCUT_500_PERFORMANCE,
  safetyNote: 'Flammable liquid (flash point ≈ 39 °C, calculated) — keep away from heat and ignition sources. Contains hydrocarbon solvents: use only with adequate ventilation, as vapours may cause drowsiness. Refer to the CORRUCUT 500 Safety Data Sheet for this grade before use.',
}

export const MSDS_OVERRIDES_CORRUCUT_500_WDRPO = {
  hazardOverride: CORRUCUT_500_MTO_HAZARD_OVERRIDE,
  identification: CORRUCUT_500_MTO_IDENTIFICATION('Hydrocarbon solvent-based water-displacing corrosion preventive fluid'),
  composition: {
    note: '* Formulation values and ingredient identities are proprietary. Concentrations are given as ranges.',
    ingredients: [
      { name: 'Hydrocarbon Solvent (Volatile Carrier)',  percent: '30% – 40%', tagType: 'danger', ghsClass: 'Flam. Liq. 3 / Asp. Tox. 1 / STOT SE 3 / STOT RE 1 / Aquatic Chronic 2', description: 'Volatile carrier solvent' },
      { name: 'Dearomatized Hydrocarbon Solvent',        percent: '15% – 25%', tagType: 'danger', ghsClass: 'Asp. Tox. 1',                    description: 'Carrier solvent' },
      { name: 'Mineral Base Oil',                        percent: '15% – 25%', tagType: 'warn',   ghsClass: 'Asp. Tox. 1',                    description: 'Residual film oil' },
      { name: 'Corrosion Inhibitor',                     percent: '10% – 16%', tagType: 'warn',   ghsClass: 'Aquatic Chronic 2',              description: 'Rust inhibitor' },
      { name: 'Light Hydrocarbon Solvent',               percent: '4% – 8%',   tagType: 'warn',   ghsClass: 'Flam. Liq. 3 / Asp. Tox. 1',     description: 'Light carrier fraction' },
      { name: 'Film-Forming Barrier Agent',              percent: '4% – 8%',   tagType: 'safe',   ghsClass: 'Not Classified',                 description: 'Water resistance and film cohesion' },
    ],
  },
  physical: [
    { key: 'Physical State',        val: 'Clear, pale amber liquid' },
    { key: 'Odour',                 val: 'Characteristic hydrocarbon solvent odour' },
    { key: 'Flash Point',           val: '≈ 43 °C (calculated; closed cup)' },
    { key: 'Relative Density',      val: '≈ 0.84 g/mL @ 25 °C (calculated)' },
    { key: 'Kinematic Viscosity',   val: '≈ 3 – 5 cSt @ 40 °C (calculated)' },
    { key: 'Initial Boiling Point', val: '≈ 150 °C (solvent fraction)' },
    { key: 'Water Solubility',      val: 'Insoluble' },
    { key: 'Vapour Pressure',       val: '< 1 kPa @ 20 °C (estimated)' },
  ],
  fireFighting: CORRUCUT_500_MTO_FIRE_FIGHTING('≈ 43 °C'),
  toxicology:   CORRUCUT_500_MTO_TOXICOLOGY,
  ecology:      CORRUCUT_500_MTO_ECOLOGY,
  transport:    CORRUCUT_500_MTO_TRANSPORT,
}

export const MSDS_OVERRIDES_CORRUCUT_500_MTO_BASED = {
  hazardOverride: CORRUCUT_500_MTO_HAZARD_OVERRIDE,
  identification: CORRUCUT_500_MTO_IDENTIFICATION('Hydrocarbon solvent-based corrosion preventive fluid'),
  composition: {
    note: '* Formulation values and ingredient identities are proprietary. Concentrations are given as ranges.',
    ingredients: [
      { name: 'Hydrocarbon Solvent (Volatile Carrier)', percent: '50% – 60%', tagType: 'danger', ghsClass: 'Flam. Liq. 3 / Asp. Tox. 1 / STOT SE 3 / STOT RE 1 / Aquatic Chronic 2', description: 'Volatile carrier solvent' },
      { name: 'Mineral Base Oil',                       percent: '20% – 30%', tagType: 'warn',   ghsClass: 'Asp. Tox. 1',       description: 'Residual film oil' },
      { name: 'Corrosion Inhibitor',                    percent: '10% – 16%', tagType: 'warn',   ghsClass: 'Aquatic Chronic 2', description: 'Rust inhibitor' },
      { name: 'Film-Forming Barrier Agent',             percent: '4% – 8%',   tagType: 'safe',   ghsClass: 'Not Classified',    description: 'Water resistance and film cohesion' },
    ],
  },
  physical: [
    { key: 'Physical State',        val: 'Clear, pale amber liquid' },
    { key: 'Odour',                 val: 'Characteristic hydrocarbon solvent odour' },
    { key: 'Flash Point',           val: '≈ 39 °C (calculated; closed cup)' },
    { key: 'Relative Density',      val: '≈ 0.84 g/mL @ 25 °C (calculated)' },
    { key: 'Kinematic Viscosity',   val: '≈ 3 – 5 cSt @ 40 °C (calculated)' },
    { key: 'Initial Boiling Point', val: '≈ 150 °C (solvent fraction)' },
    { key: 'Water Solubility',      val: 'Insoluble' },
    { key: 'Vapour Pressure',       val: '< 1 kPa @ 20 °C (estimated)' },
  ],
  fireFighting: CORRUCUT_500_MTO_FIRE_FIGHTING('≈ 39 °C'),
  toxicology:   CORRUCUT_500_MTO_TOXICOLOGY,
  ecology:      CORRUCUT_500_MTO_ECOLOGY,
  transport:    CORRUCUT_500_MTO_TRANSPORT,
}
