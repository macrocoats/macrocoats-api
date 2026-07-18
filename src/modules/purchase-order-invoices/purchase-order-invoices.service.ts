import { eq, and, desc, sql } from 'drizzle-orm'
import { db, type DB } from '../../db/index.js'
import { purchaseOrders, purchaseOrderInvoices, purchaseOrderTimeline, users } from '../../db/schema/index.js'
import { computeOverallStatus, type PoStatus, type PaymentStatus } from '../purchase-orders/purchase-orders.service.js'
import type { CreateInvoiceBody, UpdateInvoiceBody } from './purchase-order-invoices.schema.js'

function toResponse(row: typeof purchaseOrderInvoices.$inferSelect & { createdByName?: string | null }) {
  return {
    id:                row.id,
    purchaseOrderId:   row.purchaseOrderId,
    invoiceNumber:     row.invoiceNumber,
    invoiceDate:       row.invoiceDate,
    invoiceAmount:     Number(row.invoiceAmount),
    invoiceDocumentId: row.invoiceDocumentId,
    remarks:           row.remarks,
    createdBy:         row.createdBy,
    createdByName:     row.createdByName ?? null,
    createdAt:         row.createdAt.toISOString(),
  }
}

export type PurchaseOrderInvoiceRow = ReturnType<typeof toResponse>

/**
 * Plain existence check against `purchase_orders` — deliberately does NOT
 * import purchase-orders.service.ts's getPurchaseOrderById. Mirrors
 * vendor-prices.service.ts's vendorExists() idiom.
 */
export async function purchaseOrderExists(poId: string): Promise<boolean> {
  const [row] = await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.id, poId))
  return !!row
}

/**
 * Recomputes itemsTotal/invoicedTotal for the PO and, if the derived overall
 * status differs from the current one, persists it. Must be called inside
 * the same transaction as the invoice write that triggered the recompute.
 * Returns the (possibly unchanged) status, for the timeline row's toStatus.
 */
async function recomputeAndUpdateStatus(
  tx: DB,
  poId: string,
  currentStatus: PoStatus,
  paymentStatus: PaymentStatus,
): Promise<PoStatus> {
  const [itemAgg] = await tx.execute<{ total: string }>(sql`
    select coalesce(sum(quantity * unit_price * (1 + gst_percent / 100)), 0) as total
    from purchase_order_items
    where purchase_order_id = ${poId}
  `)
  const [invoiceAgg] = await tx.execute<{ total: string }>(sql`
    select coalesce(sum(invoice_amount), 0) as total
    from purchase_order_invoices
    where purchase_order_id = ${poId}
  `)
  const itemsTotal    = Number(itemAgg?.total ?? 0)
  const invoicedTotal = Number(invoiceAgg?.total ?? 0)

  const newStatus = computeOverallStatus(currentStatus, itemsTotal, invoicedTotal, paymentStatus)
  if (newStatus !== currentStatus) {
    await tx.update(purchaseOrders).set({ status: newStatus }).where(eq(purchaseOrders.id, poId))
  }
  return newStatus
}

export async function listInvoices(poId: string): Promise<PurchaseOrderInvoiceRow[]> {
  const rows = await db
    .select({
      id:                purchaseOrderInvoices.id,
      purchaseOrderId:   purchaseOrderInvoices.purchaseOrderId,
      invoiceNumber:     purchaseOrderInvoices.invoiceNumber,
      invoiceDate:       purchaseOrderInvoices.invoiceDate,
      invoiceAmount:     purchaseOrderInvoices.invoiceAmount,
      invoiceDocumentId: purchaseOrderInvoices.invoiceDocumentId,
      remarks:           purchaseOrderInvoices.remarks,
      createdBy:         purchaseOrderInvoices.createdBy,
      createdByName:     users.name,
      createdAt:         purchaseOrderInvoices.createdAt,
    })
    .from(purchaseOrderInvoices)
    .leftJoin(users, eq(purchaseOrderInvoices.createdBy, users.id))
    .where(eq(purchaseOrderInvoices.purchaseOrderId, poId))
    .orderBy(desc(purchaseOrderInvoices.createdAt))

  return rows.map(toResponse)
}

export async function createInvoice(poId: string, data: CreateInvoiceBody, userId: string): Promise<PurchaseOrderInvoiceRow | null> {
  const result = await db.transaction(async (tx) => {
    const [po] = await tx
      .select({ id: purchaseOrders.id, status: purchaseOrders.status, paymentStatus: purchaseOrders.paymentStatus })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, poId))

    if (!po) return null

    const [inserted] = await tx
      .insert(purchaseOrderInvoices)
      .values({
        purchaseOrderId:   poId,
        invoiceNumber:     data.invoiceNumber,
        invoiceDate:       data.invoiceDate,
        invoiceAmount:     String(data.invoiceAmount),
        invoiceDocumentId: data.invoiceDocumentId ?? null,
        remarks:           data.remarks ?? null,
        createdBy:         userId,
      })
      .returning()

    const newStatus = await recomputeAndUpdateStatus(tx as unknown as DB, poId, po.status as PoStatus, po.paymentStatus as PaymentStatus)

    await tx.insert(purchaseOrderTimeline).values({
      purchaseOrderId: poId,
      userId,
      action:          'invoice_added',
      fromStatus:      po.status,
      toStatus:        newStatus,
      notes:           data.invoiceNumber,
    })

    return inserted
  })

  return result ? toResponse(result) : null
}

export async function updateInvoice(
  poId: string,
  invoiceId: string,
  data: UpdateInvoiceBody,
  userId: string,
): Promise<PurchaseOrderInvoiceRow | null> {
  const result = await db.transaction(async (tx) => {
    const [po] = await tx
      .select({ id: purchaseOrders.id, status: purchaseOrders.status, paymentStatus: purchaseOrders.paymentStatus })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, poId))

    if (!po) return null

    const [existing] = await tx
      .select({ id: purchaseOrderInvoices.id })
      .from(purchaseOrderInvoices)
      .where(and(eq(purchaseOrderInvoices.id, invoiceId), eq(purchaseOrderInvoices.purchaseOrderId, poId)))

    if (!existing) return null

    const patch: Partial<typeof purchaseOrderInvoices.$inferInsert> = {}
    if (data.invoiceNumber     !== undefined) patch.invoiceNumber     = data.invoiceNumber
    if (data.invoiceDate       !== undefined) patch.invoiceDate       = data.invoiceDate
    if (data.invoiceAmount     !== undefined) patch.invoiceAmount     = String(data.invoiceAmount)
    if (data.invoiceDocumentId !== undefined) patch.invoiceDocumentId = data.invoiceDocumentId
    if (data.remarks           !== undefined) patch.remarks           = data.remarks

    const [updated] = await tx
      .update(purchaseOrderInvoices)
      .set(patch)
      .where(eq(purchaseOrderInvoices.id, invoiceId))
      .returning()

    const newStatus = await recomputeAndUpdateStatus(tx as unknown as DB, poId, po.status as PoStatus, po.paymentStatus as PaymentStatus)

    await tx.insert(purchaseOrderTimeline).values({
      purchaseOrderId: poId,
      userId,
      action:          'invoice_updated',
      fromStatus:      po.status,
      toStatus:        newStatus,
      notes:           updated.invoiceNumber,
    })

    return updated
  })

  return result ? toResponse(result) : null
}

export async function deleteInvoice(poId: string, invoiceId: string, userId: string): Promise<'deleted' | null> {
  const result = await db.transaction(async (tx) => {
    const [po] = await tx
      .select({ id: purchaseOrders.id, status: purchaseOrders.status, paymentStatus: purchaseOrders.paymentStatus })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, poId))

    if (!po) return null

    const [existing] = await tx
      .select()
      .from(purchaseOrderInvoices)
      .where(and(eq(purchaseOrderInvoices.id, invoiceId), eq(purchaseOrderInvoices.purchaseOrderId, poId)))

    if (!existing) return null

    await tx.delete(purchaseOrderInvoices).where(eq(purchaseOrderInvoices.id, invoiceId))

    const newStatus = await recomputeAndUpdateStatus(tx as unknown as DB, poId, po.status as PoStatus, po.paymentStatus as PaymentStatus)

    await tx.insert(purchaseOrderTimeline).values({
      purchaseOrderId: poId,
      userId,
      action:          'invoice_deleted',
      fromStatus:      po.status,
      toStatus:        newStatus,
      notes:           existing.invoiceNumber,
    })

    return 'ok' as const
  })

  return result ? 'deleted' : null
}
