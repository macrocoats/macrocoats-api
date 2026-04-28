import { sql } from 'drizzle-orm'
import type { DB } from '../db/index.js'
import { batchSequences } from '../db/schema/index.js'

/**
 * Atomically generates the next batch number for a given company on the current day.
 * Format: XX-YYYYMMDD-NNN  (e.g. RA-20260426-001)
 *
 * Uses INSERT ... ON CONFLICT DO UPDATE to prevent race conditions.
 * Must be called inside a transaction.
 */
export async function nextBatchNumber(db: DB, companyName: string): Promise<string> {
  const now = new Date()
  const dateKey = now.toISOString().slice(0, 10).replace(/-/g, '')  // '20260426'
  const companyCode = companyName.trim().substring(0, 2).toUpperCase()

  const result = await db
    .insert(batchSequences)
    .values({ dateKey, companyCode, lastN: 1 })
    .onConflictDoUpdate({
      target: [batchSequences.dateKey, batchSequences.companyCode],
      set:    { lastN: sql`${batchSequences.lastN} + 1` },
    })
    .returning({ lastN: batchSequences.lastN })

  const n = result[0]?.lastN ?? 1
  return `${companyCode}-${dateKey}-${String(n).padStart(3, '0')}`
}
