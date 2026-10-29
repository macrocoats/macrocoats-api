/**
 * Backfill CORROCUT 500 variant-specific formula preparation methods through
 * the authenticated admin API. Dry run by default; --apply writes changes.
 *
 *   API_BASE=https://api.example/v1 ADMIN_USER=... ADMIN_PASSWORD=... \
 *     npx tsx scripts/replay-2026-10-corrocut-500-preparation.ts
 *   ... npx tsx scripts/replay-2026-10-corrocut-500-preparation.ts --apply
 *
 * Requires migration 0035 and the API version that accepts formulaOverrides.
 */
import { CORRUCUT_500_FORMULA_OVERRIDES } from '../src/seed/corrucut500FormulaOverrides.data.js'

const API_BASE = process.env.API_BASE
const APPLY = process.argv.includes('--apply')
if (!API_BASE || !process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) {
  console.error('Set API_BASE, ADMIN_USER and ADMIN_PASSWORD.')
  process.exit(1)
}

const PRODUCT = 'corrucut-500'
const NAME_ALIASES: Record<string, string> = {
  'CORRUCUT 500 - Water-Displacing RPO': 'Exxsol Blend Grade',
  'Solvent Carrier Grade': 'MTO-LLP High-Oil Grade',
  'MTO Based': 'MTO-LLP High-Oil Grade',
  'Mixed Sulfonate Grade': 'Na-Ba Sulfonate Grade',
  'MTO-LLP Based': 'MTO-LLP Low-Oil Grade',
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

async function main() {
  const login = await fetch(`${API_BASE}/auth/mobile/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD }),
  })
  if (!login.ok) throw new Error(`login failed: ${login.status}`)
  token = (await login.json()).accessToken

  console.log(`Target: ${API_BASE}   Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}   Product: ${PRODUCT}`)
  const variants: { id: string; variantName: string }[] = (await api('GET', `/formulation-variants?productKey=${PRODUCT}`)).data
  let changes = 0

  for (const row of variants) {
    const canonicalName = NAME_ALIASES[row.variantName] ?? row.variantName
    const formulaOverrides = CORRUCUT_500_FORMULA_OVERRIDES[canonicalName]
    if (!formulaOverrides) continue

    const current = (await api('GET', `/formulation-variants/${row.id}`)).data
    if (JSON.stringify(current.formulaOverrides ?? null) === JSON.stringify(formulaOverrides)) continue

    changes++
    console.log(`• ${row.variantName}: ${formulaOverrides.preparation.length} preparation steps`)
    if (APPLY) {
      await api('PUT', `/formulation-variants/${row.id}`, { formulaOverrides })
      console.log('  ✓ applied')
    }
  }

  console.log(`${changes} variant(s) ${APPLY ? 'updated' : 'would change'}.${APPLY ? '' : ' Re-run with --apply to write.'}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
