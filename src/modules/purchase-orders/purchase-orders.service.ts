import { eq, asc, desc, sql, type SQL } from 'drizzle-orm'
import { db, type DB } from '../../db/index.js'
import {
  purchaseOrders, purchaseOrderItems, purchaseOrderTimeline,
  vendors, inventoryItems, users, PO_STATUSES,
} from '../../db/schema/index.js'
import { nextPoNumber } from '../../utils/poNumber.js'
import type {
  CreatePurchaseOrderBody, PoItemInput, ListPurchaseOrdersQuery, UpdatePaymentBody,
} from './purchase-orders.schema.js'

export type PoStatus       = typeof PO_STATUSES[number]
export type PaymentStatus  = 'pending' | 'partially_paid' | 'paid'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * PURE — no DB access. Exported so it can be unit tested directly.
 * Sums quantity * unitPrice * (1 + gstPercent/100) across all line items.
 */
export function computeItemsTotal(items: Array<{ quantity: number; unitPrice: number; gstPercent: number }>): number {
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice * (1 + item.gstPercent / 100), 0)
  return round2(total)
}

/**
 * PURE — no DB access. Exported so it can be unit tested directly.
 *
 * - 'cancelled'/'closed' are terminal — never auto-advanced out of.
 * - No invoice yet (invoicedTotal <= 0) — leave status unchanged (don't
 *   auto-advance out of draft/issued/confirmed until an invoice exists).
 * - Otherwise derive from paymentStatus + how much of itemsTotal has been invoiced.
 */
export function computeOverallStatus(
  current: PoStatus,
  itemsTotal: number,
  invoicedTotal: number,
  paymentStatus: PaymentStatus,
): PoStatus {
  if (current === 'cancelled' || current === 'closed') return current
  if (invoicedTotal <= 0) return current

  if (paymentStatus === 'paid' && invoicedTotal >= itemsTotal) return 'paid'
  if (paymentStatus === 'partially_paid') return 'partially_paid'
  if (invoicedTotal >= itemsTotal) return 'fully_invoiced'
  return 'partially_invoiced'
}

/** Linear-ish explicit state machine for the PATCH .../status endpoint (not the auto-computed transitions above). */
export const EXPLICIT_STATUS_TRANSITIONS: Record<PoStatus, PoStatus[]> = {
  draft:               ['issued', 'cancelled'],
  issued:              ['confirmed', 'cancelled'],
  confirmed:           ['cancelled'],
  partially_invoiced:  ['cancelled'],
  fully_invoiced:      ['cancelled'],
  partially_paid:      ['cancelled'],
  paid:                ['closed'],
  closed:              [],
  cancelled:           [],
}

// ── Row shape returned by the raw joined SELECT (purchase_orders ⋈ vendors, plus computed totals) ──
interface PoJoinRow {
  [key: string]: unknown
  id:                     string
  poNumber:               string
  vendorId:               string
  vendorName:             string
  contactPerson:          string | null
  phoneNumbers:           string[] | null
  poDate:                 string
  expectedDeliveryDate:   string | null
  paymentTerms:           string | null
  deliveryAddress:        string | null
  remarks:                string | null
  status:                 PoStatus
  paymentStatus:          PaymentStatus
  paymentDate:            string | null
  paymentReferenceNumber: string | null
  paymentRemarks:         string | null
  cancelledAt:            string | null
  cancelReason:           string | null
  createdBy:              string | null
  createdByName:          string | null
  updatedBy:              string | null
  createdAt:              string
  updatedAt:              string
  itemsTotal:             string
  invoicedTotal:          string
}

function toHeaderResponse(row: PoJoinRow) {
  const itemsTotal    = round2(Number(row.itemsTotal))
  const invoicedTotal = round2(Number(row.invoicedTotal))

  return {
    id:                     row.id,
    poNumber:               row.poNumber,
    vendorId:               row.vendorId,
    vendorName:             row.vendorName,
    contactPerson:          row.contactPerson,
    phoneNumbers:           row.phoneNumbers ?? [],
    poDate:                 row.poDate,
    expectedDeliveryDate:   row.expectedDeliveryDate,
    paymentTerms:           row.paymentTerms,
    deliveryAddress:        row.deliveryAddress,
    remarks:                row.remarks,
    status:                 row.status,
    paymentStatus:          row.paymentStatus,
    paymentDate:            row.paymentDate,
    paymentReferenceNumber: row.paymentReferenceNumber,
    paymentRemarks:         row.paymentRemarks,
    cancelledAt:            row.cancelledAt ? new Date(row.cancelledAt).toISOString() : null,
    cancelReason:           row.cancelReason,
    createdBy:              row.createdBy,
    createdByName:          row.createdByName,
    updatedBy:              row.updatedBy,
    createdAt:              new Date(row.createdAt).toISOString(),
    updatedAt:              new Date(row.updatedAt).toISOString(),
    itemsTotal,
    invoicedTotal,
  }
}

export type PurchaseOrderHeader = ReturnType<typeof toHeaderResponse>

interface PoItemJoinRow {
  id:          string
  sortOrder:   number
  materialId:  string
  material:    string
  description: string | null
  quantity:    string
  unit:        'Kg' | 'L'
  unitPrice:   string
  gstPercent:  string
}

function toItemResponse(row: PoItemJoinRow) {
  const quantity   = Number(row.quantity)
  const unitPrice  = Number(row.unitPrice)
  const gstPercent = Number(row.gstPercent)

  return {
    id:          row.id,
    sortOrder:   row.sortOrder,
    materialId:  row.materialId,
    material:    row.material,
    description: row.description,
    quantity,
    unit:        row.unit,
    unitPrice,
    gstPercent,
    lineTotal:   round2(quantity * unitPrice * (1 + gstPercent / 100)),
  }
}

const SELECT_COLUMNS = sql`
  po.id,
  po.po_number                as "poNumber",
  po.vendor_id                as "vendorId",
  v.vendor_name                as "vendorName",
  v.contact_person             as "contactPerson",
  v.phone_numbers              as "phoneNumbers",
  po.po_date                  as "poDate",
  po.expected_delivery_date   as "expectedDeliveryDate",
  po.payment_terms            as "paymentTerms",
  po.delivery_address         as "deliveryAddress",
  po.remarks,
  po.status,
  po.payment_status           as "paymentStatus",
  po.payment_date             as "paymentDate",
  po.payment_reference_number as "paymentReferenceNumber",
  po.payment_remarks          as "paymentRemarks",
  po.cancelled_at             as "cancelledAt",
  po.cancel_reason            as "cancelReason",
  po.created_by               as "createdBy",
  u.name                       as "createdByName",
  po.updated_by                as "updatedBy",
  po.created_at                as "createdAt",
  po.updated_at                as "updatedAt",
  coalesce((
    select sum(quantity * unit_price * (1 + gst_percent / 100))
    from purchase_order_items poi
    where poi.purchase_order_id = po.id
  ), 0) as "itemsTotal",
  coalesce((
    select sum(invoice_amount)
    from purchase_order_invoices poinv
    where poinv.purchase_order_id = po.id
  ), 0) as "invoicedTotal"
`

const JOINS = sql`
  from purchase_orders po
  join vendors v on v.id = po.vendor_id
  left join users u on u.id = po.created_by
`

export async function listPurchaseOrders(query: ListPurchaseOrdersQuery) {
  const offset = (query.page - 1) * query.limit

  const conditions: SQL[] = []
  if (query.vendorId)      conditions.push(sql`po.vendor_id = ${query.vendorId}`)
  if (query.status)        conditions.push(sql`po.status = ${query.status}`)
  if (query.paymentStatus) conditions.push(sql`po.payment_status = ${query.paymentStatus}`)
  if (query.poDateFrom)    conditions.push(sql`po.po_date >= ${query.poDateFrom}`)
  if (query.poDateTo)      conditions.push(sql`po.po_date <= ${query.poDateTo}`)
  if (query.search)        conditions.push(sql`(po.po_number ILIKE ${`%${query.search}%`} OR v.vendor_name ILIKE ${`%${query.search}%`})`)

  const whereClause = conditions.length > 0 ? sql`where ${sql.join(conditions, sql` and `)}` : sql``

  const sortColumn =
    query.sortBy === 'poDate'     ? sql`po.po_date` :
    query.sortBy === 'poNumber'   ? sql`po.po_number` :
    query.sortBy === 'status'     ? sql`po.status` :
    query.sortBy === 'totalValue' ? sql`"itemsTotal"` :
    sql`po.created_at`
  const sortDir = query.sortDir === 'asc' ? sql`asc` : sql`desc`

  const countRows = await db.execute<{ total: string }>(sql`
    select count(*) as total
    ${JOINS}
    ${whereClause}
  `)
  const total = Number(countRows[0]?.total ?? 0)

  const rows = await db.execute<PoJoinRow>(sql`
    select ${SELECT_COLUMNS}
    ${JOINS}
    ${whereClause}
    order by ${sortColumn} ${sortDir}
    limit ${query.limit} offset ${offset}
  `)

  return {
    purchaseOrders: rows.map(toHeaderResponse),
    total,
    page:  query.page,
    limit: query.limit,
  }
}

export interface PurchaseOrderDetail extends PurchaseOrderHeader {
  items:                 ReturnType<typeof toItemResponse>[]
  paymentPendingAmount:  number
}

export async function getPurchaseOrderById(id: string): Promise<PurchaseOrderDetail | null> {
  const rows = await db.execute<PoJoinRow>(sql`
    select ${SELECT_COLUMNS}
    ${JOINS}
    where po.id = ${id}
  `)
  const row = rows[0]
  if (!row) return null

  const itemRows = await db
    .select({
      id:          purchaseOrderItems.id,
      sortOrder:   purchaseOrderItems.sortOrder,
      materialId:  purchaseOrderItems.materialId,
      material:    inventoryItems.material,
      description: purchaseOrderItems.description,
      quantity:    purchaseOrderItems.quantity,
      unit:        purchaseOrderItems.unit,
      unitPrice:   purchaseOrderItems.unitPrice,
      gstPercent:  purchaseOrderItems.gstPercent,
    })
    .from(purchaseOrderItems)
    .innerJoin(inventoryItems, eq(purchaseOrderItems.materialId, inventoryItems.id))
    .where(eq(purchaseOrderItems.purchaseOrderId, id))
    .orderBy(asc(purchaseOrderItems.sortOrder))

  const header = toHeaderResponse(row)

  // No numeric "amount paid so far" is tracked at the DB level — paymentStatus
  // is a tri-state enum, not a running total — so the best-effort pending
  // figure is: 0 once fully paid, else the full items total (a genuine partial
  // paid *amount* isn't representable without a schema change).
  const paymentPendingAmount = header.paymentStatus === 'paid' ? 0 : header.itemsTotal

  return {
    ...header,
    items: itemRows.map((r) => toItemResponse(r as PoItemJoinRow)),
    paymentPendingAmount,
  }
}

export async function createPurchaseOrder(data: CreatePurchaseOrderBody, createdBy: string): Promise<PurchaseOrderDetail | null> {
  const id = await db.transaction(async (tx) => {
    const poNumber = await nextPoNumber(tx as unknown as DB)

    const [header] = await tx
      .insert(purchaseOrders)
      .values({
        poNumber,
        vendorId:             data.vendorId,
        poDate:               data.poDate,
        expectedDeliveryDate: data.expectedDeliveryDate ?? null,
        paymentTerms:         data.paymentTerms ?? null,
        deliveryAddress:      data.deliveryAddress ?? null,
        remarks:              data.remarks ?? null,
        status:               'draft',
        createdBy,
      })
      .returning({ id: purchaseOrders.id })

    const itemRows = data.items.map((item, i) => ({
      purchaseOrderId: header.id,
      sortOrder:       i + 1,
      materialId:      item.materialId,
      description:     item.description ?? null,
      quantity:        String(item.quantity),
      unit:            item.unit,
      unitPrice:       String(item.unitPrice),
      gstPercent:      String(item.gstPercent),
    }))
    await tx.insert(purchaseOrderItems).values(itemRows)

    await tx.insert(purchaseOrderTimeline).values({
      purchaseOrderId: header.id,
      userId:          createdBy,
      action:          'created',
    })

    return header.id
  })

  return getPurchaseOrderById(id)
}

export type UpdateItemsResult = PurchaseOrderDetail | null | 'items_locked'

export async function updatePurchaseOrderItems(id: string, items: PoItemInput[], userId: string): Promise<UpdateItemsResult> {
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: purchaseOrders.id, status: purchaseOrders.status, paymentStatus: purchaseOrders.paymentStatus })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))

    if (!existing) return null
    if (existing.status !== 'draft' && existing.status !== 'issued') return 'items_locked' as const

    await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id))

    const itemRows = items.map((item, i) => ({
      purchaseOrderId: id,
      sortOrder:       i + 1,
      materialId:      item.materialId,
      description:     item.description ?? null,
      quantity:        String(item.quantity),
      unit:            item.unit,
      unitPrice:       String(item.unitPrice),
      gstPercent:      String(item.gstPercent),
    }))
    await tx.insert(purchaseOrderItems).values(itemRows)

    const itemsTotal = computeItemsTotal(items)
    const [invoiceAgg] = await tx.execute<{ total: string }>(sql`
      select coalesce(sum(invoice_amount), 0) as total
      from purchase_order_invoices
      where purchase_order_id = ${id}
    `)
    const invoicedTotal = Number(invoiceAgg?.total ?? 0)
    const newStatus = computeOverallStatus(existing.status as PoStatus, itemsTotal, invoicedTotal, existing.paymentStatus as PaymentStatus)

    await tx
      .update(purchaseOrders)
      .set({
        status:    newStatus,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, id))

    await tx.insert(purchaseOrderTimeline).values({
      purchaseOrderId: id,
      userId,
      action:          'updated',
    })

    return 'ok' as const
  })

  if (result === null) return null
  if (result === 'items_locked') return 'items_locked'
  return getPurchaseOrderById(id)
}

export type TransitionStatusResult = PurchaseOrderDetail | null | 'invalid_transition'

export async function transitionPurchaseOrderStatus(
  id: string,
  newStatus: PoStatus,
  userId: string,
  notes?: string,
): Promise<TransitionStatusResult> {
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: purchaseOrders.id, status: purchaseOrders.status })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))

    if (!existing) return null

    const allowed = EXPLICIT_STATUS_TRANSITIONS[existing.status as PoStatus] ?? []
    if (!allowed.includes(newStatus)) return 'invalid_transition' as const

    const patch: Partial<typeof purchaseOrders.$inferInsert> = {
      status:    newStatus,
      updatedBy: userId,
      updatedAt: new Date(),
    }
    if (newStatus === 'cancelled') patch.cancelledAt = new Date()

    await tx.update(purchaseOrders).set(patch).where(eq(purchaseOrders.id, id))

    await tx.insert(purchaseOrderTimeline).values({
      purchaseOrderId: id,
      userId,
      action:          'status_changed',
      fromStatus:      existing.status,
      toStatus:        newStatus,
      notes:           notes ?? null,
    })

    return 'ok' as const
  })

  if (result === null) return null
  if (result === 'invalid_transition') return 'invalid_transition'
  return getPurchaseOrderById(id)
}

export type CancelResult = PurchaseOrderDetail | null | 'already_cancelled'

export async function cancelPurchaseOrder(id: string, reason: string, userId: string): Promise<CancelResult> {
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: purchaseOrders.id, status: purchaseOrders.status })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))

    if (!existing) return null
    if (existing.status === 'cancelled' || existing.status === 'closed') return 'already_cancelled' as const

    await tx
      .update(purchaseOrders)
      .set({
        status:       'cancelled',
        cancelledAt:  new Date(),
        cancelReason: reason,
        updatedBy:    userId,
        updatedAt:    new Date(),
      })
      .where(eq(purchaseOrders.id, id))

    await tx.insert(purchaseOrderTimeline).values({
      purchaseOrderId: id,
      userId,
      action:          'cancelled',
      fromStatus:      existing.status,
      toStatus:        'cancelled',
      notes:           reason,
    })

    return 'ok' as const
  })

  if (result === null) return null
  if (result === 'already_cancelled') return 'already_cancelled'
  return getPurchaseOrderById(id)
}

export async function updatePayment(id: string, data: UpdatePaymentBody, userId: string): Promise<PurchaseOrderDetail | null> {
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: purchaseOrders.id, status: purchaseOrders.status })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))

    if (!existing) return null

    await tx
      .update(purchaseOrders)
      .set({
        paymentStatus:          data.paymentStatus,
        paymentDate:            data.paymentDate ?? null,
        paymentReferenceNumber: data.paymentReferenceNumber ?? null,
        paymentRemarks:         data.paymentRemarks ?? null,
        updatedBy:              userId,
        updatedAt:              new Date(),
      })
      .where(eq(purchaseOrders.id, id))

    const [itemAgg] = await tx.execute<{ total: string }>(sql`
      select coalesce(sum(quantity * unit_price * (1 + gst_percent / 100)), 0) as total
      from purchase_order_items
      where purchase_order_id = ${id}
    `)
    const [invoiceAgg] = await tx.execute<{ total: string }>(sql`
      select coalesce(sum(invoice_amount), 0) as total
      from purchase_order_invoices
      where purchase_order_id = ${id}
    `)
    const itemsTotal    = Number(itemAgg?.total ?? 0)
    const invoicedTotal = Number(invoiceAgg?.total ?? 0)

    const newStatus = computeOverallStatus(existing.status as PoStatus, itemsTotal, invoicedTotal, data.paymentStatus)
    if (newStatus !== existing.status) {
      await tx.update(purchaseOrders).set({ status: newStatus }).where(eq(purchaseOrders.id, id))
    }

    await tx.insert(purchaseOrderTimeline).values({
      purchaseOrderId: id,
      userId,
      action:          'payment_updated',
      fromStatus:      existing.status,
      toStatus:        newStatus,
    })

    return 'ok' as const
  })

  if (result === null) return null
  return getPurchaseOrderById(id)
}

export async function listTimeline(id: string) {
  const [po] = await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.id, id))
  if (!po) return null

  return db
    .select({
      id:         purchaseOrderTimeline.id,
      action:     purchaseOrderTimeline.action,
      fromStatus: purchaseOrderTimeline.fromStatus,
      toStatus:   purchaseOrderTimeline.toStatus,
      notes:      purchaseOrderTimeline.notes,
      at:         purchaseOrderTimeline.at,
      userName:   users.name,
    })
    .from(purchaseOrderTimeline)
    .leftJoin(users, eq(purchaseOrderTimeline.userId, users.id))
    .where(eq(purchaseOrderTimeline.purchaseOrderId, id))
    .orderBy(desc(purchaseOrderTimeline.at))
}

interface DashboardSummaryRow {
  [key: string]: unknown
  totalOrders:     string
  openOrders:      string
  completedOrders: string
  cancelledOrders: string
  pendingInvoices: string
  pendingPayments: string
  overdueOrders:   string
  thisMonthOrders: string
}

export async function getDashboardSummary() {
  const rows = await db.execute<DashboardSummaryRow>(sql`
    select
      count(*)                                                                         as "totalOrders",
      count(*) filter (where status not in ('closed', 'cancelled'))                     as "openOrders",
      count(*) filter (where status = 'closed')                                         as "completedOrders",
      count(*) filter (where status = 'cancelled')                                      as "cancelledOrders",
      count(*) filter (where status in ('draft', 'issued', 'confirmed', 'partially_invoiced')) as "pendingInvoices",
      count(*) filter (where payment_status <> 'paid' and status <> 'cancelled')        as "pendingPayments",
      count(*) filter (where expected_delivery_date < current_date and status not in ('closed', 'cancelled')) as "overdueOrders",
      count(*) filter (where po_date >= date_trunc('month', current_date))              as "thisMonthOrders"
    from purchase_orders
  `)

  const row = rows[0]
  return {
    totalOrders:     Number(row?.totalOrders ?? 0),
    openOrders:      Number(row?.openOrders ?? 0),
    completedOrders: Number(row?.completedOrders ?? 0),
    cancelledOrders: Number(row?.cancelledOrders ?? 0),
    pendingInvoices: Number(row?.pendingInvoices ?? 0),
    pendingPayments: Number(row?.pendingPayments ?? 0),
    overdueOrders:   Number(row?.overdueOrders ?? 0),
    thisMonthOrders: Number(row?.thisMonthOrders ?? 0),
  }
}

// Re-exported for convenience (e.g. purchase-order-invoices.service.ts recomputing status after an invoice change).
export type { DB }
