import { db } from '../db/index.js'
import { inventoryItems } from '../db/schema/index.js'
import { eq } from 'drizzle-orm'

// Confirmed market rates — applied to both new inserts and existing item updates on every `npm run seed`
const PRICE_UPDATE: Record<string, string> = {
  'Zinc Oxide':                         '265',
  'Phosphoric Acid':                    '158',
  'Sodium Nitrite (NaNO₂)':            '120',
  'Sodium Metasilicate (SMS)':          '50',
  'Trisodium Phosphate (TSP)':          '60',
  'Mono Sodium Phosphate (NaH₂PO₄)':  '175',
  'EDTA Disodium':                      '225',
  'Soda Ash (Sodium Carbonate)':        '65',
  'Sodium Gluconate':                   '75',
  'Sodium Hexametaphosphate (SHMP)':    '170',
  'Sodium Benzoate':                    '200',
  'Sodium Molybdate':                   '550',
  'Boric Acid':                         '170',
  'Borax Powder':                       '140',
  'Manganese Sulphate':                 '120',
  'Nickel Sulphate':                    '500',
  'TEA (Triethanolamine)':              '200',
  'Monoethanolamine (MEA)':             '240',
  'Butyl Glycol':                       '240',
  'Butyl Cellosolve':                   '240',
  'Thiourea':                           '280',
  'Hexamine':                           '160',
  'TDO':                                '300',
  'IPA (Isopropyl Alcohol)':            '110',
  'Ammonium Hydroxide (25–30%)':        '50',
  'Sodium Fluoride':                    '140',
  'Alphox 200 (Non-ionic Surfactant)':  '200',
}

// Current stock quantities — applied to both new inserts and existing item updates on every `npm run seed`
const STOCK_UPDATE: Record<string, { stock: string; stockQty: string }> = {
  'Non-silicone Defoamer':              { stock: '10 Kg',   stockQty: '10'   },
  'Silicone Defoamer':                  { stock: '2 Kg',    stockQty: '2'    },
  'Poly Ethylene Glycol 400 (PEG 400)': { stock: '7 Kg',    stockQty: '7'    },
  'Isopropyl Acetate':                  { stock: '5 L',     stockQty: '5'    },
  'Biocide Yellow':                     { stock: '1 L',     stockQty: '1'    },
  'Biocide Blue':                       { stock: '2 L',     stockQty: '2'    },
  'Propylene Glycol (PG)':              { stock: '700 mL',  stockQty: '0.7'  },
  'Sodium Lauryl Ether Sulfate (SLES)': { stock: '8 L',     stockQty: '8'    },
  'TEA (Triethanolamine)':              { stock: '5 L',     stockQty: '5'    },
  'Zinc Oxide':                         { stock: '94.6 Kg', stockQty: '94.6' },
  'Trisodium Phosphate (TSP)':          { stock: '61.1 Kg', stockQty: '61.1' },
  'Hydroxylamine Sulfate':              { stock: '23.9 Kg', stockQty: '23.9' },
  'Sodium Metasilicate (SMS)':          { stock: '55 Kg',   stockQty: '55'   },
  'Soda Ash (Sodium Carbonate)':        { stock: '61 Kg',   stockQty: '61'   },
  'Citric Acid':                        { stock: '3.4 Kg',  stockQty: '3.4'  },
  'Sodium Nitrate (NaNO₃)':            { stock: '17.1 Kg', stockQty: '17.1' },
  'Caustic Soda (NaOH)':               { stock: '25.6 Kg', stockQty: '25.6' },
  'Sodium Gluconate':                   { stock: '700 g',   stockQty: '0.7'  },
  'EDTA Disodium':                      { stock: '22.8 Kg', stockQty: '22.8' },
  'Alphox 200 (Non-ionic Surfactant)':  { stock: '29.8 Kg', stockQty: '29.8' },
  'LAE-7':                              { stock: '46.5 Kg', stockQty: '46.5' },
  'Phosphoric Acid':                    { stock: '29.3 Kg', stockQty: '29.3' },
  'Methyl Oleate':                      { stock: '36.5 Kg', stockQty: '36.5' },
  'LAE-9 (Lauryl Alcohol Ethoxylate)':  { stock: '30.9 Kg', stockQty: '30.9' },
  'Oleic Acid':                         { stock: '42.8 Kg', stockQty: '42.8' },
  'Sorbitan Monooleate':                { stock: '10 Kg',   stockQty: '10'   },
  'IPA (Isopropyl Alcohol)':            { stock: '270 L',   stockQty: '270'  },
  'TAP 234':                            { stock: '25 Kg',   stockQty: '25'   },
  'TAP 4554':                           { stock: '28 Kg',   stockQty: '28'   },
  'Exxol 32D':                          { stock: '50 Kg',   stockQty: '50'   },
  'EXXSOL D145':                        { stock: '50 Kg',   stockQty: '50'   },
  'Exxol D60':                          { stock: '50 Kg',   stockQty: '50'   },
  'TAP 4500':                           { stock: '80 Kg',   stockQty: '80'   },
  'TAP 363':                            { stock: '28 Kg',   stockQty: '28'   },
}

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
  { material: 'Ammonium Hydroxide (25–30%)',         unit: 'L'  as const, price: '50',  sortOrder: 14 },
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
  { material: 'Phosphoric Acid',                    unit: 'Kg' as const, price: '158', sortOrder: 26 },

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

  // ── Surfactants (additional) ─────────────────────────────────────────────────
  { material: 'LAE-7',                              unit: 'Kg' as const, price: '0',   sortOrder: 44 },
  { material: 'Sodium Lauryl Ether Sulfate (SLES)', unit: 'L'  as const, price: '0',   sortOrder: 45 },
  { material: 'Sorbitan Monooleate',                unit: 'Kg' as const, price: '0',   sortOrder: 46 },
  { material: 'Poly Ethylene Glycol 400 (PEG 400)', unit: 'Kg' as const, price: '0',   sortOrder: 47 },
  { material: 'Propylene Glycol (PG)',               unit: 'L'  as const, price: '0',   sortOrder: 48 },

  // ── Solvents (additional) ────────────────────────────────────────────────────
  { material: 'Isopropyl Acetate',                  unit: 'L'  as const, price: '0',   sortOrder: 49 },
  { material: 'Exxol 32D',                          unit: 'L'  as const, price: '0',   sortOrder: 50 },

  // ── Biocides ─────────────────────────────────────────────────────────────────
  { material: 'Biocide Yellow',                     unit: 'L'  as const, price: '0',   sortOrder: 51 },
  { material: 'Biocide Blue',                       unit: 'L'  as const, price: '0',   sortOrder: 52 },

  // ── Alkalis (additional) ─────────────────────────────────────────────────────
  { material: 'Caustic Soda (NaOH)',                unit: 'Kg' as const, price: '0',   sortOrder: 53 },

  // ── Acids ────────────────────────────────────────────────────────────────────
  { material: 'Citric Acid',                        unit: 'Kg' as const, price: '0',   sortOrder: 54 },

  // ── Amines (additional) ──────────────────────────────────────────────────────
  { material: 'Hydroxylamine Sulfate',              unit: 'Kg' as const, price: '0',   sortOrder: 55 },

  // ── TAP Additives ─────────────────────────────────────────────────────────────
  { material: 'TAP 234',                            unit: 'Kg' as const, price: '0',   sortOrder: 56 },
  { material: 'TAP 363',                            unit: 'Kg' as const, price: '0',   sortOrder: 57 },
  { material: 'TAP 4500',                           unit: 'Kg' as const, price: '0',   sortOrder: 58 },
  { material: 'TAP 4554',                           unit: 'Kg' as const, price: '0',   sortOrder: 59 },
]

export async function seedInventory() {
  console.log('🌱 Seeding inventory items...')

  const existing = await db.select({ material: inventoryItems.material }).from(inventoryItems)
  const existingNames = new Set(existing.map((r) => r.material))

  const toInsert = DEFAULT_INVENTORY.filter((item) => !existingNames.has(item.material))

  if (toInsert.length > 0) {
    await db.insert(inventoryItems).values(
      toInsert.map((item) => {
        const stockData = STOCK_UPDATE[item.material]
        return {
          ...item,
          stock:     stockData?.stock    ?? '',
          stockQty:  stockData?.stockQty ?? null,
          supplier:  '',
          isDefault: true,
        }
      }),
    )
    console.log(`   ✅ Inserted ${toInsert.length} new inventory items (${existingNames.size} already existed)`)
  } else {
    console.log('   ⏭️  All inventory items already exist — nothing inserted')
  }

  // Update stock quantities for items that already existed in the DB
  const toUpdateStock = Object.entries(STOCK_UPDATE).filter(([material]) => existingNames.has(material))
  for (const [material, stockData] of toUpdateStock) {
    await db
      .update(inventoryItems)
      .set({ stock: stockData.stock, stockQty: stockData.stockQty })
      .where(eq(inventoryItems.material, material))
  }
  if (toUpdateStock.length > 0) {
    console.log(`   ✅ Updated stock for ${toUpdateStock.length} existing inventory items`)
  }

  // Update confirmed market prices for all items in the DB (new + existing)
  const allNames = new Set([...existingNames, ...toInsert.map((i) => i.material)])
  const toUpdatePrice = Object.entries(PRICE_UPDATE).filter(([material]) => allNames.has(material))
  for (const [material, price] of toUpdatePrice) {
    await db
      .update(inventoryItems)
      .set({ price })
      .where(eq(inventoryItems.material, material))
  }
  if (toUpdatePrice.length > 0) {
    console.log(`   ✅ Updated price for ${toUpdatePrice.length} inventory items`)
  }
}
