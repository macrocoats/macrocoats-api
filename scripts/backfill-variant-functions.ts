/**
 * Fills missing formulation variant material functions (see
 * src/seed/variantFunctions.seed.ts for the source order and draft texts).
 * Only NULL values are touched; re-running is a no-op. `npm run seed` runs
 * the same step, so this script exists for the dry-run diff.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-variant-functions.ts           # dry run (default)
 *   npx tsx --env-file=.env.local scripts/backfill-variant-functions.ts --apply   # write
 */
import { seedVariantFunctions } from '../src/seed/variantFunctions.seed.js'

async function main() {
  const fills = await seedVariantFunctions({ apply: process.argv.includes('--apply') })
  for (const f of fills) {
    console.log([f.productKey, f.variantName, f.materialName, f.source, f.text].join(' | '))
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
