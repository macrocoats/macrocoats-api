import { sql } from 'drizzle-orm'
import type { DB } from '../db/index.js'
import { quotationSequences } from '../db/schema/index.js'

/**
 * Atomically generates the next quotation number for the current year.
 * Format: UNIK-2026-001
 *
 * Uses SELECT ... FOR UPDATE to prevent race conditions under concurrent requests.
 * Must be called inside a transaction.
 */
export async function nextQuotNumber(db: DB): Promise<string> {
  const year = new Date().getFullYear()

  // Upsert the year row and bump the counter atomically
  const result = await db
    .insert(quotationSequences)
    .values({ year, lastN: 1 })
    .onConflictDoUpdate({
      target: quotationSequences.year,
      set:    { lastN: sql`${quotationSequences.lastN} + 1` },
    })
    .returning({ lastN: quotationSequences.lastN })

  const n = result[0]?.lastN ?? 1
  return `UNIK-${year}-${String(n).padStart(3, '0')}`
}
