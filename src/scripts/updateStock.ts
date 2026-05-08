/**
 * One-off script: update stock quantities from physical inventory count (May 2026).
 * Run: tsx --env-file=.env.local src/scripts/updateStock.ts
 *
 * Logic:
 *  - Existing material → UPDATE stock_qty + unit + updated_at
 *  - New material      → INSERT with stock_qty, unit, price=0
 *
 * Unit normalisation (schema allows only 'Kg' | 'L'):
 *  - 700 mL  → 0.7 L
 *  - 700 g   → 0.7 Kg
 */
import { db } from '../db/index.js'
import { inventoryItems } from '../db/schema/index.js'
import { eq, max } from 'drizzle-orm'

interface Entry {
  /** Canonical DB name (exact match or desired insert name) */
  dbName: string
  qty: number
  unit: 'Kg' | 'L'
  /** Notes for logging only */
  note?: string
}

// ---------------------------------------------------------------------------
// Entries that already exist in DB — matched by canonical name
// ---------------------------------------------------------------------------
const UPDATES: Entry[] = [
  { dbName: 'Non-silicone Defoamer',             qty: 10,   unit: 'Kg' },
  { dbName: 'Silicone Defoamer',                 qty: 2,    unit: 'Kg' },
  // TEA: user supplied in L; DB was Kg — update unit too
  { dbName: 'TEA (Triethanolamine)',              qty: 5,    unit: 'L'  },
  { dbName: 'Zinc Oxide',                        qty: 11.6, unit: 'Kg' },
  { dbName: 'Trisodium Phosphate (TSP)',          qty: 31.1, unit: 'Kg' },
  { dbName: 'Sodium Metasilicate (SMS)',          qty: 55.2, unit: 'Kg' },
  { dbName: 'Soda Ash (Sodium Carbonate)',        qty: 61.1, unit: 'Kg' },
  { dbName: 'Sodium Nitrate (NaNO₃)',             qty: 17.1, unit: 'Kg' },
  // Sodium Gluconate: 700 g → 0.7 Kg
  { dbName: 'Sodium Gluconate',                  qty: 0.7,  unit: 'Kg', note: '700 g → 0.7 Kg' },
  { dbName: 'EDTA Disodium',                     qty: 22.8, unit: 'Kg' },
  { dbName: 'Alphox 200 (Non-ionic Surfactant)',  qty: 27,   unit: 'Kg' },
  // DB name uses a space not a hyphen: "LAE 9 (Lauryl Alcohol Ethoxylate)"
  { dbName: 'LAE 9 (Lauryl Alcohol Ethoxylate)', qty: 28,   unit: 'Kg' },
  { dbName: 'Phosphoric Acid',                   qty: 27.3, unit: 'Kg' },
  { dbName: 'Methyl Oleate',                     qty: 34,   unit: 'Kg' },
  { dbName: 'Oleic Acid',                        qty: 42.8, unit: 'Kg' },
  { dbName: 'IPA (Isopropyl Alcohol)',            qty: 270,  unit: 'L'  },
  // Exxol 145 D → EXXSOL D145 (same product, normalised name)
  { dbName: 'EXXSOL D145',                       qty: 50,   unit: 'Kg', note: 'input: Exxol 145 D' },
  { dbName: 'Exxol D60',                         qty: 50,   unit: 'Kg' },
]

// ---------------------------------------------------------------------------
// Entries not yet in DB — will be inserted
// ---------------------------------------------------------------------------
const INSERTS: Entry[] = [
  { dbName: 'Polyethylene Glycol (PEG)',  qty: 7,    unit: 'Kg', note: 'input: Poly ethylene glycol' },
  { dbName: 'Isopropyl Acetate',          qty: 5,    unit: 'L',  note: 'input: Iso propyl acetate'  },
  { dbName: 'Biocide Yellow',             qty: 1,    unit: 'L'  },
  { dbName: 'Biocide Blue',               qty: 2,    unit: 'L'  },
  // Propylene glycol: 700 mL → 0.7 L
  { dbName: 'Propylene Glycol',           qty: 0.7,  unit: 'L',  note: '700 mL → 0.7 L' },
  { dbName: 'SLES',                       qty: 8,    unit: 'L'  },
  { dbName: 'Hydrinol Amine Sulfate',     qty: 23.9, unit: 'Kg', note: 'input: Hydrinol Amine Sulf' },
  { dbName: 'Citric Acid',                qty: 3.4,  unit: 'Kg' },
  { dbName: 'Caustic Soda (NaOH)',        qty: 25.6, unit: 'Kg', note: 'input: Caustic Soda' },
  { dbName: 'LAE-7',                      qty: 44,   unit: 'Kg' },
  { dbName: 'Sorbitan Mono Oleate',       qty: 10,   unit: 'Kg', note: 'input: Sorbitton mono oleate' },
  { dbName: 'TAP 334',                    qty: 25,   unit: 'Kg' },
  { dbName: 'TAP 4554',                   qty: 25,   unit: 'Kg' },
  { dbName: 'TAP 4500',                   qty: 25,   unit: 'Kg' },
  { dbName: 'TAP 363',                    qty: 25,   unit: 'Kg' },
  { dbName: 'Purit 32 D',                 qty: 50,   unit: 'Kg' },
]

// ---------------------------------------------------------------------------

async function run() {
  const now = new Date()

  // ── Fetch all existing materials ──────────────────────────────────────────
  const existing = await db
    .select({ id: inventoryItems.id, material: inventoryItems.material })
    .from(inventoryItems)

  const byName = new Map(existing.map(r => [r.material.toLowerCase().trim(), r.id]))

  // ── Get next sortOrder for inserts ────────────────────────────────────────
  const [{ maxOrder }] = await db
    .select({ maxOrder: max(inventoryItems.sortOrder) })
    .from(inventoryItems)
  let nextOrder = (maxOrder ?? 43) + 1

  let updated = 0
  let inserted = 0
  const missed: string[] = []

  // ── UPDATE existing ───────────────────────────────────────────────────────
  for (const entry of UPDATES) {
    const id = byName.get(entry.dbName.toLowerCase().trim())
    if (!id) {
      missed.push(entry.dbName)
      continue
    }
    await db
      .update(inventoryItems)
      .set({ stockQty: String(entry.qty), unit: entry.unit, updatedAt: now })
      .where(eq(inventoryItems.id, id))
    console.log(`  ✓ updated  ${entry.dbName.padEnd(45)} → ${entry.qty} ${entry.unit}${entry.note ? `  (${entry.note})` : ''}`)
    updated++
  }

  // ── INSERT new ────────────────────────────────────────────────────────────
  for (const entry of INSERTS) {
    // Guard: don't insert if a case-insensitive match already exists
    if (byName.has(entry.dbName.toLowerCase().trim())) {
      console.log(`  ⚠ skipped  ${entry.dbName} — already exists in DB (use UPDATES list)`)
      continue
    }
    await db.insert(inventoryItems).values({
      material:   entry.dbName,
      unit:       entry.unit,
      price:      '0',
      stock:      '',
      supplier:   '',
      stockQty:   String(entry.qty),
      isDefault:  false,
      sortOrder:  nextOrder++,
      updatedAt:  now,
    })
    console.log(`  + inserted ${entry.dbName.padEnd(45)} → ${entry.qty} ${entry.unit}${entry.note ? `  (${entry.note})` : ''}`)
    inserted++
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log(`\n  Summary: ${updated} updated, ${inserted} inserted`)
  if (missed.length) {
    console.warn(`\n  ⚠ Not found in DB (check names):\n${missed.map(n => `    - ${n}`).join('\n')}`)
  }
}

run()
  .then(() => { console.log('\n✅ Stock update complete.'); process.exit(0) })
  .catch(err => { console.error('❌ Error:', err); process.exit(1) })
