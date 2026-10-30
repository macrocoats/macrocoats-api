import { and, eq, sql } from 'drizzle-orm'
import type { db } from '../db/index.js'
import { batches, productionWorkOrders, productionEvents } from '../db/schema/index.js'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Released output within ±5% of the planned quantity completes a work order automatically. */
export const OUTPUT_TOLERANCE = 0.05
export const OPEN_FOR_BATCH = ['planned', 'released_to_production', 'in_progress']

/** Thrown inside a transaction to roll it back when the work order changed underneath the caller. */
export class WorkOrderStateError extends Error {
  constructor(public code: 'WORK_ORDER_NOT_OPEN' | 'VERSION_CONFLICT') { super(code) }
}

/**
 * Locks a work order and reconciles its status with its batches. Shared by
 * batch creation, QC release and batch rejection so the rule lives in one place:
 *  - any live batch moves planned / released_to_production → in_progress;
 *  - completion counts RELEASED output only, so a batch that later fails QC
 *    never leaves the order closed with nothing to ship.
 * With `requireOpen` (batch creation) a closed order or a stale version throws
 * WorkOrderStateError, rolling the whole transaction back.
 */
export async function syncWorkOrderProgress(
  tx: Tx,
  workOrderId: string,
  actorId: string | null,
  options: { requireOpen?: boolean; expectedVersion?: number; batchId?: string } = {},
) {
  const [wo] = await tx.select().from(productionWorkOrders).where(eq(productionWorkOrders.id, workOrderId)).for('update')
  if (!wo) return
  if (!OPEN_FOR_BATCH.includes(wo.status)) {
    if (options.requireOpen) throw new WorkOrderStateError('WORK_ORDER_NOT_OPEN')
    return
  }
  if (options.expectedVersion !== undefined && wo.version !== options.expectedVersion) throw new WorkOrderStateError('VERSION_CONFLICT')

  const [totals] = await tx.select({
    live: sql<string>`COALESCE(SUM(${batches.batchSize}) FILTER (WHERE ${batches.lifecycleStatus} NOT IN ('rejected', 'cancelled')), 0)`,
    released: sql<string>`COALESCE(SUM(COALESCE(${batches.actualYield}, ${batches.batchSize})) FILTER (WHERE ${batches.lifecycleStatus} = 'released'), 0)`,
  }).from(batches).where(and(eq(batches.workOrderId, workOrderId)))
  const planned = Number(wo.plannedQuantity)
  const live = Number(totals.live)
  const released = Number(totals.released)

  let next = wo.status
  if ((next === 'planned' || next === 'released_to_production') && live > 0) next = 'in_progress'
  if (released > 0 && Math.abs(released - planned) <= planned * OUTPUT_TOLERANCE) next = 'completed'
  if (next === wo.status) return

  await tx.update(productionWorkOrders).set({ status: next, version: wo.version + 1, updatedAt: new Date() })
    .where(eq(productionWorkOrders.id, workOrderId))
  await tx.insert(productionEvents).values({
    workOrderId, batchId: options.batchId ?? null, action: 'status_changed', fromStatus: wo.status, toStatus: next, actorId,
    payload: { automatic: true, producedQuantity: live, releasedQuantity: released, plannedQuantity: planned },
  })
}
