import { db } from '../db/index.js'
import { inventoryItems } from '../db/schema/index.js'

export const DEFAULT_INVENTORY = [
  // ── Solvents & Oils ──────────────────────────────────────────────────────────
  { material: 'Exxol D60',                          unit: 'L'  as const, price: '120', sortOrder: 1  },
  { material: 'EXXSOL D80',                         unit: 'L'  as const, price: '130', sortOrder: 2  },
  { material: 'EXXSOL D145',                        unit: 'L'  as const, price: '140', sortOrder: 3  },
  { material: 'Sodium Petroleum Sulfonate',          unit: 'L'  as const, price: '220', sortOrder: 4  },
  { material: 'Calcium Petroleum Sulfonate',         unit: 'L'  as const, price: '275', sortOrder: 5  },
  { material: 'Methyl Oleate',                      unit: 'L'  as const, price: '120', sortOrder: 6  },
  { material: 'Oleic Acid',                         unit: 'L'  as const, price: '150', sortOrder: 7  },
  { material: 'Ethanol',                            unit: 'L'  as const, price: '90',  sortOrder: 8  },
  // IPA Pure — updated May 2026
  { material: 'IPA (Isopropyl Alcohol)',             unit: 'L'  as const, price: '110', sortOrder: 9  },
  { material: 'Butyl Glycol',                       unit: 'Kg' as const, price: '240', sortOrder: 10 },
  { material: 'Butyl Cellosolve',                   unit: 'L'  as const, price: '240', sortOrder: 11 },

  // ── Amines & Alkanolamines ───────────────────────────────────────────────────
  // TEA unit changed L→Kg (traded by weight); price updated May 2026
  { material: 'TEA (Triethanolamine)',               unit: 'Kg' as const, price: '200', sortOrder: 12 },
  { material: 'Monoethanolamine (MEA)',              unit: 'Kg' as const, price: '240', sortOrder: 13 },
  { material: 'Ammonium Hydroxide (25–30%)',         unit: 'L'  as const, price: '80',  sortOrder: 14 },
  { material: 'Liquid Ammonia 5%',                  unit: 'L'  as const, price: '50',  sortOrder: 15 },
  { material: 'Hexamine',                           unit: 'Kg' as const, price: '160', sortOrder: 16 },

  // ── Surfactants & Defoamers ──────────────────────────────────────────────────
  { material: 'LAE-9 (Lauryl Alcohol Ethoxylate)',  unit: 'Kg' as const, price: '600', sortOrder: 17 },
  // Alphox 200 price updated May 2026
  { material: 'Alphox 200 (Non-ionic Surfactant)',   unit: 'Kg' as const, price: '200', sortOrder: 18 },
  { material: 'Alfox',                              unit: 'Kg' as const, price: '200', sortOrder: 19 },
  { material: 'Silicone Defoamer',                  unit: 'Kg' as const, price: '450', sortOrder: 20 },
  { material: 'Non-silicone Defoamer',              unit: 'Kg' as const, price: '220', sortOrder: 21 },

  // ── Phosphates & Silicates ───────────────────────────────────────────────────
  // Prices updated May 2026
  { material: 'Mono Sodium Phosphate (NaH₂PO₄)',   unit: 'Kg' as const, price: '175', sortOrder: 22 },
  { material: 'Trisodium Phosphate (TSP)',           unit: 'Kg' as const, price: '60',  sortOrder: 23 },
  { material: 'Sodium Hexametaphosphate (SHMP)',     unit: 'Kg' as const, price: '170', sortOrder: 24 },
  { material: 'Sodium Metasilicate (SMS)',          unit: 'Kg' as const, price: '50',  sortOrder: 25 },
  { material: 'Phosphoric Acid',                    unit: 'Kg' as const, price: '130', sortOrder: 26 },

  // ── Nitrites & Nitrates ──────────────────────────────────────────────────────
  { material: 'Sodium Nitrite (NaNO₂)',             unit: 'Kg' as const, price: '120', sortOrder: 27 },
  { material: 'Sodium Nitrate (NaNO₃)',             unit: 'Kg' as const, price: '22',  sortOrder: 28 },

  // ── Alkalis & Carbonates ─────────────────────────────────────────────────────
  { material: 'Soda Ash (Sodium Carbonate)',         unit: 'Kg' as const, price: '65',  sortOrder: 29 },

  // ── Chelates & Gluconates ────────────────────────────────────────────────────
  { material: 'EDTA Disodium',                      unit: 'Kg' as const, price: '225', sortOrder: 30 },
  { material: 'Sodium Gluconate',                   unit: 'Kg' as const, price: '75',  sortOrder: 31 },

  // ── Corrosion Inhibitors & Passivators ───────────────────────────────────────
  { material: 'Zinc Oxide',                         unit: 'Kg' as const, price: '265', sortOrder: 32 },
  { material: 'Sodium Benzoate',                    unit: 'Kg' as const, price: '200', sortOrder: 33 },
  { material: 'Sodium Molybdate',                   unit: 'Kg' as const, price: '550', sortOrder: 34 },
  { material: 'Thiourea',                           unit: 'Kg' as const, price: '280', sortOrder: 35 },
  { material: 'TDO',                               unit: 'Kg' as const, price: '300', sortOrder: 36 },

  // ── Borates ──────────────────────────────────────────────────────────────────
  { material: 'Boric Acid',                         unit: 'Kg' as const, price: '170', sortOrder: 37 },
  { material: 'Borax Powder',                       unit: 'Kg' as const, price: '140', sortOrder: 38 },

  // ── Metal Salts ──────────────────────────────────────────────────────────────
  { material: 'Manganese Sulphate',                 unit: 'Kg' as const, price: '120', sortOrder: 39 },
  { material: 'Nickel Sulphate',                    unit: 'Kg' as const, price: '500', sortOrder: 40 },
  { material: 'Sodium Fluoride',                    unit: 'L'  as const, price: '140', sortOrder: 41 },

  // ── Packaging ────────────────────────────────────────────────────────────────
  // Can Charges: range ₹30–90; default ₹60 used for costing
  { material: 'Can Charges',                        unit: 'Kg' as const, price: '60',  sortOrder: 42 },

  // ── Utilities ────────────────────────────────────────────────────────────────
  { material: 'DM Water',                           unit: 'L'  as const, price: '0',   sortOrder: 43 },
]

export async function seedInventory() {
  console.log('🌱 Seeding inventory items...')

  // Delete existing defaults so we can re-seed idempotently
  await db.delete(inventoryItems)

  await db.insert(inventoryItems).values(
    DEFAULT_INVENTORY.map((item) => ({
      ...item,
      stock:     '',
      supplier:  '',
      isDefault: true,
    })),
  )

  console.log(`   ✅ Inserted ${DEFAULT_INVENTORY.length} inventory items`)
}
