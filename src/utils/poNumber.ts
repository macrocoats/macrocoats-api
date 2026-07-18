import { sql } from 'drizzle-orm'
import type { DB } from '../db/index.js'
import { purchaseOrderSequences } from '../db/schema/index.js'

/**
 * Atomically generates the next purchase order number for the current year.
 * Format: PO-2026-0001
 *
 * Uses an INSERT ... ON CONFLICT DO UPDATE ... RETURNING pattern to prevent
 * race conditions under concurrent requests, without taking explicit locks.
 * Must be called inside a transaction.
 */
export async function nextPoNumber(db: DB): Promise<string> {
  const year = new Date().getFullYear()

  // Upsert the year row and bump the counter atomically
  const result = await db
    .insert(purchaseOrderSequences)
    .values({ year, lastN: 1 })
    .onConflictDoUpdate({
      target: purchaseOrderSequences.year,
      set:    { lastN: sql`${purchaseOrderSequences.lastN} + 1` },
    })
    .returning({ lastN: purchaseOrderSequences.lastN })

  const n = result[0]?.lastN ?? 1
  return `PO-${year}-${String(n).padStart(4, '0')}`
}
