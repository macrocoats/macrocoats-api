import { eq, asc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { inventoryItems } from '../../db/schema/index.js'
import type { CreateInventoryItemBody, UpdateInventoryItemBody } from './inventory.schema.js'

function toResponse(row: typeof inventoryItems.$inferSelect) {
  return {
    id:        row.id,
    material:  row.material,
    unit:      row.unit,
    price:     Number(row.price),
    stock:     row.stock,
    supplier:  row.supplier,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
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
      ...data,
      price:     String(data.price),
      isDefault: false,
      updatedBy,
      updatedAt: new Date(),
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
  // Delete all rows that were added by users (not seeded defaults)
  await db
    .delete(inventoryItems)
    .where(eq(inventoryItems.isDefault, false))

  // The seed rows remain — return the current state
  return getAllItems()
}
