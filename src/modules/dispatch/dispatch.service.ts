import { eq, sql, type SQL } from 'drizzle-orm'
import { db, type DB } from '../../db/index.js'
import { dispatches } from '../../db/schema/index.js'
import { nextDispatchNumber } from '../../utils/dispatchNumber.js'
import { incrementDispatchedQuantity, reverseDispatchedQuantity } from '../finished-goods/finished-goods.service.js'
import { recordDispatchAgainstOrder, reverseDispatchAgainstOrder } from '../customer-purchase-orders/customer-purchase-orders.service.js'
import type { CreateDispatchBody, UpdateDispatchBody, ListDispatchesQuery, DispatchTrendQuery } from './dispatch.schema.js'

function toDispatchResponse(row: typeof dispatches.$inferSelect) {
  return {
    id:                          row.id,
    dispatchNumber:              row.dispatchNumber,
    batchId:                     row.batchId,
    companyId:                   row.companyId,
    quotationId:                 row.quotationId ?? null,
    customerPurchaseOrderId:     row.customerPurchaseOrderId ?? null,
    customerPurchaseOrderItemId: row.customerPurchaseOrderItemId ?? null,
    invoiceNumber:    row.invoiceNumber ?? null,
    dispatchDate:     row.dispatchDate,
    quantity:         Number(row.quantity),
    transportDetails: row.transportDetails ?? null,
    remarks:          row.remarks ?? null,
    voidedAt:         row.voidedAt ? row.voidedAt.toISOString() : null,
    voidReason:       row.voidReason ?? null,
    createdBy:        row.createdBy ?? null,
    createdAt:        row.createdAt.toISOString(),
  }
}

export type DispatchRow = ReturnType<typeof toDispatchResponse>

// ── Row shape returned by the raw joined SELECT (dispatches ⋈ batches ⋈ companies ⋈ users) ──
interface DispatchJoinRow {
  [key: string]: unknown
  id:               string
  dispatchNumber:   string
  batchId:          string
  companyId:        string
  quotationId:      string | null
  customerPurchaseOrderId:     string | null
  customerPurchaseOrderItemId: string | null
  invoiceNumber:    string | null
  dispatchDate:     string
  quantity:         string
  transportDetails: DispatchRow['transportDetails']
  remarks:          string | null
  voidedAt:         string | null
  voidReason:       string | null
  createdBy:        string | null
  createdAt:        string
  batchNumber:      string
  companyName:      string
  createdByName:    string | null
}

function toJoinedResponse(row: DispatchJoinRow) {
  return {
    id:               row.id,
    dispatchNumber:   row.dispatchNumber,
    batchId:          row.batchId,
    batchNumber:      row.batchNumber,
    companyId:        row.companyId,
    companyName:      row.companyName,
    quotationId:      row.quotationId,
    customerPurchaseOrderId:     row.customerPurchaseOrderId,
    customerPurchaseOrderItemId: row.customerPurchaseOrderItemId,
    invoiceNumber:    row.invoiceNumber,
    dispatchDate:     row.dispatchDate,
    quantity:         Number(row.quantity),
    transportDetails: row.transportDetails ?? null,
    remarks:          row.remarks,
    voidedAt:         row.voidedAt ? new Date(row.voidedAt).toISOString() : null,
    voidReason:       row.voidReason,
    createdBy:        row.createdBy,
    createdByName:    row.createdByName,
    createdAt:        new Date(row.createdAt).toISOString(),
  }
}

export type DispatchJoinedRow = ReturnType<typeof toJoinedResponse>

const SELECT_COLUMNS = sql`
  d.id,
  d.dispatch_number   AS "dispatchNumber",
  d.batch_id          AS "batchId",
  d.company_id        AS "companyId",
  d.quotation_id      AS "quotationId",
  d.customer_purchase_order_id      AS "customerPurchaseOrderId",
  d.customer_purchase_order_item_id AS "customerPurchaseOrderItemId",
  d.invoice_number    AS "invoiceNumber",
  d.dispatch_date     AS "dispatchDate",
  d.quantity,
  d.transport_details AS "transportDetails",
  d.remarks,
  d.voided_at         AS "voidedAt",
  d.void_reason       AS "voidReason",
  d.created_by        AS "createdBy",
  d.created_at        AS "createdAt",
  b.batch_number      AS "batchNumber",
  c.display_name      AS "companyName",
  u.name              AS "createdByName"
`

const JOINS = sql`
  FROM dispatches d
  JOIN batches   b ON b.id = d.batch_id
  JOIN companies c ON c.id = d.company_id
  LEFT JOIN users u ON u.id = d.created_by
`

export type CreateDispatchResult =
  | DispatchRow
  | { code: 'FINISHED_GOODS_NOT_FOUND' }
  | { code: 'INSUFFICIENT_STOCK'; available: number }

export async function createDispatch(data: CreateDispatchBody, createdBy: string): Promise<CreateDispatchResult> {
  return db.transaction(async (tx) => {
    const updated = await incrementDispatchedQuantity(tx as unknown as DB, data.batchId, data.quantity)

    if (!updated) {
      // Disambiguate: not-found/cancelled vs. active-but-insufficient-stock.
      // Nothing has been written yet in this transaction, so it's safe to
      // return early — the transaction rolls back with no side effects.
      const rows = await tx.execute<{
        status:             string
        producedQuantity:   string
        dispatchedQuantity: string
        reservedQuantity:   string
      }>(sql`
        SELECT status,
               produced_quantity   AS "producedQuantity",
               dispatched_quantity AS "dispatchedQuantity",
               reserved_quantity   AS "reservedQuantity"
        FROM finished_goods
        WHERE batch_id = ${data.batchId}
      `)
      const fg = rows[0]

      if (!fg || fg.status === 'Cancelled') {
        return { code: 'FINISHED_GOODS_NOT_FOUND' as const }
      }

      const available = Number(fg.producedQuantity) - Number(fg.dispatchedQuantity) - Number(fg.reservedQuantity)
      return { code: 'INSUFFICIENT_STOCK' as const, available }
    }

    const dispatchNumber = await nextDispatchNumber(tx as unknown as DB)

    const [row] = await tx
      .insert(dispatches)
      .values({
        dispatchNumber,
        batchId:          data.batchId,
        companyId:        data.companyId,
        quotationId:      data.quotationId ?? null,
        customerPurchaseOrderId:     data.customerPurchaseOrderId ?? null,
        customerPurchaseOrderItemId: data.customerPurchaseOrderItemId ?? null,
        invoiceNumber:    data.invoiceNumber ?? null,
        dispatchDate:     data.dispatchDate,
        quantity:         String(data.quantity),
        transportDetails: data.transportDetails ?? null,
        remarks:          data.remarks ?? null,
        createdBy,
      })
      .returning()

    if (row.customerPurchaseOrderId && row.customerPurchaseOrderItemId) {
      await recordDispatchAgainstOrder(
        tx as unknown as DB, row.customerPurchaseOrderId, row.customerPurchaseOrderItemId,
        row.id, Number(row.quantity), createdBy,
      )
    }

    return toDispatchResponse(row)
  })
}

export type UpdateDispatchResult =
  | DispatchRow
  | { code: 'DISPATCH_NOT_FOUND' }
  | { code: 'DISPATCH_ALREADY_VOIDED' }
  | { code: 'DISPATCH_BATCH_CANCELLED' }
  | { code: 'INSUFFICIENT_STOCK'; available: number }

/**
 * Edits a non-voided dispatch. `batchId` can never be changed here — reassigning
 * a dispatch to a different batch would require moving stock between two
 * unrelated finished-goods rows; the supported path for that is void + re-create.
 * When `quantity` changes, the old amount is freed from the batch's
 * dispatched_quantity and the new amount is re-validated against available
 * stock in the same transaction (mirrors createDispatch's guard).
 */
export async function updateDispatch(id: string, data: UpdateDispatchBody, _updatedBy: string): Promise<UpdateDispatchResult> {
  return db.transaction(async (tx) => {
    const [dispatch] = await tx.select().from(dispatches).where(eq(dispatches.id, id))
    if (!dispatch) return { code: 'DISPATCH_NOT_FOUND' as const }
    if (dispatch.voidedAt) return { code: 'DISPATCH_ALREADY_VOIDED' as const }

    const oldQuantity = Number(dispatch.quantity)
    const quantityChanged = data.quantity !== undefined && data.quantity !== oldQuantity

    if (quantityChanged) {
      const [fgRow] = await tx.execute<{ status: string }>(sql`
        SELECT status FROM finished_goods WHERE batch_id = ${dispatch.batchId}
      `)
      if (!fgRow || fgRow.status === 'Cancelled') {
        return { code: 'DISPATCH_BATCH_CANCELLED' as const }
      }

      // Free the old amount first so the re-validation below checks against
      // true availability rather than double-counting this dispatch's own stake.
      await reverseDispatchedQuantity(tx as unknown as DB, dispatch.batchId, oldQuantity)
      const updatedFg = await incrementDispatchedQuantity(tx as unknown as DB, dispatch.batchId, data.quantity!)

      if (!updatedFg) {
        const rows = await tx.execute<{
          producedQuantity:   string
          dispatchedQuantity: string
          reservedQuantity:   string
        }>(sql`
          SELECT produced_quantity   AS "producedQuantity",
                 dispatched_quantity AS "dispatchedQuantity",
                 reserved_quantity   AS "reservedQuantity"
          FROM finished_goods
          WHERE batch_id = ${dispatch.batchId}
        `)
        const fg = rows[0]
        const available = fg
          ? Number(fg.producedQuantity) - Number(fg.dispatchedQuantity) - Number(fg.reservedQuantity)
          : 0
        return { code: 'INSUFFICIENT_STOCK' as const, available }
      }
    }

    const [row] = await tx
      .update(dispatches)
      .set({
        companyId:        data.companyId ?? dispatch.companyId,
        quotationId:      data.quotationId !== undefined ? data.quotationId : dispatch.quotationId,
        invoiceNumber:    data.invoiceNumber !== undefined ? data.invoiceNumber : dispatch.invoiceNumber,
        dispatchDate:     data.dispatchDate ?? dispatch.dispatchDate,
        quantity:         data.quantity !== undefined ? String(data.quantity) : dispatch.quantity,
        transportDetails: data.transportDetails !== undefined ? data.transportDetails : dispatch.transportDetails,
        remarks:          data.remarks !== undefined ? data.remarks : dispatch.remarks,
      })
      .where(eq(dispatches.id, id))
      .returning()

    if (quantityChanged && row.customerPurchaseOrderId) {
      await reverseDispatchAgainstOrder(tx as unknown as DB, row.customerPurchaseOrderId)
    }

    return toDispatchResponse(row)
  })
}

export type VoidDispatchResult =
  | DispatchRow
  | { code: 'DISPATCH_NOT_FOUND' }
  | { code: 'DISPATCH_ALREADY_VOIDED' }

export async function voidDispatch(id: string, reason: string, _voidedBy: string): Promise<VoidDispatchResult> {
  return db.transaction(async (tx) => {
    const [dispatch] = await tx.select().from(dispatches).where(eq(dispatches.id, id))
    if (!dispatch) return { code: 'DISPATCH_NOT_FOUND' as const }
    if (dispatch.voidedAt) return { code: 'DISPATCH_ALREADY_VOIDED' as const }

    await reverseDispatchedQuantity(tx as unknown as DB, dispatch.batchId, Number(dispatch.quantity))

    const [row] = await tx
      .update(dispatches)
      .set({ voidedAt: new Date(), voidReason: reason })
      .where(eq(dispatches.id, id))
      .returning()

    if (row.customerPurchaseOrderId) {
      await reverseDispatchAgainstOrder(tx as unknown as DB, row.customerPurchaseOrderId)
    }

    return toDispatchResponse(row)
  })
}

export async function listDispatches(query: ListDispatchesQuery) {
  const offset = (query.page - 1) * query.limit

  const conditions: SQL[] = []
  if (query.batchNumber) conditions.push(sql`b.batch_number = ${query.batchNumber}`)
  if (query.companyId)   conditions.push(sql`d.company_id = ${query.companyId}`)
  if (query.dateFrom)    conditions.push(sql`d.dispatch_date >= ${query.dateFrom}`)
  if (query.dateTo)      conditions.push(sql`d.dispatch_date <= ${query.dateTo}`)
  if (query.includeVoided !== 'true') conditions.push(sql`d.voided_at IS NULL`)

  const whereClause = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``

  const countRows = await db.execute<{ total: string }>(sql`
    SELECT COUNT(*) AS total
    ${JOINS}
    ${whereClause}
  `)
  const total = Number(countRows[0]?.total ?? 0)

  const rows = await db.execute<DispatchJoinRow>(sql`
    SELECT ${SELECT_COLUMNS}
    ${JOINS}
    ${whereClause}
    ORDER BY d.dispatch_date DESC, d.created_at DESC
    LIMIT ${query.limit} OFFSET ${offset}
  `)

  return {
    dispatches: rows.map(toJoinedResponse),
    total,
    page:  query.page,
    limit: query.limit,
  }
}

export async function getDispatchByNumber(dispatchNumber: string): Promise<DispatchJoinedRow | null> {
  const rows = await db.execute<DispatchJoinRow>(sql`
    SELECT ${SELECT_COLUMNS}
    ${JOINS}
    WHERE d.dispatch_number = ${dispatchNumber}
  `)
  return rows[0] ? toJoinedResponse(rows[0]) : null
}

export async function getDispatchSummary(): Promise<{ count: number; quantity: number }> {
  const rows = await db.execute<{ count: string; quantity: string }>(sql`
    SELECT count(*) AS count, coalesce(sum(quantity), 0) AS quantity
    FROM dispatches
    WHERE dispatch_date = CURRENT_DATE
      AND voided_at IS NULL
  `)
  return {
    count:    Number(rows[0]?.count ?? 0),
    quantity: Number(rows[0]?.quantity ?? 0),
  }
}

// Zero-filled trailing dispatch-volume series, same generate_series pattern as
// customer-purchase-orders.service.ts::getOrderAnalytics's ordersByMonth.
export async function getDispatchTrend(query: DispatchTrendQuery): Promise<{
  granularity: 'week' | 'month'
  series: Array<{ period: string; count: number; quantity: number }>
}> {
  const { granularity, periods } = query

  const rows = granularity === 'week'
    ? await db.execute<{ [key: string]: unknown; period: string; count: string; quantity: string }>(sql`
        SELECT to_char(gs.period, 'YYYY-MM-DD') AS period,
          COUNT(d.id) AS count, COALESCE(SUM(d.quantity), 0) AS quantity
        FROM generate_series(
          date_trunc('week', CURRENT_DATE - make_interval(weeks => ${periods})),
          date_trunc('week', CURRENT_DATE),
          INTERVAL '1 week'
        ) AS gs(period)
        LEFT JOIN dispatches d
          ON date_trunc('week', d.dispatch_date) = gs.period AND d.voided_at IS NULL
        GROUP BY gs.period
        ORDER BY gs.period
      `)
    : await db.execute<{ [key: string]: unknown; period: string; count: string; quantity: string }>(sql`
        SELECT to_char(gs.period, 'YYYY-MM-DD') AS period,
          COUNT(d.id) AS count, COALESCE(SUM(d.quantity), 0) AS quantity
        FROM generate_series(
          date_trunc('month', CURRENT_DATE - make_interval(months => ${periods})),
          date_trunc('month', CURRENT_DATE),
          INTERVAL '1 month'
        ) AS gs(period)
        LEFT JOIN dispatches d
          ON date_trunc('month', d.dispatch_date) = gs.period AND d.voided_at IS NULL
        GROUP BY gs.period
        ORDER BY gs.period
      `)

  return {
    granularity,
    series: rows.map((r) => ({ period: r.period, count: Number(r.count), quantity: Number(r.quantity) })),
  }
}
