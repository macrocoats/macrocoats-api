import { eq, ilike, and, gte, lte, desc, count, sql, isNull, isNotNull } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { batches, productFormulationVariants, finishedGoods } from '../../db/schema/index.js'
import { nextBatchNumber } from '../../utils/batchNumber.js'
import { createFinishedGoodsRecord } from '../finished-goods/finished-goods.service.js'
import { USABLE_VARIANT_STATUSES, type VariantStatus } from '../../types/index.js'
import type { CreateBatchBody, ListBatchesQuery, SaveCoaSnapshotBody } from './batches.schema.js'

function toBatchResponse(row: typeof batches.$inferSelect) {
  const blockingReasons = getReleaseBlockingReasons(row)
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
function toOperatorBatchResponse(row: typeof batches.$inferSelect) {
  const { formulationSnapshot: _formulationSnapshot, costSummary: _costSummary, ...rest } = toBatchResponse(row)
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
    const productionDate = data.productionDate ?? new Date().toISOString().slice(0, 10)
    const batchNumber    = await nextBatchNumber(tx as unknown as typeof db, data.companyName, productionDate)

    // ── Inventory deduction ────────────────────────────────────────────────
    // Single atomic VALUES-CTE UPDATE eliminates the N+1 loop and the
    // read-modify-write race: `stock_qty = stock_qty - qty` is a delta applied
    // at the row lock level, so two concurrent batch creations using the same
    // material will serialize correctly instead of silently overwriting each other.
    const componentTotals = new Map<string, { name: string; quantity: number }>()
    for (const component of data.formulationSnapshot.components) {
      if (!component.quantityUsed || component.quantityUsed <= 0) continue
      const key = component.name.trim().toLowerCase()
      const current = componentTotals.get(key) ?? { name: component.name, quantity: 0 }
      current.quantity += component.quantityUsed
      componentTotals.set(key, current)
    }
    const activeComponents = [...componentTotals.entries()].map(([key, value]) => ({ key, ...value }))

    if (activeComponents.length > 0) {
      const keys = activeComponents.map((component) => component.key)
      const inventoryRows = await tx.execute<{ materialKey: string; stockQty: string | null }>(sql`
        SELECT lower(material) AS "materialKey", stock_qty AS "stockQty"
        FROM inventory_items
        WHERE lower(material) IN (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})
        FOR UPDATE
      `)
      const stockByKey = new Map(inventoryRows.map((row) => [row.materialKey, row.stockQty]))
      for (const component of activeComponents) {
        if (!stockByKey.has(component.key) || stockByKey.get(component.key) === null) {
          return { code: 'MATERIAL_NOT_FOUND' as const, materialName: component.name }
        }
        const available = Number(stockByKey.get(component.key))
        if (available < component.quantity) {
          return { code: 'INSUFFICIENT_MATERIAL' as const, materialName: component.name, available, required: component.quantity }
        }
      }
      const valuesList = sql.join(
        activeComponents.map((c) => sql`(${c.key}, ${c.quantity}::numeric)`),
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
        lifecycleStatus:     'awaiting_qc',
        expiryDate:          data.labelSnapshot.expiryDate,
        notes:               data.notes ?? null,
        createdBy:           createdBy ?? undefined,
      })
      .returning()

    await createFinishedGoodsRecord(tx as unknown as typeof db, row)

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

  return {
    batches: rows.map(toResponse),
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
  return role === 'operator' ? toOperatorBatchResponse(row) : toBatchResponse(row)
}

export async function saveCoaSnapshot(batchNumber: string, snapshot: SaveCoaSnapshotBody) {
  const [existing] = await db.select().from(batches).where(eq(batches.batchNumber, batchNumber))
  if (!existing) return null
  if (['released', 'closed'].includes(existing.lifecycleStatus)) return { code: 'BATCH_IMMUTABLE' as const }
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
    if (row.lifecycleStatus === 'released') return toBatchResponse(row)
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
    return toBatchResponse(updated)
  })
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
  return toBatchResponse(updated)
}

export async function deleteBatch(id: string): Promise<boolean> {
  const result = await db
    .delete(batches)
    .where(eq(batches.id, id))
    .returning({ id: batches.id })

  return result.length > 0
}
