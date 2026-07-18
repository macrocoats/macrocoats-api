import { join, dirname } from 'node:path'
import { mkdir, unlink, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { randomUUID } from 'node:crypto'
import { eq, and, isNull, sql, type SQL } from 'drizzle-orm'
import { db, type DB } from '../../db/index.js'
import {
  customerPurchaseOrders, customerPurchaseOrderItems, customerPurchaseOrderDocuments,
  customerPurchaseOrderBatches, customerPurchaseOrderTimeline, companies, quotations, batches, users,
} from '../../db/schema/index.js'
import { env } from '../../config/env.js'
import { nextCustomerOrderNumber } from '../../utils/customerOrderNumber.js'
import type {
  CreateCustomerOrderBody, UpdateCustomerOrderBody, ListCustomerOrdersQuery,
  LinkBatchBody, DocumentMeta, OrderStatus, OrderPriority,
} from './customer-purchase-orders.schema.js'

/** Manually-settable transitions. Auto-progression among the production/dispatch
 *  states (production_planned…completed) is driven by recomputeStatus() based on
 *  batch-link/dispatch aggregates, not this map — this map only governs what a
 *  human can explicitly set via PATCH .../status. */
const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft:                 ['confirmed', 'cancelled'],
  confirmed:              ['production_planned', 'cancelled'],
  production_planned:     ['in_production', 'cancelled'],
  in_production:          ['cancelled'],
  partially_produced:     ['cancelled'],
  ready_for_dispatch:     ['cancelled'],
  partially_dispatched:   ['cancelled'],
  completed:              [],
  cancelled:              [],
}

// ── Response shaping ───────────────────────────────────────────────────────────

function toOrderResponse(row: typeof customerPurchaseOrders.$inferSelect) {
  return {
    id:                   row.id,
    poNumber:             row.poNumber,
    customerId:           row.customerId,
    customerPoNumber:     row.customerPoNumber,
    customerPoDate:       row.customerPoDate,
    referenceQuotationId: row.referenceQuotationId,
    expectedDeliveryDate: row.expectedDeliveryDate,
    customerContact:      row.customerContact,
    remarks:              row.remarks,
    status:               row.status as OrderStatus,
    priority:             row.priority as OrderPriority,
    totalQuantity:        Number(row.totalQuantity),
    totalValue:           Number(row.totalValue),
    createdBy:            row.createdBy,
    createdAt:            row.createdAt.toISOString(),
    updatedAt:            row.updatedAt.toISOString(),
  }
}

function toItemResponse(row: typeof customerPurchaseOrderItems.$inferSelect) {
  return {
    id:                   row.id,
    orderId:              row.orderId,
    sortOrder:            row.sortOrder,
    productKey:           row.productKey,
    variantId:            row.variantId,
    customerProductCode:  row.customerProductCode,
    quantityOrdered:      Number(row.quantityOrdered),
    unit:                 row.unit,
    unitPrice:            Number(row.unitPrice),
    amount:               Number(row.amount),
    remarks:              row.remarks,
  }
}

function toDocumentResponse(row: typeof customerPurchaseOrderDocuments.$inferSelect) {
  return {
    id:                   row.id,
    orderId:              row.orderId,
    category:             row.category,
    filename:             row.filename,
    mimeType:             row.mimeType,
    sizeBytes:            row.sizeBytes,
    version:              row.version,
    supersedesDocumentId: row.supersedesDocumentId,
    remarks:              row.remarks,
    uploadedBy:            row.uploadedBy,
    uploadedAt:            row.uploadedAt.toISOString(),
  }
}

function toBatchLinkResponse(row: typeof customerPurchaseOrderBatches.$inferSelect) {
  return {
    id:             row.id,
    orderId:        row.orderId,
    orderItemId:    row.orderItemId,
    batchId:        row.batchId,
    linkedQuantity: Number(row.linkedQuantity),
    remarks:        row.remarks,
    linkedBy:       row.linkedBy,
    linkedAt:       row.linkedAt.toISOString(),
  }
}

function toTimelineResponse(row: typeof customerPurchaseOrderTimeline.$inferSelect) {
  return {
    id:        row.id,
    orderId:   row.orderId,
    eventType: row.eventType,
    userId:    row.userId,
    remarks:   row.remarks,
    metadata:  row.metadata ?? null,
    at:        row.at.toISOString(),
  }
}

function computeTotals(items: { quantityOrdered: number; amount: number }[]) {
  return items.reduce(
    (acc, item) => ({
      totalQuantity: acc.totalQuantity + item.quantityOrdered,
      totalValue:    acc.totalValue + item.amount,
    }),
    { totalQuantity: 0, totalValue: 0 },
  )
}

async function insertTimelineEvent(
  tx: DB,
  orderId: string,
  eventType: typeof customerPurchaseOrderTimeline.$inferInsert['eventType'],
  userId: string | null,
  remarks: string | null,
  metadata?: Record<string, unknown>,
) {
  await tx.insert(customerPurchaseOrderTimeline).values({
    orderId, eventType, userId, remarks,
    metadata: metadata ?? null,
  })
}

// ── Create ──────────────────────────────────────────────────────────────────────

export async function createOrder(data: CreateCustomerOrderBody, createdBy: string) {
  return db.transaction(async (tx) => {
    const poNumber = await nextCustomerOrderNumber(tx as unknown as DB)

    const itemsWithAmount = data.items.map((item) => ({
      ...item,
      amount: Math.round(item.quantityOrdered * item.unitPrice * 100) / 100,
    }))
    const totals = computeTotals(itemsWithAmount)

    const [orderRow] = await tx
      .insert(customerPurchaseOrders)
      .values({
        poNumber,
        customerId:           data.customerId,
        customerPoNumber:     data.customerPoNumber,
        customerPoDate:       data.customerPoDate,
        referenceQuotationId: data.referenceQuotationId ?? null,
        expectedDeliveryDate: data.expectedDeliveryDate ?? null,
        customerContact:      data.customerContact ?? null,
        priority:             data.priority,
        remarks:              data.remarks ?? null,
        totalQuantity:        String(totals.totalQuantity),
        totalValue:           String(totals.totalValue),
        createdBy,
      })
      .returning()

    await tx.insert(customerPurchaseOrderItems).values(
      itemsWithAmount.map((item, index) => ({
        orderId:             orderRow.id,
        sortOrder:           index + 1,
        productKey:          item.productKey,
        variantId:           item.variantId ?? null,
        customerProductCode: item.customerProductCode ?? null,
        quantityOrdered:     String(item.quantityOrdered),
        unit:                item.unit,
        unitPrice:           String(item.unitPrice),
        amount:              String(item.amount),
        remarks:             item.remarks ?? null,
      })),
    )

    await insertTimelineEvent(tx as unknown as DB, orderRow.id, 'po_received', createdBy, 'Customer PO received.')

    return toOrderResponse(orderRow)
  })
}

// ── Update (PUT — full replace of header + items) ────────────────────────────────

export type UpdateOrderResult =
  | ReturnType<typeof toOrderResponse>
  | { code: 'NOT_FOUND' }
  | { code: 'LOCKED' }

export async function updateOrder(id: string, data: UpdateCustomerOrderBody): Promise<UpdateOrderResult> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(customerPurchaseOrders)
      .where(and(eq(customerPurchaseOrders.id, id), isNull(customerPurchaseOrders.deletedAt)))
    if (!existing) return { code: 'NOT_FOUND' as const }
    if (!['draft', 'confirmed'].includes(existing.status)) return { code: 'LOCKED' as const }

    const itemsWithAmount = data.items.map((item) => ({
      ...item,
      amount: Math.round(item.quantityOrdered * item.unitPrice * 100) / 100,
    }))
    const totals = computeTotals(itemsWithAmount)

    const [orderRow] = await tx
      .update(customerPurchaseOrders)
      .set({
        customerId:           data.customerId,
        customerPoNumber:     data.customerPoNumber,
        customerPoDate:       data.customerPoDate,
        referenceQuotationId: data.referenceQuotationId ?? null,
        expectedDeliveryDate: data.expectedDeliveryDate ?? null,
        customerContact:      data.customerContact ?? null,
        priority:             data.priority,
        remarks:              data.remarks ?? null,
        totalQuantity:        String(totals.totalQuantity),
        totalValue:           String(totals.totalValue),
        updatedAt:            new Date(),
      })
      .where(eq(customerPurchaseOrders.id, id))
      .returning()

    await tx.delete(customerPurchaseOrderItems).where(eq(customerPurchaseOrderItems.orderId, id))
    await tx.insert(customerPurchaseOrderItems).values(
      itemsWithAmount.map((item, index) => ({
        orderId:             id,
        sortOrder:           index + 1,
        productKey:          item.productKey,
        variantId:           item.variantId ?? null,
        customerProductCode: item.customerProductCode ?? null,
        quantityOrdered:     String(item.quantityOrdered),
        unit:                item.unit,
        unitPrice:           String(item.unitPrice),
        amount:              String(item.amount),
        remarks:             item.remarks ?? null,
      })),
    )

    return toOrderResponse(orderRow)
  })
}

// ── Status transitions ───────────────────────────────────────────────────────────

export type SetStatusResult =
  | ReturnType<typeof toOrderResponse>
  | { code: 'NOT_FOUND' }
  | { code: 'INVALID_TRANSITION' }

export async function setOrderStatus(
  id: string, status: OrderStatus, userId: string, reason?: string,
): Promise<SetStatusResult> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(customerPurchaseOrders)
      .where(and(eq(customerPurchaseOrders.id, id), isNull(customerPurchaseOrders.deletedAt)))
    if (!existing) return { code: 'NOT_FOUND' as const }

    const allowed = STATUS_TRANSITIONS[existing.status] ?? []
    if (!allowed.includes(status)) return { code: 'INVALID_TRANSITION' as const }

    const [row] = await tx
      .update(customerPurchaseOrders)
      .set({ status, updatedAt: new Date() })
      .where(eq(customerPurchaseOrders.id, id))
      .returning()

    await insertTimelineEvent(
      tx as unknown as DB, id, status === 'cancelled' ? 'cancelled' : 'status_changed', userId, reason ?? null,
      { fromStatus: existing.status, toStatus: status },
    )

    return toOrderResponse(row)
  })
}

/**
 * Recomputes status from item-level production/dispatch aggregates. Only
 * acts once an order is past 'draft' (must be manually confirmed first) and
 * not yet 'cancelled' (terminal). Called after batch-link and dispatch
 * events, inside the same transaction as the event that triggered it.
 */
async function recomputeStatus(tx: DB, orderId: string): Promise<void> {
  const [order] = await tx.select().from(customerPurchaseOrders).where(eq(customerPurchaseOrders.id, orderId))
  if (!order || ['draft', 'cancelled'].includes(order.status)) return

  const rows = await tx.execute<{ ordered: string; produced: string; dispatched: string }>(sql`
    SELECT
      COALESCE(SUM(i.quantity_ordered), 0) AS ordered,
      COALESCE(SUM(pb.produced), 0)        AS produced,
      COALESCE(SUM(db.dispatched), 0)      AS dispatched
    FROM customer_purchase_order_items i
    LEFT JOIN (
      SELECT order_item_id, SUM(linked_quantity) AS produced
      FROM customer_purchase_order_batches GROUP BY order_item_id
    ) pb ON pb.order_item_id = i.id
    LEFT JOIN (
      SELECT customer_purchase_order_item_id, SUM(quantity) AS dispatched
      FROM dispatches WHERE voided_at IS NULL GROUP BY customer_purchase_order_item_id
    ) db ON db.customer_purchase_order_item_id = i.id
    WHERE i.order_id = ${orderId}
  `)
  const agg = rows[0]
  const ordered    = Number(agg?.ordered ?? 0)
  const produced   = Number(agg?.produced ?? 0)
  const dispatched = Number(agg?.dispatched ?? 0)

  let nextStatus: OrderStatus
  if (dispatched > 0 && dispatched >= ordered)      nextStatus = 'completed'
  else if (dispatched > 0)                          nextStatus = 'partially_dispatched'
  else if (produced > 0 && produced >= ordered)     nextStatus = 'ready_for_dispatch'
  else if (produced > 0)                            nextStatus = 'partially_produced'
  else if (['confirmed', 'production_planned'].includes(order.status)) nextStatus = 'in_production'
  else                                               nextStatus = order.status as OrderStatus

  if (nextStatus !== order.status) {
    await tx.update(customerPurchaseOrders)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(customerPurchaseOrders.id, orderId))
    await insertTimelineEvent(
      tx, orderId, nextStatus === 'completed' ? 'completed' : 'status_changed', null, null,
      { fromStatus: order.status, toStatus: nextStatus },
    )
  }
}

export async function softDeleteOrder(id: string): Promise<'deleted' | null> {
  const [row] = await db
    .update(customerPurchaseOrders)
    .set({ deletedAt: new Date() })
    .where(and(eq(customerPurchaseOrders.id, id), isNull(customerPurchaseOrders.deletedAt)))
    .returning()
  return row ? 'deleted' : null
}

// ── Read ────────────────────────────────────────────────────────────────────────

export async function listOrders(query: ListCustomerOrdersQuery) {
  const offset = (query.page - 1) * query.limit

  const conditions: SQL[] = [sql`o.deleted_at IS NULL`]
  if (query.customerId) conditions.push(sql`o.customer_id = ${query.customerId}`)
  if (query.status)     conditions.push(sql`o.status = ${query.status}`)
  if (query.priority)   conditions.push(sql`o.priority = ${query.priority}`)
  if (query.search) {
    const like = `%${query.search}%`
    conditions.push(sql`(o.po_number ILIKE ${like} OR o.customer_po_number ILIKE ${like} OR c.display_name ILIKE ${like})`)
  }
  if (query.overdue === 'true') {
    conditions.push(sql`o.expected_delivery_date < CURRENT_DATE AND o.status NOT IN ('completed', 'cancelled')`)
  }
  const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`

  const sortColumn: Record<string, SQL> = {
    createdAt:             sql`o.created_at`,
    expectedDeliveryDate:  sql`o.expected_delivery_date`,
    customerPoDate:        sql`o.customer_po_date`,
    totalValue:            sql`o.total_value`,
  }
  const orderClause = sql`ORDER BY ${sortColumn[query.sortBy]} ${sql.raw(query.sortDir.toUpperCase())}`

  const countRows = await db.execute<{ total: string }>(sql`
    SELECT COUNT(*) AS total FROM customer_purchase_orders o
    JOIN companies c ON c.id = o.customer_id
    ${whereClause}
  `)
  const total = Number(countRows[0]?.total ?? 0)

  const rows = await db.execute<{
    [key: string]: unknown
    id: string; poNumber: string; customerId: string; customerName: string
    customerPoNumber: string; customerPoDate: string; referenceQuotationId: string | null
    referenceQuotNumber: string | null
    expectedDeliveryDate: string | null; status: string; priority: string
    totalQuantity: string; totalValue: string; createdAt: string
    createdBy: string | null; createdByName: string | null
    productNames: string | null; productCount: string | null
    totalQuantityProduced: string; totalQuantityDispatched: string
  }>(sql`
    SELECT
      o.id, o.po_number AS "poNumber", o.customer_id AS "customerId", c.display_name AS "customerName",
      o.customer_po_number AS "customerPoNumber", o.customer_po_date AS "customerPoDate",
      o.reference_quotation_id AS "referenceQuotationId", q.quot_number AS "referenceQuotNumber",
      o.expected_delivery_date AS "expectedDeliveryDate", o.status, o.priority,
      o.total_quantity AS "totalQuantity", o.total_value AS "totalValue", o.created_at AS "createdAt",
      o.created_by AS "createdBy", u.name AS "createdByName",
      prod.product_names AS "productNames", prod.product_count AS "productCount",
      COALESCE(pb.produced, 0) AS "totalQuantityProduced",
      COALESCE(db.dispatched, 0) AS "totalQuantityDispatched"
    FROM customer_purchase_orders o
    JOIN companies c ON c.id = o.customer_id
    LEFT JOIN users u ON u.id = o.created_by
    LEFT JOIN quotations q ON q.id = o.reference_quotation_id
    LEFT JOIN (
      SELECT i.order_id,
        STRING_AGG(DISTINCT p.display_name, ', ' ORDER BY p.display_name) AS product_names,
        COUNT(DISTINCT i.product_key) AS product_count
      FROM customer_purchase_order_items i
      JOIN products p ON p.key = i.product_key
      GROUP BY i.order_id
    ) prod ON prod.order_id = o.id
    LEFT JOIN (
      SELECT order_id, SUM(linked_quantity) AS produced
      FROM customer_purchase_order_batches GROUP BY order_id
    ) pb ON pb.order_id = o.id
    LEFT JOIN (
      SELECT customer_purchase_order_id AS order_id, SUM(quantity) AS dispatched
      FROM dispatches WHERE voided_at IS NULL GROUP BY customer_purchase_order_id
    ) db ON db.order_id = o.id
    ${whereClause}
    ${orderClause}
    LIMIT ${query.limit} OFFSET ${offset}
  `)

  return {
    orders: rows.map((r) => {
      const totalQuantity = Number(r.totalQuantity)
      const totalQuantityDispatched = Number(r.totalQuantityDispatched)
      return {
        id: r.id, poNumber: r.poNumber, customerId: r.customerId, customerName: r.customerName,
        customerPoNumber: r.customerPoNumber, customerPoDate: r.customerPoDate,
        referenceQuotationId: r.referenceQuotationId, referenceQuotNumber: r.referenceQuotNumber,
        expectedDeliveryDate: r.expectedDeliveryDate, status: r.status, priority: r.priority,
        totalQuantity, totalValue: Number(r.totalValue),
        createdAt: new Date(r.createdAt).toISOString(),
        createdBy: r.createdBy, createdByName: r.createdByName,
        productSummary: r.productCount && Number(r.productCount) > 1
          ? `${r.productCount} products`
          : (r.productNames ?? '—'),
        totalQuantityProduced: Number(r.totalQuantityProduced),
        totalQuantityDispatched,
        totalQuantityPending: Math.max(0, totalQuantity - totalQuantityDispatched),
      }
    }),
    total, page: query.page, limit: query.limit,
  }
}

export async function getOrderById(id: string) {
  const [order] = await db.select().from(customerPurchaseOrders)
    .where(and(eq(customerPurchaseOrders.id, id), isNull(customerPurchaseOrders.deletedAt)))
  if (!order) return null

  const [customer] = await db.select().from(companies).where(eq(companies.id, order.customerId))

  let createdByName: string | null = null
  if (order.createdBy) {
    const [creator] = await db.select({ name: users.name }).from(users).where(eq(users.id, order.createdBy))
    createdByName = creator?.name ?? null
  }

  let referenceQuotation: { id: string; quotNumber: string } | null = null
  if (order.referenceQuotationId) {
    const [q] = await db.select({ id: quotations.id, quotNumber: quotations.quotNumber })
      .from(quotations).where(eq(quotations.id, order.referenceQuotationId))
    referenceQuotation = q ?? null
  }

  const itemRows = await db.execute<{
    [key: string]: unknown
    id: string; orderId: string; sortOrder: number; productKey: string; productDisplayName: string
    variantId: string | null; customerProductCode: string | null
    quantityOrdered: string; unit: string; unitPrice: string; amount: string; remarks: string | null
    quantityProduced: string; quantityDispatched: string
  }>(sql`
    SELECT
      i.id, i.order_id AS "orderId", i.sort_order AS "sortOrder", i.product_key AS "productKey",
      p.display_name AS "productDisplayName", i.variant_id AS "variantId",
      i.customer_product_code AS "customerProductCode", i.quantity_ordered AS "quantityOrdered",
      i.unit, i.unit_price AS "unitPrice", i.amount, i.remarks,
      COALESCE(pb.produced, 0) AS "quantityProduced",
      COALESCE(db.dispatched, 0) AS "quantityDispatched"
    FROM customer_purchase_order_items i
    JOIN products p ON p.key = i.product_key
    LEFT JOIN (
      SELECT order_item_id, SUM(linked_quantity) AS produced
      FROM customer_purchase_order_batches GROUP BY order_item_id
    ) pb ON pb.order_item_id = i.id
    LEFT JOIN (
      SELECT customer_purchase_order_item_id, SUM(quantity) AS dispatched
      FROM dispatches WHERE voided_at IS NULL GROUP BY customer_purchase_order_item_id
    ) db ON db.customer_purchase_order_item_id = i.id
    WHERE i.order_id = ${id}
    ORDER BY i.sort_order
  `)

  const items = itemRows.map((r) => {
    const quantityOrdered = Number(r.quantityOrdered)
    const quantityDispatched = Number(r.quantityDispatched)
    return {
      id: r.id, orderId: r.orderId, sortOrder: r.sortOrder, productKey: r.productKey,
      productDisplayName: r.productDisplayName, variantId: r.variantId,
      customerProductCode: r.customerProductCode, quantityOrdered, unit: r.unit,
      unitPrice: Number(r.unitPrice), amount: Number(r.amount), remarks: r.remarks,
      quantityProduced: Number(r.quantityProduced),
      quantityDispatched,
      quantityPending: Math.max(0, quantityOrdered - quantityDispatched),
    }
  })

  const documents = (await db.select().from(customerPurchaseOrderDocuments)
    .where(eq(customerPurchaseOrderDocuments.orderId, id))).map(toDocumentResponse)

  const batchLinkRows = await db.execute<{
    [key: string]: unknown
    id: string; orderId: string; orderItemId: string; batchId: string; batchNumber: string
    productCode: string; linkedQuantity: string; remarks: string | null
    linkedBy: string | null; linkedByName: string | null; linkedAt: string; hasCoa: boolean
  }>(sql`
    SELECT cb.id, cb.order_id AS "orderId", cb.order_item_id AS "orderItemId", cb.batch_id AS "batchId",
      b.batch_number AS "batchNumber", b.product_code AS "productCode",
      cb.linked_quantity AS "linkedQuantity", cb.remarks, cb.linked_by AS "linkedBy", u.name AS "linkedByName",
      cb.linked_at AS "linkedAt", (b.coa_snapshot IS NOT NULL) AS "hasCoa"
    FROM customer_purchase_order_batches cb
    JOIN batches b ON b.id = cb.batch_id
    LEFT JOIN users u ON u.id = cb.linked_by
    WHERE cb.order_id = ${id}
    ORDER BY cb.linked_at
  `)
  const batchLinks = batchLinkRows.map((r) => ({
    id: r.id, orderId: r.orderId, orderItemId: r.orderItemId, batchId: r.batchId,
    batchNumber: r.batchNumber, productCode: r.productCode,
    linkedQuantity: Number(r.linkedQuantity), remarks: r.remarks,
    linkedBy: r.linkedByName ?? r.linkedBy, linkedAt: new Date(r.linkedAt).toISOString(), hasCoa: r.hasCoa,
  }))

  const dispatchRows = await db.execute<{
    [key: string]: unknown
    id: string; dispatchNumber: string; orderItemId: string | null
    quantity: string; dispatchDate: string; voidedAt: string | null
  }>(sql`
    SELECT id, dispatch_number AS "dispatchNumber", customer_purchase_order_item_id AS "orderItemId",
      quantity, dispatch_date AS "dispatchDate", voided_at AS "voidedAt"
    FROM dispatches
    WHERE customer_purchase_order_id = ${id}
    ORDER BY dispatch_date DESC, created_at DESC
  `)
  const dispatches = dispatchRows.map((r) => ({
    id: r.id, dispatchNumber: r.dispatchNumber, orderItemId: r.orderItemId,
    quantity: Number(r.quantity), dispatchDate: r.dispatchDate,
    voided: r.voidedAt !== null,
  }))

  const timelineRows = await db.execute<{
    [key: string]: unknown
    id: string; orderId: string; eventType: string; userId: string | null; userName: string | null
    remarks: string | null; metadata: unknown; at: string
  }>(sql`
    SELECT t.id, t.order_id AS "orderId", t.event_type AS "eventType", t.user_id AS "userId",
      u.name AS "userName", t.remarks, t.metadata, t.at
    FROM customer_purchase_order_timeline t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.order_id = ${id}
    ORDER BY t.at
  `)
  const timeline = timelineRows.map((r) => ({
    id: r.id, orderId: r.orderId, eventType: r.eventType, userId: r.userName ?? r.userId,
    remarks: r.remarks, metadata: r.metadata ?? null, at: new Date(r.at).toISOString(),
  }))

  return {
    ...toOrderResponse(order),
    customerName: customer?.displayName ?? null,
    createdByName,
    referenceQuotation,
    items, documents, batchLinks, dispatches, timeline,
  }
}

// ── Batch linking ─────────────────────────────────────────────────────────────

export type LinkBatchResult =
  | ReturnType<typeof toBatchLinkResponse>
  | { code: 'ORDER_NOT_FOUND' }
  | { code: 'ITEM_NOT_FOUND' }
  | { code: 'BATCH_NOT_FOUND' }

export async function linkBatch(orderId: string, data: LinkBatchBody, userId: string): Promise<LinkBatchResult> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(customerPurchaseOrders)
      .where(and(eq(customerPurchaseOrders.id, orderId), isNull(customerPurchaseOrders.deletedAt)))
    if (!order) return { code: 'ORDER_NOT_FOUND' as const }

    const [item] = await tx.select().from(customerPurchaseOrderItems)
      .where(and(eq(customerPurchaseOrderItems.id, data.orderItemId), eq(customerPurchaseOrderItems.orderId, orderId)))
    if (!item) return { code: 'ITEM_NOT_FOUND' as const }

    const [batch] = await tx.select().from(batches).where(eq(batches.id, data.batchId))
    if (!batch) return { code: 'BATCH_NOT_FOUND' as const }

    const [link] = await tx.insert(customerPurchaseOrderBatches).values({
      orderId, orderItemId: data.orderItemId, batchId: data.batchId,
      linkedQuantity: String(data.linkedQuantity), remarks: data.remarks ?? null, linkedBy: userId,
    }).returning()

    await insertTimelineEvent(
      tx as unknown as DB, orderId, 'batch_linked', userId,
      `Batch ${batch.batchNumber} linked (${data.linkedQuantity} ${item.unit}).`,
      { batchId: batch.id },
    )
    // A batch always carries a labelSnapshot (notNull); coaSnapshot is set later once
    // QC/testing completes — surface both as timeline events at link time when present,
    // rather than requiring the batches module to know about customer PO timelines.
    await insertTimelineEvent(tx as unknown as DB, orderId, 'label_generated', null, null, { batchId: batch.id })
    if (batch.coaSnapshot) {
      await insertTimelineEvent(tx as unknown as DB, orderId, 'qc_completed', null, null, { batchId: batch.id })
      await insertTimelineEvent(tx as unknown as DB, orderId, 'coa_generated', null, null, { batchId: batch.id })
    }

    await recomputeStatus(tx as unknown as DB, orderId)

    return toBatchLinkResponse(link)
  })
}

export async function unlinkBatch(orderId: string, linkId: string): Promise<'deleted' | null> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(customerPurchaseOrderBatches)
      .where(and(eq(customerPurchaseOrderBatches.id, linkId), eq(customerPurchaseOrderBatches.orderId, orderId)))
    if (!existing) return null

    await tx.delete(customerPurchaseOrderBatches).where(eq(customerPurchaseOrderBatches.id, linkId))
    await recomputeStatus(tx as unknown as DB, orderId)
    return 'deleted'
  })
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export async function listTimeline(orderId: string) {
  const rows = await db.select().from(customerPurchaseOrderTimeline)
    .where(eq(customerPurchaseOrderTimeline.orderId, orderId))
    .orderBy(customerPurchaseOrderTimeline.at)
  return rows.map(toTimelineResponse)
}

export async function addTimelineNote(orderId: string, userId: string, remarks: string) {
  const [row] = await db.insert(customerPurchaseOrderTimeline).values({
    orderId, eventType: 'note', userId, remarks,
  }).returning()
  return toTimelineResponse(row)
}

// ── Dispatch integration (called from dispatch.service.ts inside its own transaction) ──

export async function recordDispatchAgainstOrder(tx: DB, orderId: string, orderItemId: string, dispatchId: string, quantity: number, userId: string | null): Promise<void> {
  const [item] = await tx.select({ unit: customerPurchaseOrderItems.unit }).from(customerPurchaseOrderItems)
    .where(eq(customerPurchaseOrderItems.id, orderItemId))
  await insertTimelineEvent(
    tx, orderId, 'dispatched', userId, `Dispatched ${quantity} ${item?.unit ?? ''}.`.trim(), { dispatchId },
  )
  await recomputeStatus(tx, orderId)
}

export async function reverseDispatchAgainstOrder(tx: DB, orderId: string): Promise<void> {
  await recomputeStatus(tx, orderId)
}

// ── Documents (two-phase multipart upload — mirrors company-documents.service.ts) ──

export async function orderExists(orderId: string): Promise<boolean> {
  const [row] = await db.select({ id: customerPurchaseOrders.id }).from(customerPurchaseOrders)
    .where(and(eq(customerPurchaseOrders.id, orderId), isNull(customerPurchaseOrders.deletedAt)))
  return !!row
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[/\\]/g, '_')
}

export interface UploadedFileInput {
  filename:   string
  mimetype:   string
  fileStream: NodeJS.ReadableStream
}
export interface WrittenFile {
  fullPath: string; sizeBytes: number; filename: string; mimetype: string
}
export type WriteUploadedFileResult = WrittenFile | { code: 'UPLOAD_FAILED' }

/**
 * Must be awaited BEFORE reading other multipart fields — see the busboy
 * field-ordering gotcha documented in company-documents.service.ts.
 */
export async function writeUploadedFile(orderId: string, file: UploadedFileInput): Promise<WriteUploadedFileResult> {
  const id           = randomUUID()
  const safeFilename = sanitizeFilename(file.filename)
  const fullPath     = join(env.PROCUREMENT_STORAGE_PATH, 'customer-purchase-orders', orderId, `${id}-${safeFilename}`)

  await mkdir(dirname(fullPath), { recursive: true })
  try {
    await pipeline(file.fileStream, createWriteStream(fullPath))
  } catch (err) {
    console.error(`[customer-purchase-orders] failed to write file to ${fullPath}:`, err)
    return { code: 'UPLOAD_FAILED' }
  }
  try {
    const sizeBytes = (await stat(fullPath)).size
    return { fullPath, sizeBytes, filename: file.filename, mimetype: file.mimetype }
  } catch (err) {
    console.error(`[customer-purchase-orders] failed to stat written file ${fullPath}:`, err)
    return { code: 'UPLOAD_FAILED' }
  }
}

export type SaveDocumentRecordResult = ReturnType<typeof toDocumentResponse> | { code: 'UPLOAD_FAILED' }

export async function saveDocumentRecord(
  orderId: string, written: WrittenFile, meta: DocumentMeta, uploadedBy: string | null,
): Promise<SaveDocumentRecordResult> {
  try {
    return await db.transaction(async (tx) => {
      let version = 1
      if (meta.supersedesDocumentId) {
        const [prev] = await tx.select().from(customerPurchaseOrderDocuments)
          .where(eq(customerPurchaseOrderDocuments.id, meta.supersedesDocumentId))
        if (prev) version = prev.version + 1
      }

      const [row] = await tx.insert(customerPurchaseOrderDocuments).values({
        orderId, category: meta.category, filename: written.filename, storageKey: written.fullPath,
        mimeType: written.mimetype, sizeBytes: written.sizeBytes, version,
        supersedesDocumentId: meta.supersedesDocumentId ?? null,
        remarks: meta.remarks ?? null, uploadedBy: uploadedBy ?? undefined,
      }).returning()

      await insertTimelineEvent(
        tx as unknown as DB, orderId, 'document_uploaded', uploadedBy, `${meta.category.replace(/_/g, ' ')} uploaded: ${written.filename}`,
        { documentId: row.id },
      )

      return toDocumentResponse(row)
    })
  } catch (err) {
    console.error(`[customer-purchase-orders] DB insert failed after writing ${written.fullPath}, cleaning up:`, err)
    try { await unlink(written.fullPath) } catch (cleanupErr) {
      console.error(`[customer-purchase-orders] cleanup delete also failed for ${written.fullPath}:`, cleanupErr)
    }
    return { code: 'UPLOAD_FAILED' }
  }
}

export async function listDocuments(orderId: string) {
  const rows = await db.select().from(customerPurchaseOrderDocuments)
    .where(eq(customerPurchaseOrderDocuments.orderId, orderId))
    .orderBy(customerPurchaseOrderDocuments.uploadedAt)
  return rows.map(toDocumentResponse)
}

export async function getDocumentById(orderId: string, docId: string) {
  const [row] = await db.select().from(customerPurchaseOrderDocuments)
    .where(and(eq(customerPurchaseOrderDocuments.id, docId), eq(customerPurchaseOrderDocuments.orderId, orderId)))
  return row ?? null
}

export async function deleteDocument(orderId: string, docId: string): Promise<'deleted' | null> {
  const [existing] = await db.select().from(customerPurchaseOrderDocuments)
    .where(and(eq(customerPurchaseOrderDocuments.id, docId), eq(customerPurchaseOrderDocuments.orderId, orderId)))
  if (!existing) return null

  await db.delete(customerPurchaseOrderDocuments).where(eq(customerPurchaseOrderDocuments.id, docId))
  try { await unlink(existing.storageKey) } catch (err) {
    console.error(`[customer-purchase-orders] failed to delete file at ${existing.storageKey}:`, err)
  }
  return 'deleted'
}

// ── Dashboard / search ────────────────────────────────────────────────────────

export async function getDashboardSummary() {
  const rows = await db.execute<{
    [key: string]: unknown
    total: string; open: string; inProduction: string; readyForDispatch: string
    partiallyDispatched: string; completed: string; overdue: string; monthValue: string
  }>(sql`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled')) AS open,
      COUNT(*) FILTER (WHERE status IN ('in_production', 'production_planned')) AS "inProduction",
      COUNT(*) FILTER (WHERE status = 'ready_for_dispatch') AS "readyForDispatch",
      COUNT(*) FILTER (WHERE status = 'partially_dispatched') AS "partiallyDispatched",
      COUNT(*) FILTER (WHERE status = 'completed') AS completed,
      COUNT(*) FILTER (WHERE expected_delivery_date < CURRENT_DATE AND status NOT IN ('completed', 'cancelled')) AS overdue,
      COALESCE(SUM(total_value) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)), 0) AS "monthValue"
    FROM customer_purchase_orders
    WHERE deleted_at IS NULL
  `)
  const r = rows[0]
  return {
    totalOrders:          Number(r?.total ?? 0),
    openOrders:           Number(r?.open ?? 0),
    inProduction:         Number(r?.inProduction ?? 0),
    readyForDispatch:     Number(r?.readyForDispatch ?? 0),
    partiallyDispatched:  Number(r?.partiallyDispatched ?? 0),
    completedOrders:      Number(r?.completed ?? 0),
    overdueOrders:        Number(r?.overdue ?? 0),
    currentMonthOrderValue: Number(r?.monthValue ?? 0),
  }
}

/**
 * Order Management Dashboard analytics — orders-by-customer/product/month
 * breakdowns, avg production/dispatch lead time, and completion rate.
 * All read-only aggregations over existing tables; nothing here is stored.
 */
export async function getOrderAnalytics() {
  const byCustomerRows = await db.execute<{ [key: string]: unknown; customerId: string; customerName: string; orderCount: string; totalValue: string }>(sql`
    SELECT o.customer_id AS "customerId", c.display_name AS "customerName",
      COUNT(*) AS "orderCount", COALESCE(SUM(o.total_value), 0) AS "totalValue"
    FROM customer_purchase_orders o
    JOIN companies c ON c.id = o.customer_id
    WHERE o.deleted_at IS NULL AND o.status != 'cancelled'
    GROUP BY o.customer_id, c.display_name
    ORDER BY "totalValue" DESC
    LIMIT 10
  `)

  const byProductRows = await db.execute<{ [key: string]: unknown; productKey: string; productDisplayName: string; orderCount: string; totalQuantity: string }>(sql`
    SELECT i.product_key AS "productKey", p.display_name AS "productDisplayName",
      COUNT(DISTINCT i.order_id) AS "orderCount", COALESCE(SUM(i.quantity_ordered), 0) AS "totalQuantity"
    FROM customer_purchase_order_items i
    JOIN products p ON p.key = i.product_key
    JOIN customer_purchase_orders o ON o.id = i.order_id
    WHERE o.deleted_at IS NULL AND o.status != 'cancelled'
    GROUP BY i.product_key, p.display_name
    ORDER BY "totalQuantity" DESC
    LIMIT 10
  `)

  // Grouped by customer_po_date (the date on the customer's actual PO document),
  // not created_at (when it was entered into the system) — these diverge for
  // backfilled/historical orders entered well after the PO date.
  const byMonthRows = await db.execute<{ [key: string]: unknown; month: string; orderCount: string; totalValue: string }>(sql`
    SELECT to_char(gs.month, 'YYYY-MM') AS month,
      COUNT(o.id) AS "orderCount", COALESCE(SUM(o.total_value), 0) AS "totalValue"
    FROM generate_series(date_trunc('month', CURRENT_DATE - INTERVAL '11 months'), date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS gs(month)
    LEFT JOIN customer_purchase_orders o
      ON date_trunc('month', o.customer_po_date) = gs.month AND o.deleted_at IS NULL AND o.status != 'cancelled'
    GROUP BY gs.month
    ORDER BY gs.month
  `)

  const [leadTimeRow] = await db.execute<{ [key: string]: unknown; avgProductionDays: string | null; avgDispatchDays: string | null }>(sql`
    SELECT
      (SELECT AVG(EXTRACT(EPOCH FROM (fb.batch_at - pr.received_at)) / 86400)
       FROM (SELECT order_id, MIN(at) AS received_at FROM customer_purchase_order_timeline WHERE event_type = 'po_received' GROUP BY order_id) pr
       JOIN (SELECT order_id, MIN(at) AS batch_at FROM customer_purchase_order_timeline WHERE event_type = 'batch_linked' GROUP BY order_id) fb
         ON fb.order_id = pr.order_id
       JOIN customer_purchase_orders o ON o.id = pr.order_id AND o.deleted_at IS NULL
      ) AS "avgProductionDays",
      (SELECT AVG(EXTRACT(EPOCH FROM (ca.completed_at - fd.first_dispatch_date::timestamp)) / 86400)
       FROM (SELECT customer_purchase_order_id AS order_id, MIN(dispatch_date) AS first_dispatch_date
             FROM dispatches WHERE customer_purchase_order_id IS NOT NULL AND voided_at IS NULL
             GROUP BY customer_purchase_order_id) fd
       JOIN (SELECT order_id, MIN(at) AS completed_at FROM customer_purchase_order_timeline WHERE event_type = 'completed' GROUP BY order_id) ca
         ON ca.order_id = fd.order_id
       JOIN customer_purchase_orders o ON o.id = fd.order_id AND o.deleted_at IS NULL
      ) AS "avgDispatchDays"
  `)

  const [completionRow] = await db.execute<{ [key: string]: unknown; completed: string; nonCancelled: string }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'completed') AS completed,
      COUNT(*) FILTER (WHERE status != 'cancelled') AS "nonCancelled"
    FROM customer_purchase_orders
    WHERE deleted_at IS NULL
  `)
  const nonCancelled = Number(completionRow?.nonCancelled ?? 0)
  const completed = Number(completionRow?.completed ?? 0)

  return {
    ordersByCustomer: byCustomerRows.map((r) => ({
      customerId: r.customerId, customerName: r.customerName,
      orderCount: Number(r.orderCount), totalValue: Number(r.totalValue),
    })),
    ordersByProduct: byProductRows.map((r) => ({
      productKey: r.productKey, productDisplayName: r.productDisplayName,
      orderCount: Number(r.orderCount), totalQuantity: Number(r.totalQuantity),
    })),
    ordersByMonth: byMonthRows.map((r) => ({
      month: r.month, orderCount: Number(r.orderCount), totalValue: Number(r.totalValue),
    })),
    avgProductionTimeDays: leadTimeRow?.avgProductionDays != null ? Math.round(Number(leadTimeRow.avgProductionDays) * 10) / 10 : null,
    avgDispatchTimeDays:   leadTimeRow?.avgDispatchDays != null ? Math.round(Number(leadTimeRow.avgDispatchDays) * 10) / 10 : null,
    completionRate: nonCancelled > 0 ? Math.round((completed / nonCancelled) * 1000) / 10 : 0,
  }
}

export async function searchOrders(q: string) {
  const like = `%${q}%`
  const rows = await db.execute<{
    [key: string]: unknown
    id: string; poNumber: string; customerName: string; status: string
  }>(sql`
    SELECT DISTINCT o.id, o.po_number AS "poNumber", c.display_name AS "customerName", o.status
    FROM customer_purchase_orders o
    JOIN companies c ON c.id = o.customer_id
    LEFT JOIN customer_purchase_order_items i ON i.order_id = o.id
    LEFT JOIN products p ON p.key = i.product_key
    LEFT JOIN customer_purchase_order_batches cb ON cb.order_id = o.id
    LEFT JOIN batches b ON b.id = cb.batch_id
    LEFT JOIN quotations q ON q.id = o.reference_quotation_id
    WHERE o.deleted_at IS NULL AND (
      o.po_number ILIKE ${like} OR o.customer_po_number ILIKE ${like} OR c.display_name ILIKE ${like}
      OR p.display_name ILIKE ${like} OR b.batch_number ILIKE ${like} OR q.quot_number ILIKE ${like}
    )
    LIMIT 20
  `)
  return rows.map((r) => ({ id: r.id, poNumber: r.poNumber, customerName: r.customerName, status: r.status }))
}

export async function getQuotationPrefill(quotationId: string) {
  const [quotation] = await db.select().from(quotations).where(eq(quotations.id, quotationId))
  if (!quotation) return null

  const [matchedCustomer] = await db.select({ id: companies.id, displayName: companies.displayName })
    .from(companies)
    .where(sql`LOWER(${companies.displayName}) = LOWER(${quotation.customerName})`)

  return {
    quotationId:   quotation.id,
    quotNumber:    quotation.quotNumber,
    customerName:  quotation.customerName,
    quotDate:      quotation.quotDate,
    matchedCustomerId: matchedCustomer?.id ?? null,
  }
}
