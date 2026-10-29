/**
 * One-off replay of the Oct 2026 CORRUCUT 500 → CORROCUT 500 spelling fix and
 * variant renames (c88959f) onto another environment (production) through the
 * admin API — never direct DB writes. Seed re-runs can't do this: seeds only
 * insert missing rows.
 *
 * Scoped to product key `corrucut-500` (the key itself is unchanged). Text is
 * fixed by substring replace on the target's *current* data, so edits made
 * there since are preserved. Variants are matched by name, never by local ids.
 * Re-running is a no-op.
 *
 *   API_BASE=https://api.macrocoats.in/v1 ADMIN_USER=... ADMIN_PASSWORD=... \
 *     npx tsx scripts/rename-2026-10-corrocut-500.ts            # dry run (default)
 *   ... npx tsx scripts/rename-2026-10-corrocut-500.ts --apply   # write
 *
 * Not covered: `products.display_name` has no API endpoint, so the script only
 * reports it. It feeds `productName` on served TDS/MSDS and their PDFs.
 */

const API_BASE = process.env.API_BASE
const APPLY = process.argv.includes('--apply')
if (!API_BASE || !process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) {
  console.error('Set API_BASE, ADMIN_USER and ADMIN_PASSWORD.')
  process.exit(1)
}

const PRODUCT = 'corrucut-500'
const DOC_TYPES = ['tds', 'msds', 'formula', 'label', 'coa'] as const

// Any of these current names → new name
const RENAMES: [string[], string][] = [
  [['CORRUCUT 500 - Water-Displacing RPO'], 'Exxsol Blend Grade'],
  [['Solvent Carrier Grade', 'MTO Based'], 'MTO-LLP High-Oil Grade'],
  [['Mixed Sulfonate Grade'], 'Na-Ba Sulfonate Grade'],
  [['MTO-LLP Based'], 'MTO-LLP Low-Oil Grade'],
]

// Substring rules, applied in order. Uppercase only: the lowercase key
// `corrucut-500` must never be touched.
const TEXT_RULES: [string, string][] = [
  ['CORRUCUT 500 – Water-Displacing RPO', 'CORROCUT 500 – Exxsol Blend Grade'],
  ['CORRUCUT', 'CORROCUT'],
]

// ── helpers ──────────────────────────────────────────────────────────────────
const fixString = (s: string) => TEXT_RULES.reduce((acc, [o, n]) => acc.split(o).join(n), s)
const fixDeep = (v: any): any =>
  typeof v === 'string' ? fixString(v)
  : Array.isArray(v) ? v.map(fixDeep)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fixDeep(x)]))
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
  console.log(`Target: ${API_BASE}   Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}   Product: ${PRODUCT}`)

  // 1. Base documents (all five doc types).
  let displayName = ''
  for (const docType of DOC_TYPES) {
    let doc: Record<string, any>
    try { doc = (await api('GET', `/products/${PRODUCT}/${docType}`)).data } catch { continue }
    displayName ||= doc.productName ?? ''
    const body = Object.fromEntries(Object.entries(doc).filter(([k]) => !ENVELOPE_KEYS.includes(k)))
    const before = { body, footer: doc.footer }
    const after = { body: fixDeep(body), footer: fixDeep(doc.footer) }
    const payload: Record<string, unknown> = { body: after.body }
    if (doc.footer && JSON.stringify(doc.footer) !== JSON.stringify(after.footer)) payload.footer = after.footer
    await write(`${PRODUCT} ${docType} (base document)`, before, after, 'PUT', `/products/${PRODUCT}/${docType}`, payload)
  }

  // 2. Variants: renames + override text.
  const list: { id: string; variantName: string }[] = (await api('GET', `/formulation-variants?productKey=${PRODUCT}`)).data
  const names = new Set(list.map((v) => v.variantName))
  for (const row of list) {
    const v = (await api('GET', `/formulation-variants/${row.id}`)).data
    const before = { variantName: v.variantName, tdsOverrides: v.tdsOverrides ?? null, msdsOverrides: v.msdsOverrides ?? null }
    const after = {
      variantName:   RENAMES.find(([olds]) => olds.includes(v.variantName))?.[1] ?? v.variantName,
      tdsOverrides:  fixDeep(before.tdsOverrides),
      msdsOverrides: fixDeep(before.msdsOverrides),
    }
    if (after.variantName !== v.variantName && names.has(after.variantName)) {
      console.log(`\n! variant "${v.variantName}": a variant named "${after.variantName}" already exists — rename skipped, resolve by hand`)
      after.variantName = v.variantName
    }
    const payload: Record<string, unknown> = {}
    for (const k of ['variantName', 'tdsOverrides', 'msdsOverrides'] as const) {
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) payload[k] = after[k]
    }
    await write(`${PRODUCT} variant "${v.variantName}"`, before, after, 'PUT', `/formulation-variants/${v.id}`, payload)
  }
  if (!names.has('MTO-LLP Low-Oil Grade') && !names.has('MTO-LLP Based')) {
    console.log('\n! variant "MTO-LLP Low-Oil Grade" is missing — run the seed (ansible-playbook deploy.yml --tags seed)')
  }

  // 3. Display name — no API; report only.
  if (displayName.includes('CORRUCUT')) {
    console.log(`\n! products.display_name is "${displayName}" — no API endpoint updates it; needs a separate change`)
  }

  console.log(`\n${changes} target(s) ${APPLY ? 'updated' : 'would change'}.${APPLY ? '' : ' Re-run with --apply to write.'}`)
}

main().catch((e) => { console.error(e.message); process.exit(1) })
