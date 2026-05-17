import { eq, ilike, and, gte, lte, desc, count, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { batches, inventoryItems } from '../../db/schema/index.js'
import { nextBatchNumber } from '../../utils/batchNumber.js'
import type { CreateBatchBody, ListBatchesQuery } from './batches.schema.js'

function toBatchResponse(row: typeof batches.$inferSelect) {
  return {
    id:                  row.id,
    batchNumber:         row.batchNumber,
    productCode:         row.productCode,
    companyName:         row.companyName,
    batchSize:           Number(row.batchSize),
    productionDate:      row.productionDate,
    formulationSnapshot: row.formulationSnapshot,
    labelSnapshot:       row.labelSnapshot,
    costSummary:         row.costSummary,
    paymentDueDate:      row.paymentDueDate ?? null,
    paymentTermDays:     row.paymentTermDays ?? 45,
    variantId:           row.variantId ?? null,
    variantName:         row.variantName ?? null,
    createdAt:           row.createdAt.toISOString(),
  }
}

export async function createBatch(data: CreateBatchBody, createdBy: string | null) {
  return db.transaction(async (tx) => {
    const batchNumber    = await nextBatchNumber(tx as unknown as typeof db, data.companyName)
    const productionDate = new Date().toISOString().slice(0, 10)

    // ── Inventory deduction ────────────────────────────────────────────────
    for (const component of data.formulationSnapshot.components) {
      if (!component.quantityUsed || component.quantityUsed <= 0) continue

      const [item] = await tx
        .select({ id: inventoryItems.id, stockQty: inventoryItems.stockQty })
        .from(inventoryItems)
        .where(sql`lower(${inventoryItems.material}) = lower(${component.name})`)
        .limit(1)

      if (!item || item.stockQty === null) continue  // not tracked — skip

      const remaining = Number(item.stockQty) - component.quantityUsed

      await tx
        .update(inventoryItems)
        .set({ stockQty: String(remaining) })
        .where(eq(inventoryItems.id, item.id))
    }

    const labelSnapshotWithBatch = {
      ...data.labelSnapshot,
      batchNumber,
    }

    const [row] = await tx
      .insert(batches)
      .values({
        batchNumber,
        productCode:         data.productCode,
        companyName:         data.companyName,
        batchSize:           String(data.batchSize),
        productionDate,
        formulationSnapshot: data.formulationSnapshot,
        labelSnapshot:       labelSnapshotWithBatch,
        costSummary:         data.costSummary,
        paymentDueDate:      data.paymentDueDate ?? null,
        paymentTermDays:     data.paymentTermDays ?? 45,
        variantId:           data.variantId ?? null,
        variantName:         data.variantName ?? null,
        createdBy:           createdBy ?? undefined,
      })
      .returning()

    return toBatchResponse(row)
  })
}

export async function listBatches(query: ListBatchesQuery) {
  const offset = (query.page - 1) * query.limit

  const conditions = []
  if (query.companyName) conditions.push(ilike(batches.companyName, `%${query.companyName}%`))
  if (query.productCode) conditions.push(eq(batches.productCode, query.productCode))
  if (query.dateFrom)    conditions.push(gte(batches.productionDate, query.dateFrom))
  if (query.dateTo)      conditions.push(lte(batches.productionDate, query.dateTo))

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [{ total }] = await db.select({ total: count() }).from(batches).where(where)

  const rows = await db
    .select()
    .from(batches)
    .where(where)
    .orderBy(desc(batches.createdAt))
    .limit(query.limit)
    .offset(offset)

  return {
    batches: rows.map(toBatchResponse),
    total,
    page:  query.page,
    limit: query.limit,
  }
}

export async function getBatchByNumber(batchNumber: string) {
  const [row] = await db
    .select()
    .from(batches)
    .where(eq(batches.batchNumber, batchNumber))

  return row ? toBatchResponse(row) : null
}

export async function deleteBatch(id: string): Promise<boolean> {
  const result = await db
    .delete(batches)
    .where(eq(batches.id, id))
    .returning({ id: batches.id })

  return result.length > 0
}
