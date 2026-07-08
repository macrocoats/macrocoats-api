import { eq, ilike, and, gte, lte, desc, count, sql, isNull, isNotNull } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { batches, productFormulationVariants } from '../../db/schema/index.js'
import { nextBatchNumber } from '../../utils/batchNumber.js'
import { USABLE_VARIANT_STATUSES, type VariantStatus } from '../optimizer/optimizer.types.js'
import type { CreateBatchBody, ListBatchesQuery, SaveCoaSnapshotBody } from './batches.schema.js'

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
    paidAt:              row.paidAt ? row.paidAt.toISOString() : null,
    variantId:           row.variantId ?? null,
    variantName:         row.variantName ?? null,
    batchType:           row.batchType,
    coaSnapshot:         row.coaSnapshot ?? null,
    notes:               row.notes ?? null,
    createdAt:           row.createdAt.toISOString(),
  }
}

/**
 * Discriminated result for createBatch — mirrors the null/'invalid_transition'/data
 * convention used elsewhere (e.g. transitionDocumentStatus, transitionVariantStatus),
 * but createBatch needs to carry extra context (variant name + status) for the 409
 * error message, so it returns a tagged object instead of a bare string literal.
 */
export type CreateBatchResult =
  | ReturnType<typeof toBatchResponse>
  | { code: 'VARIANT_NOT_FOUND' }
  | { code: 'VARIANT_NOT_USABLE'; variantName: string; status: VariantStatus }

export async function createBatch(data: CreateBatchBody, createdBy: string | null): Promise<CreateBatchResult> {
  // ── Variant approval gate ────────────────────────────────────────────────
  // AI-suggested / draft / reviewed variants must never reach production —
  // only 'approved' and 'production' variants may back a batch.
  if (data.variantId) {
    const [variant] = await db
      .select({ variantName: productFormulationVariants.variantName, status: productFormulationVariants.status })
      .from(productFormulationVariants)
      .where(eq(productFormulationVariants.id, data.variantId))

    if (!variant) return { code: 'VARIANT_NOT_FOUND' }

    if (!USABLE_VARIANT_STATUSES.includes(variant.status as VariantStatus)) {
      return { code: 'VARIANT_NOT_USABLE', variantName: variant.variantName, status: variant.status as VariantStatus }
    }
  }

  return db.transaction(async (tx) => {
    const batchNumber    = await nextBatchNumber(tx as unknown as typeof db, data.companyName)
    const productionDate = new Date().toISOString().slice(0, 10)

    // ── Inventory deduction ────────────────────────────────────────────────
    // Single atomic VALUES-CTE UPDATE eliminates the N+1 loop and the
    // read-modify-write race: `stock_qty = stock_qty - qty` is a delta applied
    // at the row lock level, so two concurrent batch creations using the same
    // material will serialize correctly instead of silently overwriting each other.
    const activeComponents = data.formulationSnapshot.components.filter(
      (c) => c.quantityUsed && c.quantityUsed > 0,
    )

    if (activeComponents.length > 0) {
      const valuesList = sql.join(
        activeComponents.map((c) => sql`(${c.name.toLowerCase()}, ${c.quantityUsed}::numeric)`),
        sql`, `,
      )
      await tx.execute(sql`
        UPDATE inventory_items AS t
        SET    stock_qty = t.stock_qty - v.qty
        FROM  (VALUES ${valuesList}) AS v(name, qty)
        WHERE  lower(t.material) = v.name
          AND  t.stock_qty IS NOT NULL
      `)
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
        batchType:           data.batchType ?? 'Production',
        notes:               data.notes ?? null,
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
  if (query.batchType)   conditions.push(eq(batches.batchType, query.batchType))
  if (query.dateFrom)    conditions.push(gte(batches.productionDate, query.dateFrom))
  if (query.dateTo)      conditions.push(lte(batches.productionDate, query.dateTo))
  if (query.paid === 'true')  conditions.push(isNotNull(batches.paidAt))
  if (query.paid === 'false') conditions.push(isNull(batches.paidAt))

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

export async function saveCoaSnapshot(batchNumber: string, snapshot: SaveCoaSnapshotBody) {
  const [row] = await db
    .update(batches)
    .set({ coaSnapshot: snapshot })
    .where(eq(batches.batchNumber, batchNumber))
    .returning()
  return row ? toBatchResponse(row) : null
}

export async function setPaymentStatus(batchNumber: string, paid: boolean) {
  const [row] = await db
    .update(batches)
    .set({ paidAt: paid ? new Date() : null })
    .where(eq(batches.batchNumber, batchNumber))
    .returning()
  return row ? toBatchResponse(row) : null
}

export async function clearCoaSnapshot(batchNumber: string): Promise<boolean> {
  const result = await db
    .update(batches)
    .set({ coaSnapshot: null })
    .where(eq(batches.batchNumber, batchNumber))
    .returning({ id: batches.id })
  return result.length > 0
}

export async function deleteBatch(id: string): Promise<boolean> {
  const result = await db
    .delete(batches)
    .where(eq(batches.id, id))
    .returning({ id: batches.id })

  return result.length > 0
}
