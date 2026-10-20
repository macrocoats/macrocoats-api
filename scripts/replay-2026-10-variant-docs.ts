/**
 * One-off replay of the Oct 2026 TDS/MSDS data changes onto another environment
 * (production) through the admin API — never direct DB writes.
 *
 * Seed re-runs can't do this: seeds only insert missing rows. This script
 * re-applies the same transformations to the target's *current* data, so edits
 * made there since are preserved; fully authored content (CORRUCUT 500 variant
 * overrides) is sent from the seed constants. Variants are matched by
 * productKey + name, never by local ids. Re-running is a no-op.
 *
 *   API_BASE=https://api.macrocoats.in/v1 ADMIN_USER=... ADMIN_PASSWORD=... \
 *     npx tsx scripts/replay-2026-10-variant-docs.ts            # dry run (default)
 *   ... npx tsx scripts/replay-2026-10-variant-docs.ts --apply   # write
 *
 * Run after the backend deploy (502bfd3) so the new override sections are
 * validated and actually served.
 */
import {
  TDS_OVERRIDES_CORRUCUT_500_WDRPO, MSDS_OVERRIDES_CORRUCUT_500_WDRPO,
  TDS_OVERRIDES_CORRUCUT_500_MTO_BASED, MSDS_OVERRIDES_CORRUCUT_500_MTO_BASED,
} from '../src/seed/corrucut500Overrides.data.js'

const API_BASE = process.env.API_BASE
const APPLY = process.argv.includes('--apply')
if (!API_BASE || !process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) {
  console.error('Set API_BASE, ADMIN_USER and ADMIN_PASSWORD.')
  process.exit(1)
}

// ── Text rules ───────────────────────────────────────────────────────────────
// exact: the whole string must equal `old`; otherwise substring replace.
// products: limit a rule to these product keys (short exact names are scoped
// so they can never hit another product's content).
type Rule = { old: string; new: string; exact?: boolean; products?: string[] }

const DOC_RULES: Rule[] = [
  // corrucut-500 base TDS/MSDS
  { old: 'Calcium petroleum sulfonate provides the primary corrosion-inhibiting film, and petroleum jelly reinforces', new: 'A polar corrosion inhibitor provides the primary corrosion-inhibiting film, and a film-forming barrier agent reinforces', products: ['corrucut-500'] },
  { old: 'Calcium petroleum sulfonate provides the primary corrosion-inhibiting film, and Petroleum jelly reinforces', new: 'A polar corrosion inhibitor provides the primary corrosion-inhibiting film, and a film-forming barrier agent reinforces', products: ['corrucut-500'] },
  { old: 'Petroleum Jelly-Reinforced Film', new: 'Barrier-Reinforced Film', exact: true, products: ['corrucut-500'] },
  { old: 'Petroleum jelly content improves film cohesion and water resistance versus a solvent-only carrier.', new: 'A film-forming barrier agent improves film cohesion and water resistance versus a solvent-only carrier.', exact: true, products: ['corrucut-500'] },
  { old: '(petroleum jelly reinforced)', new: '(barrier-reinforced)', products: ['corrucut-500'] },
  { old: 'Petroleum Jelly', new: 'Film-Forming Barrier Agent', exact: true, products: ['corrucut-500'] },
  { old: 'Film-forming barrier agent — enhances water resistance and cohesion', new: 'Enhances water resistance and film cohesion', exact: true, products: ['corrucut-500'] },
  { old: 'Exxsol D60', new: 'Dearomatized Hydrocarbon Solvent', exact: true, products: ['corrucut-500'] },
  { old: 'Exxsol D145', new: 'Dearomatized Hydrocarbon Solvent (Heavy Grade)', exact: true, products: ['corrucut-500'] },
  { old: 'Exxsol 32D', new: 'Light Hydrocarbon Solvent', exact: true, products: ['corrucut-500'] },
  { old: 'Vaseline (Petroleum Jelly)', new: 'Film-Forming Barrier Agent', exact: true, products: ['corrucut-500'] },
  { old: ' · P260 — Do not breathe dust/fume/gas/mist/vapours/spray.', new: '', products: ['corrucut-500'] },
  // corrcut-200
  { old: 'Mineral Turpentine Oil (MTO)', new: 'Hydrocarbon Carrier Solvent', exact: true, products: ['corrcut-200'] },
  { old: 'Lanolin', new: 'Film Adhesion Promoter', exact: true, products: ['corrcut-200'] },
  { old: 'Sorbitan Monooleate (Span 80)', new: 'Dispersing Agent', exact: true, products: ['corrcut-200'] },
  { old: 'BHT (Antioxidant)', new: 'Stabiliser', exact: true, products: ['corrcut-200'] },
  { old: 'MTO + dearomatized hydrocarbon carrier', new: 'Blended hydrocarbon solvent carrier', products: ['corrcut-200'] },
  { old: 'Film adhesion promoter — natural wax-like film former, enhances water repellence', new: 'Wax-like film former — enhances adhesion and water repellence', products: ['corrcut-200'] },
  { old: 'Emulsifier / dispersing agent — stabilises additive package', new: 'Stabilises the additive package', products: ['corrcut-200'] },
  { old: 'Antioxidant / stabiliser — prevents', new: 'Prevents', products: ['corrcut-200'] },
  { old: 'Primary solvent carrier — economical aliphatic petroleum distillate', new: 'Primary solvent carrier — aliphatic petroleum distillate', products: ['corrcut-200'] },
  { old: 'Calcium Petroleum Sulfonate', new: 'Corrosion Inhibitor', exact: true, products: ['corrucut-500', 'corrcut-200'] },
  // unikoat-lt-700
  { old: '⚠ Phosphoric acid burns can cause deep tissue damage', new: '⚠ Acid burns can cause deep tissue damage' },
  { old: 'sodium nitrate content may intensify fires', new: 'the oxidising accelerator content may intensify fires' },
  { old: 'Phosphoric acid penetrates tissue', new: 'The acid component penetrates tissue' },
  { old: 'Hydroxylamine sulphate and sodium nitrate accelerators deliver', new: 'A dual accelerator system delivers' },
  { old: 'Alphox 200 surfactant addition provides', new: 'A low-foam non-ionic surfactant provides' },
  // unisolve-h3
  { old: 'Balanced phosphoric acid system delivers', new: 'Balanced inorganic acid system delivers' },
  // unipass
  { old: 'Citric acid chelation combined with sodium nitrite delivers anodic passivation; BTA provides', new: 'Chelation combined with an oxidising passivator delivers anodic passivation; a copper inhibitor provides' },
  { old: 'Copper corrosion (BTA film test)', new: 'Copper corrosion (film test)' },
  { old: 'Contains sodium nitrite — do not mix with strong acids', new: 'Contains an oxidising passivator — do not mix with strong acids' },
  { old: '— sodium nitrite content requires prompt medical evaluation', new: '— the oxidising component requires prompt medical evaluation' },
  { old: '⚠ Sodium nitrite can form methaemoglobin', new: '⚠ The oxidising component can form methaemoglobin' },
  { old: 'Sodium nitrite component may intensify fire', new: 'The oxidising component may intensify fire' },
  { old: 'risk of nitrogen oxide release from sodium nitrite component', new: 'risk of nitrogen oxide release from the oxidising component' },
  { old: '(risk of nitrogen oxide from sodium nitrite)', new: '(risk of nitrogen oxide release)' },
  { old: 'H412 — sodium nitrite is harmful', new: 'H412 — the oxidising component is harmful' },
  // uniktonner
  { old: '~33% w/v sodium nitrite active content provides', new: 'High active content provides' },
  { old: 'top up UNIKTONNER as nitrite is consumed', new: 'top up UNIKTONNER as accelerator is consumed' },
  { old: 'UNIKTONNER contains sodium nitrite — an oxidising agent.', new: 'UNIKTONNER contains an oxidising agent.' },
  { old: 'Aqueous sodium nitrite accelerator solution', new: 'Aqueous oxidising accelerator solution' },
  { old: '— sodium nitrite can cause methaemoglobinaemia', new: '— the oxidising component can cause methaemoglobinaemia' },
  { old: '⚠ Sodium nitrite ingestion is a medical emergency', new: '⚠ Ingestion is a medical emergency' },
  { old: 'Sodium nitrite is an oxidising agent and may intensify fire', new: 'The oxidising component may intensify fire' },
  { old: 'Sodium nitrite — LD50 oral (rat): 85 mg/kg.', new: 'Oxidising component — LD50 oral (rat): 85 mg/kg.' },
  { old: 'Thermal decomposition of sodium nitrite above 320 °C', new: 'Thermal decomposition of the oxidising component above 320 °C' },
  // uniprotect-oil / uniflow-ecm / corrcut-100
  { old: 'Paraffinic base oil', new: 'Mineral base oil', exact: true },
  { old: 'Petroleum sulfonate additive', new: 'Corrosion inhibitor additive', exact: true },
  { old: 'UNIFLOW ECM is a petroleum sulfonate-based corrosion preventive oil', new: 'UNIFLOW ECM is an inhibitor-fortified corrosion preventive oil' },
  { old: 'Petroleum Sulfonate', new: 'Proven Inhibitor System', exact: true, products: ['uniflow-ecm'] },
  { old: 'Contains petroleum sulfonate corrosion inhibitors for superior', new: 'Contains film-forming corrosion inhibitors for superior' },
  { old: 'Petroleum sulfonate', new: 'Primary corrosion inhibitor', exact: true, products: ['uniflow-ecm'] },
  { old: 'Calcium sulfonate additive', new: 'Secondary corrosion inhibitor', exact: true },
  { old: 'Metal sulfonate inhibitor', new: 'Corrosion inhibitor', exact: true },
  // uniklean-sf
  { old: 'Silicate/carbonate alkaline builder system rapidly', new: 'Alkaline builder system rapidly' },
  { old: 'Sodium gluconate sequesters hardness ions', new: 'A sequestering agent binds hardness ions' },
  { old: 'Silicate / carbonate builder system', new: 'Alkaline builder system', exact: true },
  { old: 'Sequestering agent (gluconate)', new: 'Sequestering agent', exact: true },
  // unicut-al
  { old: 'Sodium gluconate sequestrant system maintains', new: 'Sequestrant system maintains' },
  { old: 'Borax and amine-based inhibitor package provides', new: 'Inhibitor package provides' },
  { old: 'Paraffinic Mineral Oil System', new: 'Mineral Oil System', exact: true },
  { old: 'Light paraffinic mineral oil', new: 'Mineral base oil', exact: true, products: ['unicut-al'] },
  { old: 'Propylene glycol', new: 'Co-solvent', exact: true, products: ['unicut-al'] },
  { old: 'Triethanolamine (TEA)', new: 'pH regulator', exact: true, products: ['unicut-al'] },
  { old: 'Alcohol ethoxylate (LAE-7)', new: 'Non-ionic surfactant', exact: true, products: ['unicut-al'] },
  { old: 'Sodium gluconate', new: 'Sequestering agent', exact: true, products: ['unicut-al'] },
  { old: 'Borax', new: 'Corrosion inhibitor / buffer', exact: true, products: ['unicut-al'] },
  // uniklean-cu
  { old: 'Glycol ether coupling solvent', new: 'Coupling solvent', exact: true },
  { old: 'Glycol ether co-solvent', new: 'Co-solvent', exact: true },
  // unikbrightner
  { old: 'Calculated — mass of formula components (20.0 kg citric acid + 3.35 L H₂O₂ 50% solution @ ~1.196 g/mL + 96.65 kg DM water) ÷ 100 L reference batch volume; not lab-measured.', new: 'Calculated — mass of formula components ÷ 100 L reference batch volume; not lab-measured.' },
]

const UNICOOL_VARIANT_RULES: Rule[] = [
  { old: 'Propylene Glycol Methyl Ether (Dowanol PM)', new: 'Wetting co-solvent', exact: true },
  { old: 'Propylene Glycol Methyl Ether (PGME)', new: 'Wetting co-solvent', exact: true },
  { old: 'Propylene Glycol (PG)', new: 'Co-solvent', exact: true },
  { old: 'Propylene Glycol', new: 'Co-solvent', exact: true },
  { old: 'PEG 400', new: 'Viscosity modifier', exact: true },
  { old: 'TEA', new: 'pH regulator', exact: true },
  { old: 'Ethanol', new: 'Volatile co-solvent', exact: true },
  { old: 'Isopropyl Alcohol (IPA)', new: 'Volatile solvent', exact: true },
  { old: 'Alcohol and glycol ether vapours may accumulate', new: 'Solvent vapours may accumulate' },
  { old: 'High IPA content — keep away', new: 'High volatile-solvent content — keep away' },
  { old: 'Strong IPA / alcohol characteristic', new: 'Strong alcohol characteristic' },
  { old: 'Strong IPA / alcohol', new: 'Strong alcohol' },
  { old: 'Fast (high IPA content)', new: 'Fast (high volatile-solvent content)' },
  { old: 'IPA vapours may travel to ignition source', new: 'Solvent vapours may travel to ignition source' },
  { old: 'High IPA content increases fire risk', new: 'High volatile-solvent content increases fire risk' },
]

const PROFILE_RULES: Rule[] = [
  { old: 'Rust prevention additive — tall oil fatty acid derivative providing supplementary barrier', new: 'Rust prevention additive — supplementary barrier', exact: true },
  { old: 'Glycol ether co-solvent', new: 'Co-solvent', exact: true },
  { old: 'Glycol ether coupling solvent', new: 'Coupling solvent', exact: true },
  { old: 'Zinc ion source', new: 'Metal ion source', exact: true },
  { old: 'Zinc ion source — reacts with phosphoric acid to form zinc phosphate coating', new: 'Metal ion source — forms the conversion coating', exact: true },
  { old: 'Zinc phosphate conversion coating agent', new: 'Conversion coating agent', exact: true },
  { old: 'Zinc phosphate source for conversion coating', new: 'Coating-forming component', exact: true },
  { old: 'Molybdate-based corrosion inhibitor', new: 'Corrosion inhibitor', exact: true },
  { old: 'Iron/manganese conditioning agent', new: 'Metal conditioning agent', exact: true },
  { old: 'Nickel ion source for coating/conditioning', new: 'Metal ion source for coating/conditioning', exact: true },
]

// [productKey, any of these current names, new name]
const RENAMES: [string, string[], string][] = [
  ['corrucut-500',  ['MTO Based'], 'Solvent Carrier Grade'],
  ['unicool-al',    ['High IPA Variant'], 'Fast-Dry Variant'],
  ['unicool-al',    ['Only IPA'], 'Fast-Dry Basic Variant'],
  ['unicool-al',    ['PEG Glycol Variant'], 'Low-Evaporation Variant'],
  ['unicool-al',    ['UNICool AL – PG High Lubricity Variant'], 'UNICool AL – High Lubricity Variant'],
  ['unicool-al',    ['UNICool AL – PGME Enhanced Variant'], 'UNICool AL – Enhanced Wetting Variant'],
  ['uniklean-sp',   ['UNIKLEAN SP – Heavy Duty Alkaline SMS Variant'], 'UNIKLEAN SP – Heavy Duty Alkaline Variant'],
]

// ── helpers ──────────────────────────────────────────────────────────────────
const fixString = (s: string, rules: Rule[], product: string) => {
  for (const r of rules) {
    if (r.products && !r.products.includes(product)) continue
    if (r.exact) { if (s === r.old) return r.new }
    else if (s.includes(r.old)) s = s.split(r.old).join(r.new)
  }
  return s
}
const fixDeep = (v: any, rules: Rule[], product: string): any =>
  typeof v === 'string' ? fixString(v, rules, product)
  : Array.isArray(v) ? v.map((x) => fixDeep(x, rules, product))
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fixDeep(x, rules, product)]))
  : v

/** Leaf-level diff for the dry-run report. */
function diff(a: any, b: any, path = ''): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return []
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].flatMap((k) => diff(a[k], b[k], path ? `${path}.${k}` : k))
  }
  const show = (x: any) => (x === undefined ? '∅' : JSON.stringify(x)).slice(0, 110)
  return [`    ${path}: ${show(a)}  →  ${show(b)}`]
}

let token = ''
async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

let changes = 0
async function write(label: string, before: unknown, after: unknown, method: string, path: string, payload: unknown) {
  const lines = diff(before, after)
  if (!lines.length) return
  changes++
  console.log(`\n• ${label}`)
  lines.forEach((l) => console.log(l))
  if (APPLY) { await api(method, path, payload); console.log('    ✓ applied') }
}

// Keys getDocument() adds around row.body — stripped to recover the raw body for PUT.
const ENVELOPE_KEYS = ['productName', 'subtitle', 'accentColor', 'docNumber', 'revision', 'company', 'location',
  'contact', 'phone', 'gstin', 'footer', 'status', 'createdAt', 'updatedAt', 'updatedBy']

async function main() {
  const login = await fetch(`${API_BASE}/auth/mobile/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD }),
  })
  if (!login.ok) throw new Error(`login failed: ${login.status}`)
  token = (await login.json()).accessToken
  console.log(`Target: ${API_BASE}   Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`)

  const products: { key: string }[] = (await api('GET', '/products')).data

  // 1. Base TDS/MSDS documents.
  for (const { key } of products) {
    for (const docType of ['tds', 'msds'] as const) {
      let doc: Record<string, any>
      try { doc = (await api('GET', `/products/${key}/${docType}`)).data } catch { continue }
      const body = Object.fromEntries(Object.entries(doc).filter(([k]) => !ENVELOPE_KEYS.includes(k)))
      const next = fixDeep(body, DOC_RULES, key)
      if (docType === 'msds') {
        const ingredients = next.sections?.composition?.ingredients
        if (Array.isArray(ingredients)) next.sections.composition.ingredients = ingredients.map((i: any) => (i.percent === undefined ? { ...i, percent: '—' } : i))
        if (key === 'corrucut-500') {
          next.signalWord = 'Danger'
          next.sections.hazards.pictograms = ['flammable', 'healthhazard']
        }
      }
      await write(`${key} ${docType} (base document)`, body, next, 'PUT', `/products/${key}/${docType}`, { body: next })
    }
  }

  // 2. Variants: renames, CORRUCUT 500 authored overrides, UNICool AL text rules + High IPA fix.
  for (const { key } of products) {
    const list: { id: string; variantName: string }[] = (await api('GET', `/formulation-variants?productKey=${key}`)).data
    for (const row of list) {
      const v = (await api('GET', `/formulation-variants/${row.id}`)).data
      const before = { variantName: v.variantName, tdsOverrides: v.tdsOverrides ?? null, msdsOverrides: v.msdsOverrides ?? null }
      const after = structuredClone(before)

      const rename = RENAMES.find(([p, olds]) => p === key && olds.includes(v.variantName))
      if (rename) after.variantName = rename[2]

      if (key === 'corrucut-500' && v.variantName === 'CORRUCUT 500 - Water-Displacing RPO') {
        after.tdsOverrides = TDS_OVERRIDES_CORRUCUT_500_WDRPO
        after.msdsOverrides = MSDS_OVERRIDES_CORRUCUT_500_WDRPO
      }
      if (key === 'corrucut-500' && ['MTO Based', 'Solvent Carrier Grade'].includes(v.variantName)) {
        after.tdsOverrides = TDS_OVERRIDES_CORRUCUT_500_MTO_BASED
        after.msdsOverrides = MSDS_OVERRIDES_CORRUCUT_500_MTO_BASED
      }
      if (key === 'unicool-al') {
        after.tdsOverrides = fixDeep(after.tdsOverrides, UNICOOL_VARIANT_RULES, key)
        after.msdsOverrides = fixDeep(after.msdsOverrides, UNICOOL_VARIANT_RULES, key)
        if (['High IPA Variant', 'Fast-Dry Variant'].includes(v.variantName) && after.msdsOverrides?.hazards) {
          after.msdsOverrides.signalWord = 'Warning'
          after.msdsOverrides.hazards.pictograms = after.msdsOverrides.hazards.pictograms.filter((p: string) => p !== 'environment')
        }
      }

      const payload: Record<string, unknown> = {}
      for (const k of ['variantName', 'tdsOverrides', 'msdsOverrides'] as const) {
        if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) payload[k] = after[k]
      }
      await write(`${key} variant "${v.variantName}"`, before, after, 'PUT', `/formulation-variants/${v.id}`, payload)
    }
  }

  // 3. Hazard profiles.
  const profiles: any[] = (await api('GET', '/hazard-profiles')).data
  for (const p of profiles) {
    const before = { genericDescription: p.genericDescription, functionCategory: p.functionCategory }
    const after = {
      genericDescription: fixString(p.genericDescription, PROFILE_RULES, ''),
      functionCategory:   fixString(p.functionCategory, PROFILE_RULES, ''),
    }
    await write(`hazard profile "${p.displayName}"`, before, after, 'PUT', `/hazard-profiles/${p.id}`, after)
  }

  console.log(`\n${changes} target(s) ${APPLY ? 'updated' : 'would change'}.${APPLY ? '' : ' Re-run with --apply to write.'}`)
}

main().catch((e) => { console.error(e.message); process.exit(1) })
