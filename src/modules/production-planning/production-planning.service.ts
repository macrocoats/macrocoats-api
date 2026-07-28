import { sql, eq, and, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { formulationVariantComponents, productDocuments, inventoryItems } from '../../db/schema/index.js'
import { normalizeMaterialName } from '../cost-intelligence/cost-intelligence.service.js'
import type { OverviewQuery } from './production-planning.schema.js'

interface OpenItemRow {
  [key: string]: unknown
  itemId: string; orderId: string; poNumber: string
  priority: string; expectedDeliveryDate: string | null
  customerName: string
  productKey: string; productDisplayName: string
  variantId: string | null; variantName: string | null
  quantityOrdered: string; unit: string
  producedQty: string
}

/**
 * Read-only aggregation over open Customer PO items — "what needs to be
 * manufactured, and what raw materials does that require" — nothing here is
 * stored; every figure is derived on request from tables that already exist
 * (customer_purchase_order_items/_batches, formulation_variant_components or
 * the base product_documents formula body, inventory_items). Mirrors the
 * read-only style of cost-intelligence / investor-dashboard.
 */
export async function getProductionPlanningOverview(query: OverviewQuery) {
  const openItems = await db.execute<OpenItemRow>(sql`
    SELECT
      i.id AS "itemId", i.order_id AS "orderId", o.po_number AS "poNumber",
      o.priority, o.expected_delivery_date AS "expectedDeliveryDate",
      c.display_name AS "customerName",
      i.product_key AS "productKey", p.display_name AS "productDisplayName",
      i.variant_id AS "variantId", v.variant_name AS "variantName",
      i.quantity_ordered AS "quantityOrdered", i.unit,
      COALESCE(pb.produced, 0) AS "producedQty"
    FROM customer_purchase_order_items i
    JOIN customer_purchase_orders o ON o.id = i.order_id
    JOIN companies c ON c.id = o.customer_id
    JOIN products p ON p.key = i.product_key
    LEFT JOIN product_formulation_variants v ON v.id = i.variant_id
    LEFT JOIN (
      SELECT order_item_id, SUM(linked_quantity) AS produced
      FROM customer_purchase_order_batches
      GROUP BY order_item_id
    ) pb ON pb.order_item_id = i.id
    WHERE o.deleted_at IS NULL
      AND o.status NOT IN ('completed', 'cancelled')
      AND (
        o.expected_delivery_date IS NULL
        OR o.expected_delivery_date <= CURRENT_DATE + (${query.days} || ' days')::interval
      )
    ORDER BY o.expected_delivery_date ASC NULLS LAST, o.priority DESC
  `)

  const items = openItems
    .map((r) => {
      const quantityOrdered = Number(r.quantityOrdered)
      const producedQty = Number(r.producedQty)
      const remainingQty = Math.max(0, quantityOrdered - producedQty)
      return { ...r, quantityOrdered, producedQty, remainingQty }
    })
    .filter((r) => r.remainingQty > 0)

  // ── Batch-resolve required materials per item ──────────────────────────────
  const variantIds = [...new Set(items.filter((i) => i.variantId).map((i) => i.variantId as string))]
  const variantComponentRows = variantIds.length
    ? await db.select({
        variantId: formulationVariantComponents.variantId,
        materialName: formulationVariantComponents.materialName,
        percentage: formulationVariantComponents.percentage,
        unit: formulationVariantComponents.unit,
      }).from(formulationVariantComponents).where(inArray(formulationVariantComponents.variantId, variantIds))
    : []
  const componentsByVariant = new Map<string, typeof variantComponentRows>()
  for (const row of variantComponentRows) {
    const list = componentsByVariant.get(row.variantId) ?? []
    list.push(row)
    componentsByVariant.set(row.variantId, list)
  }

  // Items with no variant fall back to the product's base formula document —
  // a DIFFERENT field-name shape (name/percentWV, not materialName/percentage;
  // see safteyDataSheet's pages/Products/formula/LiquidFormula.jsx typedef).
  const baseProductKeys = [...new Set(items.filter((i) => !i.variantId).map((i) => i.productKey))]
  const baseFormulaRows = baseProductKeys.length
    ? await db.select({ productKey: productDocuments.productKey, body: productDocuments.body })
        .from(productDocuments)
        .where(and(inArray(productDocuments.productKey, baseProductKeys), eq(productDocuments.docType, 'formula')))
    : []
  const formulaByProduct = new Map(baseFormulaRows.map((r) => [r.productKey, r.body as { composition?: unknown }]))

  type MaterialTotal = { materialName: string; requiredQty: number; unit: string }
  const materialTotals = new Map<string, MaterialTotal>()

  const itemsOut = items.map((item) => {
    let materialsResolved = true
    let resolvedComponents: { name: string; pct: number | null; unit: string }[] = []

    if (item.variantId) {
      resolvedComponents = (componentsByVariant.get(item.variantId) ?? []).map((c) => ({
        name: c.materialName,
        pct: c.percentage !== null ? Number(c.percentage) : null,
        unit: c.unit,
      }))
    } else {
      const body = formulaByProduct.get(item.productKey)
      const composition = Array.isArray(body?.composition) ? body!.composition as Array<Record<string, unknown>> : null
      materialsResolved = composition !== null
      resolvedComponents = (composition ?? []).map((c) => ({
        name: String(c.name ?? ''),
        pct: c.percentWV !== null && c.percentWV !== undefined ? Number(c.percentWV) : null,
        unit: String(c.unit ?? item.unit),
      }))
    }

    resolvedComponents.forEach((c) => {
      // A null percentage is the water/balance row (auto-calculated to the
      // remainder) — not a distinct raw material to purchase/track, so it
      // doesn't contribute to the materials-required aggregation.
      if (c.pct === null) return
      const key = normalizeMaterialName(c.name)
      if (!key) return
      const requiredQty = (c.pct / 100) * item.remainingQty
      const existing = materialTotals.get(key) ?? { materialName: c.name, requiredQty: 0, unit: c.unit }
      existing.requiredQty += requiredQty
      materialTotals.set(key, existing)
    })

    return {
      itemId: item.itemId,
      orderId: item.orderId,
      poNumber: item.poNumber,
      customerName: item.customerName,
      priority: item.priority,
      expectedDeliveryDate: item.expectedDeliveryDate,
      unscheduled: item.expectedDeliveryDate === null,
      productKey: item.productKey,
      productDisplayName: item.productDisplayName,
      variantId: item.variantId,
      variantName: item.variantName,
      quantityOrdered: item.quantityOrdered,
      producedQty: item.producedQty,
      remainingQty: item.remainingQty,
      unit: item.unit,
      materialsResolved,
    }
  })

  // ── Cross-reference required materials against current inventory stock ────
  const inventory = await db.select({
    material: inventoryItems.material,
    stockQty: inventoryItems.stockQty,
    unit: inventoryItems.unit,
  }).from(inventoryItems)
  const inventoryByNorm = new Map(inventory.map((row) => [normalizeMaterialName(row.material), row]))

  const materials = Array.from(materialTotals.values())
    .map((m) => {
      const key = normalizeMaterialName(m.materialName)
      const invMatch = inventoryByNorm.get(key)
      const currentStock = invMatch?.stockQty !== null && invMatch?.stockQty !== undefined ? Number(invMatch.stockQty) : null
      const shortfall = currentStock !== null ? Math.max(0, m.requiredQty - currentStock) : null
      return {
        materialName: m.materialName,
        requiredQty: Math.round(m.requiredQty * 1000) / 1000,
        unit: m.unit,
        currentStock,
        shortfall,
        sufficient: currentStock === null ? null : currentStock >= m.requiredQty,
      }
    })
    .sort((a, b) => {
      // Insufficient-stock materials first (real action items), then
      // no-inventory-match (unknown), then sufficient-stock last; within
      // each group, largest required quantity first.
      const RANK = { false: 0, null: 1, true: 2 } as const
      const rankA = RANK[String(a.sufficient) as 'false' | 'null' | 'true']
      const rankB = RANK[String(b.sufficient) as 'false' | 'null' | 'true']
      if (rankA !== rankB) return rankA - rankB
      return b.requiredQty - a.requiredQty
    })

  return {
    windowDays: query.days,
    items: itemsOut,
    materials,
    unresolvedItemCount: itemsOut.filter((i) => !i.materialsResolved).length,
  }
}
