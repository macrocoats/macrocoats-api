/**
 * Hard reset — drops and recreates all tables then re-seeds.
 * Use only in development.
 */

import { env } from '../config/env.js'

if (env.NODE_ENV === 'production') {
  console.error('❌ Cannot run reset in production.')
  process.exit(1)
}

import { db } from '../db/index.js'
import { sql } from 'drizzle-orm'

async function reset() {
  console.log('⚠️  Resetting database (development only)...')

  await db.execute(sql`
    DROP TABLE IF EXISTS
      access_log, refresh_tokens, quotation_line_items, quotation_sequences,
      quotations, inventory_items, product_documents, company_product_access,
      products, users, companies
    CASCADE
  `)

  console.log('   Tables dropped. Run `npm run db:push` then `npm run seed`.')
  process.exit(0)
}

reset().catch((err) => {
  console.error(err)
  process.exit(1)
})
