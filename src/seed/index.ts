/**
 * Master seed runner.
 * Run: npm run seed
 *
 * Idempotent — safe to run multiple times (uses upsert / onConflictDoUpdate).
 */

import { seedProducts }             from './products.seed.js'
import { seedInventory }            from './inventory.seed.js'
import { seedCompanies }            from './companies.seed.js'
import { seedFormulationVariants }  from './formulationVariants.seed.js'

async function main() {
  console.log('🚀 Starting seed...\n')

  await seedProducts()
  await seedInventory()
  await seedCompanies()
  await seedFormulationVariants()

  console.log('\n✅ Seed complete.')
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
