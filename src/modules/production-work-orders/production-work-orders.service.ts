import { and, count, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  productionWorkOrders, productionWorkOrderDemands, productionWorkOrderSequences, productionEvents,
  customerPurchaseOrders, customerPurchaseOrderItems, companies, products,
  productFormulationVariants, formulationVariantComponents, productDocuments,
  inventoryItems, batches, finishedGoods, users,
} from '../../db/schema/index.js'
import { USABLE_VARIANT_STATUSES, type VariantStatus } from '../../types/index.js'
import { findMaterialMatch } from '../../utils/materialMatch.js'
import { OPEN_FOR_BATCH, OUTPUT_TOLERANCE, WorkOrderStateError, syncWorkOrderProgress } from '../../utils/workOrderProgress.js'
import {
  addDays, createBatch, findBatchByClientRequestId, getBatchByNumber, loadBatchInvoices,
  type CreateBatchResult,
} from '../batches/batches.service.js'
import type {
  CreateWorkOrderBody, CreateWorkOrderBatchBody, ListWorkOrdersQuery, TransitionWorkOrderBody,
} from './production-work-orders.schema.js'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Batches for stock-build / trial work orders are numbered under the house name. */
const HOUSE_COMPANY_NAME = 'Macro Coats'
/** Batches in these states do not count toward a work order's produced quantity. */
const DISCARDED_BATCH_STATES = ['rejected', 'cancelled']

// Manual transitions only. The server also moves orders automatically
// (utils/workOrderProgress.ts): first batch → in_progress, released output
// within tolerance → completed.
const TRANSITIONS: Record<string, string[]> = {
  draft: ['planned', 'cancelled'],
  planned: ['released_to_production', 'cancelled'],
  released_to_production: ['cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

async function recordEvent(tx: Tx | typeof db, event: typeof productionEvents.$inferInsert) {
  await tx.insert(productionEvents).values(event)
}

function toResponse(row: typeof productionWorkOrders.$inferSelect, includeFormula = false) {
  const readiness = row.materialReadinessSnapshot as { ready?: boolean; shortages?: unknown[] } | null
  const blockingReasons = readiness?.ready === false ? ['materials_not_ready'] : []
  const response = {
    id: row.id,
    workOrderNumber: row.workOrderNumber,
    demandType: row.demandType,
    productKey: row.productKey,
    variantId: row.variantId,
    plannedQuantity: Number(row.plannedQuantity),
    unit: row.unit,
    scheduledDate: row.scheduledDate,
    dueDate: row.dueDate,
    priority: row.priority,
    ownerId: row.ownerId,
    status: row.status,
    materialReadinessSnapshot: row.materialReadinessSnapshot,
    reason: row.reason,
    notes: row.notes,
    version: row.version,
    blockingReasons,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
  return includeFormula ? { ...response, formulaSnapshot: row.formulaSnapshot } : response
}

function materialRequirements(snapshot: Record<string, unknown>, plannedQuantity: number) {
  const variantComponents = Array.isArray(snapshot.components) ? snapshot.components as Array<Record<string, unknown>> : null
  const body = snapshot.body as { composition?: Array<Record<string, unknown>> } | undefined
  const components = variantComponents ?? (Array.isArray(body?.composition) ? body.composition : [])
  return components.flatMap((component) => {
    const name = String(component.materialName ?? component.name ?? '').trim()
    const rawPercentage = component.percentage ?? component.percentWV
    const percentage = rawPercentage === null || rawPercentage === undefined ? null : Number(rawPercentage)
    if (!name || percentage === null || !Number.isFinite(percentage) || percentage <= 0) return []
    return [{ name, normalizedName: name.toLowerCase().replace(/[^a-z0-9]/g, ''), requiredQuantity: (percentage / 100) * plannedQuantity }]
  })
}

async function calculateMaterialReadiness(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  formulaSnapshot: Record<string, unknown>,
  plannedQuantity: number,
) {
  const requirements = materialRequirements(formulaSnapshot, plannedQuantity)
  const inventory = await tx.select({ material: inventoryItems.material, stockQty: inventoryItems.stockQty, unit: inventoryItems.unit }).from(inventoryItems)
  const stockByMaterial = new Map(inventory.map((item) => [item.material.toLowerCase().replace(/[^a-z0-9]/g, ''), item]))
  const materials = requirements.map((requirement) => {
    const match = stockByMaterial.get(requirement.normalizedName)
    const availableQuantity = match?.stockQty === null || match?.stockQty === undefined ? null : Number(match.stockQty)
    return {
      materialName: requirement.name,
      requiredQuantity: Math.round(requirement.requiredQuantity * 1000) / 1000,
      availableQuantity,
      unit: match?.unit ?? null,
      sufficient: availableQuantity !== null && availableQuantity >= requirement.requiredQuantity,
    }
  })
  const shortages = materials.filter((material) => !material.sufficient)
  return { calculatedAt: new Date().toISOString(), ready: materials.length > 0 && shortages.length === 0, materials, shortages }
}

async function nextWorkOrderNumber(tx: typeof db): Promise<string> {
  const year = new Date().getUTCFullYear()
  const [row] = await tx.insert(productionWorkOrderSequences)
    .values({ year, lastN: 1 })
    .onConflictDoUpdate({ target: productionWorkOrderSequences.year, set: { lastN: sql`${productionWorkOrderSequences.lastN} + 1` } })
    .returning({ lastN: productionWorkOrderSequences.lastN })
  return `WO-${year}-${String(row.lastN).padStart(4, '0')}`
}

async function resolveFormulaSnapshot(data: CreateWorkOrderBody) {
  if (data.variantId) {
    const [variant] = await db.select().from(productFormulationVariants).where(eq(productFormulationVariants.id, data.variantId))
    if (!variant) return { code: 'VARIANT_NOT_FOUND' as const }
    if (variant.productKey !== data.productKey || !USABLE_VARIANT_STATUSES.includes(variant.status as VariantStatus)) {
      return { code: 'VARIANT_NOT_USABLE' as const }
    }
    const components = await db.select().from(formulationVariantComponents)
      .where(eq(formulationVariantComponents.variantId, data.variantId))
    if (components.length === 0) return { code: 'FORMULA_NOT_FOUND' as const }
    return { variantId: variant.id, variantName: variant.variantName, variantStatus: variant.status, components }
  }
  const [document] = await db.select({ body: productDocuments.body, revision: productDocuments.revision, status: productDocuments.status })
    .from(productDocuments)
    .where(and(eq(productDocuments.productKey, data.productKey), eq(productDocuments.docType, 'formula')))
  if (!document || document.status !== 'published') return { code: 'FORMULA_NOT_FOUND' as const }
  return { revision: document.revision, status: document.status, body: document.body }
}

export type CreateWorkOrderResult =
  | ReturnType<typeof toResponse>
  | { code: 'VARIANT_NOT_FOUND' | 'VARIANT_NOT_USABLE' | 'FORMULA_NOT_FOUND' | 'ORDER_ITEM_INVALID' | 'DEMAND_EXCEEDS_REMAINING'; remaining?: number }

export async function createWorkOrder(data: CreateWorkOrderBody, createdBy: string, includeFormula = false): Promise<CreateWorkOrderResult> {
  const formulaSnapshot = await resolveFormulaSnapshot(data)
  if ('code' in formulaSnapshot && formulaSnapshot.code) return { code: formulaSnapshot.code }

  return db.transaction(async (tx) => {
    if (data.demand) {
      const [item] = await tx.select({
        orderId: customerPurchaseOrderItems.orderId,
        productKey: customerPurchaseOrderItems.productKey,
        quantityOrdered: customerPurchaseOrderItems.quantityOrdered,
        unit: customerPurchaseOrderItems.unit,
        orderStatus: customerPurchaseOrders.status,
      }).from(customerPurchaseOrderItems)
        .innerJoin(customerPurchaseOrders, eq(customerPurchaseOrders.id, customerPurchaseOrderItems.orderId))
        .where(and(eq(customerPurchaseOrderItems.id, data.demand.orderItemId), eq(customerPurchaseOrders.id, data.demand.orderId)))
      if (!item || item.productKey !== data.productKey || item.unit !== data.unit || ['draft', 'cancelled', 'completed'].includes(item.orderStatus)) {
        return { code: 'ORDER_ITEM_INVALID' as const }
      }
      const plannedRows = await tx.execute<{ planned: string }>(sql`
        SELECT COALESCE(SUM(d.planned_quantity), 0) AS planned
        FROM production_work_order_demands d
        JOIN production_work_orders w ON w.id = d.work_order_id
        WHERE d.order_item_id = ${data.demand.orderItemId} AND w.status <> 'cancelled'
      `)
      const remaining = Number(item.quantityOrdered) - Number(plannedRows[0]?.planned ?? 0)
      if (data.demand.plannedQuantity > remaining) return { code: 'DEMAND_EXCEEDS_REMAINING' as const, remaining }
    }

    const workOrderNumber = await nextWorkOrderNumber(tx as unknown as typeof db)
    const materialReadinessSnapshot = await calculateMaterialReadiness(
      tx,
      formulaSnapshot as Record<string, unknown>,
      data.plannedQuantity,
    )
    const [row] = await tx.insert(productionWorkOrders).values({
      workOrderNumber,
      demandType: data.demandType,
      productKey: data.productKey,
      variantId: data.variantId ?? null,
      formulaSnapshot,
      plannedQuantity: String(data.plannedQuantity),
      unit: data.unit,
      scheduledDate: data.scheduledDate,
      dueDate: data.dueDate ?? null,
      priority: data.priority,
      ownerId: data.ownerId ?? null,
      reason: data.reason ?? null,
      notes: data.notes ?? null,
      materialReadinessSnapshot,
      // New orders skip `draft`; "release now" also skips the release click
      // when materials are ready. Shortages keep the order at `planned`.
      status: data.releaseNow && materialReadinessSnapshot.ready ? 'released_to_production' : 'planned',
      createdBy,
    }).returning()
    if (data.demand) {
      await tx.insert(productionWorkOrderDemands).values({
        workOrderId: row.id,
        orderId: data.demand.orderId,
        orderItemId: data.demand.orderItemId,
        plannedQuantity: String(data.demand.plannedQuantity),
      })
    }
    await recordEvent(tx, {
      workOrderId: row.id, action: 'created', toStatus: row.status, actorId: createdBy,
      payload: { releaseNowRequested: Boolean(data.releaseNow), materialsReady: materialReadinessSnapshot.ready },
    })
    return toResponse(row, includeFormula)
  })
}

// ── Hub enrichment ─────────────────────────────────────────────────────────
// Batch summaries, demand context, server-computed nextAction and exceptions,
// so the UI never re-derives the workflow. Cost/formula data is never included.

const round3 = (n: number) => Math.round(n * 1000) / 1000
const todayIso = () => new Date().toISOString().slice(0, 10)

async function loadBatchSummaries(workOrderIds: string[]) {
  if (workOrderIds.length === 0) return new Map<string, BatchSummary[]>()
  const rows = await db.select({ batch: batches, fg: finishedGoods }).from(batches)
    .leftJoin(finishedGoods, eq(finishedGoods.batchId, batches.id))
    .where(inArray(batches.workOrderId, workOrderIds))
    .orderBy(batches.createdAt)
  const invoices = await loadBatchInvoices(rows.map(({ batch }) => batch.id))
  const map = new Map<string, BatchSummary[]>()
  for (const { batch, fg } of rows) {
    const list = map.get(batch.workOrderId!) ?? []
    const invoice = invoices.get(batch.id) ?? null
    list.push(toBatchSummary(batch, fg, invoice))
    map.set(batch.workOrderId!, list)
  }
  return map
}

function toBatchSummary(
  batch: typeof batches.$inferSelect,
  fg: typeof finishedGoods.$inferSelect | null,
  invoice: { invoiceNumber: string; startDate: string } | null = null,
) {
  const tests = (batch.coaSnapshot as { tests?: Array<{ status?: string }> } | null)?.tests ?? []
  const today = todayIso()
  const blockingReasons: string[] = []
  if (batch.batchType !== 'Production') blockingReasons.push('trial_batch')
  if (!tests.length) blockingReasons.push('coa_missing')
  else if (tests.some((t) => t.status !== 'Pass')) blockingReasons.push('qc_failed')
  if (!batch.expiryDate) blockingReasons.push('expiry_missing')
  else if (batch.expiryDate < today) blockingReasons.push('expired')
  const released = batch.lifecycleStatus === 'released'
  const produced = fg ? Number(fg.producedQuantity) : Number(batch.actualYield ?? batch.batchSize)
  const dispatched = fg ? Number(fg.dispatchedQuantity) : 0
  const available = fg && fg.status !== 'Cancelled' ? round3(produced - dispatched) : 0
  return {
    id: batch.id,
    batchNumber: batch.batchNumber,
    batchSize: Number(batch.batchSize),
    batchType: batch.batchType,
    productionDate: batch.productionDate,
    expiryDate: batch.expiryDate ?? null,
    lifecycleStatus: batch.lifecycleStatus,
    version: batch.version,
    hasCoa: tests.length > 0,
    // Saved QC results (quality data, no formula/cost) so the QC step can re-fill its form.
    coaTests: tests,
    qcPassed: tests.length > 0 && tests.every((t) => t.status === 'Pass'),
    releasedAt: batch.releasedAt ? batch.releasedAt.toISOString() : null,
    paid: batch.paidAt !== null,
    paidAt: batch.paidAt ? batch.paidAt.toISOString() : null,
    invoiceNumber: invoice?.invoiceNumber ?? null,
    paymentDueDate: invoice ? addDays(invoice.startDate, batch.paymentTermDays ?? 45) : null,
    blockingReasons: released ? [] : blockingReasons,
    finishedGoods: fg ? { status: fg.status, producedQuantity: produced, dispatchedQuantity: dispatched, availableQuantity: available } : null,
    capabilities: {
      canSubmitQc: !['released', 'rejected', 'cancelled', 'closed'].includes(batch.lifecycleStatus),
      canRelease: !released && blockingReasons.length === 0,
      canDispatch: released && (!batch.expiryDate || batch.expiryDate >= today) && available > 0,
    },
  }
}
export type BatchSummary = ReturnType<typeof toBatchSummary>

async function loadDemandSummaries(workOrderIds: string[]) {
  if (workOrderIds.length === 0) return new Map<string, DemandSummary[]>()
  const rows = await db.select({
    workOrderId: productionWorkOrderDemands.workOrderId,
    orderId: productionWorkOrderDemands.orderId,
    orderItemId: productionWorkOrderDemands.orderItemId,
    plannedQuantity: productionWorkOrderDemands.plannedQuantity,
    poNumber: customerPurchaseOrders.poNumber,
    customerPoNumber: customerPurchaseOrders.customerPoNumber,
    customerId: customerPurchaseOrders.customerId,
    customerName: companies.displayName,
    expectedDeliveryDate: customerPurchaseOrders.expectedDeliveryDate,
    orderedQuantity: customerPurchaseOrderItems.quantityOrdered,
    unit: customerPurchaseOrderItems.unit,
    allocatedQuantity: sql<string>`COALESCE((SELECT SUM(l.linked_quantity) FROM customer_purchase_order_batches l WHERE l.order_item_id = ${productionWorkOrderDemands.orderItemId}), 0)`,
    dispatchedQuantity: sql<string>`COALESCE((SELECT SUM(d.quantity) FROM dispatches d WHERE d.customer_purchase_order_item_id = ${productionWorkOrderDemands.orderItemId} AND d.voided_at IS NULL), 0)`,
  }).from(productionWorkOrderDemands)
    .innerJoin(customerPurchaseOrderItems, eq(customerPurchaseOrderItems.id, productionWorkOrderDemands.orderItemId))
    .innerJoin(customerPurchaseOrders, eq(customerPurchaseOrders.id, productionWorkOrderDemands.orderId))
    .innerJoin(companies, eq(companies.id, customerPurchaseOrders.customerId))
    .where(inArray(productionWorkOrderDemands.workOrderId, workOrderIds))
  const map = new Map<string, DemandSummary[]>()
  for (const row of rows) {
    const list = map.get(row.workOrderId) ?? []
    const orderedQuantity = Number(row.orderedQuantity)
    const dispatchedQuantity = Number(row.dispatchedQuantity)
    list.push({
      ...row,
      plannedQuantity: Number(row.plannedQuantity),
      orderedQuantity,
      allocatedQuantity: Number(row.allocatedQuantity),
      dispatchedQuantity,
      remainingToDispatch: round3(Math.max(0, orderedQuantity - dispatchedQuantity)),
    })
    map.set(row.workOrderId, list)
  }
  return map
}
type DemandSummary = {
  workOrderId: string; orderId: string; orderItemId: string; plannedQuantity: number
  poNumber: string; customerPoNumber: string; customerId: string; customerName: string; expectedDeliveryDate: string | null
  orderedQuantity: number; unit: string; allocatedQuantity: number; dispatchedQuantity: number; remainingToDispatch: number
}

const producedQuantityOf = (list: BatchSummary[]) =>
  round3(list.filter((b) => !DISCARDED_BATCH_STATES.includes(b.lifecycleStatus)).reduce((sum, b) => sum + b.batchSize, 0))

type NextAction = { type: 'generate_batch' | 'record_qc' | 'resolve_qc' | 'release' | 'dispatch' | 'complete'; label: string; batchNumber?: string; superadminOnly?: boolean }

function computeNextAction(row: typeof productionWorkOrders.$inferSelect, list: BatchSummary[], produced: number): NextAction | null {
  if (row.status === 'cancelled') return null
  const planned = Number(row.plannedQuantity)
  const open = OPEN_FOR_BATCH.includes(row.status)
  if (open && list.length === 0) return { type: 'generate_batch', label: 'Generate batch' }
  const needsQc = list.find((b) => b.capabilities.canSubmitQc && !b.hasCoa)
  if (needsQc) return { type: 'record_qc', label: 'Record QC', batchNumber: needsQc.batchNumber }
  const failed = list.find((b) => b.lifecycleStatus !== 'released' && (b.blockingReasons.includes('qc_failed') || b.lifecycleStatus === 'on_hold'))
  if (failed) return { type: 'resolve_qc', label: 'Resolve QC', batchNumber: failed.batchNumber }
  // Dispatch first: it is operator work that can proceed while another batch waits for release.
  const shippable = list.find((b) => b.capabilities.canDispatch)
  if (shippable) return { type: 'dispatch', label: 'Dispatch', batchNumber: shippable.batchNumber }
  const releasable = list.find((b) => b.capabilities.canRelease)
  if (releasable) return { type: 'release', label: 'Release batch', batchNumber: releasable.batchNumber, superadminOnly: true }
  if (open && produced < planned * (1 - OUTPUT_TOLERANCE)) return { type: 'generate_batch', label: 'Generate next batch' }
  if (row.status === 'in_progress') return { type: 'complete', label: 'Complete' }
  return null
}

function computeExceptions(row: typeof productionWorkOrders.$inferSelect, list: BatchSummary[], produced: number): string[] {
  if (row.status === 'completed' || row.status === 'cancelled') return []
  const exceptions: string[] = []
  const planned = Number(row.plannedQuantity)
  if (row.dueDate && row.dueDate < todayIso()) exceptions.push('overdue')
  if (produced > planned * (1 + OUTPUT_TOLERANCE)) exceptions.push('output_variance')
  if (list.some((b) => b.blockingReasons.includes('qc_failed') || ['on_hold', 'rejected'].includes(b.lifecycleStatus))) exceptions.push('qc_issue')
  const readiness = row.materialReadinessSnapshot as { ready?: boolean } | null
  if (list.length === 0 && readiness?.ready === false) exceptions.push('materials_not_ready')
  return exceptions
}

function toHubResponse(row: typeof productionWorkOrders.$inferSelect, list: BatchSummary[], demands: DemandSummary[], includeFormula: boolean) {
  const producedQuantity = producedQuantityOf(list)
  return {
    ...toResponse(row, includeFormula),
    completionReason: row.completionReason ?? null,
    producedQuantity,
    batches: list,
    demands: demands.map(({ workOrderId: _w, ...demand }) => demand),
    nextAction: computeNextAction(row, list, producedQuantity),
    exceptions: computeExceptions(row, list, producedQuantity),
  }
}

// SQL mirrors of the views — keep in step with computeNextAction/computeExceptions.
const OPEN_STATUSES_SQL = sql`('draft', 'planned', 'released_to_production', 'in_progress')`
// Built per request so the date comparisons use today's (UTC) date, same as todayIso() in JS.
const viewConditions = (today = todayIso()): Record<NonNullable<ListWorkOrdersQuery['view']>, SQL> => ({
  active: sql`${productionWorkOrders.status} IN ${OPEN_STATUSES_SQL}`,
  // Trial batches never release, so they don't wait in the QC queue; cancelled orders are excluded.
  awaiting_qc: sql`${productionWorkOrders.status} <> 'cancelled' AND EXISTS (SELECT 1 FROM batches b WHERE b.work_order_id = ${productionWorkOrders.id}
    AND b.batch_type = 'Production' AND b.lifecycle_status IN ('awaiting_qc', 'on_hold', 'needs_review'))`,
  // Mirrors capabilities.canDispatch: released, unexpired, stock left.
  ready_to_ship: sql`${productionWorkOrders.status} <> 'cancelled' AND EXISTS (SELECT 1 FROM batches b JOIN finished_goods fg ON fg.batch_id = b.id
    WHERE b.work_order_id = ${productionWorkOrders.id} AND b.lifecycle_status = 'released'
    AND (b.expiry_date IS NULL OR b.expiry_date >= ${today})
    AND fg.status IN ('Available', 'Partially Dispatched') AND fg.produced_quantity > fg.dispatched_quantity)`,
  exceptions: sql`${productionWorkOrders.status} IN ${OPEN_STATUSES_SQL} AND (
    ${productionWorkOrders.dueDate} < ${today}::date
    OR EXISTS (SELECT 1 FROM batches b WHERE b.work_order_id = ${productionWorkOrders.id} AND (
      b.lifecycle_status IN ('on_hold', 'rejected')
      OR (b.lifecycle_status <> 'released' AND jsonb_path_exists(COALESCE(b.coa_snapshot, '{}'::jsonb), '$.tests[*] ? (@.status != "Pass")'))))
    OR (SELECT COALESCE(SUM(b.batch_size), 0) FROM batches b WHERE b.work_order_id = ${productionWorkOrders.id}
      AND b.lifecycle_status NOT IN ('rejected', 'cancelled')) > ${productionWorkOrders.plannedQuantity} * ${1 + OUTPUT_TOLERANCE}
    OR (NOT EXISTS (SELECT 1 FROM batches b WHERE b.work_order_id = ${productionWorkOrders.id})
      AND (${productionWorkOrders.materialReadinessSnapshot} ->> 'ready') = 'false'))`,
  done: sql`${productionWorkOrders.status} IN ('completed', 'cancelled')`,
})

async function enrich(rows: Array<typeof productionWorkOrders.$inferSelect>, includeFormula: boolean) {
  const ids = rows.map((row) => row.id)
  const [batchMap, demandMap] = await Promise.all([loadBatchSummaries(ids), loadDemandSummaries(ids)])
  return rows.map((row) => toHubResponse(row, batchMap.get(row.id) ?? [], demandMap.get(row.id) ?? [], includeFormula))
}

export async function listWorkOrders(query: ListWorkOrdersQuery, includeFormula = false) {
  const viewCondition = viewConditions()
  const conditions: SQL[] = []
  if (query.status) conditions.push(eq(productionWorkOrders.status, query.status))
  if (query.view) conditions.push(viewCondition[query.view])
  if (query.productKey) conditions.push(eq(productionWorkOrders.productKey, query.productKey))
  if (query.scheduledFrom) conditions.push(gte(productionWorkOrders.scheduledDate, query.scheduledFrom))
  if (query.scheduledTo) conditions.push(lte(productionWorkOrders.scheduledDate, query.scheduledTo))
  const where = conditions.length ? and(...conditions) : undefined
  const [[{ total }], [counts], rows] = await Promise.all([
    db.select({ total: count() }).from(productionWorkOrders).where(where),
    db.select({
      active: sql<number>`count(*) FILTER (WHERE ${viewCondition.active})::int`,
      awaiting_qc: sql<number>`count(*) FILTER (WHERE ${viewCondition.awaiting_qc})::int`,
      ready_to_ship: sql<number>`count(*) FILTER (WHERE ${viewCondition.ready_to_ship})::int`,
      exceptions: sql<number>`count(*) FILTER (WHERE ${viewCondition.exceptions})::int`,
      done: sql<number>`count(*) FILTER (WHERE ${viewCondition.done})::int`,
    }).from(productionWorkOrders),
    db.select().from(productionWorkOrders).where(where)
      .orderBy(productionWorkOrders.scheduledDate, desc(productionWorkOrders.createdAt))
      .limit(query.limit).offset((query.page - 1) * query.limit),
  ])
  return { workOrders: await enrich(rows, includeFormula), total, counts, page: query.page, limit: query.limit }
}

export async function getWorkOrder(id: string, includeFormula = false) {
  const [row] = await db.select().from(productionWorkOrders).where(eq(productionWorkOrders.id, id))
  if (!row) return null
  const [[workOrder], [coaDoc], events] = await Promise.all([
    enrich([row], includeFormula),
    db.select({ body: productDocuments.body }).from(productDocuments)
      .where(and(eq(productDocuments.productKey, row.productKey), eq(productDocuments.docType, 'coa'))),
    db.select({
      id: productionEvents.id, action: productionEvents.action, fromStatus: productionEvents.fromStatus,
      toStatus: productionEvents.toStatus, batchId: productionEvents.batchId, payload: productionEvents.payload,
      actorId: productionEvents.actorId, actorName: users.name, createdAt: productionEvents.createdAt,
    }).from(productionEvents).leftJoin(users, eq(users.id, productionEvents.actorId)).where(eq(productionEvents.workOrderId, id)).orderBy(desc(productionEvents.createdAt)).limit(50),
  ])
  // QC test template for the hub's QC step: parameter/method/specification only
  // (results blanked) — quality specs, no formula composition or cost.
  const coaTests = (coaDoc?.body as { tests?: Array<Record<string, unknown>> } | undefined)?.tests ?? []
  const coaTemplate = coaTests.map((test) => ({
    parameter: String(test.parameter ?? ''), method: String(test.method ?? ''), specification: String(test.specification ?? ''),
  })).filter((test) => test.parameter)
  return { ...workOrder, coaTemplate, events: events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })) }
}

// ── Manual transitions (override path) ─────────────────────────────────────

export type TransitionWorkOrderResult =
  | NonNullable<Awaited<ReturnType<typeof getWorkOrder>>>
  | { code: 'NOT_FOUND' | 'VERSION_CONFLICT' | 'INVALID_TRANSITION' | 'MATERIALS_NOT_READY' | 'REASON_REQUIRED' | 'FORBIDDEN'; shortages?: unknown[] }

/** Returns the same hub shape as GET /:id so the drawer can render the result directly. */
export async function transitionWorkOrder(id: string, data: TransitionWorkOrderBody, actorId: string, includeFormula = false): Promise<TransitionWorkOrderResult> {
  // Cancelling is a superadmin decision (plan: void/cancel stay superadmin); includeFormula ⇔ superadmin.
  if (data.status === 'cancelled' && !includeFormula) return { code: 'FORBIDDEN' }
  const result = await applyTransition(id, data, actorId)
  if (result.code) return { code: result.code, shortages: 'shortages' in result ? result.shortages : undefined }
  return (await getWorkOrder(id, includeFormula))!
}

async function applyTransition(id: string, data: TransitionWorkOrderBody, actorId: string) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(productionWorkOrders).where(eq(productionWorkOrders.id, id)).for('update')
    if (!existing) return { code: 'NOT_FOUND' as const }
    if (existing.version !== data.version) return { code: 'VERSION_CONFLICT' as const }
    if (!(TRANSITIONS[existing.status] ?? []).includes(data.status)) return { code: 'INVALID_TRANSITION' as const }
    const readiness = existing.materialReadinessSnapshot as { ready?: boolean; shortages?: unknown[] } | null
    if (data.status === 'released_to_production' && readiness?.ready !== true) {
      return { code: 'MATERIALS_NOT_READY' as const, shortages: readiness?.shortages ?? [] }
    }
    if (data.status === 'cancelled' && !data.reason) return { code: 'REASON_REQUIRED' as const }
    let completionReason: string | null = existing.completionReason
    if (data.status === 'completed') {
      const [{ produced }] = await tx.select({ produced: sql<string>`COALESCE(SUM(${batches.batchSize}), 0)` }).from(batches)
        .where(and(eq(batches.workOrderId, id), sql`${batches.lifecycleStatus} NOT IN ('rejected', 'cancelled')`))
      const planned = Number(existing.plannedQuantity)
      const withinTolerance = Math.abs(Number(produced) - planned) <= planned * OUTPUT_TOLERANCE
      if (!withinTolerance && !data.reason) return { code: 'REASON_REQUIRED' as const }
      completionReason = data.reason ?? null
    }
    const [row] = await tx.update(productionWorkOrders)
      .set({ status: data.status, completionReason, version: existing.version + 1, updatedAt: new Date() })
      .where(and(eq(productionWorkOrders.id, id), eq(productionWorkOrders.version, data.version))).returning()
    if (!row) return { code: 'VERSION_CONFLICT' as const }
    await recordEvent(tx, {
      workOrderId: id, action: 'status_changed', fromStatus: existing.status, toStatus: data.status, actorId,
      payload: { automatic: false, reason: data.reason ?? null },
    })
    return { id: row.id }
  })
}

// ── Batch execution from the work order ────────────────────────────────────

interface FormulaRow { name: string; percentage: number | null }

/** Variant components or base-formula composition → name/percentage rows (null = water balance). */
function formulaRows(snapshot: Record<string, unknown>): FormulaRow[] {
  const variantComponents = Array.isArray(snapshot.components) ? snapshot.components as Array<Record<string, unknown>> : null
  const body = snapshot.body as { composition?: Array<Record<string, unknown>> } | undefined
  const components = variantComponents ?? (Array.isArray(body?.composition) ? body.composition : [])
  return components.flatMap((component) => {
    const name = String(component.materialName ?? component.name ?? '').trim()
    if (!name) return []
    const raw = component.percentage ?? component.percentWV
    const percentage = raw === null || raw === undefined || raw === '' ? null : Number(raw)
    return [{ name, percentage: percentage !== null && Number.isFinite(percentage) ? percentage : null }]
  })
}

export type CreateWorkOrderBatchResult =
  | { batch: Record<string, unknown>; workOrder: Awaited<ReturnType<typeof getWorkOrder>>; replayed: boolean }
  | { code: 'NOT_FOUND' | 'WORK_ORDER_NOT_OPEN' | 'VERSION_CONFLICT' | 'FORMULA_EMPTY' | 'IDEMPOTENCY_KEY_REUSED' }
  | Exclude<CreateBatchResult, { batchNumber: string }>

export async function createWorkOrderBatch(
  id: string,
  data: CreateWorkOrderBatchBody,
  actor: { id: string; role: 'superadmin' | 'operator' },
  clientRequestId?: string,
): Promise<CreateWorkOrderBatchResult> {
  const role = actor.role
  const replay = async () => {
    if (!clientRequestId) return null
    const existing = await findBatchByClientRequestId(clientRequestId)
    if (!existing) return null
    // A key belongs to the work order it was first used on.
    if (existing.workOrderId !== id) return { code: 'IDEMPOTENCY_KEY_REUSED' as const }
    return { batch: (await getBatchByNumber(existing.batchNumber, role))!, workOrder: await getWorkOrder(id, role === 'superadmin'), replayed: true }
  }
  const replayed = await replay()
  if (replayed) return replayed

  const [wo] = await db.select().from(productionWorkOrders).where(eq(productionWorkOrders.id, id))
  if (!wo) return { code: 'NOT_FOUND' }
  if (!OPEN_FOR_BATCH.includes(wo.status)) return { code: 'WORK_ORDER_NOT_OPEN' }
  if (data.version !== undefined && wo.version !== data.version) return { code: 'VERSION_CONFLICT' }

  const rows = formulaRows(wo.formulaSnapshot as Record<string, unknown>)
  if (rows.length === 0) return { code: 'FORMULA_EMPTY' }

  const [[demand], [product], [formulaDoc], inventory] = await Promise.all([
    db.select({ customerName: companies.displayName, unitPrice: customerPurchaseOrderItems.unitPrice })
      .from(productionWorkOrderDemands)
      .innerJoin(customerPurchaseOrders, eq(customerPurchaseOrders.id, productionWorkOrderDemands.orderId))
      .innerJoin(companies, eq(companies.id, customerPurchaseOrders.customerId))
      .innerJoin(customerPurchaseOrderItems, eq(customerPurchaseOrderItems.id, productionWorkOrderDemands.orderItemId))
      .where(eq(productionWorkOrderDemands.workOrderId, id)).limit(1),
    db.select({ displayName: products.displayName }).from(products).where(eq(products.key, wo.productKey)),
    db.select({ body: productDocuments.body }).from(productDocuments)
      .where(and(eq(productDocuments.productKey, wo.productKey), eq(productDocuments.docType, 'formula'))),
    db.select({ material: inventoryItems.material, price: inventoryItems.price }).from(inventoryItems),
  ])

  // Server-built snapshots: quantities scale linearly with batch size (same
  // basis as material readiness); rates come from current inventory prices.
  const materials = inventory.map((item) => item.material)
  const explicitTotal = rows.reduce((sum, row) => sum + (row.percentage ?? 0), 0)
  const components = rows.map((row) => {
    const percentage = row.percentage ?? Math.max(0, 100 - explicitTotal)
    const match = findMaterialMatch(row.name, materials)
    const materialRate = Number(inventory.find((item) => item.material === match)?.price ?? 0)
    const quantityUsed = round3((percentage / 100) * data.batchSize)
    return { name: row.name, percentage, quantityUsed, unit: wo.unit, materialRate, costContribution: round3(quantityUsed * materialRate) }
  })
  const rawMaterialCostPerL = components.reduce((sum, c) => sum + c.costContribution, 0) / data.batchSize
  const sellingPricePerL = demand ? Number(demand.unitPrice) : 0
  const profitPerL = sellingPricePerL - rawMaterialCostPerL
  const companyName = demand?.customerName ?? HOUSE_COMPANY_NAME
  const productionDate = data.productionDate ?? todayIso()
  const signalWord = (formulaDoc?.body as { signalWord?: string } | undefined)?.signalWord ?? 'WARNING'

  let result: CreateBatchResult
  try {
    result = await createBatch({
    productCode: wo.productKey,
    companyName,
    batchSize: data.batchSize,
    productionDate,
    formulationSnapshot: { components },
    labelSnapshot: {
      productName: product?.displayName ?? wo.productKey,
      companyName,
      manufactureDate: productionDate,
      expiryDate: data.expiryDate,
      netWeight: `${data.batchSize} ${wo.unit}`,
      hazardPictograms: [],
      signalWord,
    },
    costSummary: {
      rawMaterialCostPerL: round3(rawMaterialCostPerL),
      lossAdjustmentPerL: 0,
      transportCostPerL: 0,
      handlingBufferPerL: 0,
      productionCostPerL: round3(rawMaterialCostPerL),
      sellingPricePerL,
      profitPerL: round3(profitPerL),
      profitMargin: sellingPricePerL > 0 ? round3((profitPerL / sellingPricePerL) * 100) : 0,
    },
    paymentTermDays: 45,
    variantId: wo.variantId,
    variantName: (wo.formulaSnapshot as { variantName?: string }).variantName ?? null,
    notes: data.notes,
    batchType: wo.demandType === 'trial' ? 'Trial' : 'Production',
  }, actor.id, {
    workOrderId: wo.id,
    clientRequestId,
    onCreated: (tx, row) => advanceAfterBatch(tx, wo.id, row, actor.id, data.version),
  })
  } catch (error) {
    if (error instanceof WorkOrderStateError) return { code: error.code }
    // Same Idempotency-Key raced in concurrently: the other request won — replay it.
    if ((error as { code?: string }).code === '23505' && clientRequestId) {
      const winner = await replay()
      if (winner) return winner
    }
    throw error
  }
  if ('code' in result) return result

  return {
    batch: (await getBatchByNumber(result.batchNumber, role))!,
    workOrder: await getWorkOrder(wo.id, role === 'superadmin'),
    replayed: false,
  }
}

/** After a batch is recorded: audit it, then reconcile the order under its row lock (rejects closed/stale orders). */
async function advanceAfterBatch(tx: Tx, workOrderId: string, batch: typeof batches.$inferSelect, actorId: string, expectedVersion?: number) {
  await syncWorkOrderProgress(tx, workOrderId, actorId, { requireOpen: true, expectedVersion, batchId: batch.id })
  await recordEvent(tx, {
    workOrderId, batchId: batch.id, action: 'batch_created', actorId,
    payload: { batchNumber: batch.batchNumber, batchSize: Number(batch.batchSize) },
  })
}
