import { eq, asc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { inventoryItems } from '../../db/schema/index.js'
import type { CreateInventoryItemBody, UpdateInventoryItemBody, StockStatus } from './inventory.schema.js'

function computeStockStatus(stockQty: string | null, threshold: number): StockStatus {
  if (stockQty === null) return 'unknown'
  const qty = Number(stockQty)
  if (qty === 0) return 'out_of_stock'
  if (qty < threshold) return 'low'
  return 'in_stock'
}

function toResponse(row: typeof inventoryItems.$inferSelect) {
  const stockStatus = computeStockStatus(row.stockQty, row.lowStockThreshold)
  return {
    id:                row.id,
    material:          row.material,
    unit:              row.unit,
    price:             Number(row.price),
    supplier:          row.supplier,
    sortOrder:         row.sortOrder,
    stockQty:          row.stockQty !== null ? Number(row.stockQty) : null,
    lowStockThreshold: row.lowStockThreshold,
    stockStatus,
    updatedAt:         row.updatedAt.toISOString(),
  }
}

export async function getAllItems() {
  const rows = await db
    .select()
    .from(inventoryItems)
    .orderBy(asc(inventoryItems.sortOrder), asc(inventoryItems.material))

  return rows.map(toResponse)
}

export async function getItemById(id: string) {
  const [row] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id))
  return row ? toResponse(row) : null
}

export async function createItem(data: CreateInventoryItemBody, updatedBy: string) {
  const [row] = await db
    .insert(inventoryItems)
    .values({
      material:          data.material,
      unit:              data.unit,
      price:             String(data.price),
      stock:             data.stock ?? '',
      supplier:          data.supplier ?? '',
      sortOrder:         data.sortOrder ?? 0,
      stockQty:          data.stockQty != null ? String(data.stockQty) : null,
      lowStockThreshold: data.lowStockThreshold ?? 10,
      isDefault:         false,
      updatedBy,
      updatedAt:         new Date(),
    })
    .returning()

  return toResponse(row)
}

export async function updateItem(id: string, data: UpdateInventoryItemBody, updatedBy: string) {
  const patch: Partial<typeof inventoryItems.$inferInsert> = {
    updatedAt: new Date(),
    updatedBy,
  }
  if (data.material  !== undefined) patch.material  = data.material
  if (data.unit      !== undefined) patch.unit      = data.unit
  if (data.price     !== undefined) patch.price     = String(data.price)
  if (data.stock     !== undefined) patch.stock     = data.stock
  if (data.supplier  !== undefined) patch.supplier  = data.supplier
  if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder
  if (data.stockQty  !== undefined) patch.stockQty  = data.stockQty !== null ? String(data.stockQty) : null
  if (data.lowStockThreshold !== undefined) patch.lowStockThreshold = data.lowStockThreshold

  const [row] = await db
    .update(inventoryItems)
    .set(patch)
    .where(eq(inventoryItems.id, id))
    .returning()

  return row ? toResponse(row) : null
}

export async function deleteItem(id: string): Promise<boolean> {
  const result = await db
    .delete(inventoryItems)
    .where(eq(inventoryItems.id, id))
    .returning({ id: inventoryItems.id })

  return result.length > 0
}

/**
 * Resets the inventory to the 23 default materials.
 * Deletes all non-default rows; restores default rows to their seed prices.
 */
export async function resetToDefaults() {
  await db
    .delete(inventoryItems)
    .where(eq(inventoryItems.isDefault, false))

  return getAllItems()
}
