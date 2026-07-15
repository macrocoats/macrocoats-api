import { sql } from 'drizzle-orm'
import type { DB } from '../db/index.js'
import { dispatchSequences } from '../db/schema/index.js'

/**
 * Atomically generates the next dispatch number for the current day.
 * Format: DSP-YYYYMMDD-NNN  (e.g. DSP-20260714-001)
 *
 * Uses INSERT ... ON CONFLICT DO UPDATE to prevent race conditions.
 * Must be called inside a transaction.
 */
export async function nextDispatchNumber(db: DB): Promise<string> {
  const now = new Date()
  const dateKey = now.toISOString().slice(0, 10).replace(/-/g, '')  // '20260714'

  const result = await db
    .insert(dispatchSequences)
    .values({ dateKey, lastN: 1 })
    .onConflictDoUpdate({
      target: dispatchSequences.dateKey,
      set:    { lastN: sql`${dispatchSequences.lastN} + 1` },
    })
    .returning({ lastN: dispatchSequences.lastN })

  const n = result[0]?.lastN ?? 1
  return `DSP-${dateKey}-${String(n).padStart(3, '0')}`
}
