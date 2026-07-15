import { eq, sql, type SQL } from 'drizzle-orm'
import { db, type DB } from '../../db/index.js'
import { finishedGoods, batches } from '../../db/schema/index.js'
import type { ListFinishedGoodsQuery } from './finished-goods.schema.js'

function computeBackfillStatus(producedQuantity: number, dispatchedQuantity: number): 'Available' | 'Partially Dispatched' | 'Fully Dispatched' {
  if (dispatchedQuantity <= 0) return 'Available'
  if (dispatchedQuantity >= producedQuantity) return 'Fully Dispatched'
  return 'Partially Dispatched'
}

// ── Row shape returned by the raw joined SELECT (finished_goods ⋈ batches) ──
interface FinishedGoodsJoinRow {
  [key: string]: unknown
  id:                 string
  batchId:            string
  productCode:        string
  companyName:        string
  variantId:          string | null
  variantName:        string | null
  producedQuantity:   string
  dispatchedQuantity: string
  reservedQuantity:   string
  status:             string
  cancelReason:       string | null
  createdAt:          string
  updatedAt:          string
  batchNumber:        string
  productionDate:     string
  dispatchCount:      string
}

function toResponse(row: FinishedGoodsJoinRow) {
  const producedQuantity   = Number(row.producedQuantity)
  const dispatchedQuantity = Number(row.dispatchedQuantity)
  const reservedQuantity   = Number(row.reservedQuantity)

  return {
    id:                 row.id,
    batchId:            row.batchId,
    batchNumber:        row.batchNumber,
    productionDate:     row.productionDate,
    productCode:        row.productCode,
    companyName:        row.companyName,
    variantId:          row.variantId,
    variantName:        row.variantName,
    producedQuantity,
    dispatchedQuantity,
    reservedQuantity,
    availableQuantity:  producedQuantity - dispatchedQuantity - reservedQuantity,
    status:             row.status,
    cancelReason:       row.cancelReason,
    dispatchCount:      Number(row.dispatchCount),
    createdAt:          new Date(row.createdAt).toISOString(),
    updatedAt:          new Date(row.updatedAt).toISOString(),
  }
}

export type FinishedGoodsRow = ReturnType<typeof toResponse>

const SELECT_COLUMNS = sql`
  fg.id,
  fg.batch_id            AS "batchId",
  fg.product_code        AS "productCode",
  fg.company_name        AS "companyName",
  fg.variant_id          AS "variantId",
  fg.variant_name        AS "variantName",
  fg.produced_quantity   AS "producedQuantity",
  fg.dispatched_quantity AS "dispatchedQuantity",
  fg.reserved_quantity   AS "reservedQuantity",
  fg.status,
  fg.cancel_reason       AS "cancelReason",
  fg.created_at          AS "createdAt",
  fg.updated_at          AS "updatedAt",
  b.batch_number         AS "batchNumber",
  b.production_date      AS "productionDate",
  (SELECT COUNT(*) FROM dispatches d WHERE d.batch_id = fg.batch_id AND d.voided_at IS NULL) AS "dispatchCount"
`

/**
 * Inserts the finished-goods inventory row for a newly created batch.
 * Called from batches.service.ts::createBatch inside the same transaction
 * that inserts the batch row — never call this outside a transaction.
 */
export async function createFinishedGoodsRecord(tx: DB, batchRow: typeof batches.$inferSelect): Promise<void> {
  await tx.insert(finishedGoods).values({
    batchId:            batchRow.id,
    productCode:        batchRow.productCode,
    companyName:        batchRow.companyName,
    variantId:          batchRow.variantId ?? null,
    variantName:        batchRow.variantName ?? null,
    producedQuantity:   batchRow.batchSize,
    dispatchedQuantity: '0',
    status:             'Available',
  })
}

export type BackfillFinishedGoodsResult =
  | FinishedGoodsRow
  | { code: 'BATCH_NOT_FOUND' }
  | { code: 'ALREADY_EXISTS' }
  | { code: 'QUANTITY_EXCEEDS_PRODUCED'; producedQuantity: number }

/**
 * One-time manual entry point for batches created before the Finished Goods
 * feature existed (no automatic hook ever ran for them). The operator supplies
 * the quantity actually still physically in stock; dispatchedQuantity is
 * back-derived as (producedQuantity - remainingQuantity) so the existing
 * status/availableQuantity logic works unchanged. Never overwrites an existing
 * finished_goods row — this is strictly for batches that don't have one yet.
 */
export async function backfillFinishedGoodsForBatch(
  batchNumber: string,
  remainingQuantity: number,
): Promise<BackfillFinishedGoodsResult> {
  const [batchRow] = await db.select().from(batches).where(eq(batches.batchNumber, batchNumber))
  if (!batchRow) return { code: 'BATCH_NOT_FOUND' }

  const [existing] = await db.select({ id: finishedGoods.id }).from(finishedGoods).where(eq(finishedGoods.batchId, batchRow.id))
  if (existing) return { code: 'ALREADY_EXISTS' }

  const producedQuantity = Number(batchRow.batchSize)
  if (remainingQuantity > producedQuantity) {
    return { code: 'QUANTITY_EXCEEDS_PRODUCED', producedQuantity }
  }

  const dispatchedQuantity = producedQuantity - remainingQuantity

  const [inserted] = await db.insert(finishedGoods).values({
    batchId:            batchRow.id,
    productCode:        batchRow.productCode,
    companyName:         batchRow.companyName,
    variantId:          batchRow.variantId ?? null,
    variantName:        batchRow.variantName ?? null,
    producedQuantity:   batchRow.batchSize,
    dispatchedQuantity: String(dispatchedQuantity),
    status:             computeBackfillStatus(producedQuantity, dispatchedQuantity),
  }).returning({ id: finishedGoods.id })

  return (await findByIdWithJoin(inserted.id))!
}

/**
 * Atomically increments dispatched_quantity for the finished-goods row backing
 * `batchId`, recomputing status, guarded by a single conditional UPDATE so
 * concurrent dispatches against the same batch serialize correctly instead of
 * racing on a read-modify-write. Returns the raw updated row (snake_case
 * columns) or undefined if the guard failed (not found / cancelled /
 * insufficient stock) — callers must disambiguate with a follow-up SELECT.
 */
export async function incrementDispatchedQuantity(
  tx: DB,
  batchId: string,
  qty: number,
): Promise<Record<string, unknown> | undefined> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    UPDATE finished_goods
    SET    dispatched_quantity = dispatched_quantity + ${qty}::numeric,
           status = CASE
                       WHEN produced_quantity - (dispatched_quantity + ${qty}::numeric) - reserved_quantity <= 0
                         THEN 'Fully Dispatched' ELSE 'Partially Dispatched' END,
           updated_at = now()
    WHERE  batch_id = ${batchId}
      AND  status <> 'Cancelled'
      AND  produced_quantity - dispatched_quantity - reserved_quantity >= ${qty}::numeric
    RETURNING *
  `)
  return rows[0]
}

/**
 * Symmetric atomic decrement used by dispatch-void. Never touches a
 * 'Cancelled' row (excluded via WHERE). Recomputes status: back to
 * 'Available' if the remaining dispatched quantity is <= 0, else
 * 'Partially Dispatched'.
 */
export async function reverseDispatchedQuantity(
  tx: DB,
  batchId: string,
  qty: number,
): Promise<Record<string, unknown> | undefined> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    UPDATE finished_goods
    SET    dispatched_quantity = dispatched_quantity - ${qty}::numeric,
           status = CASE
                       WHEN (dispatched_quantity - ${qty}::numeric) <= 0 THEN 'Available'
                       ELSE 'Partially Dispatched' END,
           updated_at = now()
    WHERE  batch_id = ${batchId}
      AND  status <> 'Cancelled'
    RETURNING *
  `)
  return rows[0]
}

export async function listFinishedGoods(query: ListFinishedGoodsQuery) {
  const offset = (query.page - 1) * query.limit

  const conditions: SQL[] = []
  if (query.companyName) conditions.push(sql`fg.company_name ILIKE ${`%${query.companyName}%`}`)
  if (query.productCode) conditions.push(sql`fg.product_code = ${query.productCode}`)
  if (query.status)       conditions.push(sql`fg.status = ${query.status}`)
  if (query.batchNumbers) {
    const numbers = query.batchNumbers.split(',').map((s) => s.trim()).filter(Boolean)
    if (numbers.length > 0) {
      conditions.push(sql`b.batch_number IN (${sql.join(numbers.map((n) => sql`${n}`), sql`, `)})`)
    }
  }

  const whereClause = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``

  const countRows = await db.execute<{ total: string }>(sql`
    SELECT COUNT(*) AS total
    FROM finished_goods fg
    JOIN batches b ON b.id = fg.batch_id
    ${whereClause}
  `)
  const total = Number(countRows[0]?.total ?? 0)

  const rows = await db.execute<FinishedGoodsJoinRow>(sql`
    SELECT ${SELECT_COLUMNS}
    FROM finished_goods fg
    JOIN batches b ON b.id = fg.batch_id
    ${whereClause}
    ORDER BY fg.created_at DESC
    LIMIT ${query.limit} OFFSET ${offset}
  `)

  return {
    finishedGoods: rows.map(toResponse),
    total,
    page:  query.page,
    limit: query.limit,
  }
}

export async function getFinishedGoodsByBatchNumber(batchNumber: string): Promise<FinishedGoodsRow | null> {
  const rows = await db.execute<FinishedGoodsJoinRow>(sql`
    SELECT ${SELECT_COLUMNS}
    FROM finished_goods fg
    JOIN batches b ON b.id = fg.batch_id
    WHERE b.batch_number = ${batchNumber}
  `)
  return rows[0] ? toResponse(rows[0]) : null
}

async function findByIdWithJoin(id: string): Promise<FinishedGoodsRow | null> {
  const rows = await db.execute<FinishedGoodsJoinRow>(sql`
    SELECT ${SELECT_COLUMNS}
    FROM finished_goods fg
    JOIN batches b ON b.id = fg.batch_id
    WHERE fg.id = ${id}
  `)
  return rows[0] ? toResponse(rows[0]) : null
}

export type SetFinishedGoodsStatusResult =
  | FinishedGoodsRow
  | null
  | { code: 'REASON_REQUIRED' }

export async function setFinishedGoodsStatus(
  id: string,
  status: 'Cancelled' | 'Available',
  reason?: string,
): Promise<SetFinishedGoodsStatusResult> {
  if (status === 'Cancelled' && !reason) {
    return { code: 'REASON_REQUIRED' }
  }

  const [updated] = await db
    .update(finishedGoods)
    .set({
      status,
      cancelReason: status === 'Cancelled' ? (reason ?? null) : null,
      updatedAt:    new Date(),
    })
    .where(eq(finishedGoods.id, id))
    .returning({ id: finishedGoods.id })

  if (!updated) return null

  return findByIdWithJoin(updated.id)
}

interface FinishedGoodsSummaryRow {
  [key: string]: unknown
  status:       string
  n:            string
  availableSum: string
}

export async function getFinishedGoodsSummary() {
  const rows = await db.execute<FinishedGoodsSummaryRow>(sql`
    SELECT status,
           count(*) AS n,
           coalesce(sum(produced_quantity - dispatched_quantity - reserved_quantity), 0) AS "availableSum"
    FROM finished_goods
    GROUP BY status
  `)

  let finishedGoodsQuantity = 0
  let partiallyDispatched   = 0
  let fullyDispatched       = 0
  let pendingDispatch       = 0
  let cancelled             = 0

  for (const row of rows) {
    const n = Number(row.n)
    if (row.status !== 'Cancelled') finishedGoodsQuantity += Number(row.availableSum)
    if (row.status === 'Partially Dispatched') partiallyDispatched = n
    if (row.status === 'Fully Dispatched')     fullyDispatched     = n
    if (row.status === 'Available')            pendingDispatch     = n
    if (row.status === 'Cancelled')            cancelled           = n
  }

  return { finishedGoodsQuantity, partiallyDispatched, fullyDispatched, pendingDispatch, cancelled }
}
