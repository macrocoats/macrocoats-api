import { db } from '../db/index.js'
import { packContainerMovements, packContainerStock } from '../db/schema/index.js'
import type { PackContainerId } from '../modules/batches/packContainers.js'

// Opening counts. Insert-if-missing: live stock is never overwritten, so change
// it on the Container stock page, not here.
const OPENING_STOCK: Record<PackContainerId, number> = {
  'can-50':           28,
  'can-30-blue':      92,
  'can-30-grey':      67,
  'drum-210-steel':   5,
  'drum-210-plastic': 2,
}

export async function seedPackContainers() {
  console.log('🛢️  Seeding container stock...')
  let inserted = 0
  for (const [containerId, stockQty] of Object.entries(OPENING_STOCK)) {
    const rows = await db.insert(packContainerStock).values({ containerId, stockQty }).onConflictDoNothing().returning()
    if (rows.length === 0) continue
    inserted += 1
    await db.insert(packContainerMovements).values({
      containerId, movementType: 'count', quantityChange: stockQty, stockAfter: stockQty, note: 'Opening stock',
    })
  }
  console.log(`   ${inserted} new container row(s) inserted.`)
}
