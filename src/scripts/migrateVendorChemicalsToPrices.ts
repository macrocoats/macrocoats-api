/**
 * One-off script: back-fill `vendor_material_prices` with each vendor's
 * *current* `vendors.chemicals[]` entries as that vendor's opening/first
 * price record.
 *
 * Run (dry run — default, no writes):
 *   tsx --env-file=.env.local src/scripts/migrateVendorChemicalsToPrices.ts
 *
 * Run (apply — only after reviewing the dry-run report):
 *   tsx --env-file=.env.local src/scripts/migrateVendorChemicalsToPrices.ts --apply
 *
 * Matching strategy (2-tier, see root CLAUDE.md §9 — never bypass admin UI
 * with unreviewed inserts, and never guess at ambiguous chemical names):
 *   1. Exact match on the SAME normalization already used elsewhere in this
 *      codebase for material-name matching (see `normalizeMaterialName` in
 *      `cost-intelligence.service.ts` — reused here verbatim, not
 *      reinvented): lowercase, trim, collapse runs of `-`/`_`/whitespace to
 *      a single space.
 *   2. A hand-curated ALIAS_MAP (built by inspecting the real vendor rows
 *      in this DB — see the report from the dry run performed 2026-07-15)
 *      for spelling variants / abbreviations we are reasonably confident
 *      about. Anything not resolved by either tier is printed as
 *      UNMATCHED and never inserted — in particular:
 *        - genuinely ambiguous names that could plausibly resolve to more
 *          than one inventory_items row (e.g. generic "Biocide" vs
 *          "Biocide Blue"/"Biocide Yellow"; "Lauryl alcohol ethoxylate"
 *          vs LAE-7/LAE-9; "Propylene Glycol Methyl Ether" vs the
 *          Dowanol-PM/PGME-branded rows)
 *        - names that look like typos with no confident target (e.g.
 *          "TAP 334" — no such inventory item, and it isn't clearly a
 *          transposition of "TAP 234" either)
 *        - names that reference a product with no inventory_items row at
 *          all (e.g. "PURIT 32D", "Sodium Tri Poly phosphate - STPP")
 *   This script NEVER creates inventory_items rows for unmatched entries.
 *
 * Unit handling: vendors.chemicals uses lowercase 'kg'/'L' free text;
 * inventory_items.unit is the enum 'Kg'/'L'. A vendor unit of 'kg' vs
 * inventory 'Kg' is NOT a mismatch (case only). Anything else disagreeing
 * is a genuine mismatch — printed as a warning but still included in the
 * matched set; the inserted row's `unit` always comes from the matched
 * inventory_items.unit, never the vendor's raw string.
 *
 * Idempotency: before inserting, this script checks whether the
 * (vendorId, inventoryItemId) pair already has ANY row in
 * vendor_material_prices; if so it's skipped so reruns are safe.
 *
 * `vendors.chemicals` is never modified by this script.
 */
import { db } from '../db/index.js'
import { vendors, inventoryItems, vendorMaterialPrices, users } from '../db/schema/index.js'
import { and, eq } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Normalization — reused verbatim from
// src/modules/cost-intelligence/cost-intelligence.service.ts::normalizeMaterialName
// (do not invent a new regex here; if that function ever changes, update
// this comment/copy together with it since this is a one-off script that
// intentionally does not import across module boundaries for a throwaway
// tool — see optimizer/CLAUDE.md's guidance against unnecessary
// cross-module imports).
// ---------------------------------------------------------------------------
function normalizeMaterialName(name: string): string {
  return name.trim().toLowerCase().replace(/[-_\s]+/g, ' ')
}

// ---------------------------------------------------------------------------
// Tier 2 — hand-curated aliases, built from the actual vendor data in this
// DB (dry run 2026-07-15, 9 vendors / 66 chemical entries). Normalized
// chemical name → exact inventory_items.material value.
//
// Reasoning for each entry:
// ---------------------------------------------------------------------------
const ALIAS_MAP: Record<string, string> = {
  // Brand/grade qualifiers appended to an otherwise-unambiguous base name
  'zinc oxide white seal':        'Zinc Oxide',                          // "white seal" = grade descriptor
  'phosphoric acid aditya birla': 'Phosphoric Acid',                     // "aditya birla" = manufacturer qualifier
  'sodium nitrate deepak':        'Sodium Nitrate (NaNO₃)',              // "deepak" = manufacturer qualifier
  'tsp imported (25kg bag)':      'Trisodium Phosphate (TSP)',           // TSP abbrev + packaging note

  // Standard chemical abbreviations confirmed by another vendor's fuller name
  // for the same substance in this same dataset (e.g. Jain's "Sodium Meta
  // Silicate (SMS)" confirms SMS = Sodium Metasilicate)
  'sms':                          'Sodium Metasilicate (SMS)',
  'sles':                         'Sodium Lauryl Ether Sulfate (SLES)',
  'ipa':                          'IPA (Isopropyl Alcohol)',
  'ipa (iso propyl alcohol)':     'IPA (Isopropyl Alcohol)',             // "Iso Propyl" spelling variant of "Isopropyl"

  // Well-known synonyms
  'sodium hydroxide':             'Caustic Soda (NaOH)',                 // Sodium Hydroxide = Caustic Soda
  'sodium carbonate':             'Soda Ash (Sodium Carbonate)',         // Sodium Carbonate = Soda Ash
  'soda ash':                     'Soda Ash (Sodium Carbonate)',         // base-name prefix of the same inventory row
  'sodium nitrite':                'Sodium Nitrite (NaNO₂)',             // base-name prefix, unambiguous (only one Sodium Nitrite row)
  'sodium nitrate':                'Sodium Nitrate (NaNO₃)',             // base-name prefix, unambiguous (only one Sodium Nitrate row)
  'mono sodium phosphate':         'Mono Sodium Phosphate (NaH₂PO₄)',    // base-name prefix, unambiguous
  'mono sod phosphate (msp)':      'Mono Sodium Phosphate (NaH₂PO₄)',    // "Sod" abbreviation + MSP abbrev of same
  'tri sodium phosphate (tsp)':    'Trisodium Phosphate (TSP)',          // "Tri Sodium" spacing variant of "Trisodium", TSP abbrev confirms
  'sodium meta silicate (sms)':    'Sodium Metasilicate (SMS)',          // "Meta Silicate" spacing variant of "Metasilicate", SMS abbrev confirms
  'sodium hexa meta phosphate':    'Sodium Hexametaphosphate (SHMP)',    // spacing variant of "Hexametaphosphate"
  'tri ethanol amine (tea)':       'TEA (Triethanolamine)',              // "Tri Ethanol Amine" spacing variant of "Triethanolamine", TEA abbrev confirms
  'liq ammonia (5%)':              'Liquid Ammonia 5%',                  // "Liq" abbreviation of "Liquid"; % matches exactly, no other Ammonia row at 5%
  'sorbitan mono oleate (smo span 80)': 'Sorbitan Monooleate',           // "Mono Oleate" spacing variant of "Monooleate"; SMO/Span-80 are standard synonyms
  'propylene glycol':              'Propylene Glycol (PG)',              // base-name match; unambiguous because the methyl-ether variants always say "Methyl Ether" in the name
  'exxsol d60 fluid':              'Exxol D60',                          // Exxsol/Exxol spelling variance already established as interchangeable in this codebase — see src/scripts/updateStock.ts ("Exxol 145 D → EXXSOL D145, same product, normalised name"); "FLUID" is a grade descriptor
}

// ---------------------------------------------------------------------------

interface VendorRow {
  id:        string
  vendorName: string
  createdAt: Date
  chemicals: Array<{ chemicalName: string; rate: number; unit: string }>
}

interface InventoryRow {
  id:       string
  material: string
  unit:     'Kg' | 'L'
}

interface MatchResult {
  vendorId:        string
  vendorName:       string
  vendorCreatedAt: Date
  chemicalName:    string
  rate:             number
  vendorUnit:      string
  inventoryItemId: string
  inventoryMaterial: string
  inventoryUnit:    'Kg' | 'L'
  unitMismatch:     boolean
  matchTier:        'exact' | 'alias'
}

interface UnmatchedResult {
  vendorName:    string
  chemicalName: string
  rate:          number
  vendorUnit:   string
}

function isRealUnitMismatch(vendorUnit: string, inventoryUnit: string): boolean {
  // 'kg' vs 'Kg' / 'l' vs 'L' case differences are NOT a real mismatch —
  // vendors.chemicals is free-text lowercase, inventory_items.unit is the
  // canonical enum.
  return vendorUnit.trim().toLowerCase() !== inventoryUnit.trim().toLowerCase()
}

async function computeMatches() {
  const vendorRows: VendorRow[] = (await db
    .select({
      id:        vendors.id,
      vendorName: vendors.vendorName,
      createdAt: vendors.createdAt,
      chemicals: vendors.chemicals,
    })
    .from(vendors)) as VendorRow[]

  const inventoryRows: InventoryRow[] = (await db
    .select({ id: inventoryItems.id, material: inventoryItems.material, unit: inventoryItems.unit })
    .from(inventoryItems)) as InventoryRow[]

  const invByNorm = new Map<string, InventoryRow>()
  for (const item of inventoryRows) {
    invByNorm.set(normalizeMaterialName(item.material), item)
  }

  const matched: MatchResult[] = []
  const unmatched: UnmatchedResult[] = []
  let totalChemicalEntries = 0

  for (const vendor of vendorRows) {
    for (const chem of vendor.chemicals) {
      totalChemicalEntries++
      const norm = normalizeMaterialName(chem.chemicalName)

      let inv = invByNorm.get(norm)
      let tier: 'exact' | 'alias' = 'exact'

      if (!inv && ALIAS_MAP[norm]) {
        const aliasTarget = invByNorm.get(normalizeMaterialName(ALIAS_MAP[norm]))
        if (aliasTarget) {
          inv = aliasTarget
          tier = 'alias'
        }
      }

      if (!inv) {
        unmatched.push({
          vendorName:   vendor.vendorName,
          chemicalName: chem.chemicalName,
          rate:         chem.rate,
          vendorUnit:   chem.unit,
        })
        continue
      }

      matched.push({
        vendorId:          vendor.id,
        vendorName:         vendor.vendorName,
        vendorCreatedAt:    vendor.createdAt,
        chemicalName:      chem.chemicalName,
        rate:               chem.rate,
        vendorUnit:         chem.unit,
        inventoryItemId:    inv.id,
        inventoryMaterial: inv.material,
        inventoryUnit:      inv.unit,
        unitMismatch:       isRealUnitMismatch(chem.unit, inv.unit),
        matchTier:          tier,
      })
    }
  }

  return { vendorRows, matched, unmatched, totalChemicalEntries }
}

function printReport(vendorCount: number, totalChemicalEntries: number, matched: MatchResult[], unmatched: UnmatchedResult[]) {
  console.log('\n=== vendor.chemicals → vendor_material_prices dry-run report ===\n')

  console.log(`Vendors:                ${vendorCount}`)
  console.log(`Chemical entries total: ${totalChemicalEntries}`)
  console.log(`Matched:                ${matched.length}`)
  console.log(`Unmatched:              ${unmatched.length}\n`)

  console.log('--- Matched (vendorName | chemicalName | rate unit -> inventory material [tier] [unit warning]) ---')
  for (const m of matched) {
    const warn = m.unitMismatch ? `  ⚠ UNIT MISMATCH (vendor: ${m.vendorUnit}, inventory: ${m.inventoryUnit})` : ''
    console.log(
      `  ${m.vendorName.padEnd(42)} | ${m.chemicalName.padEnd(38)} | ${String(m.rate).padEnd(8)} ${m.vendorUnit.padEnd(4)} -> ${m.inventoryMaterial} [${m.matchTier}]${warn}`
    )
  }

  console.log('\n--- UNMATCHED (never inserted) ---')
  if (unmatched.length === 0) {
    console.log('  (none)')
  }
  for (const u of unmatched) {
    console.log(`  ${u.vendorName.padEnd(42)} | ${u.chemicalName.padEnd(38)} | ${String(u.rate).padEnd(8)} ${u.vendorUnit}  → UNMATCHED`)
  }

  const mismatchCount = matched.filter((m) => m.unitMismatch).length
  console.log(`\nUnit mismatches among matched rows: ${mismatchCount}`)
  console.log('\n=== end of report ===\n')
}

async function findSuperadminId(): Promise<string | null> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'superadmin'))
    .limit(1)
  return rows[0]?.id ?? null
}

function toDateOnly(d: Date): string {
  // effectiveFrom is a `date` column — pass YYYY-MM-DD
  return d.toISOString().slice(0, 10)
}

async function applyMatches(matched: MatchResult[]) {
  const superadminId = await findSuperadminId()
  if (!superadminId) {
    console.error('❌ No user with role = \'superadmin\' found. Aborting --apply (createdBy would be unresolvable).')
    process.exit(1)
  }
  console.log(`Using superadmin user id ${superadminId} as createdBy for all inserted rows.\n`)

  let inserted = 0
  let skipped = 0

  await db.transaction(async (tx) => {
    for (const m of matched) {
      const existing = await tx
        .select({ id: vendorMaterialPrices.id })
        .from(vendorMaterialPrices)
        .where(
          and(
            eq(vendorMaterialPrices.vendorId, m.vendorId),
            eq(vendorMaterialPrices.inventoryItemId, m.inventoryItemId)
          )
        )
        .limit(1)

      if (existing.length > 0) {
        console.log(`  ⚠ skipped  ${m.vendorName} / ${m.inventoryMaterial} — row already exists for this (vendor, item) pair`)
        skipped++
        continue
      }

      await tx.insert(vendorMaterialPrices).values({
        vendorId:        m.vendorId,
        inventoryItemId: m.inventoryItemId,
        effectiveFrom:   toDateOnly(m.vendorCreatedAt),
        effectiveTo:     null,
        unitPrice:       String(m.rate),
        currency:        'INR',
        unit:            m.inventoryUnit,
        createdBy:       superadminId,
      })
      console.log(`  ✓ inserted ${m.vendorName.padEnd(42)} -> ${m.inventoryMaterial} @ ${m.rate} ${m.inventoryUnit}`)
      inserted++
    }
  })

  console.log(`\nSummary: ${inserted} inserted, ${skipped} skipped (already existed).`)
}

async function run() {
  const apply = process.argv.includes('--apply')

  const { vendorRows, matched, unmatched, totalChemicalEntries } = await computeMatches()
  printReport(vendorRows.length, totalChemicalEntries, matched, unmatched)

  if (!apply) {
    console.log('Dry run only — no rows written. Re-run with --apply to insert the matched rows above.')
    return
  }

  console.log('--apply flag detected — inserting matched rows now.\n')
  await applyMatches(matched)
}

run()
  .then(() => { console.log('\n✅ Done.'); process.exit(0) })
  .catch((err) => { console.error('❌ Error:', err); process.exit(1) })
