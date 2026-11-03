import { desc, eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { packContainerMovements, packContainerStock, users } from '../../db/schema/index.js'
import { PACK_CONTAINERS, findPackContainer, type PackContainerId } from '../batches/packContainers.js'
import type { AdjustStockBody, ListMovementsQuery } from './pack-containers.schema.js'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface ReturnedContainer { containerId: string; name: string; quantity: number }

const stockStatus = (qty: number, threshold: number) => {
  if (qty === 0) return 'out_of_stock' as const
  if (qty < threshold) return 'low' as const
  return 'in_stock' as const
}

/** Every container type with its stock. A type with no stock row yet reads as zero. */
export async function listContainers() {
  const rows = await db.select().from(packContainerStock)
  const byId = new Map(rows.map((row) => [row.containerId, row]))
  return PACK_CONTAINERS.map((container) => {
    const row = byId.get(container.id)
    const stockQty = row?.stockQty ?? 0
    const lowStockThreshold = row?.lowStockThreshold ?? 5
    return {
      ...container,
      stockQty,
      lowStockThreshold,
      stockStatus: stockStatus(stockQty, lowStockThreshold),
      updatedAt: row?.updatedAt.toISOString() ?? null,
    }
  })
}

/** Containers a batch fills: a part-filled container still uses one whole container. */
export const containersNeeded = (batchSize: number, capacityL: number): number =>
  Math.ceil(Math.round((batchSize / capacityL) * 1000) / 1000)

/** Locks the container's row until the transaction ends and returns its stock. */
export async function lockContainerStock(tx: Tx, containerId: string): Promise<number> {
  const [row] = await tx.select({ stockQty: packContainerStock.stockQty }).from(packContainerStock)
    .where(eq(packContainerStock.containerId, containerId)).for('update')
  return row?.stockQty ?? 0
}

export async function issueContainers(
  tx: Tx,
  input: { containerId: string; quantity: number; batchId: string; batchNumber: string; actorId?: string | null },
) {
  const [updated] = await tx.update(packContainerStock)
    .set({ stockQty: sql`${packContainerStock.stockQty} - ${input.quantity}`, updatedAt: new Date() })
    .where(eq(packContainerStock.containerId, input.containerId))
    .returning({ stockQty: packContainerStock.stockQty })
  await tx.insert(packContainerMovements).values({
    containerId: input.containerId,
    movementType: 'issue',
    quantityChange: -input.quantity,
    stockAfter: updated.stockQty,
    batchId: input.batchId,
    batchNumber: input.batchNumber,
    createdBy: input.actorId ?? undefined,
  })
}

/** True once any of this batch's containers have gone back to stock. */
export async function hasReturnedContainers(tx: Tx, batchId: string): Promise<boolean> {
  const rows = await tx.select({ id: packContainerMovements.id }).from(packContainerMovements)
    .where(sql`${packContainerMovements.batchId} = ${batchId} AND ${packContainerMovements.movementType} = 'return'`)
    .limit(1)
  return rows.length > 0
}

/**
 * Puts a batch's containers back, from its movement records, so a second call
 * returns nothing and a batch with no record returns nothing.
 */
export async function returnBatchContainers(
  tx: Tx,
  batch: { id: string; batchNumber: string },
  note: string,
  actorId?: string,
): Promise<ReturnedContainer[]> {
  const rows = await tx.select({ containerId: packContainerMovements.containerId, change: packContainerMovements.quantityChange })
    .from(packContainerMovements)
    .where(eq(packContainerMovements.batchId, batch.id))
  const net = new Map<string, number>()
  for (const row of rows) net.set(row.containerId, (net.get(row.containerId) ?? 0) + row.change)

  const returned: ReturnedContainer[] = []
  for (const [containerId, change] of net) {
    if (change >= 0) continue
    const quantity = -change
    const [updated] = await tx.update(packContainerStock)
      .set({ stockQty: sql`${packContainerStock.stockQty} + ${quantity}`, updatedAt: new Date() })
      .where(eq(packContainerStock.containerId, containerId))
      .returning({ stockQty: packContainerStock.stockQty })
    await tx.insert(packContainerMovements).values({
      containerId,
      movementType: 'return',
      quantityChange: quantity,
      stockAfter: updated.stockQty,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      note,
      createdBy: actorId,
    })
    returned.push({ containerId, name: findPackContainer(containerId)?.name ?? containerId, quantity })
  }
  return returned
}

/** Records containers received, or replaces the stock with a physical count. */
export async function adjustStock(containerId: PackContainerId, body: AdjustStockBody, actorId: string) {
  await db.transaction(async (tx) => {
    await tx.insert(packContainerStock).values({ containerId }).onConflictDoNothing()
    const current = await lockContainerStock(tx, containerId)
    const stockAfter = body.type === 'receipt' ? current + body.quantity : body.quantity
    await tx.update(packContainerStock)
      .set({ stockQty: stockAfter, updatedAt: new Date(), updatedBy: actorId })
      .where(eq(packContainerStock.containerId, containerId))
    await tx.insert(packContainerMovements).values({
      containerId,
      movementType: body.type,
      quantityChange: stockAfter - current,
      stockAfter,
      note: body.note || null,
      createdBy: actorId,
    })
  })
  return getContainer(containerId)
}

export async function updateMinimum(containerId: PackContainerId, lowStockThreshold: number, actorId: string) {
  await db.insert(packContainerStock).values({ containerId, lowStockThreshold, updatedBy: actorId })
    .onConflictDoUpdate({
      target: packContainerStock.containerId,
      set: { lowStockThreshold, updatedAt: new Date(), updatedBy: actorId },
    })
  return getContainer(containerId)
}

async function getContainer(containerId: PackContainerId) {
  const all = await listContainers()
  return all.find((container) => container.id === containerId)!
}

export async function listMovements(query: ListMovementsQuery) {
  const rows = await db
    .select({ movement: packContainerMovements, userName: users.name })
    .from(packContainerMovements)
    .leftJoin(users, eq(users.id, packContainerMovements.createdBy))
    .where(query.containerId ? eq(packContainerMovements.containerId, query.containerId) : undefined)
    .orderBy(desc(packContainerMovements.createdAt))
    .limit(query.limit)

  return rows.map(({ movement, userName }) => ({
    id: movement.id,
    containerId: movement.containerId,
    containerName: findPackContainer(movement.containerId)?.name ?? movement.containerId,
    movementType: movement.movementType,
    quantityChange: movement.quantityChange,
    stockAfter: movement.stockAfter,
    batchNumber: movement.batchNumber,
    note: movement.note,
    userName,
    createdAt: movement.createdAt.toISOString(),
  }))
}
