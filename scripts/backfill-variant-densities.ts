/**
 * Fills missing formulation variant component densities (see
 * src/seed/variantDensities.seed.ts for the source order and value table).
 * Only NULL densities are touched; re-running is a no-op. `npm run seed` runs
 * the same step, so this script exists for the dry-run diff.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-variant-densities.ts           # dry run (default)
 *   npx tsx --env-file=.env.local scripts/backfill-variant-densities.ts --apply   # write
 */
import { seedVariantDensities } from '../src/seed/variantDensities.seed.js'

async function main() {
  const fills = await seedVariantDensities({ apply: process.argv.includes('--apply') })
  for (const f of fills) {
    console.log([f.productKey, f.variantName, f.materialName, f.unit, f.density, f.source].join(' | '))
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
