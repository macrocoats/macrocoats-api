import { and, count, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  productionWorkOrders, productionWorkOrderDemands, productionWorkOrderSequences,
  customerPurchaseOrders, customerPurchaseOrderItems,
  productFormulationVariants, formulationVariantComponents, productDocuments,
  inventoryItems,
} from '../../db/schema/index.js'
import { USABLE_VARIANT_STATUSES, type VariantStatus } from '../../types/index.js'
import type { CreateWorkOrderBody, ListWorkOrdersQuery, TransitionWorkOrderBody } from './production-work-orders.schema.js'

const TRANSITIONS: Record<string, string[]> = {
  draft: ['planned', 'cancelled'],
  planned: ['released_to_production', 'cancelled'],
  released_to_production: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
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
    return toResponse(row, includeFormula)
  })
}

export async function listWorkOrders(query: ListWorkOrdersQuery, includeFormula = false) {
  const conditions: SQL[] = []
  if (query.status) conditions.push(eq(productionWorkOrders.status, query.status))
  if (query.productKey) conditions.push(eq(productionWorkOrders.productKey, query.productKey))
  if (query.scheduledFrom) conditions.push(gte(productionWorkOrders.scheduledDate, query.scheduledFrom))
  if (query.scheduledTo) conditions.push(lte(productionWorkOrders.scheduledDate, query.scheduledTo))
  const where = conditions.length ? and(...conditions) : undefined
  const [{ total }] = await db.select({ total: count() }).from(productionWorkOrders).where(where)
  const rows = await db.select().from(productionWorkOrders).where(where)
    .orderBy(productionWorkOrders.scheduledDate, desc(productionWorkOrders.createdAt))
    .limit(query.limit).offset((query.page - 1) * query.limit)
  return { workOrders: rows.map((row) => toResponse(row, includeFormula)), total, page: query.page, limit: query.limit }
}

export async function getWorkOrder(id: string, includeFormula = false) {
  const [row] = await db.select().from(productionWorkOrders).where(eq(productionWorkOrders.id, id))
  return row ? toResponse(row, includeFormula) : null
}

export type TransitionWorkOrderResult = ReturnType<typeof toResponse> | { code: 'NOT_FOUND' | 'VERSION_CONFLICT' | 'INVALID_TRANSITION' | 'MATERIALS_NOT_READY' }

export async function transitionWorkOrder(id: string, data: TransitionWorkOrderBody, includeFormula = false): Promise<TransitionWorkOrderResult> {
  const [existing] = await db.select().from(productionWorkOrders).where(eq(productionWorkOrders.id, id))
  if (!existing) return { code: 'NOT_FOUND' }
  if (existing.version !== data.version) return { code: 'VERSION_CONFLICT' }
  if (!(TRANSITIONS[existing.status] ?? []).includes(data.status)) return { code: 'INVALID_TRANSITION' }
  const readiness = existing.materialReadinessSnapshot as { ready?: boolean } | null
  if (data.status === 'released_to_production' && readiness?.ready !== true) return { code: 'MATERIALS_NOT_READY' }
  const [row] = await db.update(productionWorkOrders).set({ status: data.status, version: existing.version + 1, updatedAt: new Date() })
    .where(and(eq(productionWorkOrders.id, id), eq(productionWorkOrders.version, data.version))).returning()
  if (!row) return { code: 'VERSION_CONFLICT' }
  return toResponse(row, includeFormula)
}
