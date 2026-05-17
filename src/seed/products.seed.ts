import { db } from '../db/index.js'
import { products, productDocuments } from '../db/schema/index.js'

// ── Product master data ────────────────────────────────────────────────────────
const PRODUCTS = [
  { key: 'uniklean-sp',    displayName: 'UNIKLEAN-SP',    code: 'SP',  category: 'Alkaline Cleaner - Cast Iron',      subtitle: 'Industrial Surface Cleaner & Metal Conditioner',                  accentColor: '#1e6b5a' },
  { key: 'uniklean-fe',    displayName: 'UNIKLEAN-FE',    code: 'FE',  category: 'Iron-based Cleaner',                subtitle: 'Iron Phosphating & Metal Conditioning Agent',                     accentColor: '#7a3a1a' },
  { key: 'uniprotect-oil', displayName: 'UNIPROTECT OIL', code: 'UP',  category: 'Rust Preventive Oil',               subtitle: 'Water Displacing Rust Preventive',                                accentColor: '#1a4971' },
  { key: 'uniflow-ecm',    displayName: 'UNIFLOW ECM',    code: 'ECM', category: 'Corrosion Preventive Oil',          subtitle: 'Corrosion Preventive Oil — Hydrocarbon + Petroleum Sulfonate',     accentColor: '#1a5c73' },
  { key: 'unicool-al',      displayName: 'UNICool AL',      code: 'AL',  category: 'Alcohol Based Cleaner', subtitle: 'Fast-Drying Alcohol Cleaner — Cooling & Precision Cleaning Fluid', accentColor: '#1590c2' },
  { key: 'unikoat-lt-700', displayName: 'UNIKOAT LT 700', code: 'LT',  category: 'Zinc Phosphating',      subtitle: 'Zinc Phosphating & Surface Conversion Agent',                     accentColor: '#4a6741' },
  { key: 'unisolve-h3',    displayName: 'UNISOLVE H3',    code: 'H3',  category: 'Degreasing / Derusting Chemical', subtitle: 'Phosphoric Acid-Based Acidic Cleaner & Rust Remover',         accentColor: '#7a5c1a' },
  { key: 'unipass',        displayName: 'UNIPASS',        code: 'PS',  category: 'Passivation Chemical',             subtitle: 'Post-treatment / Anti-corrosion Passivation',                   accentColor: '#2d6a6a' },
  { key: 'uniktonner',    displayName: 'UNIKTONNER',    code: 'TN',  category: 'Tonnage Additive / Accelerator',   subtitle: 'Nitrite-Based Phosphating Accelerator Solution',                 accentColor: '#8b2500' },
]

// ── Document data ──────────────────────────────────────────────────────────────
// Full TDS/MSDS/Formula/Label/CoA bodies — migrated verbatim from handlers.js

const DOCS: Array<{
  productKey: string
  docType:    'tds' | 'msds' | 'formula' | 'label' | 'coa'
  docNumber:  string
  revision:   string
  body:       Record<string, unknown>
  footer:     { left: string; center: string; right: string }
}> = [

  // ─────────────────────────────────────────────────────────────────────────────
  // UNIKLEAN-SP
  // ─────────────────────────────────────────────────────────────────────────────
  {
    productKey: 'uniklean-sp',
    docType:    'tds',
    docNumber:  'TDS-USP-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'TDS-USP-001 Rev 01 · Apr 2026',
      center: 'This Technical Data Sheet is for guidance only. Performance figures are typical values obtained under controlled conditions. © Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nPage 1 of 1',
    },
    body: {
      grade:       'Industrial Grade',
      description: 'Uniklean SP is a heavy-duty, water-based alkaline cleaning compound engineered for the removal of grease, oil, carbon deposits, scale, and industrial soils from metallic substrates prior to painting, powder coating, or phosphating. It combines a balanced blend of functional agents for reliable, consistent performance across spray wash, immersion, and ultrasonic cleaning systems. The formulation is non-flammable, low-foam, and compatible with a broad range of ferrous and non-ferrous substrates at recommended concentrations.',
      sections: {
        features: [
          { head: 'High-Efficiency Cleaning',  body: 'Effective removal of heavy greases, oils, drawing compounds, and carbonised soils at low concentrations' },
          { head: 'Corrosion Inhibition',       body: 'Integrated inhibitor system protects ferrous metals against flash rust during and immediately after cleaning' },
          { head: 'Low Foam Formula',           body: 'Defoamer-controlled; suitable for high-pressure spray wash tunnels and automated lines' },
          { head: 'Multi-metal Compatible',     body: 'Safe for use on mild steel, galvanised, and aluminium substrates at recommended dilutions' },
        ],
        physicalProperties: [
          { property: 'Appearance',             value: 'Clear to pale yellow liquid', unit: '—',      method: 'Visual' },
          { property: 'pH (1% solution)',        value: '10.5 – 12.5',                unit: '—',      method: 'pH electrode, 25 °C' },
          { property: 'Density',                value: '~1.05',                       unit: 'g/mL',   method: 'ISO 2811' },
          { property: 'Working Concentration',   value: '1 – 5',                      unit: '% v/v',  method: 'Titration / conductivity' },
          { property: 'Working Temperature',     value: '40 – 65',                    unit: '°C',     method: '—' },
          { property: 'Contact Time (spray)',    value: '1 – 3',                      unit: 'min',    method: 'Process qualification' },
          { property: 'Contact Time (dip)',      value: '5 – 15',                     unit: 'min',    method: 'Process qualification' },
          { property: 'Foam level',              value: 'Low',                        unit: '—',      method: 'DIN 53902' },
        ],
        composition: [
          { name: 'Alkaline builder system',    function: 'Alkalinity source for oil saponification and heavy soil removal', percent: '10–20%',  compat: 'All metals at working dilution' },
          { name: 'Non-ionic surfactant blend',  function: 'Oil emulsification, wetting and low-foam detergency',            percent: '1–5%',    compat: 'Low foam at ≤65 °C' },
          { name: 'Chelating agent',            function: 'Water hardness control; prevents bath scaling',                   percent: '<2%',     compat: 'Hard and soft water' },
          { name: 'Corrosion inhibitor',        function: 'Flash rust prevention on ferrous surfaces post-clean',            percent: '<2%',     compat: 'Ferrous, Al, Zn' },
          { name: 'Foam control agent',         function: 'Foam suppression for spray wash and agitated baths',              percent: '<1%',     compat: 'Spray and dip' },
          { name: 'Water',                      function: 'Carrier / solvent',                                              percent: 'Balance', compat: '—' },
        ],
        application: [
          { step: '1', name: 'Prepare bath',  param: '1–5% Uniklean SP in water',                    value: '40–65 °C' },
          { step: '2', name: 'Load parts',    param: 'Immersion or spray',                            value: '1–15 min contact' },
          { step: '3', name: 'Rinse',         param: 'Tap water',                                    value: '2 × rinse, ambient' },
          { step: '4', name: 'Second Rinse',  param: 'DI water (if DI line)',                         value: 'Ambient' },
          { step: '5', name: 'Next Stage',    param: 'Phosphating / DI rinse / topcoat',              value: 'As required' },
        ],
        packaging: [
          { size: '30',  unit: 'L',   type: 'HDPE jerrycan' },
          { size: '200', unit: 'KG',  type: 'HDPE barrel / drum' },
        ],
        performance: [
          { label: 'Oil removal (mineral)', val: '>99% at 2%, 55 °C, 5 min' },
          { label: 'Foam (spray, 55 °C)',   val: '<5 mL (DIN 53902)' },
          { label: 'Corrosion inhibition',  val: 'No flash rust for ≥2 h (IS 5521)' },
          { label: 'Bath life',             val: '5–7 shifts at 2% with top-up' },
        ],
        safetyNote: 'Corrosive at full concentration. Always dilute before use. Refer to the current MSDS (SDS-USP-001) for full hazard information and PPE requirements.',
      },
    },
  },

  {
    productKey: 'uniklean-sp',
    docType:    'msds',
    docNumber:  'SDS-USP-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'SDS-USP-001 Rev 01 · Apr 2026',
      center: 'This Safety Data Sheet is provided in good faith based on current knowledge. © Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nGHS Rev 9 Compliant · Page 1 of 1',
    },
    body: {
      signalWord: 'Warning',
      sections: {
        identification: {
          productType: 'Alkaline aqueous cleaning & conditioning formulation',
          intendedUse: 'Industrial degreasing, pre-treatment of metallic substrates',
          manufacturer: 'Macro Coats Pvt Ltd, Chennai, Tamil Nadu, India',
          emergency:   'AIIMS Poison Control: 1800-11-6117 (Toll-Free)',
        },
        hazards: {
          pictograms:      ['corrosive', 'irritant', 'environment'],
          classifications: [
            { class: 'Skin Corrosion / Irritation', category: 'Cat 1B',        tagType: 'danger'  },
            { class: 'Serious Eye Damage',           category: 'Cat 1',         tagType: 'danger'  },
            { class: 'Skin Sensitisation',           category: 'Cat 1B',        tagType: 'warn'    },
            { class: 'Aquatic Toxicity (Chronic)',   category: 'Cat 3',         tagType: 'warn'    },
            { class: 'Flammability',                 category: 'Not Classif.',  tagType: 'neutral' },
          ],
          hStatements: 'H314 — Causes severe skin burns and eye damage (concentrate). H317 — May cause allergic skin reaction. H412 — Harmful to aquatic life with long lasting effects.',
          pStatements: 'P260 · P264 · P273 · P280 · P301+P330+P331 · P303+P361+P353 · P305+P351+P338 · P310',
        },
        composition: {
          ingredients: [
            { name: 'Alkaline inorganic builders', description: 'Degreasing alkalinity system — saponification and emulsification of oils', percent: '10–20%', ghsClass: 'Corrosive', tagType: 'danger' },
            { name: 'Non-ionic surfactant blend',  description: 'Oil emulsification, wetting and detergency',                              percent: '1–5%',   ghsClass: 'Irritant',  tagType: 'warn'   },
            { name: 'Chelating agent',             description: 'Water hardness control — prevents scale formation in bath',               percent: '<2%',    ghsClass: 'None',      tagType: 'safe'   },
            { name: 'Corrosion inhibitor',         description: 'Flash rust prevention on treated ferrous surfaces',                       percent: '<2%',    ghsClass: 'None',      tagType: 'safe'   },
            { name: 'Foam control agent',          description: 'Foam suppression for spray wash and high-agitation systems',             percent: '<1%',    ghsClass: 'None',      tagType: 'safe'   },
            { name: 'Water',                       description: 'Carrier / solvent',                                                      percent: 'Balance', ghsClass: '—',        tagType: 'safe'   },
          ],
          note: 'Exact formulation is proprietary. Functional ingredient descriptions are provided for safety and emergency purposes only.',
        },
        firstAid: {
          eyes:       'Flush with running water for ≥20 min, holding eyelids open. Seek immediate medical attention — risk of permanent eye damage.',
          skin:       'Remove contaminated clothing immediately. Wash with soap and copious water for ≥20 min. Seek medical attention if burns develop.',
          inhalation: 'Move to fresh air immediately. If breathing is difficult, give supplemental oxygen. Seek medical attention.',
          ingestion:  'Rinse mouth with water. Do NOT induce vomiting — may cause further burns. Call AIIMS Poison Control: 1800-11-6117.',
          warning:    '⚠ Alkali burns can be deceptive — pain may be delayed. Always seek medical attention for eye/skin exposure.',
        },
        fireFighting: {
          flammability:       'Not flammable',
          extinguishingMedia: 'Any extinguishing agent suitable for surrounding fire',
          fireHazard:         'Thermal decomposition may generate irritating vapours',
          ppe:                'Full SCBA and chemical-resistant clothing',
        },
        accidentalRelease: [
          'Evacuate non-essential personnel; ventilate area',
          'Wear full PPE (chemical goggles, face shield, alkali-resistant gloves, apron)',
          'Contain spill with sand or vermiculite; avoid runoff to drains',
          'Neutralise with dilute acid (citric or acetic) before disposal',
          'Prevent entry into waterways — toxic to aquatic organisms',
          'Dispose as per local CPCB/SPCB guidelines',
        ],
        handling: {
          handling:     'Dilute concentrate carefully — always add to water, not vice versa. Handle in well-ventilated areas.',
          storageTemp:  '10 °C – 35 °C; store in cool, dry place; protect from frost',
          containers:   'Sealed HDPE or polypropylene containers; segregate from acids',
          segregation:  'Store separately from acids, ammonium salts, and oxidising agents',
          shelfLife:    '24 months from date of manufacture (sealed, stored correctly)',
        },
        exposure: {
          ppeItems:    ['Chemical Goggles', 'Face Shield', 'Alkali-resist. Gloves', 'PVC Apron', 'Rubber Boots'],
          engineering: 'Exhaust ventilation for spray application. Eyewash station within 10 s. Emergency shower near handling area.',
        },
        physical: [
          { key: 'Appearance',    val: 'Clear to pale yellow liquid' },
          { key: 'Odour',         val: 'Mild, characteristic' },
          { key: 'pH (1% Sol.)',  val: '10.5 – 12.5' },
          { key: 'Density',       val: '~1.05 g/mL' },
          { key: 'Flash Point',   val: 'None (aqueous)' },
          { key: 'Boiling Point', val: '~102 °C' },
          { key: 'Solubility',    val: 'Fully miscible with water' },
          { key: 'Viscosity',     val: 'Low (water-like)' },
        ],
        stability: {
          stability:      'Stable under recommended storage conditions',
          avoid:          'Strong acids, oxidising agents, ammonium compounds',
          decomposition:  'May emit irritating vapours on strong heating',
          polymerisation: 'Will not occur',
        },
        sections11to16: {
          'Skin / Eye': 'Alkaline burns — corrosive to skin and eyes at full concentration. Diluted solutions are irritating.',
          Aquatic:      'H412 — surfactants and alkali harmful to aquatic life with long lasting effects',
          Disposal:     'Neutralise to pH 6–9 before discharge. Dispose per CPCB/SPCB norms (E.P. Act 1986)',
          Regulatory:   'MSIHC Rules 1989 · Factories Act 1948 · Hazardous Waste Rules 2016 · GHS Rev 9',
          'Other Info': 'SDS Rev 01 issued Apr 2026. Next review: Apr 2028 or upon formulation change.',
        },
      },
    },
  },

  {
    productKey: 'uniklean-sp',
    docType:    'formula',
    docNumber:  'FRM-USP-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'FRM-USP-001 Rev 01 · Apr 2026',
      center: 'CONFIDENTIAL — This formulation sheet is the proprietary information of Macro Coats Pvt Ltd. Unauthorised reproduction or disclosure is prohibited.',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nPage 1 of 1',
    },
    body: {
      classification:      'CONFIDENTIAL — Internal Use Only',
      batchSize:           '100 L (reference)',
      formulaType:         'liquid',
      referenceBatchSize:  100,
      batchUnit:           'L',
      totalActivePercent:  15.52,
      overview: 'UNIKLEAN-SP is a heavy-duty alkaline degreasing compound formulated for industrial metal pretreatment prior to phosphating and coating processes.',
      composition: [
        { srNo: 1, name: 'Sodium Metasilicate (SMS)',         casNo: '6834-92-0',  baseQty: 5.5,  unit: 'kg', percentWV: 5.5,  function: 'Strong alkalinity, oil emulsification, corrosion protection', density: null, unitPrice: 32  },
        { srNo: 2, name: 'Soda Ash (Sodium Carbonate)',        casNo: '497-19-8',   baseQty: 5.0,  unit: 'kg', percentWV: 5.0,  function: 'Alkalinity builder and buffering',                           density: null, unitPrice: 14  },
        { srNo: 3, name: 'Trisodium Phosphate (TSP)',          casNo: '7601-54-9',  baseQty: 3.5,  unit: 'kg', percentWV: 3.5,  function: 'Builder, grease removal, water softening',                  density: null, unitPrice: 42  },
        { srNo: 4, name: 'EDTA Disodium',                     casNo: '6381-92-6',  baseQty: 0.5,  unit: 'kg', percentWV: 0.5,  function: 'Chelating agent for hardness control',                      density: null, unitPrice: 160 },
        { srNo: 5, name: 'Alphox 200 (Non-ionic Surfactant)',  casNo: '68439-50-9', baseQty: 0.2,  unit: 'kg', percentWV: 0.2,  function: 'Wetting and oil emulsification',                            density: null, unitPrice: 130 },
        { srNo: 6, name: 'Sodium Nitrite',                    casNo: '7632-00-0',  baseQty: 0.8,  unit: 'kg', percentWV: 0.8,  function: 'Flash rust inhibitor',                                      density: null, unitPrice: 48  },
        { srNo: 7, name: 'Non-silicone Defoamer',              casNo: 'Mixture',    baseQty: 0.02, unit: 'kg', percentWV: 0.02, function: 'Foam control',                                              density: null, unitPrice: 220 },
        { srNo: 8, name: 'Water',                              casNo: '7732-18-5',  baseQty: null, unit: 'L',  percentWV: null, function: 'Solvent — balance to final volume',                         density: null, unitPrice: 0   },
      ],
      preparation: [
        { step: 1, title: 'Water Charging',             detail: 'Add 60–65% of the required water to the mixing tank and start agitation.' },
        { step: 2, title: 'Dissolve Alkaline Builders', detail: 'Add sequentially: Sodium Metasilicate, Soda Ash, Trisodium Phosphate. Allow complete dissolution before adding the next chemical.' },
        { step: 3, title: 'Add Chelating Agent',        detail: 'Add EDTA Disodium and mix until fully dissolved.' },
        { step: 4, title: 'Add Corrosion Inhibitor',    detail: 'Add Sodium Nitrite with continuous mixing.' },
        { step: 5, title: 'Add Surfactant',             detail: 'Slowly add Alphox 200 while stirring to prevent foaming.' },
        { step: 6, title: 'Add Defoamer',               detail: 'Add non-silicone defoamer and mix.' },
        { step: 7, title: 'Final Volume Adjustment',    detail: 'Add water to reach the final batch volume and mix for 10–15 minutes.' },
      ],
      operatingConditions: [
        { param: 'Bath Concentration',    value: '2 – 4 %' },
        { param: 'Operating Temperature', value: '60 – 75 °C' },
        { param: 'Bath pH',               value: '10.5 – 12.5' },
        { param: 'Treatment Time',        value: '5 – 15 minutes' },
        { param: 'Application Method',    value: 'Spray wash or immersion' },
      ],
      applications: {
        removes:    ['Machining oils', 'Drawing compounds', 'Greases', 'Shop contaminants'],
        usedBefore: ['Phosphating', 'Powder coating', 'Painting / liquid coat'],
      },
    },
  },

  {
    productKey: 'uniklean-sp',
    docType:    'label',
    docNumber:  'LBL-USP-001',
    revision:   'Rev 01 — Apr 2026',
    footer: { left: '', center: '', right: '' },
    body: {
      signalWord: 'DANGER',
      unNo: 'UN 1760',
      hCodes: [
        { code: 'H290', text: 'May be corrosive to metals' },
        { code: 'H302', text: 'Harmful if swallowed' },
        { code: 'H314', text: 'Causes severe skin burns and eye damage' },
        { code: 'H317', text: 'May cause allergic skin reaction' },
        { code: 'H412', text: 'Harmful to aquatic life with long lasting effects' },
      ],
      pCodes: [
        { code: 'P260',            text: 'Do not breathe fumes or vapours' },
        { code: 'P273',            text: 'Avoid release to the environment' },
        { code: 'P280',            text: 'Wear protective gloves and eye/face protection' },
        { code: 'P301+P330+P331', text: 'If swallowed, rinse mouth; do NOT induce vomiting' },
        { code: 'P303+P361+P353', text: 'If on skin or hair, remove clothing; rinse skin with water' },
        { code: 'P305+P351+P338', text: 'If in eyes, rinse cautiously with water for ≥20 min' },
        { code: 'P310',            text: 'Immediately call a POISON CENTER or doctor' },
      ],
      firstAid: {
        skin:       'Remove clothing. Wash with copious water for ≥20 min. Seek medical attention.',
        eyes:       'Flush with running water for ≥20 min. Seek immediate medical attention — risk of permanent damage.',
        ingestion:  'Rinse mouth. Do NOT induce vomiting. Call 1800-11-6117 immediately.',
        inhalation: 'Move to fresh air. If breathing difficult, give oxygen. Seek medical attention.',
      },
      directions: [
        'Dilute 1–5% in water before use',
        'Apply at 40–65 °C by spray or immersion',
        'Allow 3–5 min contact time',
        'Rinse thoroughly with clean water',
      ],
      storage:  ['Store at 5°C – 35°C', 'Keep away from sunlight', 'Keep away from children', 'Dispose per local regulations (CPCB)'],
      products: ['UNIKLEAN SP', 'UNIKCONDITIONER', 'UNIKTONNER', 'UNISOLVE', 'UNISOLVE H3'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // UNIKLEAN-FE
  // ─────────────────────────────────────────────────────────────────────────────
  {
    productKey: 'uniklean-fe',
    docType:    'tds',
    docNumber:  'TDS-UFE-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'TDS-UFE-001 Rev 01 · Apr 2026',
      center: 'This Technical Data Sheet is for guidance only. Performance figures are typical values obtained under controlled conditions and may vary in practice. © Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nPage 1 of 1',
    },
    body: {
      grade:       'Industrial Grade',
      description: 'UNIKLEAN-FE is a ready-to-dilute liquid iron phosphate pretreatment concentrate designed for ferrous metal conditioning prior to powder coating, liquid painting, and electrocoating.',
      sections: {
        features: [
          { head: 'Conversion Coating',  body: 'Produces a uniform microcrystalline iron phosphate layer (0.3–1.0 g/m²) on ferrous substrates, improving paint adhesion' },
          { head: 'Single-Stage Action', body: 'Simultaneous light cleaning and phosphating in one bath — removes light surface contamination and activates the metal surface' },
          { head: 'Flash Rust Inhibition', body: 'Treated surfaces exhibit reduced flash rust, extending the open time before topcoat application' },
          { head: 'Topcoat Compatible', body: 'Validated for use under powder coat, liquid paint, and electrocoat (e-coat) topcoat systems on ferrous substrates' },
        ],
        physicalProperties: [
          { property: 'Appearance',               value: 'Clear to pale yellow liquid', unit: '—',      method: 'Visual' },
          { property: 'pH (concentrate)',          value: '1.5 – 3.0',                  unit: '—',      method: 'pH electrode, 25 °C' },
          { property: 'pH (working bath, 5–10%)', value: '4.0 – 5.5',                  unit: '—',      method: 'pH electrode, 25 °C' },
          { property: 'Density (concentrate)',     value: '~1.10',                       unit: 'g/mL',   method: 'ISO 2811' },
          { property: 'Working Concentration',     value: '5 – 10',                      unit: '% v/v',  method: 'Titration / pH control' },
          { property: 'Working Temperature',       value: '45 – 65',                     unit: '°C',     method: '—' },
          { property: 'Treatment Time',            value: '3 – 8',                       unit: 'min',    method: 'Process qualification' },
          { property: 'Coating Weight',            value: '0.3 – 1.0',                  unit: 'g/m²',   method: 'IS 6005 / ISO 3892' },
        ],
        composition: [
          { name: 'Phosphate salt system',  function: 'Conversion coating and surface conditioning',          percent: '20–30%',  compat: 'MS, GI, CR steel' },
          { name: 'Accelerator system',     function: 'Promotes uniform phosphate coating formation',         percent: '2–5%',    compat: 'Spray and dip' },
          { name: 'Oxidising salt system',  function: 'Enhances coating deposition rate and uniformity',      percent: '2–5%',    compat: 'All process types' },
          { name: 'Water',                  function: 'Carrier / solvent',                                    percent: 'Balance', compat: '—' },
        ],
        application: [
          { step: '1', name: 'Pre-clean (if required)', param: 'Alkaline degreaser (e.g. Uniklean SP)', value: '2–4%, 60–75 °C, 3–8 min' },
          { step: '2', name: 'Rinse',                   param: 'Tap water',                             value: '2 × overflow rinse, ambient' },
          { step: '3', name: 'Uniklean FE Bath',         param: '5–10% v/v, pH 4.0–5.5',               value: '45–65 °C, 3–8 min spray or dip' },
          { step: '4', name: 'Water Rinse',              param: 'Tap water',                             value: '1–2 × rinse, ambient' },
          { step: '5', name: 'DI / Passivation Rinse',  param: 'Deionised water or chrome-free passivate', value: 'As required by topcoat spec' },
          { step: '6', name: 'Dry & Topcoat',            param: 'Powder coat / Liquid paint / E-coat',   value: 'Apply within 4 h of treatment' },
        ],
        packaging: [
          { size: '30',  unit: 'L', type: 'HDPE jerrycan' },
          { size: '200', unit: 'L', type: 'HDPE barrel / drum' },
        ],
        performance: [
          { label: 'Salt Spray (coated)',  val: '≥240 h (IS 101 / ASTM B117)' },
          { label: 'Adhesion (cross-cut)', val: 'Class 0–1 (ISO 2409)' },
          { label: 'Coating Weight',       val: '0.3–1.0 g/m² (IS 6005)' },
          { label: 'Bath pH Stability',    val: '±0.3 over 8 h continuous production' },
        ],
        safetyNote: 'Acidic concentrate — handle with appropriate PPE. Always dilute into water; do not add water to concentrate. Refer to the current SDS (SDS-UFE-001) for full hazard information.',
      },
    },
  },

  {
    productKey: 'uniklean-fe',
    docType:    'msds',
    docNumber:  'SDS-UFE-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'SDS-UFE-001 Rev 01 · Apr 2026',
      center: 'This Safety Data Sheet is provided in good faith based on current knowledge. Information does not constitute a guarantee of specific product properties. © Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nGHS Rev 9 Compliant · Page 1 of 1',
    },
    body: {
      signalWord: 'Warning',
      sections: {
        identification: {
          productType:  'Liquid iron phosphate pretreatment concentrate for ferrous metal conditioning',
          intendedUse:  'Iron phosphate conversion coating on ferrous substrates prior to powder coating, painting, or electrocoating',
          manufacturer: 'Macro Coats Pvt Ltd, Chennai, Tamil Nadu, India',
          emergency:    'AIIMS Poison Control: 1800-11-6117 (Toll-Free)',
        },
        hazards: {
          pictograms:      ['oxidiser', 'irritant', 'environment'],
          classifications: [
            { class: 'Skin Irritation',             category: 'Cat 2',  tagType: 'warn' },
            { class: 'Eye Irritation',              category: 'Cat 2',  tagType: 'warn' },
            { class: 'Acute Toxicity — Oral',       category: 'Cat 4',  tagType: 'warn' },
            { class: 'Oxidising Liquid',            category: 'Cat 3',  tagType: 'warn' },
            { class: 'Aquatic Toxicity (Chronic)',  category: 'Cat 3',  tagType: 'warn' },
          ],
          hStatements: 'H272 — May intensify fire; oxidiser. H302 — Harmful if swallowed. H315 — Causes skin irritation. H319 — Causes serious eye irritation. H412 — Harmful to aquatic life with long lasting effects.',
          pStatements: 'P210 · P220 · P221 · P260 · P264 · P270 · P273 · P280 · P301+P312 · P302+P352 · P305+P351+P338 · P330 · P501',
        },
        composition: {
          ingredients: [
            { name: 'Phosphate salts',    description: 'Metal surface conditioning and conversion coating agents', percent: '20–30%', ghsClass: 'Irritant',  tagType: 'warn' },
            { name: 'Accelerator system', description: 'Phosphating reaction accelerator',                         percent: '2–5%',   ghsClass: 'Oxidiser', tagType: 'warn' },
            { name: 'Oxidizing salts',    description: 'Coating formation enhancer',                               percent: '2–5%',   ghsClass: 'Oxidiser', tagType: 'warn' },
            { name: 'Water',              description: 'Carrier / solvent',                                        percent: 'Balance', ghsClass: '—',       tagType: 'safe' },
          ],
          note: 'Exact formulation is proprietary. Functional ingredient descriptions are provided for safety and emergency purposes only.',
        },
        firstAid: {
          eyes:       'Flush with running water for ≥15 min, holding eyelids open. Seek immediate medical attention.',
          skin:       'Remove contaminated clothing immediately. Wash with soap and water for ≥15 min. Seek medical attention if irritation persists.',
          inhalation: 'Move to fresh air immediately. Seek medical attention if symptoms persist.',
          ingestion:  'Rinse mouth thoroughly with water. Do NOT induce vomiting. Call AIIMS Poison Control: 1800-11-6117.',
          warning:    '⚠ Contains oxidising agents — ingestion requires immediate medical evaluation.',
        },
        fireFighting: {
          flammability:       'Not flammable (aqueous solution); oxidising components may intensify fires involving combustible materials',
          extinguishingMedia: 'Water spray or fog; dry sand.',
          fireHazard:         'Thermal decomposition may generate toxic nitrogen oxides (NOₓ).',
          ppe:                'SCBA and full chemical-resistant protective clothing.',
        },
        accidentalRelease: [
          'Evacuate non-essential personnel from spill area; ensure adequate ventilation',
          'Wear full PPE: chemical splash goggles, face shield, acid/oxidiser-resistant gloves',
          'Contain spill with inert absorbent material (vermiculite, dry sand)',
          'Collect contaminated material into sealed, labelled HDPE containers for disposal',
          'Do not allow runoff to enter drains, surface water, or soil',
          'Dispose of spill waste per local CPCB/SPCB guidelines (HWM Rules 2016)',
        ],
        handling: {
          handling:     'Dilute into water — always add concentrate to water, not vice versa.',
          storageTemp:  '10 °C – 35 °C; cool, dry, ventilated store; protect from frost and direct heat sources',
          containers:   'Sealed, labelled HDPE or polypropylene containers',
          segregation:  'Oxidising liquid — store separately from flammable and combustible materials',
          shelfLife:    '24 months from date of manufacture in original sealed containers',
        },
        exposure: {
          ppeItems:    ['Chemical Splash Goggles', 'Face Shield', 'Acid-resist. Gloves', 'Chemical Apron', 'Rubber Boots'],
          engineering: 'Mechanical ventilation for enclosed handling areas. Eyewash station and emergency shower within 10 seconds walking distance.',
        },
        physical: [
          { key: 'Appearance',    val: 'Clear to pale yellow liquid' },
          { key: 'Odour',         val: 'Mild, characteristic' },
          { key: 'pH (5% Sol.)',  val: '4.0 – 5.5' },
          { key: 'Density',       val: '~1.10 g/mL' },
          { key: 'Flash Point',   val: 'None (aqueous)' },
          { key: 'Boiling Point', val: '~102 °C' },
          { key: 'Solubility',    val: 'Fully miscible with water' },
          { key: 'Viscosity',     val: 'Low (water-like)' },
        ],
        stability: {
          stability:      'Stable under recommended storage and handling conditions.',
          avoid:          'Strong reducing agents, combustible / organic materials, strong alkalis',
          decomposition:  'Thermal decomposition above 300 °C may release toxic nitrogen oxide gases.',
          polymerisation: 'Will not occur',
        },
        sections11to16: {
          'Skin / Eye': 'Skin irritation (GHS Cat. 2); eye irritation (GHS Cat. 2) from concentrate.',
          Aquatic:      'H412 — harmful to aquatic life with long lasting effects (chronic Cat. 3).',
          Disposal:     'Neutralise spent bath to pH 6–9; treat for residual nitrogen compounds before discharge.',
          Regulatory:   'MSIHC Rules 1989 · Factories Act 1948 · HWM Rules 2016 · GHS Rev 9',
          'Other Info': 'SDS Rev 01 issued Apr 2026. Next review: Apr 2028.',
        },
      },
    },
  },

  {
    productKey: 'uniklean-fe',
    docType:    'formula',
    docNumber:  'FRM-UFE-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'FRM-UFE-001 Rev 01 · Apr 2026',
      center: 'CONFIDENTIAL — This formulation sheet is the proprietary information of Macro Coats Pvt Ltd.',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nPage 1 of 1',
    },
    body: {
      classification:     'CONFIDENTIAL — Internal Use Only',
      batchSize:          '200 L (reference)',
      formulaType:        'liquid',
      referenceBatchSize: 200,
      batchUnit:          'L',
      totalActivePercent: 29,
      overview: 'UNIKLEAN-FE is a liquid iron phosphate accelerator and conditioner formulated for metal pretreatment applications.',
      composition: [
        { srNo: 1, name: 'Mono Sodium Phosphate (NaH₂PO₄)', casNo: '7558-80-7', baseQty: 50,   unit: 'kg', percentWV: 25,   function: 'Phosphate source and acidity control — forms the conversion coating', density: null, unitPrice: 35 },
        { srNo: 2, name: 'Sodium Nitrite (NaNO₂)',           casNo: '7632-00-0', baseQty: 4,    unit: 'kg', percentWV: 2,    function: 'Accelerator and mild corrosion inhibitor',                          density: null, unitPrice: 48 },
        { srNo: 3, name: 'Sodium Nitrate (NaNO₃)',           casNo: '7631-99-4', baseQty: 4,    unit: 'kg', percentWV: 2,    function: 'Oxidizing accelerator for phosphate coating formation',               density: null, unitPrice: 22 },
        { srNo: 4, name: 'Water',                            casNo: '7732-18-5', baseQty: null, unit: 'L',  percentWV: null, function: 'Solvent — balance to final volume',                                  density: null, unitPrice: 0  },
      ],
      preparation: [
        { step: 1, title: 'Water Charging',          detail: 'Add approximately 60–70% of the required water (120–140 L for a 200 L batch) to the mixing tank. Start agitation.' },
        { step: 2, title: 'Dissolve Phosphate Salt', detail: 'Slowly add 50 kg Mono Sodium Phosphate while mixing.' },
        { step: 3, title: 'Add Sodium Nitrite',      detail: 'Add 4 kg Sodium Nitrite with continued mixing. Wear full PPE.' },
        { step: 4, title: 'Add Sodium Nitrate',      detail: 'Add 4 kg Sodium Nitrate sequentially with mixing.' },
        { step: 5, title: 'Final Volume Adjustment', detail: 'Add water to bring the final volume to exactly 200 liters. Mix for 10–15 minutes.' },
        { step: 6, title: 'QC Check & Pack',         detail: 'Verify pH (4.5–5.5) and appearance. Discharge into labelled HDPE containers.' },
      ],
      operatingConditions: [
        { param: 'Working Concentration', value: '5 – 10 %' },
        { param: 'Operating Temperature', value: '45 – 65 °C' },
        { param: 'Bath pH',               value: '4.5 – 5.5' },
        { param: 'Treatment Time',        value: '3 – 8 minutes' },
        { param: 'Application Method',    value: 'Spray wash or immersion' },
      ],
      applications: {
        removes:    ['Mild surface rust', 'Light mill scale', 'Residual metallic fines'],
        usedBefore: ['Powder coating', 'Painting / liquid coat', 'Electrocoating (E-coat)'],
      },
    },
  },

  {
    productKey: 'uniklean-fe',
    docType:    'label',
    docNumber:  'LBL-UFE-001',
    revision:   'Rev 01 — Apr 2026',
    footer: { left: '', center: '', right: '' },
    body: {
      signalWord: 'WARNING',
      unNo: 'UN 3138',
      hCodes: [
        { code: 'H272', text: 'May intensify fire; oxidiser' },
        { code: 'H302', text: 'Harmful if swallowed' },
        { code: 'H315', text: 'Causes skin irritation' },
        { code: 'H319', text: 'Causes serious eye irritation' },
        { code: 'H412', text: 'Harmful to aquatic life with long lasting effects' },
      ],
      pCodes: [
        { code: 'P210',            text: 'Keep away from heat and ignition sources' },
        { code: 'P220',            text: 'Keep away from combustible materials' },
        { code: 'P260',            text: 'Do not breathe dust or fumes' },
        { code: 'P273',            text: 'Avoid release to the environment' },
        { code: 'P280',            text: 'Wear protective gloves and eye protection' },
        { code: 'P301+P312',       text: 'If swallowed, call a doctor' },
        { code: 'P305+P351+P338', text: 'If in eyes, rinse cautiously with water' },
      ],
      firstAid: {
        skin:       'Wash with soap and water for ≥15 min. Seek medical advice if irritation persists.',
        eyes:       'Flush with running water for ≥15 min. Seek immediate medical attention.',
        ingestion:  'Do NOT induce vomiting. Call Poison Control: 1800-11-6117.',
        inhalation: 'Move to fresh air. Seek medical attention if symptoms persist.',
      },
      directions: [
        'Dilute 2–3% in water before use',
        'Apply at 50–70 °C by spray or immersion',
        'Allow 3–5 min contact time',
        'Rinse thoroughly with clean water',
      ],
      storage:  ['Store at 5°C – 35°C', 'Keep away from sunlight and heat', 'Keep away from combustibles', 'Dispose per local regulations (CPCB)'],
      products: ['UNIKLEAN FE', 'UNI-IRON PHOSPHATE', 'UNIPASS - FE CHROME', 'UNIPASS - FE NON CHROME'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // UNIPROTECT OIL
  // ─────────────────────────────────────────────────────────────────────────────
  {
    productKey: 'uniprotect-oil',
    docType:    'tds',
    docNumber:  'TDS-UPO-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'TDS-UPO-001 Rev 01 · Apr 2026',
      center: 'This Technical Data Sheet is for guidance only. © Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nPage 1 of 1',
    },
    body: {
      grade:       'Industrial Grade',
      description: 'UNIPROTECT OIL is a water-displacing rust preventive oil formulated for temporary corrosion protection of ferrous metal components. Applied by dip, spray, or brush, it deposits a thin protective film that displaces moisture and prevents flash rust during in-process handling, storage, and inter-stage transit.',
      sections: {
        features: [
          { head: 'Water Displacing',       body: 'Displaces moisture from metal surfaces, providing immediate corrosion protection' },
          { head: 'Thin Film Protection',   body: 'Deposits a thin, transparent protective film without masking surface defects' },
          { head: 'Multi-metal Safe',       body: 'Suitable for ferrous, non-ferrous, and aluminium substrates' },
          { head: 'Easy Removal',           body: 'Degreaser-removable before further processing or final finishing' },
        ],
        physicalProperties: [
          { property: 'Appearance',          value: 'Clear amber liquid', unit: '—',    method: 'Visual' },
          { property: 'Flash Point',         value: '>60',                unit: '°C',   method: 'ASTM D93' },
          { property: 'Density',             value: '0.82 – 0.86',        unit: 'g/mL', method: 'ISO 2811' },
          { property: 'Viscosity (40°C)',    value: '8 – 15',             unit: 'cSt',  method: 'ASTM D445' },
          { property: 'Film Thickness',      value: '3 – 8',              unit: 'μm',   method: 'After dip + drain' },
          { property: 'Water Displacement',  value: '>99%',               unit: '—',    method: 'Internal' },
        ],
        composition: [
          { name: 'Paraffinic base oil',          function: 'Primary carrier and film former',        percent: '60–70%',  compat: 'All metals' },
          { name: 'Petroleum sulfonate additive', function: 'Corrosion inhibitor and water displacer', percent: '10–20%',  compat: 'Ferrous, non-ferrous' },
          { name: 'Corrosion inhibitor blend',    function: 'Enhanced protection system',              percent: '5–10%',   compat: 'All metals' },
          { name: 'Diluent / carrier',            function: 'Viscosity control',                       percent: 'Balance', compat: '—' },
        ],
        application: [
          { step: '1', name: 'Pre-clean surface',  param: 'Remove all machining oils, dirt, moisture', value: 'Clean, dry surface required' },
          { step: '2', name: 'Apply UNIPROTECT OIL', param: 'Dip, spray or brush',                  value: 'Uniform coverage, 15–30 s dip or spray' },
          { step: '3', name: 'Drain',               param: 'Vertical draining',                     value: '15–30 min' },
          { step: '4', name: 'Allow film to set',   param: 'Air dry',                               value: '15–30 min at ambient' },
          { step: '5', name: 'Remove before use',   param: 'Alkaline degreaser',                    value: 'Wash off before further processing' },
        ],
        packaging: [
          { size: '20', unit: 'L', type: 'HDPE jerrycan' },
          { size: '200', unit: 'L', type: 'HDPE barrel / drum' },
        ],
        performance: [
          { label: 'Humidity cabinet',     val: '>500 h (IS 11864 / ASTM D1748)' },
          { label: 'Salt spray (uncoated)', val: '>72 h (ASTM B117)' },
          { label: 'Water displacement',   val: '>99%' },
          { label: 'Film thickness',       val: '3–8 μm (dip application)' },
        ],
        safetyNote: 'Flammable liquid — keep away from ignition sources. Refer to the current SDS (SDS-UPO-001) for full hazard information.',
      },
    },
  },

  {
    productKey: 'uniprotect-oil',
    docType:    'msds',
    docNumber:  'SDS-UPO-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'SDS-UPO-001 Rev 01 · Apr 2026',
      center: 'This Safety Data Sheet is provided in good faith based on current knowledge. © Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nGHS Rev 9 Compliant · Page 1 of 1',
    },
    body: {
      signalWord: 'Warning',
      sections: {
        identification: {
          productType:  'Petroleum-based rust preventive oil',
          intendedUse:  'Temporary corrosion protection of metal components during storage and transit',
          manufacturer: 'Macro Coats Pvt Ltd, Chennai, Tamil Nadu, India',
          emergency:    'AIIMS Poison Control: 1800-11-6117 (Toll-Free)',
        },
        hazards: {
          pictograms:      ['flammable', 'health', 'environment'],
          classifications: [
            { class: 'Flammable Liquid',         category: 'Cat 3', tagType: 'warn' },
            { class: 'Aspiration Hazard',        category: 'Cat 1', tagType: 'danger' },
            { class: 'Skin Irritation',          category: 'Cat 2', tagType: 'warn' },
            { class: 'Aquatic Toxicity (Chronic)', category: 'Cat 3', tagType: 'warn' },
          ],
          hStatements: 'H226 — Flammable liquid and vapour. H304 — May be fatal if swallowed and enters airways. H315 — Causes skin irritation. H412 — Harmful to aquatic life with long lasting effects.',
          pStatements: 'P210 · P261 · P273 · P280 · P301+P310 · P302+P352 · P331',
        },
        composition: {
          ingredients: [
            { name: 'Petroleum distillate base', description: 'Carrier and film former — primary protective barrier', percent: '60–75%', ghsClass: 'Aspiration Hazard', tagType: 'danger' },
            { name: 'Anionic corrosion inhibitor', description: 'Corrosion inhibitor — prevents oxidation on metal surfaces', percent: '10–20%', ghsClass: 'Irritant', tagType: 'warn' },
            { name: 'Protective additive blend',   description: 'Functional additives for enhanced surface protection', percent: '5–10%',  ghsClass: 'None',  tagType: 'safe' },
          ],
          note: 'Exact formulation is proprietary. Functional ingredient descriptions are provided for safety and emergency purposes only.',
        },
        firstAid: {
          eyes:       'Flush with water for ≥15 min. Seek medical attention.',
          skin:       'Wash with soap and water. Remove contaminated clothing.',
          inhalation: 'Move to fresh air. Seek medical attention if symptoms persist.',
          ingestion:  'Do NOT induce vomiting — aspiration risk. Seek immediate medical attention.',
          warning:    '⚠ Do NOT induce vomiting — risk of aspiration pneumonia.',
        },
        fireFighting: {
          flammability:       'Flammable liquid — flash point >60 °C',
          extinguishingMedia: 'CO₂, dry powder, foam. Do NOT use water jet on burning liquid.',
          fireHazard:         'Decomposition may release toxic fumes.',
          ppe:                'SCBA and full fire-resistant protective clothing.',
        },
        accidentalRelease: [
          'Eliminate ignition sources immediately',
          'Contain spill with sand or absorbent material',
          'Prevent entry into drains and waterways',
          'Dispose as per CPCB Hazardous Waste Management Rules',
        ],
        handling: {
          handling:     'Keep away from heat, sparks, open flames, and ignition sources.',
          storageTemp:  '5 °C – 40 °C; cool, dry, well-ventilated area',
          containers:   'Sealed HDPE or steel containers; keep tightly closed',
          segregation:  'Store away from oxidising agents and strong acids',
          shelfLife:    '24 months from manufacture in sealed containers',
        },
        exposure: {
          ppeItems:    ['Safety Glasses', 'Chemical-resist. Gloves', 'Apron', 'Closed-toe Shoes'],
          engineering: 'Good general ventilation. Avoid mist generation.',
        },
        physical: [
          { key: 'Appearance',    val: 'Clear amber liquid' },
          { key: 'Odour',         val: 'Petroleum characteristic' },
          { key: 'Flash Point',   val: '>60 °C (ASTM D93)' },
          { key: 'Density',       val: '0.82 – 0.86 g/mL' },
          { key: 'Viscosity',     val: '8–15 cSt at 40 °C' },
          { key: 'Solubility',    val: 'Insoluble in water' },
        ],
        stability: {
          stability:      'Stable under normal storage conditions.',
          avoid:          'Strong oxidising agents, excessive heat, open flame',
          decomposition:  'Combustion may produce CO, CO₂, and hydrocarbon fragments.',
          polymerisation: 'Will not occur',
        },
        sections11to16: {
          'Skin / Eye': 'Mild skin irritant. Prolonged/repeated contact may cause dermatitis.',
          Aquatic:      'H412 — harmful to aquatic life with long lasting effects.',
          Disposal:     'Dispose as petroleum waste per CPCB Hazardous Waste Management Rules.',
          Regulatory:   'MSIHC Rules 1989 · Factories Act 1948 · HWM Rules 2016 · GHS Rev 9',
          'Other Info': 'SDS Rev 01 issued Apr 2026.',
        },
      },
    },
  },

  {
    productKey: 'uniprotect-oil',
    docType:    'formula',
    docNumber:  'FRM-UPO-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'FRM-UPO-001 Rev 01 · Apr 2026',
      center: 'CONFIDENTIAL — This formulation sheet is the proprietary information of Macro Coats Pvt Ltd. Unauthorised reproduction or disclosure is prohibited.',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nPage 1 of 1',
    },
    body: {
      classification:     'CONFIDENTIAL — Internal Use Only',
      batchSize:          '100 L (reference)',
      formulaType:        'liquid',
      referenceBatchSize: 100,
      batchUnit:          'L',
      totalActivePercent: 98,
      overview: 'UNIPROTECT OIL is a petroleum-based, water-displacing rust preventive oil formulated for temporary corrosion protection of ferrous metal components. It deposits a thin, transparent film that displaces moisture and prevents flash rust during in-process handling, storage, and inter-stage transit.',
      composition: [
        { srNo: 1, name: 'Paraffinic Base Oil (100N)',          casNo: '8042-47-5',  baseQty: 65.0, unit: 'L',  percentWV: 65.0, function: 'Primary carrier and film-forming base',                                           density: 0.86, unitPrice: 65  },
        { srNo: 2, name: 'Petroleum Sulfonate (Sodium Salt)',   casNo: '68608-26-4', baseQty: 18.0, unit: 'L',  percentWV: 18.0, function: 'Primary corrosion inhibitor and water displacer — forms protective film on metal',  density: 0.95, unitPrice: 120 },
        { srNo: 3, name: 'Corrosion Inhibitor Blend',           casNo: 'Mixture',    baseQty: 8.0,  unit: 'L',  percentWV: 8.0,  function: 'Enhanced protection system — secondary rust inhibitor',                            density: 0.98, unitPrice: 185 },
        { srNo: 4, name: 'Diluent / Carrier (Mineral Spirits)', casNo: '64741-65-7', baseQty: 7.0,  unit: 'L',  percentWV: 7.0,  function: 'Viscosity control and application aid',                                            density: 0.78, unitPrice: 55  },
        { srNo: 5, name: 'Antioxidant (DBPC)',                  casNo: '128-37-0',   baseQty: 0.5,  unit: 'kg', percentWV: 0.5,  function: 'Oxidation inhibitor — extends product shelf life',                                 density: 1.05, unitPrice: 480 },
        { srNo: 6, name: 'VCI Additive',                        casNo: '109-02-4',   baseQty: 1.5,  unit: 'L',  percentWV: 1.5,  function: 'Vapour corrosion inhibitor — supplementary vapour-phase protection',                density: 0.98, unitPrice: 320 },
      ],
      preparation: [
        { step: 1, title: 'Safety Setup',            detail: 'Ensure adequate ventilation. Wear nitrile gloves, safety goggles, and heat-resistant apron. Keep fire extinguisher accessible (Class B — petroleum fires).' },
        { step: 2, title: 'Heat Base Oil',           detail: 'Add 65 L of Paraffinic Base Oil (100N) to a stainless steel mixing vessel. Heat to 55–65 °C with gentle stirring.' },
        { step: 3, title: 'Add Sulfonates',          detail: 'Reduce temperature to 50 °C. Slowly add 18 L of Petroleum Sulfonate with continuous stirring. Mix for 15 minutes.' },
        { step: 4, title: 'Add Corrosion Inhibitor', detail: 'Add 8 L of the corrosion inhibitor blend and stir for 10 minutes at 50 °C until fully dispersed.' },
        { step: 5, title: 'Add Antioxidant & VCI',  detail: 'Add 0.5 kg DBPC antioxidant and 1.5 L VCI additive. Mix at 45 °C for 10 minutes.' },
        { step: 6, title: 'Add Diluent',             detail: 'Allow batch to cool to 40 °C. Add 7 L of diluent/mineral spirits and stir for 5 minutes.' },
        { step: 7, title: 'QC Check & Fill',         detail: 'Verify appearance (clear amber), viscosity (8–15 cSt at 40 °C per ASTM D445), and flash point (>60 °C per ASTM D93). Fill into labelled containers.' },
      ],
      operatingConditions: [
        { param: 'Application Method',      value: 'Dip, spray, or brush' },
        { param: 'Application Temperature', value: '20 – 40 °C (ambient, no heating required)' },
        { param: 'Film Thickness',          value: '3 – 8 µm (after dip + drain)' },
        { param: 'Protection Period',       value: '3 – 12 months (indoor / covered storage)' },
        { param: 'Substrate',               value: 'Mild steel, cast iron, alloy steel, non-ferrous metals' },
      ],
      applications: {
        removes:    ['Surface moisture', 'Atmospheric oxygen exposure', 'Flash rust risk', 'Residual machining fluid films'],
        usedBefore: ['Inter-process transit', 'Short-to-medium-term storage', 'Pre-painting holding stage', 'Finished component preservation'],
      },
    },
  },

  {
    productKey: 'uniprotect-oil',
    docType:    'label',
    docNumber:  'LBL-UPO-001',
    revision:   'Rev 01 — Apr 2026',
    footer: { left: '', center: '', right: '' },
    body: {
      signalWord: 'WARNING',
      unNo: 'UN 1270',
      hCodes: [
        { code: 'H226', text: 'Flammable liquid and vapour' },
        { code: 'H304', text: 'May be fatal if swallowed and enters airways' },
        { code: 'H315', text: 'Causes skin irritation' },
        { code: 'H336', text: 'May cause drowsiness or dizziness' },
        { code: 'H412', text: 'Harmful to aquatic life with long lasting effects' },
      ],
      pCodes: [
        { code: 'P210',      text: 'Keep away from heat and ignition sources' },
        { code: 'P261',      text: 'Avoid breathing vapours or spray' },
        { code: 'P273',      text: 'Avoid release to the environment' },
        { code: 'P280',      text: 'Wear protective gloves and eye protection' },
        { code: 'P301+P310', text: 'If swallowed, immediately call a doctor' },
        { code: 'P302+P352', text: 'If on skin, wash with soap and water' },
        { code: 'P331',      text: 'Do NOT induce vomiting' },
      ],
      firstAid: {
        skin:       'Wash with soap and water. Remove contaminated clothing.',
        eyes:       'Flush with water for ≥15 min. Seek medical attention.',
        ingestion:  'Do NOT induce vomiting. Seek immediate medical attention.',
        inhalation: 'Move to fresh air. Seek medical attention if symptoms persist.',
      },
      directions: [
        'Apply by dip, spray, or brush',
        'Allow protective film to dry 15–30 min',
        'Do not apply to hot surfaces (>60 °C)',
        'Remove with degreaser before use',
      ],
      storage:  ['Store at 5°C – 40°C', 'Keep away from heat and ignition', 'Keep container tightly closed', 'Dispose per CPCB regulations'],
      products: ['UNIPROTECT OIL', 'UNIPROTECT PLUS', 'UNIRUST GUARD', 'UNIPROTECT CLEAR'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // UNIFLOW ECM
  // ─────────────────────────────────────────────────────────────────────────────
  {
    productKey: 'uniflow-ecm',
    docType:    'tds',
    docNumber:  'TDS-UEF-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'TDS-UEF-001 Rev 01 · Apr 2026',
      center: 'This Technical Data Sheet is for guidance only. © Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nPage 1 of 1',
    },
    body: {
      grade:       'Industrial Grade',
      description: 'UNIFLOW ECM is a petroleum sulfonate-based corrosion preventive oil designed for long-term indoor storage protection of ferrous and non-ferrous components.',
      sections: {
        features: [
          { head: 'Long-term Protection', body: 'Provides extended corrosion protection for storage periods up to 12 months indoors' },
          { head: 'Petroleum Sulfonate',  body: 'Contains petroleum sulfonate corrosion inhibitors for superior protection performance' },
          { head: 'Thin Dry Film',        body: 'Deposits a thin, non-sticky film that does not attract dust or contamination' },
          { head: 'Easy Removal',         body: 'Degreaser-removable before further processing' },
        ],
        physicalProperties: [
          { property: 'Appearance',        value: 'Amber to dark amber liquid', unit: '—',    method: 'Visual' },
          { property: 'Flash Point',       value: '>65',                        unit: '°C',   method: 'ASTM D93' },
          { property: 'Density',           value: '0.85 – 0.92',                unit: 'g/mL', method: 'ISO 2811' },
          { property: 'Viscosity (40°C)',  value: '15 – 30',                    unit: 'cSt',  method: 'ASTM D445' },
          { property: 'Protection Period', value: 'Up to 12 months',            unit: '—',    method: 'Indoor storage' },
        ],
        composition: [
          { name: 'Paraffinic base oil',          function: 'Primary carrier',                       percent: '50–65%',  compat: 'All metals' },
          { name: 'Petroleum sulfonate',           function: 'Primary corrosion inhibitor',            percent: '15–25%',  compat: 'Ferrous, non-ferrous' },
          { name: 'Calcium sulfonate additive',    function: 'Enhanced long-term protection',          percent: '5–10%',   compat: 'All metals' },
          { name: 'Diluent',                       function: 'Viscosity and film control',             percent: 'Balance', compat: '—' },
        ],
        application: [
          { step: '1', name: 'Surface preparation', param: 'Clean, dry, rust-free surface',     value: 'Essential for best performance' },
          { step: '2', name: 'Apply UNIFLOW ECM',   param: 'Dip, spray or brush application',  value: 'Ensure uniform coverage' },
          { step: '3', name: 'Drain',               param: 'Vertical draining',                value: '15–25 min' },
          { step: '4', name: 'Film formation',      param: 'Air dry',                          value: '20–30 min' },
          { step: '5', name: 'Pack / Store',        param: 'Wrap or bag after film sets',      value: 'Enhanced protection when wrapped' },
        ],
        packaging: [
          { size: '20',  unit: 'L', type: 'HDPE jerrycan' },
          { size: '200', unit: 'L', type: 'HDPE barrel / drum' },
        ],
        performance: [
          { label: 'Humidity cabinet',       val: '>720 h (ASTM D1748)' },
          { label: 'Salt spray (uncoated)',   val: '>96 h (ASTM B117)' },
          { label: 'Indoor storage',         val: 'Up to 12 months' },
        ],
        safetyNote: 'Flammable liquid. Refer to SDS-UEF-001 for full hazard information and PPE requirements.',
      },
    },
  },

  {
    productKey: 'uniflow-ecm',
    docType:    'msds',
    docNumber:  'SDS-UEF-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'SDS-UEF-001 Rev 01 · Apr 2026',
      center: 'This Safety Data Sheet is provided in good faith based on current knowledge. © Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nGHS Rev 9 Compliant · Page 1 of 1',
    },
    body: {
      signalWord: 'Warning',
      sections: {
        identification: {
          productType:  'Petroleum-based corrosion preventive oil',
          intendedUse:  'Temporary corrosion protection of metal components during storage and transit',
          manufacturer: 'Macro Coats Pvt Ltd, Chennai, Tamil Nadu, India',
          emergency:    'AIIMS Poison Control: 1800-11-6117 (Toll-Free)',
        },
        hazards: {
          pictograms:      ['flammable', 'health', 'environment'],
          classifications: [
            { class: 'Flammable Liquid',           category: 'Cat 3', tagType: 'warn'   },
            { class: 'Aspiration Hazard',          category: 'Cat 1', tagType: 'danger' },
            { class: 'Skin Irritation',            category: 'Cat 2', tagType: 'warn'   },
            { class: 'Aquatic Toxicity (Chronic)', category: 'Cat 3', tagType: 'warn'   },
          ],
          hStatements: 'H226 — Flammable liquid and vapour. H304 — May be fatal if swallowed and enters airways. H315 — Causes skin irritation. H412 — Harmful to aquatic life with long lasting effects.',
          pStatements: 'P210 · P260 · P273 · P280 · P301+P310 · P302+P352 · P331',
        },
        composition: {
          ingredients: [
            { name: 'Hydrocarbon base oil',          description: 'Carrier and film-forming base — primary corrosion barrier', percent: '70–85%', ghsClass: 'Aspiration Hazard', tagType: 'danger' },
            { name: 'Corrosion inhibitor blend',     description: 'ECM-compatible inhibitor package for ferrous and non-ferrous metals', percent: '10–20%', ghsClass: 'Irritant', tagType: 'warn' },
            { name: 'Aliphatic hydrocarbon solvent', description: 'Viscosity modifier and carrier for inhibitor package', percent: '<5%', ghsClass: 'Flammable', tagType: 'warn' },
          ],
          note: 'Exact formulation is proprietary. Functional ingredient descriptions are provided for safety and emergency purposes only.',
        },
        firstAid: {
          skin:       'Wash with soap and water. Remove contaminated clothing. Seek advice if irritation persists.',
          eyes:       'Flush with water for ≥15 min. Seek medical attention.',
          ingestion:  'Do NOT induce vomiting — aspiration risk. Seek immediate medical attention.',
          inhalation: 'Move to fresh air. Seek medical attention if symptoms persist.',
          warning:    '⚠ Do NOT induce vomiting — risk of aspiration pneumonia.',
        },
        fireFighting: {
          flammability:       'Flammable liquid — flash point >60 °C.',
          extinguishingMedia: 'CO₂, dry powder, foam. Do NOT use water jet on burning liquid.',
          fireHazard:         'Thermal decomposition may release toxic hydrocarbon fumes.',
          ppe:                'SCBA and full fire-resistant protective clothing.',
        },
        accidentalRelease: [
          'Eliminate all ignition sources immediately',
          'Contain spill with sand or inert absorbent material',
          'Prevent entry into drains and waterways — harmful to aquatic organisms',
          'Collect contaminated material into sealed HDPE containers for disposal',
          'Dispose as per CPCB Hazardous Waste Management Rules 2016',
        ],
        handling: {
          handling:     'Keep away from heat, sparks, open flames, and all ignition sources. Handle in well-ventilated areas.',
          storageTemp:  '5 °C – 40 °C; cool, dry, well-ventilated area; away from heat sources',
          containers:   'Sealed HDPE or steel containers; keep tightly closed when not in use',
          segregation:  'Store separately from oxidising agents, strong acids, and strong alkalis',
          shelfLife:    '24 months from date of manufacture in original sealed containers',
        },
        exposure: {
          ppeItems:    ['Safety Glasses', 'Chemical-resist. Gloves', 'Apron', 'Closed-toe Shoes'],
          engineering: 'Good general ventilation. Avoid generation of mist or aerosol. Eyewash station within 10 s.',
        },
        physical: [
          { key: 'Appearance',    val: 'Clear amber liquid' },
          { key: 'Odour',         val: 'Petroleum characteristic' },
          { key: 'Flash Point',   val: '>60 °C (ASTM D93)' },
          { key: 'Density',       val: '0.83 – 0.87 g/mL' },
          { key: 'Viscosity',     val: '10–18 cSt at 40 °C' },
          { key: 'Solubility',    val: 'Insoluble in water' },
          { key: 'Boiling Point', val: '>150 °C' },
          { key: 'Vapour Pres.',  val: 'Low at ambient temperature' },
        ],
        stability: {
          stability:      'Stable under recommended storage conditions.',
          avoid:          'Strong oxidising agents, excessive heat, open flame, ignition sources',
          decomposition:  'Combustion may produce CO, CO₂, and hydrocarbon fragments.',
          polymerisation: 'Will not occur',
        },
        sections11to16: {
          'Skin / Eye': 'Petroleum-based oil may cause mild skin and eye irritation on prolonged exposure. Flush with water immediately.',
          Aquatic:      'H412 — harmful to aquatic life with long lasting effects. Do not discharge to drains, waterways, or soil.',
          Disposal:     'Recover and recycle where possible. Dispose via licensed waste contractor per CPCB/SPCB norms (E.P. Act 1986).',
          Regulatory:   'MSIHC Rules 1989 · Factories Act 1948 · Hazardous Waste Rules 2016 · GHS Rev 9',
          'Other Info': 'SDS Rev 01 issued Apr 2026. Next review: Apr 2028 or upon formulation change.',
        },
      },
    },
  },

  {
    productKey: 'uniflow-ecm',
    docType:    'label',
    docNumber:  'LBL-UEF-001',
    revision:   'Rev 01 — Apr 2026',
    footer: { left: '', center: '', right: '' },
    body: {
      signalWord: 'WARNING',
      unNo: 'UN 1270',
      hCodes: [
        { code: 'H226', text: 'Flammable liquid and vapour' },
        { code: 'H304', text: 'May be fatal if swallowed and enters airways' },
        { code: 'H315', text: 'Causes skin irritation' },
        { code: 'H336', text: 'May cause drowsiness or dizziness' },
        { code: 'H412', text: 'Harmful to aquatic life with long lasting effects' },
      ],
      pCodes: [
        { code: 'P210',      text: 'Keep away from heat and ignition sources' },
        { code: 'P260',      text: 'Do not breathe vapours or spray mist' },
        { code: 'P273',      text: 'Avoid release to the environment' },
        { code: 'P280',      text: 'Wear protective gloves and eye protection' },
        { code: 'P301+P310', text: 'If swallowed, immediately call a doctor' },
        { code: 'P302+P352', text: 'If on skin, wash with soap and water' },
        { code: 'P331',      text: 'Do NOT induce vomiting' },
      ],
      firstAid: {
        skin:       'Wash with soap and water. Seek advice if irritation persists.',
        eyes:       'Flush with water for ≥15 min. Seek medical attention.',
        ingestion:  'Do NOT induce vomiting. Seek immediate medical attention.',
        inhalation: 'Move to fresh air. Seek medical attention if symptoms persist.',
      },
      directions: [
        'Apply by dip, spray, or brush',
        'Allow protective film to dry 15–25 min',
        'Ensure clean, dry surface before application',
        'Remove with degreaser before use',
      ],
      storage:  ['Store at 5°C – 40°C', 'Keep away from heat and flame', 'Keep container tightly sealed', 'Dispose per CPCB regulations'],
      products: ['UNIFLOW ECM', 'UNIFLOW PLUS', 'UNIFLOW CLEAR'],
    },
  },

  {
    productKey: 'uniflow-ecm',
    docType:    'formula',
    docNumber:  'FRM-UEF-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'FRM-UEF-001 Rev 01 · Apr 2026',
      center: 'CONFIDENTIAL — This formulation sheet is the proprietary information of Macro Coats Pvt Ltd. Unauthorised reproduction or disclosure is prohibited.',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nPage 1 of 1',
    },
    body: {
      classification:     'CONFIDENTIAL — Internal Use Only',
      batchSize:          '100 L (reference)',
      formulaType:        'liquid',
      referenceBatchSize: 100,
      batchUnit:          'L',
      totalActivePercent: 98,
      overview: 'UNIFLOW ECM is a petroleum-sulphonate based corrosion preventive oil formulated for long-term protection of ferrous components during storage and transit. The product deposits a thin, tenacious film that displaces moisture and provides a physical barrier against atmospheric corrosion. Effective at ambient temperature by dip or spray application; no heating required.',
      composition: [
        { srNo: 1, name: 'Paraffinic Base Oil (100N)',         casNo: '8042-47-5',  baseQty: 70.0, unit: 'L', percentWV: 70.0, function: 'Carrier oil — provides film-forming base and lubrication',                       density: 0.87,  unitPrice: 65  },
        { srNo: 2, name: 'Petroleum Sulfonate (Sodium Salt)',  casNo: '68608-26-4', baseQty: 15.0, unit: 'L', percentWV: 15.0, function: 'Primary corrosion inhibitor — forms protective film on metal surface',            density: 0.95,  unitPrice: 120 },
        { srNo: 3, name: 'Calcium Sulfonate (Overbased)',      casNo: '61789-86-4', baseQty: 8.0,  unit: 'L', percentWV: 8.0,  function: 'Secondary rust inhibitor — neutralises acidic corrosion products',               density: 1.02,  unitPrice: 185 },
        { srNo: 4, name: 'Microcrystalline Wax',               casNo: '63231-60-7', baseQty: 4.0,  unit: 'Kg', percentWV: 4.0, function: 'Film former — thickens oil film and improves adhesion to substrate',             density: 0.92,  unitPrice: 95  },
        { srNo: 5, name: 'Antioxidant (DBPC)',                 casNo: '128-37-0',   baseQty: 0.5,  unit: 'Kg', percentWV: 0.5, function: 'Oxidation inhibitor — extends product shelf life and prevents sludge formation', density: 1.05,  unitPrice: 480 },
        { srNo: 6, name: 'Rust Inhibitor Additive (VCI)',      casNo: '109-02-4',   baseQty: 2.5,  unit: 'L', percentWV: 2.5,  function: 'Vapour corrosion inhibitor — supplementary vapour-phase protection',             density: 0.98,  unitPrice: 320 },
      ],
      preparation: [
        { step: 1, title: 'Safety Setup',            detail: 'Ensure adequate ventilation. Wear nitrile gloves, safety goggles, and heat-resistant apron. Keep fire extinguisher accessible (Class B).' },
        { step: 2, title: 'Heat Base Oil',           detail: 'Add 70 L of Paraffinic Base Oil (100N) to a stainless steel or mild steel mixing vessel. Heat to 60–70 °C with gentle stirring.' },
        { step: 3, title: 'Melt and Blend Wax',     detail: 'Add 4 Kg of Microcrystalline Wax to the heated oil. Continue stirring at 65 °C until the wax is fully dissolved and the blend is homogeneous.' },
        { step: 4, title: 'Add Sulfonates',          detail: 'Reduce temperature to 55 °C. Slowly add 15 L of Petroleum Sulfonate followed by 8 L of Calcium Sulfonate. Stir for 15 minutes after each addition.' },
        { step: 5, title: 'Add Antioxidant & VCI',  detail: 'Add 0.5 Kg DBPC antioxidant and 2.5 L VCI additive. Mix at 50 °C for 10 minutes until fully dispersed.' },
        { step: 6, title: 'Cool and Filter',         detail: 'Allow batch to cool to 40 °C with slow stirring. Pass through a 25-micron filter into the filling vessel.' },
        { step: 7, title: 'QC Check & Fill',         detail: 'Verify appearance (clear amber), kinematic viscosity (20–40 cSt at 40 °C), and flash point (≥160 °C). Fill into labelled containers.' },
      ],
      operatingConditions: [
        { param: 'Application Method',      value: 'Dip, brush, or spray' },
        { param: 'Application Temperature', value: '25 – 40 °C (no heating required)' },
        { param: 'Film Thickness',          value: '5 – 15 µm (dry)' },
        { param: 'Protection Period',       value: '6 – 24 months (indoor storage)' },
        { param: 'Substrate',               value: 'Mild steel, cast iron, alloy steel' },
      ],
      applications: {
        removes:    ['Moisture', 'Atmospheric oxygen', 'Acidic corrosion products', 'Chloride contaminants'],
        usedBefore: ['Long-term storage', 'Inter-process transit', 'Export packaging', 'Machined component preservation'],
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // UNICool AL
  // ─────────────────────────────────────────────────────────────────────────────
  {
    productKey: 'unicool-al',
    docType:    'tds',
    docNumber:  'TDS-UCL-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'TDS-UCL-001 Rev 01 · Apr 2026',
      center: 'This Technical Data Sheet is for guidance only. © Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nPage 1 of 1',
    },
    body: {
      grade:       'Industrial / Precision Grade',
      description: 'UNICool AL is a fast-drying, alcohol-based precision cleaning fluid for aluminium, copper, PCBs, and electronic assemblies. It evaporates without residue, leaving no film or contamination.',
      sections: {
        features: [
          { head: 'Residue-Free Evaporation', body: 'Evaporates completely without leaving residue or film on cleaned surfaces' },
          { head: 'Fast Drying',              body: 'Air-dry time 30–90 seconds at ambient temperature — no rinse required' },
          { head: 'Electronics Safe',         body: 'Safe for use on PCBs, connectors, and electronic assemblies at recommended application' },
          { head: 'Multi-substrate',          body: 'Compatible with aluminium, copper, stainless steel, and most engineering plastics' },
        ],
        physicalProperties: [
          { property: 'Appearance',           value: 'Clear, colourless liquid',     unit: '—',   method: 'Visual' },
          { property: 'Odour',                value: 'Characteristic alcohol',        unit: '—',   method: '—' },
          { property: 'Flash Point',          value: '12 – 18',                       unit: '°C',  method: 'ASTM D56' },
          { property: 'Density',              value: '0.78 – 0.82',                   unit: 'g/mL', method: 'ISO 2811' },
          { property: 'Evaporation Rate',     value: 'Fast',                          unit: '—',   method: 'vs diethyl ether = 1' },
          { property: 'Dry Time',             value: '30 – 90',                       unit: 's',   method: 'Ambient, cotton wipe' },
          { property: 'Residue on Evaporation', value: 'None (≤0.001%)',              unit: '—',   method: 'ASTM D1353' },
        ],
        composition: [
          { name: 'Alcohol blend',    function: 'Cleaning solvent and carrier',          percent: '90–98%',  compat: 'Metals, PCBs, plastics' },
          { name: 'Corrosion inhibitor',    function: 'Prevents staining on aluminium, copper', percent: '<2%',     compat: 'Non-ferrous metals' },
          { name: 'Deionised water',        function: 'Carrier adjustment',                    percent: '1–5%',    compat: 'All substrates' },
        ],
        application: [
          { step: '1', name: 'Apply UNICool AL', param: 'Spray or wipe with lint-free cloth',  value: 'Ambient temperature' },
          { step: '2', name: 'Wipe / Agitate',   param: 'Wipe with lint-free cloth if needed', value: 'Light pressure' },
          { step: '3', name: 'Air dry',           param: 'No rinsing required',                 value: '30–90 s at ambient' },
          { step: '4', name: 'Inspect',           param: 'Verify residue-free surface',          value: 'White cloth test' },
        ],
        packaging: [
          { size: '1',  unit: 'L',  type: 'HDPE trigger spray bottle' },
          { size: '5',  unit: 'L',  type: 'HDPE jerrycan' },
          { size: '20', unit: 'L',  type: 'HDPE jerrycan' },
        ],
        performance: [
          { label: 'Evaporation residue',     val: '≤0.001% (ASTM D1353)' },
          { label: 'Dry time',               val: '30–90 s (ambient)' },
          { label: 'Aluminium compatibility', val: 'No staining or etching at ambient' },
        ],
        safetyNote: 'Highly flammable — keep away from ignition sources. Ensure adequate ventilation during use. Refer to SDS-UCL-001.',
      },
    },
  },

  {
    productKey: 'unicool-al',
    docType:    'msds',
    docNumber:  'SDS-UCL-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'SDS-UCL-001 Rev 01 · Apr 2026',
      center: 'This Safety Data Sheet is provided in good faith based on current knowledge. © Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nGHS Rev 9 Compliant · Page 1 of 1',
    },
    body: {
      signalWord: 'Danger',
      sections: {
        identification: {
          productType:  'Alcohol-based precision cleaning and degreasing fluid',
          intendedUse:  'Fast-drying cleaning of aluminium, copper, PCBs, and electronic assemblies',
          manufacturer: 'Macro Coats Pvt Ltd, Chennai, Tamil Nadu, India',
          emergency:    'AIIMS Poison Control: 1800-11-6117 (Toll-Free)',
        },
        hazards: {
          pictograms:      ['flammable', 'irritant', 'environment'],
          classifications: [
            { class: 'Flammable Liquid',           category: 'Cat 2', tagType: 'danger' },
            { class: 'Eye Irritation',             category: 'Cat 2', tagType: 'warn'   },
            { class: 'Specific Target Organ',      category: 'Cat 3 (CNS)', tagType: 'warn' },
            { class: 'Aquatic Toxicity (Chronic)', category: 'Cat 3', tagType: 'warn'   },
          ],
          hStatements: 'H225 — Highly flammable liquid and vapour. H319 — Causes serious eye irritation. H336 — May cause drowsiness or dizziness. H412.',
          pStatements: 'P210 · P233 · P261 · P273 · P280 · P305+P351+P338 · P370+P378',
        },
        composition: {
          ingredients: [
            { name: 'Water',               description: 'Carrier / solvent — major component',                              percent: '>60%',   ghsClass: '—',        tagType: 'safe'   },
            { name: 'Alcohol solvent blend', description: 'Co-solvent system — enhances cleaning and accelerates drying',   percent: '10–20%', ghsClass: 'Flammable', tagType: 'warn'   },
            { name: 'Non-ionic surfactant', description: 'Wetting and emulsification aid',                                  percent: '<1%',    ghsClass: 'Irritant',  tagType: 'warn'   },
            { name: 'pH regulator',        description: 'Mild alkalinity buffer for enhanced cleaning performance',          percent: '<1%',    ghsClass: 'Irritant',  tagType: 'warn'   },
          ],
          note: 'Exact formulation is proprietary. Functional ingredient descriptions are provided for safety and emergency purposes only.',
        },
        firstAid: {
          skin:       'Wash with soap and water. Remove soaked clothing immediately. Seek advice if irritation persists.',
          eyes:       'Flush with running water for ≥15 min, holding eyelids open. Seek medical attention.',
          ingestion:  'Rinse mouth with water. Do NOT induce vomiting. Seek medical advice.',
          inhalation: 'Move to fresh air immediately. If symptoms persist, seek medical attention.',
          warning:    '⚠ Highly flammable — eliminate all ignition sources before use.',
        },
        fireFighting: {
          flammability:       'Flammable liquid and vapour. Flash point ~24 °C (alcohol component).',
          extinguishingMedia: 'CO₂, dry powder, alcohol-resistant foam.',
          fireHazard:         'Alcohol vapours may travel to ignition source and flashback.',
          ppe:                'SCBA and full fire-resistant clothing.',
        },
        accidentalRelease: [
          'Eliminate all ignition sources immediately — flammable vapour risk',
          'Ventilate area well to prevent vapour accumulation',
          'Contain spill with inert absorbent material (sand, vermiculite)',
          'Prevent runoff from entering drains or waterways',
          'Collect spilled material and dispose per CPCB/SPCB guidelines',
        ],
        handling: {
          handling:     'Keep away from open flames, sparks, and all ignition sources. Use only in well-ventilated areas.',
          storageTemp:  '5 °C – 35 °C; cool, dry, ventilated area; away from direct heat and sunlight',
          containers:   'HDPE trigger spray bottles or HDPE jerrycans; keep tightly sealed when not in use',
          segregation:  'Store separately from oxidising agents, strong acids, and strong alkalis',
          shelfLife:    '24 months from date of manufacture in original sealed containers',
        },
        exposure: {
          ppeItems:    ['Safety Glasses', 'Nitrile Gloves', 'Antistatic Footwear', 'Lab Coat'],
          engineering: 'Mechanical exhaust ventilation to prevent vapour build-up. Eyewash station within 10 s of handling area.',
        },
        physical: [
          { key: 'Appearance',    val: 'Clear, colourless liquid' },
          { key: 'Odour',         val: 'Mild alcohol characteristic' },
          { key: 'Flash Point',   val: '~24 °C (alcohol component)' },
          { key: 'Density',       val: '0.92 – 0.96 g/mL' },
          { key: 'pH',            val: '8.0 – 9.0' },
          { key: 'Solubility',    val: 'Fully miscible with water' },
          { key: 'Evaporation',   val: 'Fast (alcohol component)' },
          { key: 'Boiling Point', val: '~80 °C' },
        ],
        stability: {
          stability:      'Stable under recommended storage conditions.',
          avoid:          'Open flames, sparks, strong oxidising agents, strong acids',
          decomposition:  'Combustion may produce CO, CO₂, water vapour, and nitrogen oxides.',
          polymerisation: 'Will not occur',
        },
        sections11to16: {
          'Skin / Eye': 'Alcohol-based formulation is a skin and eye irritant. May cause dryness with repeated exposure. Flush with water immediately.',
          Aquatic:      'H412 — harmful to aquatic life with long lasting effects. Avoid discharge to drains or watercourses.',
          Disposal:     'Recover and recycle if possible. Dispose of residues via licensed waste contractor per CPCB/SPCB norms (E.P. Act 1986).',
          Regulatory:   'MSIHC Rules 1989 · Factories Act 1948 · Hazardous Waste Rules 2016 · GHS Rev 9',
          'Other Info': 'SDS Rev 01 issued Apr 2026. Next review: Apr 2028 or upon formulation change.',
        },
      },
    },
  },

  {
    productKey: 'unicool-al',
    docType:    'formula',
    docNumber:  'FRM-UCL-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'FRM-UCL-001 Rev 01 · Apr 2026',
      center: 'CONFIDENTIAL — This formulation sheet is the proprietary information of Macro Coats Pvt Ltd. Unauthorised reproduction or disclosure is prohibited.',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nPage 1 of 1',
    },
    body: {
      classification:     'CONFIDENTIAL — Internal Use Only',
      batchSize:          '100 L (reference)',
      formulaType:        'liquid',
      referenceBatchSize: 100,
      batchUnit:          'L',
      totalActivePercent: 95,
      overview: 'UNICool AL is a fast-drying isopropyl alcohol (IPA) based precision cleaner formulated for cooling and degreasing of metal and electronic components. It leaves no residue, evaporates rapidly, and is suitable for precision engineering, bearing cleaning, and post-machining surface preparation.',
      composition: [
        { srNo: 1, name: 'DM Water',                          casNo: '7732-18-5', baseQty: null, unit: 'L', percentWV: null, function: 'Solvent base — balance to final volume (de-mineralised)',                         density: 1.0,  unitPrice: 0   },
        { srNo: 2, name: 'Ethanol (Industrial Grade)',         casNo: '64-17-5',   baseQty: 10.0, unit: 'L', percentWV: 10.0, function: 'Co-solvent — enhances cleaning action and accelerates drying',                    density: 0.789, unitPrice: 55  },
        { srNo: 3, name: 'IPA (Isopropyl Alcohol)',            casNo: '67-63-0',   baseQty: 5.0,  unit: 'L', percentWV: 5.0,  function: 'Primary solvent — rapid evaporation, degreasing and surface preparation',        density: 0.786, unitPrice: 65  },
        { srNo: 4, name: 'LAE-9 (Lauryl Alcohol Ethoxylate)', casNo: '9002-92-0', baseQty: 0.01, unit: 'L', percentWV: 0.01, function: 'Nonionic surfactant — wetting and emulsification aid',                            density: 0.95,  unitPrice: 380 },
        { srNo: 5, name: 'Ammonium Hydroxide (25–30%)',        casNo: '1336-21-6', baseQty: 0.01, unit: 'L', percentWV: 0.01, function: 'pH regulator — mild alkalinity for enhanced cleaning and degreasing performance', density: 0.91,  unitPrice: 120 },
      ],
      preparation: [
        { step: 1, title: 'Safety Setup',              detail: 'Ensure working area is well-ventilated. Wear PPE: chemical goggles, nitrile gloves, and lab coat. Avoid contact with eyes and skin.' },
        { step: 2, title: 'Charge DM Water',           detail: 'Add approximately 80 L of de-mineralised (DM) water to the stainless steel or HDPE mixing vessel.' },
        { step: 3, title: 'Add Ethanol',               detail: 'Add 10 L of industrial-grade ethanol to the DM water and mix gently for 2 minutes.' },
        { step: 4, title: 'Add IPA',                   detail: 'Add 5 L of Isopropyl Alcohol (IPA) to the blend and continue mixing.' },
        { step: 5, title: 'Add Surfactant & pH Agent', detail: 'Pre-dilute LAE-9 (10 mL) and Ammonium Hydroxide (10 mL) separately in a small quantity of DM water, then blend into the main vessel with gentle agitation.' },
        { step: 6, title: 'Final Volume Adjustment',   detail: 'Top up with DM water to bring the final batch volume to exactly 100 L. Stir for 5 minutes to ensure homogeneity.' },
        { step: 7, title: 'QC Check & Fill',           detail: 'Check pH (target 7.5–9.0) and appearance (clear, colourless to very pale). Fill into labelled HDPE containers.' },
      ],
      operatingConditions: [
        { param: 'Application Method',    value: 'Spray, wipe or dip' },
        { param: 'Evaporation Rate',      value: 'Fast — <2 min at 25 °C' },
        { param: 'Operating Temperature', value: '15 – 40 °C' },
        { param: 'Contact Time',          value: '15 – 60 seconds' },
        { param: 'Substrate Compatibility', value: 'Metal, glass, PCB, plastic (non-sensitive)' },
      ],
      applications: {
        removes:    ['Machining oils', 'Cutting fluids', 'Flux residues', 'Fingerprints', 'Light greases'],
        usedBefore: ['Precision assembly', 'Bearing installation', 'Surface inspection', 'Adhesive bonding'],
      },
    },
  },

  {
    productKey: 'unicool-al',
    docType:    'label',
    docNumber:  'LBL-UCL-001',
    revision:   'Rev 01 — Apr 2026',
    footer: { left: '', center: '', right: '' },
    body: {
      signalWord: 'DANGER',
      unNo: 'UN 1170',
      hCodes: [
        { code: 'H225', text: 'Highly flammable liquid and vapour' },
        { code: 'H319', text: 'Causes serious eye irritation' },
        { code: 'H336', text: 'May cause drowsiness or dizziness' },
        { code: 'H412', text: 'Harmful to aquatic life with long lasting effects' },
      ],
      pCodes: [
        { code: 'P210',            text: 'Keep away from heat, sparks and open flame' },
        { code: 'P233',            text: 'Keep container tightly closed' },
        { code: 'P261',            text: 'Avoid breathing vapours or spray mist' },
        { code: 'P273',            text: 'Avoid release to the environment' },
        { code: 'P280',            text: 'Wear protective gloves and eye protection' },
        { code: 'P305+P351+P338', text: 'If in eyes, rinse cautiously with water' },
        { code: 'P370+P378',       text: 'In case of fire, use CO₂ or dry powder' },
      ],
      firstAid: {
        skin:       'Wash with soap and water. Remove soaked clothing immediately.',
        eyes:       'Flush with running water for ≥15 min. Seek medical attention.',
        ingestion:  'Rinse mouth with water. Seek medical advice.',
        inhalation: 'Move to fresh air. If symptoms persist, seek medical attention.',
      },
      directions: [
        'Spray or wipe with lint-free cloth',
        'Allow to air-dry 30–90 seconds',
        'No rinsing required',
        'Ensure adequate ventilation during use',
      ],
      storage:  ['Store at 5°C – 35°C', 'Keep away from ignition sources', 'Keep container sealed and upright', 'Dispose per local regulations'],
      products: ['UNICool AL', 'UNICool AL PLUS', 'UNICool IPA'],
    },
  },
  // ─────────────────────────────────────────────────────────────────────────────
  // CoA — UNIKLEAN-SP
  // ─────────────────────────────────────────────────────────────────────────────
  {
    productKey: 'uniklean-sp',
    docType:    'coa',
    docNumber:  'COA-USP-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'COA-USP-001 Rev 01 · Apr 2026',
      center: 'CONFIDENTIAL — For authorised recipients only · Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India',
    },
    body: {
      batchNumber:    'USP-20260426-001',
      batchSize:      '100 L',
      productionDate: '26 Apr 2026',
      expiryDate:     'Apr 2028',
      grade:          'Industrial Grade',
      appearance:     'Clear to pale yellow liquid',
      tests: [
        { parameter: 'Appearance',                 method: 'Visual',                 specification: 'Clear to pale yellow liquid',  result: 'Clear, pale yellow liquid', status: 'Pass' },
        { parameter: 'pH (1% solution, 25 °C)',    method: 'pH Electrode',            specification: '10.5 – 12.5',                 result: '11.2',                      status: 'Pass' },
        { parameter: 'Density (25 °C)',            method: 'ISO 2811',                specification: '1.03 – 1.08 g/mL',           result: '1.05 g/mL',                 status: 'Pass' },
        { parameter: 'Total Alkalinity',           method: 'HCl Titration',           specification: '≥ 8.0 % (as Na₂O)',          result: '9.2 %',                     status: 'Pass' },
        { parameter: 'Foam Level (spray, 55 °C)',  method: 'DIN 53902',               specification: '< 5 mL',                      result: '2 mL',                      status: 'Pass' },
        { parameter: 'Flash Rust Inhibition',      method: 'IS 5521 (2 h, 25 °C)',    specification: 'No flash rust',               result: 'No flash rust observed',    status: 'Pass' },
        { parameter: 'Oil Removal Efficiency',     method: 'Internal Method IM-001',  specification: '≥ 98 %',                      result: '99.3 %',                    status: 'Pass' },
      ],
      statement: 'We hereby certify that the above batch of UNIKLEAN-SP has been manufactured, tested, and inspected in accordance with our internal quality specifications. All parameters conform to the product specification and the product is approved for release.',
      approvals: {
        preparedBy: 'Quality Analyst — Macro Coats',
        reviewedBy: 'QC Manager — Macro Coats',
        approvedBy: 'Operations Head — Macro Coats',
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CoA — UNIKLEAN-FE
  // ─────────────────────────────────────────────────────────────────────────────
  {
    productKey: 'uniklean-fe',
    docType:    'coa',
    docNumber:  'COA-UFE-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'COA-UFE-001 Rev 01 · Apr 2026',
      center: 'CONFIDENTIAL — For authorised recipients only · Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India',
    },
    body: {
      batchNumber:    'UFE-20260426-001',
      batchSize:      '200 L',
      productionDate: '26 Apr 2026',
      expiryDate:     'Apr 2028',
      grade:          'Industrial Grade',
      appearance:     'Clear to pale yellow liquid',
      tests: [
        { parameter: 'Appearance',                      method: 'Visual',             specification: 'Clear to pale yellow liquid',   result: 'Clear, pale yellow liquid', status: 'Pass' },
        { parameter: 'pH (Concentrate, 25 °C)',         method: 'pH Electrode',        specification: '1.5 – 3.0',                    result: '2.3',                       status: 'Pass' },
        { parameter: 'pH (5% working bath, 25 °C)',     method: 'pH Electrode',        specification: '4.0 – 5.5',                    result: '4.7',                       status: 'Pass' },
        { parameter: 'Density (25 °C)',                 method: 'ISO 2811',            specification: '1.08 – 1.12 g/mL',            result: '1.10 g/mL',                 status: 'Pass' },
        { parameter: 'Total Phosphate (as P₂O₅)',       method: 'Volumetric Titration',specification: '20 – 30 %',                    result: '24.8 %',                    status: 'Pass' },
        { parameter: 'Coating Weight (5%, 55°C, 5min)', method: 'IS 6005 / ISO 3892', specification: '0.3 – 1.0 g/m²',              result: '0.65 g/m²',                 status: 'Pass' },
        { parameter: 'Flash Rust Resistance',           method: 'IS 5521 (1 h)',      specification: 'No flash rust within 1 h',     result: 'No flash rust observed',    status: 'Pass' },
      ],
      statement: 'We hereby certify that the above batch of UNIKLEAN-FE has been manufactured, tested, and inspected in accordance with our internal quality specifications. All parameters conform to the product specification and the product is approved for release.',
      approvals: {
        preparedBy: 'Quality Analyst — Macro Coats',
        reviewedBy: 'QC Manager — Macro Coats',
        approvedBy: 'Operations Head — Macro Coats',
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CoA — UNIPROTECT OIL
  // ─────────────────────────────────────────────────────────────────────────────
  {
    productKey: 'uniprotect-oil',
    docType:    'coa',
    docNumber:  'COA-UPO-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'COA-UPO-001 Rev 01 · Apr 2026',
      center: 'CONFIDENTIAL — For authorised recipients only · Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India',
    },
    body: {
      batchNumber:    'UPO-20260426-001',
      batchSize:      '200 L',
      productionDate: '26 Apr 2026',
      expiryDate:     'Apr 2028',
      grade:          'Industrial Grade',
      appearance:     'Clear amber liquid',
      tests: [
        { parameter: 'Appearance',                      method: 'Visual',              specification: 'Clear amber liquid',              result: 'Clear amber liquid',              status: 'Pass' },
        { parameter: 'Flash Point',                     method: 'ASTM D93',            specification: '> 60 °C',                         result: '68 °C',                           status: 'Pass' },
        { parameter: 'Density (25 °C)',                 method: 'ISO 2811',            specification: '0.82 – 0.86 g/mL',               result: '0.84 g/mL',                       status: 'Pass' },
        { parameter: 'Kinematic Viscosity (40 °C)',     method: 'ASTM D445',           specification: '8 – 15 cSt',                      result: '11.2 cSt',                        status: 'Pass' },
        { parameter: 'Film Thickness (dip application)',method: 'Dry Film Gauge',      specification: '3 – 8 μm',                        result: '5 μm',                            status: 'Pass' },
        { parameter: 'Humidity Cabinet Test',           method: 'ASTM D1748 (500 h)',  specification: 'No rust formation in 500 h',      result: 'No rust observed at 500 h',       status: 'Pass' },
        { parameter: 'Water Displacement',              method: 'Internal IM-002',     specification: '≥ 99 %',                          result: '99.5 %',                          status: 'Pass' },
      ],
      statement: 'We hereby certify that the above batch of UNIPROTECT OIL has been manufactured, tested, and inspected in accordance with our internal quality specifications. All parameters conform to the product specification and the product is approved for release.',
      approvals: {
        preparedBy: 'Quality Analyst — Macro Coats',
        reviewedBy: 'QC Manager — Macro Coats',
        approvedBy: 'Operations Head — Macro Coats',
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CoA — UNIFLOW ECM
  // ─────────────────────────────────────────────────────────────────────────────
  {
    productKey: 'uniflow-ecm',
    docType:    'coa',
    docNumber:  'COA-UEF-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'COA-UEF-001 Rev 01 · Apr 2026',
      center: 'CONFIDENTIAL — For authorised recipients only · Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India',
    },
    body: {
      batchNumber:    'UEF-20260426-001',
      batchSize:      '200 L',
      productionDate: '26 Apr 2026',
      expiryDate:     'Apr 2028',
      grade:          'Industrial Grade',
      appearance:     'Amber to dark amber liquid',
      tests: [
        { parameter: 'Appearance',                    method: 'Visual',              specification: 'Amber to dark amber liquid',      result: 'Amber liquid, clear',             status: 'Pass' },
        { parameter: 'Flash Point',                   method: 'ASTM D93',            specification: '> 65 °C',                         result: '72 °C',                           status: 'Pass' },
        { parameter: 'Density (25 °C)',               method: 'ISO 2811',            specification: '0.85 – 0.92 g/mL',               result: '0.88 g/mL',                       status: 'Pass' },
        { parameter: 'Kinematic Viscosity (40 °C)',   method: 'ASTM D445',           specification: '15 – 30 cSt',                     result: '21.5 cSt',                        status: 'Pass' },
        { parameter: 'Petroleum Sulfonate Content',   method: 'IP 33',               specification: '15 – 25 %',                       result: '19.8 %',                          status: 'Pass' },
        { parameter: 'Humidity Cabinet (720 h)',       method: 'ASTM D1748',          specification: 'No rust in 720 h',               result: 'No rust observed at 720 h',       status: 'Pass' },
        { parameter: 'Salt Spray Resistance',         method: 'ASTM B117 (96 h)',    specification: 'No rust in 96 h',                 result: 'No rust observed at 96 h',        status: 'Pass' },
      ],
      statement: 'We hereby certify that the above batch of UNIFLOW ECM has been manufactured, tested, and inspected in accordance with our internal quality specifications. All parameters conform to the product specification and the product is approved for release.',
      approvals: {
        preparedBy: 'Quality Analyst — Macro Coats',
        reviewedBy: 'QC Manager — Macro Coats',
        approvedBy: 'Operations Head — Macro Coats',
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CoA — UNICool AL
  // ─────────────────────────────────────────────────────────────────────────────
  {
    productKey: 'unicool-al',
    docType:    'coa',
    docNumber:  'COA-UCL-001',
    revision:   'Rev 01 — Apr 2026',
    footer: {
      left:   'COA-UCL-001 Rev 01 · Apr 2026',
      center: 'CONFIDENTIAL — For authorised recipients only · Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India',
    },
    body: {
      batchNumber:    'UCL-20260426-001',
      batchSize:      '50 L',
      productionDate: '26 Apr 2026',
      expiryDate:     'Apr 2027',
      grade:          'Industrial / Precision Grade',
      appearance:     'Clear, colourless liquid',
      tests: [
        { parameter: 'Appearance',                  method: 'Visual',               specification: 'Clear, colourless liquid',        result: 'Clear, colourless liquid',        status: 'Pass' },
        { parameter: 'Odour',                       method: 'Olfactory',            specification: 'Characteristic alcohol odour',    result: 'Characteristic alcohol',          status: 'Pass' },
        { parameter: 'Flash Point',                 method: 'ASTM D56',             specification: '12 – 18 °C',                      result: '14 °C',                           status: 'Pass' },
        { parameter: 'Density (25 °C)',             method: 'ISO 2811',             specification: '0.78 – 0.82 g/mL',               result: '0.80 g/mL',                       status: 'Pass' },
        { parameter: 'Evaporation Residue',         method: 'ASTM D1353',           specification: '≤ 0.001 %',                       result: '< 0.001 %',                       status: 'Pass' },
        { parameter: 'Dry Time (ambient)',          method: 'Cotton Wipe Method',   specification: '30 – 90 s',                       result: '45 s',                            status: 'Pass' },
        { parameter: 'Aluminium Compatibility',     method: 'Internal IM-003',      specification: 'No staining, no etching',         result: 'No staining or etching observed', status: 'Pass' },
      ],
      statement: 'We hereby certify that the above batch of UNICool AL has been manufactured, tested, and inspected in accordance with our internal quality specifications. All parameters conform to the product specification and the product is approved for release.',
      approvals: {
        preparedBy: 'Quality Analyst — Macro Coats',
        reviewedBy: 'QC Manager — Macro Coats',
        approvedBy: 'Operations Head — Macro Coats',
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // UNIKOAT LT 700
  // ─────────────────────────────────────────────────────────────────────────────
  {
    productKey: 'unikoat-lt-700',
    docType:    'tds',
    docNumber:  'TDS-ULT-001',
    revision:   'Rev 01 — May 2026',
    footer: {
      left:   'TDS-ULT-001 Rev 01 · May 2026',
      center: 'This Technical Data Sheet is for guidance only. Performance figures are typical values obtained under controlled conditions. © Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nPage 1 of 1',
    },
    body: {
      grade:       'Industrial Grade',
      description: 'UNIKOAT LT 700 is a ready-to-dilute liquid zinc phosphating concentrate engineered to produce a heavy, microcrystalline zinc phosphate conversion coating on ferrous substrates. The coating provides an excellent keying layer for paints and powder coats and acts as a corrosion barrier in its own right. The formulation contains zinc oxide, phosphoric acid, and a balanced accelerator system (hydroxylamine sulphate, sodium nitrate, ferrous sulphate) with a low-foam surfactant. It is suitable for spray wash and immersion application at moderate temperatures.',
      sections: {
        features: [
          { head: 'Heavy Zinc Phosphate Coating',  body: 'Produces a dense, microcrystalline zinc phosphate layer (1.5 – 4.5 g/m²) on ferrous substrates for superior paint adhesion and corrosion resistance' },
          { head: 'Accelerated Bath Chemistry',    body: 'Hydroxylamine sulphate and sodium nitrate accelerators deliver fast, uniform coating formation at reduced temperatures (40 – 60 °C)' },
          { head: 'Multi-application Compatible',  body: 'Validated under powder coat, liquid paint, and cataphoresis (e-coat) topcoat systems; meets OEM pretreatment specifications for heavy-duty applications' },
          { head: 'Low-Foam Formulation',          body: 'Alphox 200 surfactant addition provides bath wetting without foam — suitable for spray tunnel and agitated dip processes' },
        ],
        physicalProperties: [
          { property: 'Appearance',                value: 'Clear to pale yellow-green liquid', unit: '—',      method: 'Visual' },
          { property: 'pH (concentrate)',           value: '1.5 – 2.5',                         unit: '—',      method: 'pH electrode, 25 °C' },
          { property: 'pH (working bath, 3–8%)',   value: '2.8 – 3.5',                          unit: '—',      method: 'pH electrode, 25 °C' },
          { property: 'Density (concentrate)',      value: '~1.18',                              unit: 'g/mL',   method: 'ISO 2811' },
          { property: 'Working Concentration',      value: '3 – 8',                              unit: '% v/v',  method: 'Titration / pH control' },
          { property: 'Working Temperature',        value: '40 – 60',                            unit: '°C',     method: '—' },
          { property: 'Treatment Time',             value: '5 – 15',                             unit: 'min',    method: 'Process qualification' },
          { property: 'Coating Weight',             value: '1.5 – 4.5',                          unit: 'g/m²',   method: 'IS 6005 / ISO 3892' },
        ],
        composition: [
          { name: 'Zinc salt system',        function: 'Zinc ion source for phosphate conversion coating formation',            percent: '~6%',     compat: 'Ferrous substrates' },
          { name: 'Phosphating agent',       function: 'Phosphate source and bath acidity control; drives conversion coating',  percent: '~19%',    compat: 'All process types' },
          { name: 'Accelerator system',      function: 'Promotes uniform, fast zinc phosphate coating deposition',              percent: '~2.5%',   compat: 'Spray and dip' },
          { name: 'Iron conditioning agent', function: 'Controls iron content in bath for coating morphology',                  percent: '<1%',     compat: 'Immersion and spray' },
          { name: 'Non-ionic surfactant',    function: 'Bath wetting and foam control',                                         percent: '<0.1%',   compat: 'Low foam at ≤60 °C' },
          { name: 'Water',                   function: 'Carrier / solvent',                                                     percent: 'Balance', compat: '—' },
        ],
        application: [
          { step: '1', name: 'Pre-clean',             param: 'Alkaline degreaser (e.g. Uniklean SP)',    value: '2–4%, 60–75 °C, 3–8 min' },
          { step: '2', name: 'Rinse',                  param: 'Tap water overflow rinse',                value: '2 × rinse, ambient' },
          { step: '3', name: 'Activation (optional)',  param: 'Titanium activation rinse',               value: '0.1–0.3%, ambient, 30–60 s' },
          { step: '4', name: 'UNIKOAT LT 700 Bath',   param: '3–8% v/v, pH 2.8–3.5',                   value: '40–60 °C, 5–15 min spray/dip' },
          { step: '5', name: 'Water Rinse',            param: 'Tap water',                               value: '1–2 × rinse, ambient' },
          { step: '6', name: 'Passivation / DI Rinse', param: 'Chrome-free passivate or DI water',      value: 'As per topcoat specification' },
          { step: '7', name: 'Dry & Topcoat',          param: 'Powder coat / Liquid paint / E-coat',    value: 'Apply within 4 h of treatment' },
        ],
        packaging: [
          { size: '30',  unit: 'L',  type: 'HDPE jerrycan' },
          { size: '200', unit: 'L',  type: 'HDPE barrel / drum' },
        ],
        performance: [
          { label: 'Salt Spray (coated)',   val: '≥500 h (IS 101 / ASTM B117)' },
          { label: 'Adhesion (cross-cut)',  val: 'Class 0 (ISO 2409)' },
          { label: 'Coating Weight',        val: '1.5–4.5 g/m² (IS 6005)' },
          { label: 'Bath pH Stability',     val: '±0.2 over 8 h continuous production' },
        ],
        safetyNote: 'Strongly acidic concentrate — handle with full PPE. Always add concentrate to water; never add water to concentrate. Refer to the current SDS (SDS-ULT-001) for full hazard information.',
      },
    },
  },

  {
    productKey: 'unikoat-lt-700',
    docType:    'msds',
    docNumber:  'SDS-ULT-001',
    revision:   'Rev 01 — May 2026',
    footer: {
      left:   'SDS-ULT-001 Rev 01 · May 2026',
      center: 'This Safety Data Sheet is provided in good faith based on current knowledge. © Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nGHS Rev 9 Compliant · Page 1 of 1',
    },
    body: {
      signalWord: 'Danger',
      sections: {
        identification: {
          productType:  'Liquid zinc phosphating concentrate for ferrous metal conversion coating',
          intendedUse:  'Zinc phosphate conversion coating on ferrous substrates prior to powder coating, painting, or electrocoating',
          manufacturer: 'Macro Coats Pvt Ltd, Chennai, Tamil Nadu, India',
          emergency:    'AIIMS Poison Control: 1800-11-6117 (Toll-Free)',
        },
        hazards: {
          pictograms:      ['oxidiser', 'corrosive', 'irritant'],
          classifications: [
            { class: 'Skin Corrosion / Irritation', category: 'Cat 1A',       tagType: 'danger'  },
            { class: 'Serious Eye Damage',           category: 'Cat 1',        tagType: 'danger'  },
            { class: 'Oxidising Liquid',             category: 'Cat 3',        tagType: 'warn'    },
            { class: 'Acute Toxicity — Oral',        category: 'Cat 4',        tagType: 'warn'    },
            { class: 'Aquatic Toxicity (Chronic)',   category: 'Cat 3',        tagType: 'warn'    },
          ],
          hStatements: 'H272 — May intensify fire; oxidiser. H302 — Harmful if swallowed. H314 — Causes severe skin burns and eye damage. H318 — Causes serious eye damage.',
          pStatements: 'P210 · P220 · P260 · P264 · P270 · P273 · P280 · P301+P330+P331 · P303+P361+P353 · P305+P351+P338 · P310 · P501',
        },
        composition: {
          ingredients: [
            { name: 'Phosphate source (acidic)',   description: 'Acidity control and conversion coating agent',              percent: '15–25%', ghsClass: 'Corrosive', tagType: 'danger' },
            { name: 'Zinc compound',               description: 'Zinc ion source for phosphate coating formation',           percent: '5–10%',  ghsClass: 'Irritant',  tagType: 'warn'   },
            { name: 'Oxidising accelerator salt',  description: 'Uniform coating deposition accelerator',                   percent: '<5%',    ghsClass: 'Oxidiser',  tagType: 'warn'   },
            { name: 'Reaction accelerator',        description: 'Phosphating reaction accelerator',                          percent: '<2%',    ghsClass: 'Irritant',  tagType: 'warn'   },
            { name: 'Iron conditioning agent',     description: 'Controls coating morphology on ferrous substrates',         percent: '<1%',    ghsClass: 'Irritant',  tagType: 'warn'   },
            { name: 'Non-ionic surfactant',        description: 'Bath wetting and foam control',                             percent: '<1%',    ghsClass: 'None',      tagType: 'safe'   },
            { name: 'Water',                       description: 'Carrier / solvent',                                         percent: 'Balance', ghsClass: '—',       tagType: 'safe'   },
          ],
          note: 'Exact formulation is proprietary. Functional ingredient descriptions are provided for safety and emergency purposes only.',
        },
        firstAid: {
          eyes:       'Flush immediately with running water for ≥20 min, holding eyelids open. Seek immediate medical attention — risk of permanent eye damage from acid burns.',
          skin:       'Remove contaminated clothing immediately. Wash with soap and copious water for ≥20 min. Seek medical attention if burns develop.',
          inhalation: 'Move to fresh air immediately. If breathing is difficult, give supplemental oxygen. Seek medical attention.',
          ingestion:  'Rinse mouth with water. Do NOT induce vomiting — acid ingestion risk. Call AIIMS Poison Control: 1800-11-6117 immediately.',
          warning:    '⚠ Phosphoric acid burns can cause deep tissue damage — always seek medical attention for eye or skin exposure, even if pain is initially mild.',
        },
        fireFighting: {
          flammability:       'Not flammable (aqueous solution); sodium nitrate content may intensify fires involving combustible materials',
          extinguishingMedia: 'Water spray, dry sand, or foam. Do not use dry powder near oxidising materials.',
          fireHazard:         'Thermal decomposition may release toxic nitrogen oxides (NOₓ) and phosphorus oxides',
          ppe:                'SCBA and full chemical-resistant protective clothing',
        },
        accidentalRelease: [
          'Evacuate non-essential personnel; ensure adequate ventilation',
          'Wear full PPE: acid-resistant goggles, face shield, acid/oxidiser-resistant gloves and apron',
          'Contain spill with inert absorbent material (dry sand, vermiculite); avoid sawdust with oxidising liquid',
          'Neutralise slowly with dilute alkali (sodium bicarbonate) — caution: exothermic reaction',
          'Collect contaminated material into sealed, labelled HDPE containers for disposal',
          'Prevent runoff from entering drains, waterways, or soil',
          'Dispose per local CPCB/SPCB guidelines (HWM Rules 2016)',
        ],
        handling: {
          handling:     'Always add concentrate to water — never add water to concentrate (exothermic). Handle in well-ventilated areas with full PPE.',
          storageTemp:  '10 °C – 35 °C; cool, dry, ventilated store; protect from frost and heat sources',
          containers:   'Sealed HDPE or polypropylene containers; segregate from alkalis, reducing agents, and combustible materials',
          segregation:  'Oxidising liquid — store separately from flammable/combustible materials and strong bases',
          shelfLife:    '24 months from date of manufacture in original sealed containers',
        },
        exposure: {
          ppeItems:    ['Acid-Resistant Goggles', 'Face Shield', 'Acid-resist. Gloves (nitrile/butyl)', 'Chemical Apron', 'Rubber Boots'],
          engineering: 'Exhaust ventilation for enclosed areas. Eyewash station and emergency shower within 10 seconds of handling point.',
        },
        physical: [
          { key: 'Appearance',    val: 'Clear to pale yellow-green liquid' },
          { key: 'Odour',         val: 'Mild acidic odour' },
          { key: 'pH (conc.)',    val: '1.5 – 2.5' },
          { key: 'Density',       val: '~1.18 g/mL' },
          { key: 'Flash Point',   val: 'None (aqueous)' },
          { key: 'Boiling Point', val: '~102 °C' },
          { key: 'Solubility',    val: 'Fully miscible with water' },
          { key: 'Viscosity',     val: 'Low (water-like)' },
        ],
        stability: {
          stability:      'Stable under recommended storage and handling conditions',
          avoid:          'Strong alkalis, reducing agents, combustible materials, ammonium compounds',
          decomposition:  'Thermal decomposition above 300 °C may release toxic nitrogen oxides and phosphorus oxides',
          polymerisation: 'Will not occur',
        },
        sections11to16: {
          'Skin / Eye': 'Corrosive at concentrate — H314 severe skin burns and eye damage. Phosphoric acid penetrates tissue.',
          Aquatic:      'Zinc ions are toxic to aquatic organisms; H412 with long lasting effects. Treat spent bath before discharge.',
          Disposal:     'Neutralise to pH 6–9, precipitate zinc before discharge. Dispose per CPCB/SPCB norms (E.P. Act 1986).',
          Regulatory:   'MSIHC Rules 1989 · Factories Act 1948 · HWM Rules 2016 · GHS Rev 9',
          'Other Info': 'SDS Rev 01 issued May 2026. Next review: May 2028 or upon formulation change.',
        },
      },
    },
  },

  {
    productKey: 'unikoat-lt-700',
    docType:    'formula',
    docNumber:  'FRM-ULT-001',
    revision:   'Rev 01 — May 2026',
    footer: {
      left:   'FRM-ULT-001 Rev 01 · May 2026',
      center: 'CONFIDENTIAL — This formulation sheet is the proprietary information of Macro Coats Pvt Ltd. Unauthorised reproduction or disclosure is prohibited.',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nPage 1 of 1',
    },
    body: {
      classification:     'CONFIDENTIAL — Internal Use Only',
      batchSize:          '100 L (reference)',
      formulaType:        'liquid',
      referenceBatchSize: 100,
      batchUnit:          'L',
      totalActivePercent: 27.7,
      overview: 'UNIKOAT LT 700 is a zinc phosphating concentrate formulated for heavy microcrystalline zinc phosphate conversion coatings on ferrous substrates prior to painting, powder coating, or e-coating.',
      composition: [
        { srNo: 1, name: 'Zinc Oxide',               casNo: '1314-13-2',  baseQty: 5.8,  unit: 'kg', percentWV: 5.8,  function: 'Zinc ion source — reacts with phosphoric acid to form zinc phosphate coating', density: null, unitPrice: 85  },
        { srNo: 2, name: 'Phosphoric Acid (85%)',     casNo: '7664-38-2',  baseQty: 19,   unit: 'kg', percentWV: 19,   function: 'Phosphate source and bath acidity — drives the conversion coating reaction',   density: null, unitPrice: 55  },
        { srNo: 3, name: 'Hydroxylamine Sulphate',   casNo: '10039-54-0', baseQty: 0.7,  unit: 'kg', percentWV: 0.7,  function: 'Accelerator — promotes uniform and rapid coating formation',                   density: null, unitPrice: 480 },
        { srNo: 4, name: 'Sodium Nitrate',            casNo: '7631-99-4',  baseQty: 1.8,  unit: 'kg', percentWV: 1.8,  function: 'Oxidising accelerator — enhances coating deposition rate and uniformity',      density: null, unitPrice: 22  },
        { srNo: 5, name: 'Ferrous Sulphate',          casNo: '7720-78-7',  baseQty: 0.35, unit: 'kg', percentWV: 0.35, function: 'Iron conditioning agent — controls coating morphology and crystal size',        density: null, unitPrice: 18  },
        { srNo: 6, name: 'Alphox 200',                casNo: '68439-50-9', baseQty: 0.05, unit: 'L',  percentWV: 0.05, function: 'Non-ionic surfactant — bath wetting and foam suppression',                     density: 1.02, unitPrice: 130 },
        { srNo: 7, name: 'Water',                     casNo: '7732-18-5',  baseQty: null, unit: 'L',  percentWV: null, function: 'Solvent — balance to final volume',                                            density: null, unitPrice: 0   },
      ],
      preparation: [
        { step: 1, title: 'Pre-dissolve Zinc Oxide',   detail: 'In a separate acid-resistant vessel, slowly add 5.8 kg Zinc Oxide to 15 L of Phosphoric Acid with continuous stirring. The reaction is exothermic — allow to cool before adding to tank. Full dissolution produces a clear zinc phosphate solution.' },
        { step: 2, title: 'Water Charging',             detail: 'Add 60–65 L of the required water to the main mixing tank and start agitation.' },
        { step: 3, title: 'Add Zinc-Phosphate Solution', detail: 'Slowly transfer the pre-dissolved zinc phosphate solution from Step 1 into the main tank with stirring.' },
        { step: 4, title: 'Add Hydroxylamine Sulphate', detail: 'Dissolve 0.7 kg Hydroxylamine Sulphate in a small volume of water, then add to the tank with mixing.' },
        { step: 5, title: 'Add Sodium Nitrate',         detail: 'Add 1.8 kg Sodium Nitrate and stir until fully dissolved.' },
        { step: 6, title: 'Add Ferrous Sulphate',       detail: 'Add 0.35 kg Ferrous Sulphate and mix until dissolved.' },
        { step: 7, title: 'Add Alphox 200',             detail: 'Add 0.05 L Alphox 200 slowly to avoid foaming, with gentle stirring.' },
        { step: 8, title: 'Final Volume Adjustment',    detail: 'Add water to reach the final batch volume of 100 L. Mix for 10–15 minutes.' },
        { step: 9, title: 'QC Check & Pack',            detail: 'Verify pH (concentrate: 1.5–2.5), appearance (clear to pale yellow-green). Discharge into labelled HDPE containers.' },
      ],
      operatingConditions: [
        { param: 'Working Concentration', value: '3 – 8 %' },
        { param: 'Operating Temperature', value: '40 – 60 °C' },
        { param: 'Bath pH',               value: '2.8 – 3.5' },
        { param: 'Treatment Time',        value: '5 – 15 minutes' },
        { param: 'Coating Weight',        value: '1.5 – 4.5 g/m²' },
        { param: 'Application Method',    value: 'Spray wash or immersion' },
      ],
      applications: {
        removes:    ['Light rust', 'Mill scale residues', 'Surface oxides'],
        usedBefore: ['Powder coating', 'Painting / liquid coat', 'Electrocoating (E-coat)', 'Cataphoresis'],
      },
    },
  },

  {
    productKey: 'unikoat-lt-700',
    docType:    'label',
    docNumber:  'LBL-ULT-001',
    revision:   'Rev 01 — May 2026',
    footer: { left: '', center: '', right: '' },
    body: {
      signalWord: 'DANGER',
      unNo: 'UN 1805',
      hCodes: [
        { code: 'H272', text: 'May intensify fire; oxidiser' },
        { code: 'H302', text: 'Harmful if swallowed' },
        { code: 'H314', text: 'Causes severe skin burns and eye damage' },
        { code: 'H318', text: 'Causes serious eye damage' },
      ],
      pCodes: [
        { code: 'P210',            text: 'Keep away from heat and open flames' },
        { code: 'P220',            text: 'Keep away from combustible materials' },
        { code: 'P260',            text: 'Do not breathe fumes or mist' },
        { code: 'P273',            text: 'Avoid release to the environment' },
        { code: 'P280',            text: 'Wear acid-resistant gloves, goggles and face protection' },
        { code: 'P301+P330+P331', text: 'If swallowed, rinse mouth; do NOT induce vomiting' },
        { code: 'P303+P361+P353', text: 'If on skin or hair, remove clothing; rinse with water' },
        { code: 'P305+P351+P338', text: 'If in eyes, rinse cautiously with water for ≥20 min' },
        { code: 'P310',            text: 'Immediately call a POISON CENTER or doctor' },
      ],
      firstAid: {
        skin:       'Remove clothing immediately. Wash with copious water for ≥20 min. Seek medical attention.',
        eyes:       'Flush with running water for ≥20 min holding eyelids open. Seek immediate medical attention — risk of permanent damage.',
        ingestion:  'Rinse mouth. Do NOT induce vomiting. Call 1800-11-6117 immediately.',
        inhalation: 'Move to fresh air. Give oxygen if breathing is difficult. Seek medical attention.',
      },
      directions: [
        'Dilute 3–8% in water before use',
        'Apply at 40–60 °C by spray or immersion',
        'Maintain bath pH at 2.8–3.5',
        'Allow 5–15 min contact time for coating formation',
        'Rinse thoroughly with water after treatment',
      ],
      storage: ['Store at 10°C – 35°C', 'Keep away from combustible materials', 'Keep away from children', 'Dispose per CPCB regulations'],
      products: ['UNIKOAT LT 700', 'UNIKLEAN SP', 'UNIKLEAN FE'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CoA — UNIKOAT LT 700
  // ─────────────────────────────────────────────────────────────────────────────
  {
    productKey: 'unikoat-lt-700',
    docType:    'coa',
    docNumber:  'COA-ULT-001',
    revision:   'Rev 01 — May 2026',
    footer: {
      left:   'COA-ULT-001 Rev 01 · May 2026',
      center: 'CONFIDENTIAL — For authorised recipients only · Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India',
    },
    body: {
      batchNumber:    'ULT-20260505-001',
      batchSize:      '100 L',
      productionDate: '05 May 2026',
      expiryDate:     'May 2028',
      grade:          'Industrial Grade',
      appearance:     'Clear to pale yellow-green liquid',
      tests: [
        { parameter: 'Appearance',                       method: 'Visual',                  specification: 'Clear to pale yellow-green liquid',  result: 'Clear, pale yellow-green liquid', status: 'Pass' },
        { parameter: 'pH (Concentrate, 25 °C)',          method: 'pH Electrode',             specification: '1.5 – 2.5',                          result: '1.9',                             status: 'Pass' },
        { parameter: 'pH (5% working bath, 25 °C)',      method: 'pH Electrode',             specification: '2.8 – 3.5',                          result: '3.1',                             status: 'Pass' },
        { parameter: 'Density (25 °C)',                  method: 'ISO 2811',                 specification: '1.15 – 1.22 g/mL',                  result: '1.18 g/mL',                       status: 'Pass' },
        { parameter: 'Total Phosphate (as P₂O₅)',        method: 'Volumetric Titration',     specification: '15 – 22 %',                          result: '18.4 %',                          status: 'Pass' },
        { parameter: 'Free Acid (as H₃PO₄)',             method: 'NaOH Titration',           specification: '8 – 14 points',                      result: '10.5 points',                     status: 'Pass' },
        { parameter: 'Coating Weight (5%, 55°C, 10min)', method: 'IS 6005 / ISO 3892',       specification: '1.5 – 4.5 g/m²',                    result: '2.8 g/m²',                        status: 'Pass' },
        { parameter: 'Salt Spray Resistance (coated)',   method: 'ASTM B117',                specification: '≥ 500 h (no rust)',                  result: '≥ 500 h, no rust observed',       status: 'Pass' },
      ],
      statement: 'We hereby certify that the above batch of UNIKOAT LT 700 has been manufactured, tested, and inspected in accordance with our internal quality specifications. All parameters conform to the product specification and the product is approved for release.',
      approvals: {
        preparedBy: 'Quality Analyst — Macro Coats',
        reviewedBy: 'QC Manager — Macro Coats',
        approvedBy: 'Operations Head — Macro Coats',
      },
    },
  },


  // ─────────────────────────────────────────────────────────────────────────────
  // UNISOLVE H3
  // ─────────────────────────────────────────────────────────────────────────────
  {
    productKey: 'unisolve-h3',
    docType:    'tds',
    docNumber:  'TDS-UH3-001',
    revision:   'Rev 01 — May 2026',
    footer: {
      left:   'TDS-UH3-001 Rev 01 · May 2026',
      center: 'This Technical Data Sheet is for guidance only. Performance figures are typical values obtained under controlled conditions. © Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nPage 1 of 1',
    },
    body: {
      grade:       'Industrial Grade',
      description: 'UNISOLVE H3 is a phosphoric acid-based acidic cleaner and derusting agent formulated for the removal of rust, mill scale, and oxide layers from ferrous metal surfaces. The product combines a phosphate acid system with a wetting surfactant, emulsifier, and pH-buffering agent to deliver effective, controlled metal pickling. It is suitable for immersion, spray, and brush application at ambient to moderate temperatures, and is widely used in pre-treatment lines prior to phosphating, powder coating, and painting.',
      sections: {
        features: [
          { head: 'Dual-Action Derusting & Degreasing', body: 'Simultaneously removes rust, scale, and light oils in a single-step treatment — reduces pre-treatment steps and cycle time' },
          { head: 'Controlled Metal Pickling',           body: 'Balanced phosphoric acid system delivers effective rust removal without excessive base metal attack at recommended dilutions' },
          { head: 'Surface Conditioning',                body: 'Leaves a light phosphate conversion layer on ferrous surfaces, improving paint adhesion and providing interim flash rust protection' },
          { head: 'Multi-application Compatible',        body: 'Validated for immersion dip, spray wash, and brush application; compatible with subsequent phosphating, painting, and powder coating processes' },
        ],
        physicalProperties: [
          { property: 'Appearance',              value: 'Clear to pale yellow liquid', unit: '—',      method: 'Visual' },
          { property: 'pH (concentrate)',         value: '1.0 – 2.0',                  unit: '—',      method: 'pH electrode, 25 °C' },
          { property: 'pH (5% working bath)',     value: '1.5 – 2.5',                  unit: '—',      method: 'pH electrode, 25 °C' },
          { property: 'Density',                 value: '~1.15',                       unit: 'g/mL',   method: 'ISO 2811' },
          { property: 'Working Concentration',    value: '3 – 8',                       unit: '% v/v',  method: 'Titration / pH control' },
          { property: 'Working Temperature',      value: '25 – 50',                     unit: '°C',     method: '—' },
          { property: 'Treatment Time',           value: '5 – 20',                      unit: 'min',    method: 'Process qualification' },
          { property: 'Flash Point',              value: 'None (aqueous)',              unit: '—',      method: 'ASTM D93' },
        ],
        composition: [
          { name: 'Phosphate-based acid system',  function: 'Primary rust removal and metal conditioning agent',                       percent: '15–25%',  compat: 'Ferrous substrates at working dilution' },
          { name: 'Non-ionic surfactant',         function: 'Wetting, degreasing, and surface penetration aid',                        percent: '<5%',     compat: 'Low foam at ≤50 °C' },
          { name: 'Emulsifier blend',             function: 'Oil emulsification and surface wetting enhancement',                      percent: '<5%',     compat: 'All process types' },
          { name: 'pH buffering agent',           function: 'pH stability control and improved substrate compatibility',               percent: '<5%',     compat: 'Spray and dip' },
          { name: 'Water',                        function: 'Carrier / solvent',                                                       percent: 'Balance', compat: '—' },
        ],
        application: [
          { step: '1', name: 'Pre-rinse',          param: 'Water rinse to remove loose dirt',                    value: 'Ambient' },
          { step: '2', name: 'UNISOLVE H3 Bath',   param: '3–8% v/v in water',                                   value: '25–50 °C, 5–20 min' },
          { step: '3', name: 'Rinse',              param: 'Tap water overflow rinse',                             value: '2 × rinse, ambient' },
          { step: '4', name: 'Second Rinse',       param: 'DI water (if DI line available)',                      value: 'Ambient' },
          { step: '5', name: 'Next Stage',         param: 'Phosphating / painting / powder coating',              value: 'As required' },
        ],
        packaging: [
          { size: '30',  unit: 'L',  type: 'HDPE jerrycan' },
          { size: '200', unit: 'L',  type: 'HDPE barrel / drum' },
        ],
        performance: [
          { label: 'Rust removal (light flash rust)',   val: '>98% at 5%, 40 °C, 10 min' },
          { label: 'Mill scale removal',                val: '>90% at 8%, 50 °C, 20 min' },
          { label: 'Base metal loss (mild steel)',      val: '<0.5 g/m² at 5%, 30 °C, 10 min' },
          { label: 'Surface after treatment',          val: 'Light phosphate layer — improved paint adhesion' },
        ],
        safetyNote: 'Strongly acidic concentrate — corrosive to skin and eyes. Always add concentrate to water; never add water to concentrate. Wear full PPE. Refer to the current MSDS (SDS-UH3-001) for full hazard information and PPE requirements.',
      },
    },
  },

  {
    productKey: 'unisolve-h3',
    docType:    'msds',
    docNumber:  'SDS-UH3-001',
    revision:   'Rev 01 — May 2026',
    footer: {
      left:   'SDS-UH3-001 Rev 01 · May 2026',
      center: 'This Safety Data Sheet is provided in good faith based on current knowledge. © Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nGHS Rev 9 Compliant · Page 1 of 1',
    },
    body: {
      signalWord: 'Danger',
      sections: {
        identification: {
          productType:  'Acidic aqueous cleaner and derusting concentrate for ferrous metal surfaces',
          intendedUse:  'Removal of rust, mill scale, and oxide layers from ferrous substrates prior to phosphating, powder coating, or painting',
          manufacturer: 'Macro Coats Pvt Ltd, Chennai, Tamil Nadu, India',
          emergency:    'AIIMS Poison Control: 1800-11-6117 (Toll-Free)',
        },
        hazards: {
          pictograms:      ['corrosive', 'irritant'],
          classifications: [
            { class: 'Skin Corrosion / Irritation', category: 'Cat 1A', tagType: 'danger' },
            { class: 'Serious Eye Damage',           category: 'Cat 1',  tagType: 'danger' },
            { class: 'Acute Toxicity — Oral',        category: 'Cat 4',  tagType: 'warn'   },
          ],
          hStatements: 'H314 — Causes severe skin burns and eye damage. H318 — Causes serious eye damage. H302 — Harmful if swallowed.',
          pStatements: 'P260 · P264 · P280 · P301+P330+P331 · P303+P361+P353 · P305+P351+P338 · P310',
        },
        composition: {
          ingredients: [
            { name: 'Phosphate source (acidic)', description: 'Primary rust removal and acidity control agent',           percent: '15–25%',  ghsClass: 'Corrosive',     tagType: 'danger' },
            { name: 'Non-ionic surfactant',      description: 'Wetting and degreasing aid',                              percent: '<5%',     ghsClass: 'Irritant',      tagType: 'warn'   },
            { name: 'Emulsifier blend',          description: 'Surface penetration and oil emulsification agent',         percent: '<5%',     ghsClass: 'Irritant',      tagType: 'warn'   },
            { name: 'pH regulator',              description: 'pH stabilisation and substrate compatibility agent',        percent: '<5%',     ghsClass: 'Irritant',      tagType: 'warn'   },
            { name: 'Water / aqueous carrier',   description: 'Carrier / solvent — major component',                     percent: 'Balance', ghsClass: 'Non-hazardous', tagType: 'safe'   },
          ],
          note: 'Exact formulation is proprietary. Functional ingredient descriptions are provided for safety and emergency purposes only.',
        },
        firstAid: {
          eyes:       'Flush immediately with running water for ≥20 min, holding eyelids open. Seek immediate medical attention — risk of permanent eye damage from acid burns.',
          skin:       'Remove contaminated clothing immediately. Wash with soap and copious water for ≥20 min. Seek medical attention if burns develop.',
          inhalation: 'Move to fresh air immediately. If breathing is difficult, give supplemental oxygen. Seek medical attention.',
          ingestion:  'Rinse mouth with water. Do NOT induce vomiting — acid ingestion risk. Call AIIMS Poison Control: 1800-11-6117 immediately.',
          warning:    '⚠ Phosphoric acid burns can cause deep tissue damage — always seek medical attention for eye or skin exposure, even if pain is initially mild.',
        },
        fireFighting: {
          flammability:       'Not flammable (aqueous solution)',
          extinguishingMedia: 'Water spray, dry sand, or foam appropriate to surrounding materials.',
          fireHazard:         'Thermal decomposition may release irritating phosphorus oxide fumes',
          ppe:                'SCBA and full chemical-resistant protective clothing',
        },
        accidentalRelease: [
          'Evacuate non-essential personnel; ensure adequate ventilation',
          'Wear full PPE: acid-resistant goggles, face shield, acid-resistant gloves and chemical apron',
          'Contain spill with inert absorbent material (dry sand, vermiculite)',
          'Neutralise slowly with dilute alkali (sodium bicarbonate) — caution: exothermic reaction',
          'Collect contaminated material into sealed, labelled HDPE containers for disposal',
          'Prevent runoff from entering drains, waterways, or soil',
          'Dispose per local CPCB/SPCB guidelines (HWM Rules 2016)',
        ],
        handling: {
          handling:     'Always add concentrate to water — never add water to concentrate (exothermic). Handle in well-ventilated areas with full PPE.',
          storageTemp:  '10 °C – 35 °C; cool, dry, ventilated store; protect from frost and heat sources',
          containers:   'Sealed HDPE or polypropylene containers; segregate from alkalis and strong bases',
          segregation:  'Store separately from strong alkalis, oxidising agents, and reactive metals',
          shelfLife:    '24 months from date of manufacture in original sealed containers',
        },
        exposure: {
          ppeItems:    ['Acid-Resistant Goggles', 'Face Shield', 'Acid-resist. Gloves (nitrile/butyl)', 'Chemical Apron', 'Rubber Boots'],
          engineering: 'Exhaust ventilation for enclosed areas. Eyewash station and emergency shower within 10 seconds of handling point.',
        },
        physical: [
          { key: 'Appearance',    val: 'Clear to pale yellow liquid' },
          { key: 'Odour',         val: 'Mild acidic odour' },
          { key: 'pH (conc.)',    val: '1.0 – 2.0' },
          { key: 'Density',       val: '~1.15 g/mL' },
          { key: 'Flash Point',   val: 'None (aqueous)' },
          { key: 'Boiling Point', val: '~102 °C' },
          { key: 'Solubility',    val: 'Fully miscible with water' },
          { key: 'Viscosity',     val: 'Low (water-like)' },
        ],
        stability: {
          stability:      'Stable under recommended storage and handling conditions',
          avoid:          'Strong alkalis, reactive metals (zinc, aluminium at high concentration), strong oxidising agents',
          decomposition:  'Thermal decomposition above 200 °C may release irritating phosphorus oxide fumes',
          polymerisation: 'Will not occur',
        },
        sections11to16: {
          'Skin / Eye': 'Corrosive at concentrate — H314 severe skin burns and eye damage. Phosphoric acid penetrates tissue; seek medical attention promptly for any exposure.',
          Aquatic:      'Aqueous phosphate solution — avoid discharge in large quantities to waterways. Treat spent bath to neutral pH before disposal.',
          Disposal:     'Neutralise to pH 6–9 before discharge. Dispose per CPCB/SPCB norms (E.P. Act 1986).',
          Regulatory:   'MSIHC Rules 1989 · Factories Act 1948 · HWM Rules 2016 · GHS Rev 9',
          'Other Info': 'SDS Rev 01 issued May 2026. Next review: May 2028 or upon formulation change.',
        },
      },
    },
  },

  {
    productKey: 'unisolve-h3',
    docType:    'formula',
    docNumber:  'FRM-UH3-001',
    revision:   'Rev 01 — May 2026',
    footer: {
      left:   'FRM-UH3-001 Rev 01 · May 2026',
      center: 'CONFIDENTIAL — This formulation sheet is the proprietary information of Macro Coats Pvt Ltd. Unauthorised reproduction or disclosure is prohibited.',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nPage 1 of 1',
    },
    body: {
      classification:     'CONFIDENTIAL — Internal Use Only',
      batchSize:          '139 L (reference)',
      formulaType:        'liquid',
      referenceBatchSize: 139,
      batchUnit:          'L',
      totalActivePercent: 28.18,
      overview: 'UNISOLVE H3 is a phosphoric acid-based acidic cleaner and derusting agent for ferrous metal surfaces. Used in pre-treatment lines prior to painting, powder coating, or phosphating.',
      composition: [
        { srNo: 1, name: 'Phosphoric Acid',                   casNo: '7664-38-2',   baseQty: 33.24, unit: 'L', percentWV: 23.87, function: 'Rust removal / acid cleaning — primary active ingredient',   density: 1.685, unitPrice: 0 },
        { srNo: 2, name: 'Water',                              casNo: '7732-18-5',   baseQty: 100, unit: 'L',  percentWV: 71.82, function: 'Base medium / carrier — balance to final volume',             density: 1.000, unitPrice: 0 },
        { srNo: 3, name: 'Alphox 200',                        casNo: 'Proprietary',  baseQty: 1.5, unit: 'L',  percentWV: 1.08,  function: 'Emulsifier / surfactant — enhances surface penetration',     density: 1.020, unitPrice: 0 },
        { srNo: 4, name: 'LAE 9 (Lauryl Alcohol Ethoxylate)', casNo: '9002-92-0',   baseQty: 1.5, unit: 'L',  percentWV: 1.08,  function: 'Wetting & degreasing agent — non-ionic surfactant',          density: 1.010, unitPrice: 0 },
        { srNo: 5, name: 'TEA (Triethanolamine)',             casNo: '102-71-6',    baseQty: 3,   unit: 'L',  percentWV: 2.15,  function: 'Neutralizing agent / pH control — improves compatibility',  density: 1.124, unitPrice: 0 },
      ],
      preparation: [
        { step: 1, title: 'Safety Setup',        detail: 'Ensure working area is well-ventilated. Wear full PPE: acid-resistant goggles, face shield, nitrile/butyl gloves, chemical apron, and rubber boots.' },
        { step: 2, title: 'Water Charging',      detail: 'Add 70–80 L of the total water quantity (100 L) to a clean, acid-resistant HDPE mixing tank. Begin slow agitation.' },
        { step: 3, title: 'Acid Addition',       detail: 'Slowly add Phosphoric Acid (56 kg / 33.24 L) to the water with continuous stirring. Never add water to acid. Monitor temperature — reaction is mildly exothermic. Ensure ventilation.' },
        { step: 4, title: 'Surfactant Addition', detail: 'Add Alphox 200 (1.5 L) and LAE 9 (1.5 L) to the acidic solution. Mix for 10 minutes at low agitation until homogeneous.' },
        { step: 5, title: 'TEA Addition',        detail: 'Slowly add TEA (3 L) with continuous stirring to improve pH balance and substrate compatibility. Mix for 5–10 minutes.' },
        { step: 6, title: 'Top Up & Homogenise', detail: 'Add remaining water to bring the total batch volume to exactly 139 L. Mix for 10 minutes to ensure full homogeneity.' },
        { step: 7, title: 'QC Check & Fill',     detail: 'Verify pH (concentrate: 1.0–2.0), density (~1.15 g/mL), and appearance (clear to pale yellow liquid). Record batch number, date, and operator sign-off before filling into labelled HDPE containers.' },
      ],
      operatingConditions: [
        { param: 'Bath Concentration',    value: '3 – 8 %' },
        { param: 'Operating Temperature', value: '25 – 50 °C' },
        { param: 'Bath pH',               value: '1.5 – 2.5 (at working dilution)' },
        { param: 'Treatment Time',        value: '5 – 20 minutes depending on rust severity' },
        { param: 'Application Method',    value: 'Spray wash, dip, or brush application' },
      ],
      applications: {
        removes:    ['Rust and flash rust', 'Mill scale', 'Oxide layers', 'Light oils and machining contaminants'],
        usedBefore: ['Zinc phosphating', 'Painting / liquid coat', 'Powder coating', 'Passivation'],
      },
    },
  },

  {
    productKey: 'unisolve-h3',
    docType:    'label',
    docNumber:  'LBL-UH3-001',
    revision:   'Rev 01 — May 2026',
    footer: { left: '', center: '', right: '' },
    body: {
      signalWord: 'DANGER',
      unNo: 'N/A',
      hCodes: [
        { code: 'H314', text: 'Causes severe skin burns and eye damage' },
        { code: 'H318', text: 'Causes serious eye damage' },
        { code: 'H302', text: 'Harmful if swallowed' },
      ],
      pCodes: [
        { code: 'P260',            text: 'Do not breathe fumes or mist' },
        { code: 'P264',            text: 'Wash hands thoroughly after handling' },
        { code: 'P280',            text: 'Wear acid-resistant gloves, goggles and face protection' },
        { code: 'P301+P330+P331', text: 'If swallowed, rinse mouth; do NOT induce vomiting' },
        { code: 'P303+P361+P353', text: 'If on skin or hair, remove clothing; rinse with water' },
        { code: 'P305+P351+P338', text: 'If in eyes, rinse cautiously with water for ≥20 min' },
        { code: 'P310',            text: 'Immediately call a POISON CENTER or doctor' },
      ],
      firstAid: {
        skin:       'Remove clothing immediately. Wash with copious water for ≥20 min. Seek medical attention.',
        eyes:       'Flush with running water for ≥20 min holding eyelids open. Seek immediate medical attention — risk of permanent damage.',
        ingestion:  'Rinse mouth. Do NOT induce vomiting. Call 1800-11-6117 immediately.',
        inhalation: 'Move to fresh air. Give oxygen if breathing is difficult. Seek medical attention.',
      },
      directions: [
        'Dilute 3–8% in water before use',
        'Always add concentrate to water — never add water to concentrate',
        'Apply at 25–50 °C by spray, dip, or brush',
        'Allow 5–20 min contact time depending on rust severity',
        'Rinse thoroughly with water after treatment',
      ],
      storage:  ['Store at 10°C – 35°C', 'Keep container sealed and upright', 'Keep away from strong alkalis and reactive metals', 'Keep away from children', 'Dispose per CPCB regulations'],
      products: ['UNISOLVE H3', 'UNIKOAT LT 700', 'UNIKLEAN SP', 'UNIKLEAN FE'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CoA — UNISOLVE H3
  // ─────────────────────────────────────────────────────────────────────────────
  {
    productKey: 'unisolve-h3',
    docType:    'coa',
    docNumber:  'COA-UH3-001',
    revision:   'Rev 01 — May 2026',
    footer: {
      left:   'COA-UH3-001 Rev 01 · May 2026',
      center: 'CONFIDENTIAL — For authorised recipients only · Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India',
    },
    body: {
      batchNumber:    'UH3-20260506-001',
      batchSize:      '100 L',
      productionDate: '06 May 2026',
      expiryDate:     'May 2028',
      grade:          'Industrial Grade',
      appearance:     'Clear to pale yellow liquid',
      tests: [
        { parameter: 'Appearance',                    method: 'Visual',          specification: 'Clear to pale yellow liquid',    result: 'Clear, pale yellow liquid', status: 'Pass' },
        { parameter: 'pH (Concentrate, 25 °C)',       method: 'pH Electrode',     specification: '1.0 – 2.0',                      result: '1.5',                       status: 'Pass' },
        { parameter: 'pH (5% working bath, 25 °C)',   method: 'pH Electrode',     specification: '1.5 – 2.5',                      result: '2.0',                       status: 'Pass' },
        { parameter: 'Density (25 °C)',               method: 'ISO 2811',         specification: '1.12 – 1.18 g/mL',              result: '1.15 g/mL',                 status: 'Pass' },
        { parameter: 'Free Acid (as H₃PO₄)',          method: 'NaOH Titration',   specification: '18 – 24 % w/v',                  result: '21.1 % w/v',                status: 'Pass' },
        { parameter: 'Rust Removal (5%, 40°C, 10min)', method: 'Internal IM-004', specification: '≥ 95 %',                         result: '98.2 %',                    status: 'Pass' },
        { parameter: 'Foam Level (working bath)',      method: 'DIN 53902',        specification: '< 10 mL',                        result: '4 mL',                      status: 'Pass' },
      ],
      statement: 'We hereby certify that the above batch of UNISOLVE H3 has been manufactured, tested, and inspected in accordance with our internal quality specifications. All parameters conform to the product specification and the product is approved for release.',
      approvals: {
        preparedBy: 'Quality Analyst — Macro Coats',
        reviewedBy: 'QC Manager — Macro Coats',
        approvedBy: 'Operations Head — Macro Coats',
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // UNIPASS
  // ─────────────────────────────────────────────────────────────────────────────
  {
    productKey: 'unipass',
    docType:    'tds',
    docNumber:  'TDS-UPS-001',
    revision:   'Rev 01 — May 2026',
    footer: {
      left:   'TDS-UPS-001 Rev 01 · May 2026',
      center: 'This Technical Data Sheet is for guidance only. Performance figures are typical values obtained under controlled conditions. © Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nPage 1 of 1',
    },
    body: {
      grade:       'Industrial Grade',
      description: 'UNIPASS is an aqueous passivation treatment formulated for post-phosphating application on ferrous metal surfaces. The product combines a citric acid chelating system with sodium nitrite corrosion inhibitor and benzotriazole (BTA) film former to produce a dense, stable passivation layer that significantly enhances the corrosion resistance of phosphated surfaces. UNIPASS is designed for spray or dip application immediately following the phosphating and rinse stages, and is compatible with subsequent painting, powder coating, and electrocoat processes.',
      sections: {
        features: [
          { head: 'Post-Phosphating Passivation',   body: 'Seals and stabilises zinc or iron phosphate conversion coatings — extends the corrosion protection window and improves topcoat adhesion' },
          { head: 'Dual-Mechanism Inhibition',       body: 'Citric acid chelation combined with sodium nitrite delivers anodic passivation; BTA provides supplementary film-forming protection on copper-containing alloys' },
          { head: 'Multi-Metal Compatible',          body: 'Safe for use on ferrous substrates and mixed-metal assemblies including copper and brass components at recommended dilutions and temperatures' },
          { head: 'Low-Concentration Efficacy',      body: 'Effective at 1–3% dilution — minimises chemical consumption and wastewater treatment load without compromising passivation quality' },
        ],
        physicalProperties: [
          { property: 'Appearance',              value: 'Clear to pale straw-yellow liquid', unit: '—',      method: 'Visual' },
          { property: 'pH (concentrate)',         value: '3.5 – 5.0',                         unit: '—',      method: 'pH electrode, 25 °C' },
          { property: 'pH (2% working bath)',     value: '4.0 – 5.5',                         unit: '—',      method: 'pH electrode, 25 °C' },
          { property: 'Density',                 value: '~1.02',                              unit: 'g/mL',   method: 'ISO 2811' },
          { property: 'Working Concentration',    value: '1 – 3',                              unit: '% v/v',  method: 'Titration / pH control' },
          { property: 'Working Temperature',      value: '30 – 60',                            unit: '°C',     method: '—' },
          { property: 'Treatment Time',           value: '1 – 3',                              unit: 'min',    method: 'Process qualification' },
          { property: 'Flash Point',              value: 'None (aqueous)',                     unit: '—',      method: 'ASTM D93' },
        ],
        composition: [
          { name: 'Organic chelating acid',           function: 'Passivation initiator and metal surface conditioner',          percent: '<5%',     compat: 'Zinc and iron phosphate coatings' },
          { name: 'Oxidising corrosion inhibitor',    function: 'Anodic passivation layer former',                              percent: '5–10%',   compat: 'Ferrous substrates' },
          { name: 'Heterocyclic film former',         function: 'Copper and brass corrosion inhibitor and film-forming agent',  percent: '<1%',     compat: 'Mixed-metal assemblies' },
          { name: 'Water',                            function: 'Carrier / solvent',                                            percent: 'Balance', compat: '—' },
        ],
        application: [
          { step: '1', name: 'Phosphating Stage',   param: 'As per process specification',               value: '40–60 °C' },
          { step: '2', name: 'Water Rinse',         param: 'Tap water overflow rinse post-phosphating',  value: 'Ambient, 2 × rinse' },
          { step: '3', name: 'UNIPASS Bath',        param: '1–3% v/v, pH 4.0–5.5',                      value: '30–60 °C, 1–3 min' },
          { step: '4', name: 'DI Water Rinse',      param: 'Deionised water final rinse',                value: 'Ambient' },
          { step: '5', name: 'Topcoat / Drying',   param: 'Paint / powder coat / e-coat as required',   value: 'As required' },
        ],
        packaging: [
          { size: '30',  unit: 'L',  type: 'HDPE jerrycan' },
          { size: '200', unit: 'L',  type: 'HDPE barrel / drum' },
        ],
        performance: [
          { label: 'Salt spray (uncoated phosphated steel)',  val: '>48 h at 2%, 45 °C, 2 min passivation' },
          { label: 'Flash rust protection (post-rinse)',       val: '>4 h at ambient humidity' },
          { label: 'Copper corrosion (BTA film test)',         val: 'Pass at 1% (visual, 24 h immersion)' },
          { label: 'Coating adhesion (ISO 2409)',              val: 'Consistent Gt0 crosshatch result' },
        ],
        safetyNote: 'Contains sodium nitrite — do not mix with strong acids at concentrate level (risk of nitrogen oxide release). Avoid ingestion. Refer to the current MSDS (SDS-UPS-001) for full hazard information and PPE requirements.',
      },
    },
  },

  {
    productKey: 'unipass',
    docType:    'msds',
    docNumber:  'SDS-UPS-001',
    revision:   'Rev 01 — May 2026',
    footer: {
      left:   'SDS-UPS-001 Rev 01 · May 2026',
      center: 'This Safety Data Sheet is provided in good faith based on current knowledge. © Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nGHS Rev 9 Compliant · Page 1 of 1',
    },
    body: {
      signalWord: 'Warning',
      sections: {
        identification: {
          productType:  'Aqueous passivation treatment for post-phosphating application on ferrous metal surfaces',
          intendedUse:  'Post-phosphating passivation to enhance corrosion resistance of conversion coatings prior to topcoat application',
          manufacturer: 'Macro Coats Pvt Ltd, Chennai, Tamil Nadu, India',
          emergency:    'AIIMS Poison Control: 1800-11-6117 (Toll-Free)',
        },
        hazards: {
          pictograms:      ['oxidiser', 'irritant', 'environment'],
          classifications: [
            { class: 'Oxidising Liquids',                       category: 'Cat 3',       tagType: 'warn' },
            { class: 'Skin Irritation',                         category: 'Cat 2',       tagType: 'warn' },
            { class: 'Eye Irritation',                          category: 'Cat 2A',      tagType: 'warn' },
            { class: 'Hazardous to Aquatic Environment',        category: 'Chronic Cat 3', tagType: 'warn' },
          ],
          hStatements: 'H272 — May intensify fire; oxidiser. H302 — Harmful if swallowed. H315 — Causes skin irritation. H319 — Causes serious eye irritation. H412 — Harmful to aquatic life with long lasting effects.',
          pStatements: 'P210 · P260 · P264 · P273 · P280 · P305+P351+P338 · P337+P313 · P501',
        },
        composition: {
          ingredients: [
            { name: 'Organic chelating acid',           description: 'Passivation initiator and metal surface conditioner',           percent: '<5%',     ghsClass: 'Irritant',      tagType: 'warn' },
            { name: 'Oxidising corrosion inhibitor salt', description: 'Anodic passivation agent — water-soluble oxidising salt',       percent: '5–10%',   ghsClass: 'Oxidiser',      tagType: 'warn' },
            { name: 'Heterocyclic corrosion inhibitor', description: 'Film-forming agent for copper and mixed-metal protection',       percent: '<1%',     ghsClass: 'Irritant',      tagType: 'warn' },
            { name: 'Water / aqueous carrier',          description: 'Carrier / solvent — major component',                           percent: 'Balance', ghsClass: 'Non-hazardous', tagType: 'safe' },
          ],
          note: 'Exact formulation is proprietary. Functional ingredient descriptions are provided for safety and emergency purposes only.',
        },
        firstAid: {
          eyes:       'Rinse with running water for ≥15 min holding eyelids open. If irritation or redness persists, seek medical attention.',
          skin:       'Wash with soap and water. Remove contaminated clothing. If irritation or rash develops, seek medical attention.',
          inhalation: 'Move to fresh air. If irritation or breathing difficulty persists, seek medical attention.',
          ingestion:  'Rinse mouth with water. Do NOT induce vomiting. Call AIIMS Poison Control: 1800-11-6117 immediately — sodium nitrite content requires prompt medical evaluation.',
          warning:    '⚠ Sodium nitrite can form methaemoglobin if ingested in quantity — always seek medical attention following any ingestion incident.',
        },
        fireFighting: {
          flammability:       'Not flammable (aqueous solution)',
          extinguishingMedia: 'Water spray or foam; avoid dry powder near oxidising material',
          fireHazard:         'Sodium nitrite component may intensify fire in contact with combustible materials at elevated temperatures; thermal decomposition may release nitrogen oxide fumes',
          ppe:                'SCBA and chemical-resistant full-body protective clothing',
        },
        accidentalRelease: [
          'Evacuate non-essential personnel; ensure adequate ventilation',
          'Wear chemical goggles, nitrile gloves, and chemical apron',
          'Do not mix spill material with combustible substances',
          'Contain spill with inert absorbent material (dry sand, vermiculite)',
          'Prevent runoff from entering drains, waterways, or soil',
          'Collect in sealed labelled HDPE containers for disposal',
          'Dispose per local CPCB/SPCB guidelines (HWM Rules 2016)',
        ],
        handling: {
          handling:     'Avoid contact with skin, eyes, and clothing. Handle in well-ventilated area. Do not mix with strong acids at high concentration — risk of nitrogen oxide release from sodium nitrite component.',
          storageTemp:  '10 °C – 35 °C; cool, dry, ventilated store away from combustible materials and strong acids',
          containers:   'Sealed HDPE or polypropylene containers',
          segregation:  'Store separately from strong acids, combustible materials, and reducing agents',
          shelfLife:    '18 months from date of manufacture in original sealed containers',
        },
        exposure: {
          ppeItems:    ['Chemical Goggles', 'Nitrile Gloves', 'Chemical Apron', 'Rubber Boots', 'Face Shield (spray application)'],
          engineering: 'Adequate general ventilation. Eyewash station within 10 seconds of handling point.',
        },
        physical: [
          { key: 'Appearance',    val: 'Clear to pale straw-yellow liquid' },
          { key: 'Odour',         val: 'Faint mild odour' },
          { key: 'pH (conc.)',    val: '3.5 – 5.0' },
          { key: 'Density',       val: '~1.02 g/mL' },
          { key: 'Flash Point',   val: 'None (aqueous)' },
          { key: 'Boiling Point', val: '~101 °C' },
          { key: 'Solubility',    val: 'Fully miscible with water' },
          { key: 'Viscosity',     val: 'Low (water-like)' },
        ],
        stability: {
          stability:      'Stable under recommended storage conditions when kept away from strong acids and combustibles',
          avoid:          'Strong acids (risk of nitrogen oxide from sodium nitrite), combustible materials, heat above 60 °C',
          decomposition:  'Thermal decomposition of sodium nitrite above 320 °C may release nitrogen oxide fumes',
          polymerisation: 'Will not occur',
        },
        sections11to16: {
          'Skin / Eye': 'H315 skin irritation / H319 eye irritation at working concentrations. Flush affected area with water promptly.',
          Aquatic:      'H412 — sodium nitrite is harmful to aquatic organisms with long-term effects. Avoid discharge to waterways; dilute to <0.1% before disposal.',
          Disposal:     'Dilute to safe concentration before disposal. Dispose per CPCB/SPCB norms (E.P. Act 1986).',
          Regulatory:   'MSIHC Rules 1989 · Factories Act 1948 · HWM Rules 2016 · GHS Rev 9',
          'Other Info': 'SDS Rev 01 issued May 2026. Next review: May 2028 or upon formulation change.',
        },
      },
    },
  },

  {
    productKey: 'unipass',
    docType:    'formula',
    docNumber:  'FRM-UPS-001',
    revision:   'Rev 01 — May 2026',
    footer: {
      left:   'FRM-UPS-001 Rev 01 · May 2026',
      center: 'CONFIDENTIAL — This formulation sheet is the proprietary information of Macro Coats Pvt Ltd. Unauthorised reproduction or disclosure is prohibited.',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nPage 1 of 1',
    },
    body: {
      classification:     'CONFIDENTIAL — Internal Use Only',
      batchSize:          '136.7 L (reference)',
      formulaType:        'liquid',
      referenceBatchSize: 136.7,
      batchUnit:          'L',
      totalActivePercent: 9.36,
      overview: 'UNIPASS is an aqueous passivation treatment for post-phosphating application on ferrous metal surfaces. The formulation combines citric acid (chelating passivation initiator), sodium nitrite (anodic corrosion inhibitor), and BTA/benzotriazole (film-forming copper inhibitor) in a DI/RO water carrier. Passivation is applied immediately after the final phosphating rinse to seal and stabilise the conversion coating.',
      composition: [
        { srNo: 1, name: 'Citric Acid',          casNo: '77-92-9',    baseQty: 4.37,  unit: 'kg', percentWV: 3.20,  function: 'Chelating agent / mild passivation initiator',           density: null, unitPrice: 110  },
        { srNo: 2, name: 'Sodium Nitrite',        casNo: '7632-00-0',  baseQty: 7.65,  unit: 'kg', percentWV: 5.60,  function: 'Corrosion inhibitor / anodic passivation agent',          density: null, unitPrice: 65   },
        { srNo: 3, name: 'BTA (Benzotriazole)',   casNo: '95-14-7',    baseQty: 0.77,  unit: 'kg', percentWV: 0.56,  function: 'Copper corrosion inhibitor / film former',                density: null, unitPrice: 850  },
        { srNo: 4, name: 'Water (DI/RO)',         casNo: '7732-18-5',  baseQty: 123.9, unit: 'L',  percentWV: 90.64, function: 'Base medium / carrier',                                  density: 1.0,  unitPrice: 0.5  },
      ],
      preparation: [
        { step: 1, title: 'Safety Setup',            detail: 'Ensure working area is well-ventilated. Wear nitrile gloves, chemical goggles, and apron. Note: sodium nitrite — do not handle near strong acids or open flames.' },
        { step: 2, title: 'Water Charging',           detail: 'Add 108–112 L of DI/RO water to a clean HDPE mixing tank. Begin gentle agitation.' },
        { step: 3, title: 'Sodium Nitrite Addition',  detail: 'Slowly add Sodium Nitrite (7.65 kg) to the water with continuous stirring until fully dissolved (~10 min). Solution may warm slightly.' },
        { step: 4, title: 'Citric Acid Addition',     detail: 'Add Citric Acid (4.37 kg) with stirring until completely dissolved. Monitor pH — concentrate should read 3.5–5.0.' },
        { step: 5, title: 'BTA Addition',             detail: 'Add BTA/Benzotriazole (0.77 kg) with stirring. BTA may require 15–20 min to fully dissolve at ambient temperature; light warming to 35–40 °C accelerates dissolution.' },
        { step: 6, title: 'Top Up & Homogenise',      detail: 'Add remaining DI/RO water to bring total batch volume to exactly 136.7 L (total water: 123.9 L). Mix for 10 minutes to ensure full homogeneity.' },
        { step: 7, title: 'QC Check & Fill',          detail: 'Verify pH (3.5–5.0 concentrate), appearance (clear to pale straw-yellow), and density (~1.02 g/mL). Record batch number, date, and operator sign-off before filling into labelled HDPE containers.' },
      ],
      operatingConditions: [
        { param: 'Bath Concentration',    value: '1 – 3 % v/v' },
        { param: 'Operating Temperature', value: '30 – 60 °C' },
        { param: 'Bath pH',               value: '4.0 – 5.5 (at working dilution)' },
        { param: 'Treatment Time',        value: '1 – 3 minutes' },
        { param: 'Application Method',    value: 'Spray wash or dip — immediately after final phosphating rinse' },
      ],
      applications: {
        removes:    ['Post-phosphating surface contamination', 'Residual rinse salts', 'Loose phosphate particles'],
        usedBefore: ['Painting / liquid coat', 'Powder coating', 'Electrocoat (e-coat)', 'KTL / cathodic dip'],
      },
    },
  },

  {
    productKey: 'unipass',
    docType:    'label',
    docNumber:  'LBL-UPS-001',
    revision:   'Rev 01 — May 2026',
    footer: { left: '', center: '', right: '' },
    body: {
      signalWord: 'WARNING',
      unNo: 'N/A',
      hCodes: [
        { code: 'H272', text: 'May intensify fire; oxidiser' },
        { code: 'H302', text: 'Harmful if swallowed' },
        { code: 'H412', text: 'Harmful to aquatic life with long lasting effects' },
      ],
      pCodes: [
        { code: 'P210',            text: 'Keep away from heat, hot surfaces, sparks, and open flames' },
        { code: 'P260',            text: 'Do not breathe mist or vapour' },
        { code: 'P273',            text: 'Avoid release to the environment' },
        { code: 'P280',            text: 'Wear protective gloves and eye protection' },
        { code: 'P501',            text: 'Dispose of contents/container per local regulations (CPCB)' },
      ],
      firstAid: {
        skin:       'Wash with soap and water. Remove contaminated clothing. Seek medical attention if irritation persists.',
        eyes:       'Rinse with water for ≥15 min. Seek medical attention if irritation persists.',
        ingestion:  'Rinse mouth. Do NOT induce vomiting. Call 1800-11-6117 immediately — sodium nitrite ingestion requires medical attention.',
        inhalation: 'Move to fresh air. Seek medical attention if breathing discomfort persists.',
      },
      directions: [
        'Dilute 1–3% in DI/RO water before use',
        'Apply at 30–60 °C by spray or dip immediately after phosphating rinse',
        'Allow 1–3 min contact time',
        'Final rinse with DI water before topcoat application',
      ],
      storage:  ['Store at 10°C – 35°C', 'Keep away from strong acids and combustibles', 'Keep container sealed and upright', 'Keep away from children', 'Dispose per CPCB regulations'],
      products: ['UNIPASS', 'UNIKOAT LT 700', 'UNIKLEAN SP', 'UNIKLEAN FE'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CoA — UNIPASS
  // ─────────────────────────────────────────────────────────────────────────────
  {
    productKey: 'unipass',
    docType:    'coa',
    docNumber:  'COA-UPS-001',
    revision:   'Rev 01 — May 2026',
    footer: {
      left:   'COA-UPS-001 Rev 01 · May 2026',
      center: 'CONFIDENTIAL — For authorised recipients only · Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India',
    },
    body: {
      batchNumber:    'UPS-20260506-001',
      batchSize:      '100 L',
      productionDate: '06 May 2026',
      expiryDate:     'May 2027',
      grade:          'Industrial Grade',
      appearance:     'Clear to pale straw-yellow liquid',
      tests: [
        { parameter: 'Appearance',                        method: 'Visual',                  specification: 'Clear to pale straw-yellow liquid', result: 'Clear, pale straw-yellow',    status: 'Pass' },
        { parameter: 'pH (Concentrate, 25 °C)',           method: 'pH Electrode',             specification: '3.5 – 5.0',                        result: '4.2',                         status: 'Pass' },
        { parameter: 'pH (2% working bath, 25 °C)',       method: 'pH Electrode',             specification: '4.0 – 5.5',                        result: '4.8',                         status: 'Pass' },
        { parameter: 'Density (25 °C)',                   method: 'ISO 2811',                 specification: '1.00 – 1.05 g/mL',                 result: '1.02 g/mL',                   status: 'Pass' },
        { parameter: 'Sodium Nitrite Content',            method: 'Titration (KMnO₄)',         specification: '5.0 – 6.2 % w/v',                  result: '5.6 % w/v',                   status: 'Pass' },
        { parameter: 'Flash Rust Protection (2%, 45°C, 2 min)', method: 'Internal QM-012',   specification: '≥ 48 h',                            result: '52 h',                        status: 'Pass' },
        { parameter: 'Appearance after treatment',        method: 'Visual',                  specification: 'Uniform — no staining or discolouration', result: 'Uniform — no staining', status: 'Pass' },
      ],
      statement: 'We hereby certify that the above batch of UNIPASS has been manufactured, tested, and inspected in accordance with our internal quality specifications. All parameters conform to the product specification and the product is approved for release.',
      approvals: {
        preparedBy: 'Quality Analyst — Macro Coats',
        reviewedBy: 'QC Manager — Macro Coats',
        approvedBy: 'Operations Head — Macro Coats',
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // UNIKTONNER
  // ─────────────────────────────────────────────────────────────────────────────
  {
    productKey: 'uniktonner',
    docType:    'tds',
    docNumber:  'TDS-UTN-001',
    revision:   'Rev 01 — May 2026',
    footer: {
      left:   'TDS-UTN-001 Rev 01 · May 2026',
      center: 'This Technical Data Sheet is for guidance only. Performance figures are typical values obtained under controlled conditions. © Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nPage 1 of 1',
    },
    body: {
      grade:       'Industrial Grade',
      description: 'UNIKTONNER is a high-concentration sodium nitrite accelerator solution formulated for use as a tonnage additive in zinc and iron phosphating baths. It significantly accelerates the phosphating reaction by providing an oxidising environment that suppresses hydrogen evolution, increases coating weight, and improves bath throughput for high-volume production lines. The product is supplied as a ready-to-dose aqueous solution compatible with all standard phosphating chemistries.',
      sections: {
        features: [
          { head: 'High-Active Accelerator',   body: '~33% w/v sodium nitrite active content provides powerful oxidising acceleration for fast, consistent phosphating across high-tonnage production lines' },
          { head: 'Improved Coating Weight',   body: 'Accelerates nucleation and growth of the phosphate crystal layer, producing denser coatings with better corrosion protection and paint adhesion' },
          { head: 'Hydrogen Suppression',      body: 'Oxidising action suppresses hydrogen evolution at the metal surface, reducing porosity and pitting in the conversion coating' },
          { head: 'Easy Dosing',               body: 'Supplied as a liquid concentrate — no pre-dissolving required; dose directly into the phosphating bath at 2–5% by volume' },
          { head: 'Bath Compatible',           body: 'Compatible with zinc phosphating, iron phosphating, and manganese phosphating baths; does not disturb pH or free acid balance at recommended dosages' },
        ],
        physicalProperties: [
          { property: 'Appearance',             value: 'Clear to pale yellow solution',  unit: '—',     method: 'Visual' },
          { property: 'pH (neat, 25 °C)',        value: '8.5 – 9.5',                     unit: '—',     method: 'pH electrode' },
          { property: 'Density (25 °C)',         value: '~1.26 – 1.32',                  unit: 'g/mL',  method: 'ISO 2811' },
          { property: 'Active Content (NaNO₂)', value: '~33.3',                          unit: '% w/v', method: 'KMnO₄ titration' },
          { property: 'Flash Point',             value: 'None (aqueous)',                unit: '—',     method: 'ASTM D93' },
          { property: 'Boiling Point',           value: '~103',                          unit: '°C',    method: '—' },
          { property: 'Solubility',              value: 'Fully miscible with water',     unit: '—',     method: '—' },
          { property: 'Dosage Rate',             value: '2 – 5',                         unit: '% v/v', method: 'Bath titration / throughput' },
        ],
        composition: [
          { name: 'Oxidising accelerator salt', function: 'Phosphating bath accelerator — oxidising agent', percent: '30–37%',  compat: 'All phosphating baths at working dilution' },
          { name: 'Water (aqueous carrier)',     function: 'Solvent / carrier',                              percent: 'Balance', compat: '—' },
        ],
        application: [
          { step: '1', name: 'Initial charge', param: 'Add 2–5% UNIKTONNER to fresh or topped-up phosphating bath',           value: 'Start at 2%; increase to 5% for high-tonnage runs' },
          { step: '2', name: 'Maintain level', param: 'Monitor bath by titration; top up UNIKTONNER as nitrite is consumed',   value: 'Target: 0.5–1.5 g/L NaNO₂ in working bath' },
          { step: '3', name: 'Process',        param: 'Operate phosphating bath at normal temperature and contact time',      value: 'Zinc: 45–60 °C; Iron: 60–80 °C' },
          { step: '4', name: 'Rinse',          param: 'Rinse parts with fresh water after phosphating',                       value: '2 × rinse, ambient' },
          { step: '5', name: 'Next stage',     param: 'Passivation / DI rinse / topcoat as per process specification',       value: 'As required' },
        ],
        packaging: [
          { size: '30',  unit: 'L',  type: 'HDPE jerrycan / carboy' },
          { size: '200', unit: 'KG', type: 'HDPE barrel / drum' },
        ],
        performance: [
          { label: 'Bath life extension',   val: 'Reduces sludge by suppressing hydrogen pitting; extends bath replacement interval' },
          { label: 'Coating uniformity',    val: 'Consistent coating weight across complex geometries — holes, recesses, and blind areas' },
          { label: 'Throughput improvement', val: 'Up to 30–40% increase in parts-per-hour compared to unaccelerated baths at same temperature' },
        ],
        safetyNote: 'UNIKTONNER contains sodium nitrite — an oxidising agent. Do not mix with acids, combustible materials, or reducing agents. Wear chemical goggles, nitrile gloves, and a chemical apron when handling. Store in cool, dry, well-ventilated area away from heat, acids, and combustibles. See SDS-UTN-001 for full safety information.',
      },
    },
  },

  {
    productKey: 'uniktonner',
    docType:    'msds',
    docNumber:  'SDS-UTN-001',
    revision:   'Rev 01 — May 2026',
    footer: {
      left:   'SDS-UTN-001 Rev 01 · May 2026',
      center: 'This Safety Data Sheet is provided in good faith based on current knowledge. © Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nGHS Rev 9 Compliant · Page 1 of 1',
    },
    body: {
      signalWord: 'Danger',
      sections: {
        identification: {
          productType:  'Aqueous sodium nitrite accelerator solution for zinc and iron phosphating baths',
          intendedUse:  'Tonnage additive / accelerator for phosphating baths; increases coating weight and bath throughput',
          manufacturer: 'Macro Coats Pvt Ltd, Chennai, Tamil Nadu, India',
          emergency:    'AIIMS Poison Control: 1800-11-6117 (Toll-Free)',
        },
        hazards: {
          pictograms:      ['oxidiser', 'skull', 'environment'],
          classifications: [
            { class: 'Oxidising Liquids',                       category: 'Cat 2',         tagType: 'danger' },
            { class: 'Acute Oral Toxicity',                     category: 'Cat 4',         tagType: 'warn'   },
            { class: 'Hazardous to Aquatic Environment (Acute)', category: 'Cat 1',        tagType: 'danger' },
            { class: 'Hazardous to Aquatic Environment (Chronic)', category: 'Cat 2',      tagType: 'warn'   },
          ],
          hStatements: 'H272 — May intensify fire; oxidiser. H302 — Harmful if swallowed. H400 — Very toxic to aquatic life. H411 — Toxic to aquatic life with long lasting effects.',
          pStatements: 'P210 · P220 · P260 · P264 · P270 · P273 · P280 · P301+P312 · P330 · P391 · P501',
        },
        composition: {
          ingredients: [
            { name: 'Oxidising accelerator salt', description: 'Phosphating bath accelerator — oxidising agent', percent: '30–37%',  ghsClass: 'Oxidiser / Acute Tox Cat 4', tagType: 'danger' },
            { name: 'Water (aqueous carrier)',     description: 'Solvent / carrier — major component',           percent: 'Balance', ghsClass: 'Non-hazardous',              tagType: 'safe'   },
          ],
          note: 'Exact formulation is proprietary. Functional ingredient descriptions are provided for safety and emergency purposes only.',
        },
        firstAid: {
          eyes:       'Rinse immediately with running water for ≥15 min holding eyelids open. Seek medical attention if redness or irritation persists.',
          skin:       'Wash thoroughly with soap and water. Remove contaminated clothing and wash before reuse. Seek medical attention if irritation develops.',
          inhalation: 'Move to fresh air. If breathing is difficult or irritation persists, seek medical attention immediately.',
          ingestion:  'Rinse mouth with water. Do NOT induce vomiting. Call AIIMS Poison Control: 1800-11-6117 immediately — sodium nitrite can cause methaemoglobinaemia even in moderate doses.',
          warning:    '⚠ Sodium nitrite ingestion is a medical emergency — causes methaemoglobinaemia. Seek immediate hospital treatment.',
        },
        fireFighting: {
          flammability:       'Not flammable (aqueous solution)',
          extinguishingMedia: 'Water spray, foam; avoid dry powder which may spread burning material',
          fireHazard:         'Sodium nitrite is an oxidising agent and may intensify fire in contact with combustible materials; thermal decomposition above 320 °C releases toxic nitrogen oxide fumes',
          ppe:                'SCBA and full chemical-resistant protective clothing; do not breathe combustion gases',
        },
        accidentalRelease: [
          'Evacuate non-essential personnel and ensure adequate ventilation',
          'Wear chemical goggles, nitrile gloves, chemical apron, and rubber boots',
          'Do NOT allow spill material to contact combustible materials, reducing agents, or acids',
          'Contain spill with inert absorbent material (dry sand, vermiculite, earth)',
          'Prevent runoff from entering drains, waterways, or soil — acutely toxic to aquatic organisms',
          'Collect in sealed labelled HDPE containers for authorised disposal',
          'Dispose per CPCB/SPCB guidelines (HWM Rules 2016)',
        ],
        handling: {
          handling:     'Avoid contact with skin, eyes, and clothing. Handle in well-ventilated area. Do not mix with strong acids (risk of toxic nitrogen oxide gas), combustible materials, ammonium salts, or reducing agents.',
          storageTemp:  '10 °C – 35 °C; cool, dry, well-ventilated store away from combustibles, heat sources, and acids',
          containers:   'Sealed HDPE or polypropylene containers; keep tightly closed when not in use',
          segregation:  'Store separately from acids, combustibles, reducing agents, ammonium compounds, and foodstuffs',
          shelfLife:    '24 months from date of manufacture in original sealed containers',
        },
        exposure: {
          ppeItems:    ['Chemical Goggles', 'Nitrile Gloves (≥0.3 mm)', 'Chemical Apron', 'Rubber Boots', 'Face Shield (when splashing risk)'],
          engineering: 'Adequate general ventilation. Eyewash station within 10 seconds of handling point. Safety shower recommended for bulk handling.',
        },
        physical: [
          { key: 'Appearance',    val: 'Clear to pale yellow solution' },
          { key: 'Odour',         val: 'Odourless to faint mild odour' },
          { key: 'pH (neat)',     val: '8.5 – 9.5' },
          { key: 'Density',       val: '~1.26 – 1.32 g/mL' },
          { key: 'Flash Point',   val: 'None (aqueous)' },
          { key: 'Boiling Point', val: '~103 °C' },
          { key: 'Solubility',    val: 'Fully miscible with water' },
          { key: 'Viscosity',     val: 'Low (water-like)' },
        ],
        stability: {
          stability:      'Stable under recommended storage conditions; keep away from heat, acids, and combustible materials',
          avoid:          'Strong acids (risk of toxic NO gas), combustible materials, reducing agents, ammonium compounds, heat above 60 °C',
          decomposition:  'Thermal decomposition of sodium nitrite above 320 °C releases nitrogen oxide fumes (NOx); slow decomposition in acidic conditions',
          polymerisation: 'Will not occur',
        },
        sections11to16: {
          'Toxicology':  'Sodium nitrite — LD50 oral (rat): 85 mg/kg. Causes methaemoglobinaemia on significant ingestion. No evidence of carcinogenicity at normal industrial exposure levels.',
          'Aquatic':     'H400/H411 — acutely very toxic to aquatic organisms. Prevent any release to drains or waterways. Dilute extensively before disposal to approved trade effluent system.',
          'Disposal':    'Dilute to <0.5% before disposal. Dispose per CPCB/SPCB norms (E.P. Act 1986, HWM Rules 2016). Do not dispose of to drains without authorised treatment.',
          'Regulatory':  'MSIHC Rules 1989 · Factories Act 1948 · HWM Rules 2016 · GHS Rev 9',
          'Other Info':  'SDS Rev 01 issued May 2026. Next review: May 2028 or upon formulation change.',
        },
      },
    },
  },

  {
    productKey: 'uniktonner',
    docType:    'formula',
    docNumber:  'FRM-UTN-001',
    revision:   'Rev 01 — May 2026',
    footer: {
      left:   'FRM-UTN-001 Rev 01 · May 2026',
      center: 'CONFIDENTIAL — This formulation sheet is the proprietary information of Macro Coats Pvt Ltd. Unauthorised reproduction or disclosure is prohibited.',
      right:  'Macro Coats Pvt Ltd · Chennai · India\nPage 1 of 1',
    },
    body: {
      classification:     'CONFIDENTIAL — Internal Use Only',
      batchSize:          '150 (50 kg NaNO₂ + 100 L water)',
      formulaType:        'liquid',
      referenceBatchSize: 150,
      batchUnit:          'L',
      totalActivePercent: 33.3,
      overview: 'UNIKTONNER is a sodium nitrite accelerator solution for phosphating baths. The formulation is a simple two-component aqueous system: sodium nitrite dissolved in purified water. It is supplied as a ready-to-use liquid concentrate dosed directly into the phosphating bath at 2–5% v/v to maintain nitrite accelerator levels for optimal throughput and coating quality.',
      composition: [
        { srNo: 1, name: 'Sodium Nitrite',  casNo: '7632-00-0', baseQty: 50,  unit: 'kg', percentWV: 33.3, function: 'Phosphating accelerator / oxidising agent — suppresses hydrogen evolution, increases coating weight and bath throughput', density: null, unitPrice: 0 },
        { srNo: 2, name: 'Water (DI/RO)',   casNo: '7732-18-5', baseQty: 100, unit: 'L',  percentWV: null, function: 'Aqueous carrier / base medium',                                                                                         density: 1.0,  unitPrice: 0 },
      ],
      preparation: [
        { step: 1, title: 'Safety Setup',          detail: 'Ensure working area is well-ventilated. Wear nitrile gloves, chemical goggles, and apron. Sodium nitrite is an oxidising agent — keep away from combustibles, acids, and reducing agents during mixing.' },
        { step: 2, title: 'Water Charging',         detail: 'Add 90 L of DI/RO water to a clean HDPE mixing vessel. Do NOT use metallic containers.' },
        { step: 3, title: 'Sodium Nitrite Addition', detail: 'Slowly add 50 kg of Sodium Nitrite crystals/powder to the water with continuous stirring. Addition should be gradual — the dissolution is slightly exothermic. Stir until fully dissolved (~15–20 min). Do NOT reverse order (do not add water to solid sodium nitrite in a closed vessel).' },
        { step: 4, title: 'Top Up to Volume',       detail: 'Add remaining DI/RO water to bring total water charge to exactly 100 L. Mix for a further 10 minutes to ensure uniform concentration throughout.' },
        { step: 5, title: 'QC Check & Fill',        detail: 'Verify active content by KMnO₄ titration (target: 31–35% w/v NaNO₂), pH (8.5–9.5 neat), and density (~1.26 – 1.32 g/mL). Record batch number, date, and operator. Fill into sealed, labelled HDPE carboys.' },
      ],
      operatingConditions: [
        { param: 'Dosage in Phosphating Bath', value: '2 – 5 % v/v' },
        { param: 'Nitrite Level in Bath',       value: '0.5 – 1.5 g/L NaNO₂ (maintain by titration)' },
        { param: 'Compatible Bath Types',       value: 'Zinc phosphating, iron phosphating, manganese phosphating' },
        { param: 'Bath Temperature',            value: '45 – 80 °C (as per phosphating specification)' },
        { param: 'Monitoring',                  value: 'Check nitrite level every 2–4 hours on high-tonnage lines; top up as consumed' },
      ],
      applications: {
        removes:    ['Hydrogen evolution from metal surface', 'Inconsistent coating weight', 'Slow phosphating reaction rates', 'Porous or patchy conversion coating'],
        usedBefore: ['Powder coating', 'Painting / liquid coat', 'Electrocoat (e-coat)', 'KTL / cathodic dip'],
      },
    },
  },

  {
    productKey: 'uniktonner',
    docType:    'label',
    docNumber:  'LBL-UTN-001',
    revision:   'Rev 01 — May 2026',
    footer: {
      left:   'LBL-UTN-001 · May 2026',
      center: 'UNIKTONNER — GHS Label',
      right:  'Macro Coats Pvt Ltd · Chennai · India',
    },
    body: {
      signalWord: 'DANGER',
      unNo: 'UN 1500',
      hCodes: [
        { code: 'H272', text: 'May intensify fire; oxidiser' },
        { code: 'H302', text: 'Harmful if swallowed' },
        { code: 'H400', text: 'Very toxic to aquatic life' },
        { code: 'H411', text: 'Toxic to aquatic life with long lasting effects' },
      ],
      pCodes: [
        { code: 'P210',      text: 'Keep away from heat and ignition sources' },
        { code: 'P220',      text: 'Keep away from combustible materials' },
        { code: 'P260',      text: 'Do not breathe vapours or mist' },
        { code: 'P270',      text: 'Do not eat, drink or smoke when using this product' },
        { code: 'P273',      text: 'Avoid release to the environment' },
        { code: 'P280',      text: 'Wear protective gloves, eye protection and face protection' },
        { code: 'P301+P312', text: 'If swallowed and you feel unwell, call a doctor immediately' },
        { code: 'P391',      text: 'Collect spillage' },
        { code: 'P501',      text: 'Dispose of contents per CPCB/SPCB regulations' },
      ],
      firstAid: {
        skin:       'Wash thoroughly with soap and water. Remove contaminated clothing.',
        eyes:       'Rinse with running water for ≥15 min. Seek medical attention.',
        ingestion:  'Do NOT induce vomiting. MEDICAL EMERGENCY — sodium nitrite can cause methaemoglobinaemia. Call 1800-11-6117 immediately.',
        inhalation: 'Move to fresh air. Seek medical attention if symptoms persist.',
      },
      directions: [
        'Dose 2–5% by volume into phosphating bath',
        'Monitor bath nitrite level by titration — maintain 0.5–1.5 g/L',
        'Do NOT mix with acids or reducing agents',
        'Handle in well-ventilated area with full PPE',
      ],
      storage:  ['Store at 10°C – 35°C', 'Keep away from heat, acids, and combustibles', 'Keep container tightly sealed', 'Keep away from children', 'Dispose per CPCB/SPCB regulations'],
      products: ['UNIKTONNER', 'UNIKOAT LT 700', 'UNIPASS', 'UNIKLEAN FE'],
    },
  },

  {
    productKey: 'uniktonner',
    docType:    'coa',
    docNumber:  'COA-UTN-001',
    revision:   'Rev 01 — May 2026',
    footer: {
      left:   'COA-UTN-001 Rev 01 · May 2026',
      center: 'CONFIDENTIAL — For authorised recipients only · Macro Coats Pvt Ltd',
      right:  'Macro Coats Pvt Ltd · Chennai · India',
    },
    body: {
      batchNumber:    'UTN-20260506-001',
      batchSize:      '100 L',
      productionDate: '06 May 2026',
      expiryDate:     'May 2028',
      grade:          'Industrial Grade',
      appearance:     'Clear to pale yellow solution',
      tests: [
        { parameter: 'Appearance',                            method: 'Visual',                   specification: 'Clear to pale yellow solution',     result: 'Clear, pale yellow',           status: 'Pass' },
        { parameter: 'pH (neat, 25 °C)',                      method: 'pH Electrode',              specification: '8.5 – 9.5',                        result: '8.9',                          status: 'Pass' },
        { parameter: 'Density (25 °C)',                       method: 'ISO 2811',                  specification: '1.26 – 1.32 g/mL',                 result: '1.29 g/mL',                    status: 'Pass' },
        { parameter: 'Active Content (NaNO₂)',                method: 'KMnO₄ Titration',           specification: '31.0 – 35.5 % w/v',                result: '33.3 % w/v',                   status: 'Pass' },
        { parameter: 'Colour',                                method: 'Visual',                   specification: 'Colourless to pale yellow',         result: 'Pale yellow',                  status: 'Pass' },
        { parameter: 'Clarity / Turbidity',                   method: 'Visual',                   specification: 'Clear, no visible precipitate',     result: 'Clear, no precipitate',        status: 'Pass' },
        { parameter: 'Phosphating Acceleration Test (45°C)',  method: 'Internal QM-018',           specification: '≥25% increase in coating weight vs. unaccelerated control', result: '31% increase', status: 'Pass' },
      ],
      statement: 'We hereby certify that the above batch of UNIKTONNER has been manufactured, tested, and inspected in accordance with our internal quality specifications. All parameters conform to the product specification and the product is approved for release.',
      approvals: {
        preparedBy: 'Quality Analyst — Macro Coats',
        reviewedBy: 'QC Manager — Macro Coats',
        approvedBy: 'Operations Head — Macro Coats',
      },
    },
  },

]

// ── Seed function ──────────────────────────────────────────────────────────────

export async function seedProducts() {
  console.log('🌱 Seeding products and documents...')

  // Insert products — skip if already exists
  let productInserted = 0
  for (const product of PRODUCTS) {
    const rows = await db
      .insert(products)
      .values(product)
      .onConflictDoNothing()
      .returning({ key: products.key })
    if (rows.length > 0) productInserted++
  }
  console.log(`   ✅ Inserted ${productInserted} new products (${PRODUCTS.length - productInserted} already existed)`)

  // Insert documents — skip if already exists
  let docInserted = 0
  for (const doc of DOCS) {
    const rows = await db
      .insert(productDocuments)
      .values({
        productKey: doc.productKey,
        docType:    doc.docType,
        docNumber:  doc.docNumber,
        revision:   doc.revision,
        body:       doc.body,
        footer:     doc.footer,
      })
      .onConflictDoNothing()
      .returning({ productKey: productDocuments.productKey })
    if (rows.length > 0) docInserted++
  }
  console.log(`   ✅ Inserted ${docInserted} new product documents (${DOCS.length - docInserted} already existed)`)
}
