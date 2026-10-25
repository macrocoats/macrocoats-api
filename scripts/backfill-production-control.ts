import { sql } from 'drizzle-orm'
import { closeDb, db } from '../src/db/index.js'

async function main() {
  const result = await db.transaction(async (tx) => {
    // Historical batches that already shipped are grandfathered so existing
    // customer traceability remains usable. This is an explicit migration
    // disposition, not evidence that the original release workflow ran.
    const grandfathered = await tx.execute(sql`
      UPDATE batches b
      SET lifecycle_status = 'released',
          released_at = COALESCE(b.released_at, b.created_at),
          release_notes = COALESCE(b.release_notes, 'Legacy migration: grandfathered because an active dispatch exists'),
          actual_yield = COALESCE(b.actual_yield, b.batch_size),
          version = b.version + 1
      WHERE b.lifecycle_status = 'needs_review'
        AND EXISTS (
          SELECT 1 FROM dispatches d
          WHERE d.batch_id = b.id AND d.voided_at IS NULL
        )
      RETURNING b.id
    `)

    // Undispatched legacy stock remains blocked. Passing CoA records require a
    // superadmin review; records without complete passing QC return to QC.
    const awaitingQc = await tx.execute(sql`
      UPDATE batches b
      SET lifecycle_status = 'awaiting_qc', version = b.version + 1
      WHERE b.lifecycle_status = 'needs_review'
        AND NOT EXISTS (
          SELECT 1 FROM dispatches d
          WHERE d.batch_id = b.id AND d.voided_at IS NULL
        )
        AND (
          b.coa_snapshot IS NULL
          OR NOT jsonb_path_exists(b.coa_snapshot, '$.tests[*]')
          OR jsonb_path_exists(b.coa_snapshot, '$.tests[*] ? (@.status != "Pass")')
        )
      RETURNING b.id
    `)

    await tx.execute(sql`
      UPDATE finished_goods fg
      SET status = CASE
        WHEN b.lifecycle_status <> 'released' THEN 'Quarantined'
        WHEN fg.dispatched_quantity >= fg.produced_quantity THEN 'Fully Dispatched'
        WHEN fg.dispatched_quantity > 0 THEN 'Partially Dispatched'
        ELSE 'Available'
      END,
      updated_at = now()
      FROM batches b
      WHERE b.id = fg.batch_id
    `)

    // Establish one traceable opening lot for each existing positive balance.
    // The constant lot number and NOT EXISTS checks make this command safe to
    // rerun after an interrupted rollout.
    await tx.execute(sql`
      INSERT INTO inventory_lots (
        inventory_item_id, lot_number, received_quantity, available_quantity,
        unit, received_date
      )
      SELECT i.id, 'LEGACY-OPENING', i.stock_qty, i.stock_qty, i.unit, CURRENT_DATE
      FROM inventory_items i
      WHERE i.stock_qty IS NOT NULL AND i.stock_qty > 0
        AND NOT EXISTS (
          SELECT 1 FROM inventory_lots l
          WHERE l.inventory_item_id = i.id AND l.lot_number = 'LEGACY-OPENING'
        )
    `)

    await tx.execute(sql`
      INSERT INTO inventory_movements (lot_id, movement_type, quantity, reason, metadata)
      SELECT l.id, 'adjustment', l.received_quantity,
             'Legacy opening balance migration',
             jsonb_build_object('migration', 'production-control-v1')
      FROM inventory_lots l
      WHERE l.lot_number = 'LEGACY-OPENING'
        AND NOT EXISTS (
          SELECT 1 FROM inventory_movements m
          WHERE m.lot_id = l.id
            AND m.reason = 'Legacy opening balance migration'
        )
    `)

    const reconciliation = await tx.execute<{
      batchCount: string
      releasedCount: string
      needsReviewCount: string
      awaitingQcCount: string
      negativeFinishedGoods: string
      lotVariance: string
    }>(sql`
      SELECT
        (SELECT COUNT(*) FROM batches)::text AS "batchCount",
        (SELECT COUNT(*) FROM batches WHERE lifecycle_status = 'released')::text AS "releasedCount",
        (SELECT COUNT(*) FROM batches WHERE lifecycle_status = 'needs_review')::text AS "needsReviewCount",
        (SELECT COUNT(*) FROM batches WHERE lifecycle_status = 'awaiting_qc')::text AS "awaitingQcCount",
        (SELECT COUNT(*) FROM finished_goods
          WHERE produced_quantity - dispatched_quantity - reserved_quantity < 0)::text AS "negativeFinishedGoods",
        COALESCE((SELECT SUM(ABS(i.stock_qty - l.available_quantity))
          FROM inventory_items i
          JOIN inventory_lots l ON l.inventory_item_id = i.id AND l.lot_number = 'LEGACY-OPENING'
          WHERE i.stock_qty IS NOT NULL), 0)::text AS "lotVariance"
    `)

    return {
      grandfathered: grandfathered.length,
      movedToAwaitingQc: awaitingQc.length,
      reconciliation: reconciliation[0],
    }
  })

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDb()
  })
