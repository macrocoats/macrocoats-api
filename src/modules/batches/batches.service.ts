import { eq, ilike, and, gte, lte, desc, count, sql, isNull, isNotNull } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { batches, productFormulationVariants, finishedGoods, productionWorkOrderDemands, productionEvents } from '../../db/schema/index.js'
import { allocateReleasedBatch } from '../customer-purchase-orders/customer-purchase-orders.service.js'
import { syncWorkOrderProgress } from '../../utils/workOrderProgress.js'
import { nextBatchNumber } from '../../utils/batchNumber.js'
import { findMaterialMatch, isWaterMaterial } from '../../utils/materialMatch.js'
import { createFinishedGoodsRecord } from '../finished-goods/finished-goods.service.js'
import { USABLE_VARIANT_STATUSES, type VariantStatus } from '../../types/index.js'
import type { CreateBatchBody, ListBatchesQuery, SaveCoaSnapshotBody } from './batches.schema.js'
import { findPackContainer } from './packContainers.js'

/** The batch's first invoice — the earliest non-voided dispatch carrying an invoice number. */
interface BatchInvoice { invoiceNumber: string; startDate: string }

/**
 * Payment terms start only once an invoice is mapped to the batch (a dispatch
 * with an invoice number). The term counts from the Zoho invoice date when the
 * invoice has been synced, else from that dispatch's date. Derived on every
 * read, so voiding or editing the dispatch moves the due date with it;
 * `batches.payment_due_date` is legacy and no longer read or written.
 */
export async function loadBatchInvoices(batchIds: string[]): Promise<Map<string, BatchInvoice>> {
  if (batchIds.length === 0) return new Map()
  const rows = await db.execute<{ batchId: string; invoiceNumber: string; startDate: string }>(sql`
    SELECT d.batch_id AS "batchId",
           (array_agg(d.invoice_number ORDER BY coalesce(z.invoice_date, d.dispatch_date), d.created_at))[1] AS "invoiceNumber",
           min(coalesce(z.invoice_date, d.dispatch_date))::text AS "startDate"
    FROM dispatches d
    LEFT JOIN zoho_invoice_syncs z ON z.dispatch_id = d.id
    WHERE d.batch_id IN (${sql.join(batchIds.map((id) => sql`${id}::uuid`), sql`, `)})
      AND d.voided_at IS NULL
      AND btrim(coalesce(d.invoice_number, '')) <> ''
    GROUP BY d.batch_id
  `)
  return new Map(rows.map((r) => [r.batchId, { invoiceNumber: r.invoiceNumber, startDate: r.startDate }]))
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function withInvoice(row: typeof batches.$inferSelect) {
  const invoices = await loadBatchInvoices([row.id])
  return toBatchResponse(row, invoices.get(row.id) ?? null)
}

function toBatchResponse(row: typeof batches.$inferSelect, invoice: BatchInvoice | null = null) {
  const blockingReasons = getReleaseBlockingReasons(row)
  const paymentTermDays = row.paymentTermDays ?? 45
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
    invoiceNumber:       invoice?.invoiceNumber ?? null,
    paymentStartDate:    invoice?.startDate ?? null,
    paymentDueDate:      invoice ? addDays(invoice.startDate, paymentTermDays) : null,
    paymentTermDays,
    paidAt:              row.paidAt ? row.paidAt.toISOString() : null,
    variantId:           row.variantId ?? null,
    variantName:         row.variantName ?? null,
    batchType:           row.batchType,
    lifecycleStatus:     row.lifecycleStatus,
    actualYield:         row.actualYield === null ? null : Number(row.actualYield),
    expiryDate:          row.expiryDate ?? null,
    releaseNotes:        row.releaseNotes ?? null,
    releasedAt:          row.releasedAt ? row.releasedAt.toISOString() : null,
    version:             row.version,
    blockingReasons,
    capabilities: {
      canSubmitQc: !['released', 'rejected', 'cancelled', 'closed'].includes(row.lifecycleStatus),
      canRelease: row.lifecycleStatus !== 'released' && blockingReasons.length === 0,
      canDispatch: row.lifecycleStatus === 'released' && (!row.expiryDate || row.expiryDate >= new Date().toISOString().slice(0, 10)),
    },
    coaSnapshot:         row.coaSnapshot ?? null,
    notes:               row.notes ?? null,
    workOrderId:         row.workOrderId ?? null,
    createdAt:           row.createdAt.toISOString(),
  }
}

function getReleaseBlockingReasons(row: typeof batches.$inferSelect): string[] {
  const blockers: string[] = []
  if (row.batchType !== 'Production') blockers.push('trial_batch')
  const tests = (row.coaSnapshot as { tests?: Array<{ status?: string }> } | null)?.tests
  if (!tests?.length) blockers.push('coa_missing')
  else if (tests.some((test) => test.status !== 'Pass')) blockers.push('qc_failed')
  if (!row.labelSnapshot) blockers.push('label_missing')
  if (!row.expiryDate) blockers.push('expiry_missing')
  else if (row.expiryDate < new Date().toISOString().slice(0, 10)) blockers.push('expired')
  return blockers
}

/**
 * Operator-role view of a batch — everything toBatchResponse() returns
 * EXCEPT formulationSnapshot (component percentages — formula IP) and
 * costSummary (cost/profit figures). labelSnapshot and coaSnapshot are kept:
 * neither is formula composition or pricing (a label is printed and shipped
 * with the product; a CoA is a quality record), and an operator plausibly
 * needs both for traceability. Used instead of toBatchResponse() on the
 * GET routes operators are granted — see requireRole.ts and batches.routes.ts.
 */
function toOperatorBatchResponse(row: typeof batches.$inferSelect, invoice: BatchInvoice | null = null) {
  const { formulationSnapshot: _formulationSnapshot, costSummary: _costSummary, ...rest } = toBatchResponse(row, invoice)
  return rest
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
  | { code: 'MATERIAL_NOT_FOUND'; materialName: string }
  | { code: 'INSUFFICIENT_MATERIAL'; materialName: string; available: number; required: number }

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Work-order hook for createBatch: links the new batch to a production work
 * order and runs `onCreated` inside the same transaction (the work-order
 * service uses it to auto-advance the order and write audit events), so a
 * failed advance rolls the batch back too.
 */
export interface CreateBatchOptions {
  workOrderId?: string
  clientRequestId?: string
  onCreated?: (tx: Tx, row: typeof batches.$inferSelect) => Promise<void>
}

export async function findBatchByClientRequestId(clientRequestId: string) {
  const [row] = await db.select().from(batches).where(eq(batches.clientRequestId, clientRequestId))
  return row ?? null
}

export { toOperatorBatchResponse }

export async function createBatch(data: CreateBatchBody, createdBy: string | null, options: CreateBatchOptions = {}): Promise<CreateBatchResult> {
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
    const productionDate = data.productionDate ?? new Date().toISOString().slice(0, 10)
    const batchNumber    = await nextBatchNumber(tx as unknown as typeof db, data.companyName, productionDate)

    // ── Inventory deduction ────────────────────────────────────────────────
    // Formula materials resolve to Inventory items with the same whole-word
    // matcher the Formula page prices with (utils/materialMatch.ts), so
    // "Exxsol D60" deducts from "Exxol D60". Water rows are not stocked and are
    // skipped. Trial batches skip the inventory gate and deduction entirely —
    // they are R&D/sample runs, not production consumption.
    // The inventory rows are locked FOR UPDATE and the deduction is a single
    // VALUES-CTE delta update by id, so concurrent batches serialize correctly.
    const components = (data.batchType === 'Trial' ? [] : data.formulationSnapshot.components)
      .filter((c) => c.quantityUsed > 0 && !isWaterMaterial(c.name))

    if (components.length > 0) {
      const inventoryRows = await tx.execute<{ id: string; material: string; stockQty: string | null }>(sql`
        SELECT id, material, stock_qty AS "stockQty"
        FROM inventory_items
        FOR UPDATE
      `)
      const materials = inventoryRows.map((row) => row.material)
      const totals = new Map<string, { name: string; quantity: number; stockQty: string | null }>()
      for (const component of components) {
        const match = findMaterialMatch(component.name, materials)
        const item = match === null ? undefined : inventoryRows.find((row) => row.material === match)
        if (!item || item.stockQty === null) {
          return { code: 'MATERIAL_NOT_FOUND' as const, materialName: component.name }
        }
        const current = totals.get(item.id) ?? { name: component.name, quantity: 0, stockQty: item.stockQty }
        current.quantity += component.quantityUsed
        totals.set(item.id, current)
      }
      for (const total of totals.values()) {
        const available = Number(total.stockQty)
        if (available < total.quantity) {
          return { code: 'INSUFFICIENT_MATERIAL' as const, materialName: total.name, available, required: total.quantity }
        }
      }
      const valuesList = sql.join(
        [...totals.entries()].map(([id, t]) => sql`(${id}::uuid, ${t.quantity}::numeric)`),
        sql`, `,
      )
      await tx.execute(sql`
        UPDATE inventory_items AS t
        SET    stock_qty = t.stock_qty - v.qty
        FROM  (VALUES ${valuesList}) AS v(id, qty)
        WHERE  t.id = v.id
          AND  t.stock_qty IS NOT NULL
      `)
    }

    const { packContainerId, ...labelSnapshot } = data.labelSnapshot
    const packContainer = findPackContainer(packContainerId)
    const labelSnapshotWithBatch = {
      ...labelSnapshot,
      ...(packContainer ? { packContainer } : {}),
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
        paymentTermDays:     data.paymentTermDays ?? 45,
        variantId:           data.variantId ?? null,
        variantName:         data.variantName ?? null,
        batchType:           data.batchType ?? 'Production',
        lifecycleStatus:     'awaiting_qc',
        expiryDate:          data.labelSnapshot.expiryDate,
        notes:               data.notes ?? null,
        workOrderId:         options.workOrderId ?? null,
        clientRequestId:     options.clientRequestId ?? null,
        createdBy:           createdBy ?? undefined,
      })
      .returning()

    await createFinishedGoodsRecord(tx as unknown as typeof db, row)
    if (options.onCreated) await options.onCreated(tx, row)

    return toBatchResponse(row)
  })
}

export async function listBatches(query: ListBatchesQuery, role: 'superadmin' | 'operator' = 'superadmin') {
  const toResponse = role === 'operator' ? toOperatorBatchResponse : toBatchResponse
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
  const invoices = await loadBatchInvoices(rows.map((row) => row.id))

  return {
    batches: rows.map((row) => toResponse(row, invoices.get(row.id) ?? null)),
    total,
    page:  query.page,
    limit: query.limit,
  }
}

export async function getBatchByNumber(batchNumber: string, role: 'superadmin' | 'operator' = 'superadmin') {
  const [row] = await db
    .select()
    .from(batches)
    .where(eq(batches.batchNumber, batchNumber))

  if (!row) return null
  const invoice = (await loadBatchInvoices([row.id])).get(row.id) ?? null
  return role === 'operator' ? toOperatorBatchResponse(row, invoice) : toBatchResponse(row, invoice)
}

export async function saveCoaSnapshot(
  batchNumber: string,
  snapshot: SaveCoaSnapshotBody,
  actor: { id: string | null; role: 'superadmin' | 'operator' } = { id: null, role: 'superadmin' },
) {
  // Lock + guarded UPDATE so a concurrent release can't be followed by a CoA overwrite.
  const outcome = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(batches).where(eq(batches.batchNumber, batchNumber)).for('update')
    if (!existing) return null
    if (['released', 'closed'].includes(existing.lifecycleStatus)) return { code: 'BATCH_IMMUTABLE' as const }
    const [updated] = await tx.update(batches)
      .set({ coaSnapshot: snapshot, version: existing.version + 1 })
      .where(and(eq(batches.id, existing.id), sql`${batches.lifecycleStatus} NOT IN ('released', 'closed')`))
      .returning()
    if (!updated) return { code: 'BATCH_IMMUTABLE' as const }
    if (updated.workOrderId) {
      const tests = snapshot.tests
      await tx.insert(productionEvents).values({
        workOrderId: updated.workOrderId, batchId: updated.id, action: 'qc_recorded', actorId: actor.id,
        payload: { batchNumber, testCount: tests.length, passed: tests.every((t) => t.status === 'Pass'), savedBy: snapshot.savedBy ?? null },
      })
    }
    return updated
  })
  if (!outcome || 'code' in outcome) return outcome
  const row = outcome
  // Operators may record QC results; the response never carries formula/cost.
  const invoice = (await loadBatchInvoices([row.id])).get(row.id) ?? null
  return actor.role === 'operator' ? toOperatorBatchResponse(row, invoice) : toBatchResponse(row, invoice)
}

export async function setPaymentStatus(batchNumber: string, paid: boolean) {
  const [row] = await db
    .update(batches)
    .set({ paidAt: paid ? new Date() : null })
    .where(eq(batches.batchNumber, batchNumber))
    .returning()
  return row ? withInvoice(row) : null
}

export async function clearCoaSnapshot(batchNumber: string): Promise<boolean> {
  const [existing] = await db.select().from(batches).where(eq(batches.batchNumber, batchNumber))
  if (!existing || ['released', 'closed'].includes(existing.lifecycleStatus)) return false
  const result = await db
    .update(batches)
    .set({ coaSnapshot: null })
    .where(eq(batches.batchNumber, batchNumber))
    .returning({ id: batches.id })
  return result.length > 0
}

export type ReleaseBatchResult =
  | ReturnType<typeof toBatchResponse>
  | { code: 'BATCH_NOT_FOUND' | 'BATCH_NOT_RELEASABLE' | 'VERSION_CONFLICT'; blockingReasons?: string[] }

export async function releaseBatch(batchNumber: string, releasedBy: string, notes?: string, version?: number): Promise<ReleaseBatchResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(batches).where(eq(batches.batchNumber, batchNumber)).for('update')
    if (!row) return { code: 'BATCH_NOT_FOUND' as const }
    if (row.lifecycleStatus === 'released') return withInvoice(row)
    if (version !== undefined && row.version !== version) return { code: 'VERSION_CONFLICT' as const }
    const blockingReasons = getReleaseBlockingReasons(row)
    if (blockingReasons.length) return { code: 'BATCH_NOT_RELEASABLE' as const, blockingReasons }
    const [updated] = await tx.update(batches).set({
      lifecycleStatus: 'released', releasedBy, releasedAt: new Date(), releaseNotes: notes ?? null,
      actualYield: row.actualYield ?? row.batchSize, version: row.version + 1,
    }).where(and(eq(batches.id, row.id), eq(batches.version, row.version))).returning()
    if (!updated) return { code: 'VERSION_CONFLICT' as const }
    await tx.update(finishedGoods).set({ status: 'Available', updatedAt: new Date() })
      .where(and(eq(finishedGoods.batchId, row.id), eq(finishedGoods.status, 'Quarantined')))
    if (updated.workOrderId) {
      // Work-order batches allocate to the order lines they were planned for.
      const lines = await tx.select({ orderId: productionWorkOrderDemands.orderId, orderItemId: productionWorkOrderDemands.orderItemId })
        .from(productionWorkOrderDemands).where(eq(productionWorkOrderDemands.workOrderId, updated.workOrderId))
        .orderBy(productionWorkOrderDemands.createdAt)
      const allocations = await allocateReleasedBatch(tx as unknown as typeof db, updated, lines, releasedBy)
      await tx.insert(productionEvents).values({
        workOrderId: updated.workOrderId, batchId: updated.id, action: 'batch_released', actorId: releasedBy,
        payload: { batchNumber: updated.batchNumber, allocations },
      })
      // Released output is what completes a work order.
      await syncWorkOrderProgress(tx, updated.workOrderId, releasedBy, { batchId: updated.id })
    }
    return withInvoice(updated)
  })
}

export async function releaseBatches(batchNumbers: string[], releasedBy: string, notes?: string) {
  // Each batch releases in its own transaction so one blocked batch never
  // fails the rest; the server re-checks every gate per batch.
  const results = []
  for (const batchNumber of batchNumbers) {
    const result = await releaseBatch(batchNumber, releasedBy, notes)
    results.push('code' in result
      ? { batchNumber, released: false, error: result.code, blockingReasons: result.blockingReasons ?? [] }
      : { batchNumber, released: true, lifecycleStatus: result.lifecycleStatus })
  }
  return results
}

export async function setBatchLifecycle(batchNumber: string, status: 'on_hold' | 'rejected' | 'cancelled', reason: string, version?: number): Promise<ReleaseBatchResult> {
  const [existing] = await db.select().from(batches).where(eq(batches.batchNumber, batchNumber))
  if (!existing) return { code: 'BATCH_NOT_FOUND' }
  if (existing.lifecycleStatus === 'released' || existing.lifecycleStatus === 'closed') {
    return { code: 'BATCH_NOT_RELEASABLE', blockingReasons: ['released_batch_immutable'] }
  }
  if (version !== undefined && existing.version !== version) return { code: 'VERSION_CONFLICT' }
  const [updated] = await db.update(batches).set({ lifecycleStatus: status, releaseNotes: reason, version: existing.version + 1 })
    .where(and(eq(batches.id, existing.id), eq(batches.version, existing.version))).returning()
  if (!updated) return { code: 'VERSION_CONFLICT' }
  await db.update(finishedGoods).set({ status: 'Quarantined', updatedAt: new Date() }).where(eq(finishedGoods.batchId, existing.id))
  if (updated.workOrderId) {
    // A held/rejected batch stops counting as output; the hub then offers the next batch.
    await db.insert(productionEvents).values({
      workOrderId: updated.workOrderId, batchId: updated.id, action: `batch_${status}`, fromStatus: existing.lifecycleStatus, toStatus: status,
      payload: { batchNumber, reason },
    })
  }
  return withInvoice(updated)
}

export async function deleteBatch(id: string): Promise<boolean> {
  const result = await db
    .delete(batches)
    .where(eq(batches.id, id))
    .returning({ id: batches.id })

  return result.length > 0
}
