import { db } from '../db/index.js'
import { products, productDocuments } from '../db/schema/index.js'

// ── Product master data ────────────────────────────────────────────────────────
const PRODUCTS = [
  { key: 'uniklean-sp',    displayName: 'UNIKLEAN-SP',    code: 'SP',  category: 'Alkaline Cleaner - Cast Iron',      subtitle: 'Industrial Surface Cleaner & Metal Conditioner',                  accentColor: '#1e6b5a' },
  { key: 'uniklean-fe',    displayName: 'UNIKLEAN-FE',    code: 'FE',  category: 'Iron-based Cleaner',                subtitle: 'Iron Phosphating & Metal Conditioning Agent',                     accentColor: '#7a3a1a' },
  { key: 'uniprotect-oil', displayName: 'UNIPROTECT OIL', code: 'UP',  category: 'Rust Preventive Oil',               subtitle: 'Water Displacing Rust Preventive',                                accentColor: '#1a4971' },
  { key: 'uniflow-ecm',    displayName: 'UNIFLOW ECM',    code: 'ECM', category: 'Corrosion Preventive Oil',          subtitle: 'Corrosion Preventive Oil — Hydrocarbon + Petroleum Sulfonate',     accentColor: '#1a5c73' },
  { key: 'unicool-al',     displayName: 'UNICool AL',     code: 'AL',  category: 'Alcohol Based Cleaner',             subtitle: 'Fast-Drying Alcohol Cleaner — Cooling & Precision Cleaning Fluid', accentColor: '#1590c2' },
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
      totalActivePercent:  17.5,
      overview: 'UNIKLEAN-SP is a heavy-duty alkaline degreasing compound formulated for industrial metal pretreatment prior to phosphating and coating processes.',
      composition: [
        { srNo: 1, name: 'Sodium Metasilicate (SMS)',         casNo: '6834-92-0',  baseQty: 5.5,  unit: 'kg', percentWV: 5.5,  function: 'Strong alkalinity, oil emulsification, corrosion protection', density: null, unitPrice: 32  },
        { srNo: 2, name: 'Soda Ash (Sodium Carbonate)',        casNo: '497-19-8',   baseQty: 5.0,  unit: 'kg', percentWV: 5.0,  function: 'Alkalinity builder and buffering',                           density: null, unitPrice: 14  },
        { srNo: 3, name: 'Trisodium Phosphate (TSP)',          casNo: '7601-54-9',  baseQty: 3.5,  unit: 'kg', percentWV: 3.5,  function: 'Builder, grease removal, water softening',                  density: null, unitPrice: 42  },
        { srNo: 4, name: 'EDTA Disodium',                     casNo: '6381-92-6',  baseQty: 0.5,  unit: 'kg', percentWV: 0.5,  function: 'Chelating agent for hardness control',                      density: null, unitPrice: 160 },
        { srNo: 5, name: 'Alphox 200 (Non-ionic Surfactant)',  casNo: '68439-50-9', baseQty: 2.0,  unit: 'kg', percentWV: 2.0,  function: 'Wetting and oil emulsification',                            density: null, unitPrice: 130 },
        { srNo: 6, name: 'Sodium Nitrite',                    casNo: '7632-00-0',  baseQty: 0.8,  unit: 'kg', percentWV: 0.8,  function: 'Flash rust inhibitor',                                      density: null, unitPrice: 48  },
        { srNo: 7, name: 'Non-silicone Defoamer',              casNo: 'Mixture',    baseQty: 0.2,  unit: 'kg', percentWV: 0.2,  function: 'Foam control',                                              density: null, unitPrice: 220 },
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
            { name: 'Paraffinic mineral oil', description: 'Carrier and film former', percent: '60–70%', ghsClass: 'Aspiration Hazard', tagType: 'danger' },
            { name: 'Petroleum sulfonate',    description: 'Corrosion inhibitor',     percent: '10–20%', ghsClass: 'Irritant',          tagType: 'warn'   },
            { name: 'Corrosion inhibitor',    description: 'Protection additives',    percent: '5–10%',  ghsClass: 'None',              tagType: 'safe'   },
          ],
          note: 'Exact formulation is proprietary.',
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
        hazards: {
          pictograms:      ['flammable', 'health', 'environment'],
          classifications: [
            { class: 'Flammable Liquid',           category: 'Cat 3', tagType: 'warn'   },
            { class: 'Aspiration Hazard',          category: 'Cat 1', tagType: 'danger' },
            { class: 'Skin Irritation',            category: 'Cat 2', tagType: 'warn'   },
            { class: 'Aquatic Toxicity (Chronic)', category: 'Cat 3', tagType: 'warn'   },
          ],
          hStatements: 'H226, H304, H315, H412',
          pStatements: 'P210 · P260 · P273 · P280 · P301+P310 · P302+P352 · P331',
        },
        firstAid: {
          skin:       'Wash with soap and water. Seek advice if irritation persists.',
          eyes:       'Flush with water for ≥15 min. Seek medical attention.',
          ingestion:  'Do NOT induce vomiting. Seek immediate medical attention.',
          inhalation: 'Move to fresh air. Seek medical attention if symptoms persist.',
          warning:    '⚠ Do NOT induce vomiting — aspiration hazard.',
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
          { name: 'Ethanol / IPA blend',    function: 'Cleaning solvent and carrier',          percent: '90–98%',  compat: 'Metals, PCBs, plastics' },
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
        firstAid: {
          skin:       'Wash with soap and water. Remove soaked clothing immediately.',
          eyes:       'Flush with running water for ≥15 min. Seek medical attention.',
          ingestion:  'Rinse mouth with water. Seek medical advice.',
          inhalation: 'Move to fresh air. If symptoms persist, seek medical attention.',
          warning:    '⚠ Highly flammable — eliminate all ignition sources.',
        },
        fireFighting: {
          flammability:       'Highly flammable liquid and vapour. Flash point 12–18 °C.',
          extinguishingMedia: 'CO₂, dry powder, alcohol-resistant foam.',
          fireHazard:         'Vapours may travel to ignition source and flashback.',
          ppe:                'SCBA and full fire-resistant clothing.',
        },
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
]

// ── Seed function ──────────────────────────────────────────────────────────────

export async function seedProducts() {
  console.log('🌱 Seeding products and documents...')

  // Upsert products
  for (const product of PRODUCTS) {
    await db
      .insert(products)
      .values(product)
      .onConflictDoUpdate({
        target: products.key,
        set: {
          displayName: product.displayName,
          code:        product.code,
          category:    product.category,
          subtitle:    product.subtitle,
          accentColor: product.accentColor,
        },
      })
  }
  console.log(`   ✅ Upserted ${PRODUCTS.length} products`)

  // Upsert documents
  let docCount = 0
  for (const doc of DOCS) {
    await db
      .insert(productDocuments)
      .values({
        productKey: doc.productKey,
        docType:    doc.docType,
        docNumber:  doc.docNumber,
        revision:   doc.revision,
        body:       doc.body,
        footer:     doc.footer,
      })
      .onConflictDoUpdate({
        target:  [productDocuments.productKey, productDocuments.docType],
        set: {
          docNumber: doc.docNumber,
          revision:  doc.revision,
          body:      doc.body,
          footer:    doc.footer,
          updatedAt: new Date(),
        },
      })
    docCount++
  }
  console.log(`   ✅ Upserted ${docCount} product documents`)
}
