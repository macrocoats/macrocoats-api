import { sql } from 'drizzle-orm'
import type { DB } from '../db/index.js'
import { customerPurchaseOrderSequences } from '../db/schema/index.js'

/**
 * Atomically generates the next customer purchase order number for the
 * current year. Format: CPO-2026-001
 *
 * Lock-free INSERT ... ON CONFLICT DO UPDATE ... RETURNING, mirrors
 * nextQuotNumber(). Must be called inside a transaction.
 */
export async function nextCustomerOrderNumber(db: DB): Promise<string> {
  const year = new Date().getFullYear()

  const result = await db
    .insert(customerPurchaseOrderSequences)
    .values({ year, lastN: 1 })
    .onConflictDoUpdate({
      target: customerPurchaseOrderSequences.year,
      set:    { lastN: sql`${customerPurchaseOrderSequences.lastN} + 1` },
    })
    .returning({ lastN: customerPurchaseOrderSequences.lastN })

  const n = result[0]?.lastN ?? 1
  return `CPO-${year}-${String(n).padStart(3, '0')}`
}
