import { db } from '../db/index.js'
import { inventoryItems } from '../db/schema/index.js'

export const DEFAULT_INVENTORY = [
  { material: 'Exxol D60',                         unit: 'L'  as const, price: '120', sortOrder: 1  },
  { material: 'EXXSOL D80',                         unit: 'L'  as const, price: '130', sortOrder: 2  },
  { material: 'EXXSOL D145',                        unit: 'L'  as const, price: '140', sortOrder: 3  },
  { material: 'Sodium Petroleum Sulfonate',          unit: 'L'  as const, price: '220', sortOrder: 4  },
  { material: 'Calcium Petroleum Sulfonate',         unit: 'L'  as const, price: '275', sortOrder: 5  },
  { material: 'Methyl Oleate',                      unit: 'L'  as const, price: '120', sortOrder: 6  },
  { material: 'Oleic Acid',                         unit: 'L'  as const, price: '150', sortOrder: 7  },
  { material: 'Ethanol',                            unit: 'L'  as const, price: '90',  sortOrder: 8  },
  { material: 'IPA (Isopropyl Alcohol)',             unit: 'L'  as const, price: '230', sortOrder: 9  },
  { material: 'TEA (Triethanolamine)',               unit: 'L'  as const, price: '85',  sortOrder: 10 },
  { material: 'Ammonium Hydroxide (25–30%)',         unit: 'L'  as const, price: '80',  sortOrder: 11 },
  { material: 'LAE-9 (Lauryl Alcohol Ethoxylate)',  unit: 'Kg' as const, price: '600', sortOrder: 12 },
  { material: 'Alphox 200 (Non-ionic Surfactant)',   unit: 'Kg' as const, price: '130', sortOrder: 13 },
  { material: 'Silicone Defoamer',                  unit: 'Kg' as const, price: '450', sortOrder: 14 },
  { material: 'Non-silicone Defoamer',              unit: 'Kg' as const, price: '220', sortOrder: 15 },
  { material: 'Mono Sodium Phosphate (NaH₂PO₄)',   unit: 'Kg' as const, price: '35',  sortOrder: 16 },
  { material: 'Sodium Nitrite (NaNO₂)',             unit: 'Kg' as const, price: '48',  sortOrder: 17 },
  { material: 'Sodium Nitrate (NaNO₃)',             unit: 'Kg' as const, price: '22',  sortOrder: 18 },
  { material: 'Sodium Metasilicate (SMS)',          unit: 'Kg' as const, price: '32',  sortOrder: 19 },
  { material: 'Soda Ash (Sodium Carbonate)',         unit: 'Kg' as const, price: '14',  sortOrder: 20 },
  { material: 'Trisodium Phosphate (TSP)',           unit: 'Kg' as const, price: '42',  sortOrder: 21 },
  { material: 'EDTA Disodium',                      unit: 'Kg' as const, price: '160', sortOrder: 22 },
  { material: 'DM Water',                           unit: 'L'  as const, price: '0',   sortOrder: 23 },
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
