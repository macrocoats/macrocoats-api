import { pgTable, uuid, text, numeric, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { customerPurchaseOrders } from './customerPurchaseOrders.js'
import { customerPurchaseOrderItems } from './customerPurchaseOrderItems.js'
import { batches } from './batches.js'
import { users } from './users.js'

/**
 * Links a manufactured batch to the specific customer PO line item it was
 * produced against — the join that makes "Customer Order → Batch → COA →
 * Label → Dispatch" traceability possible. A batch may be linked to more
 * than one order item (split production), and an item may draw from
 * multiple batches (e.g. 500L + 500L against a 1000L order line); the
 * unique index only prevents the same batch being linked twice to the same
 * item.
 */
export const customerPurchaseOrderBatches = pgTable('customer_purchase_order_batches', {
  id:             uuid('id').primaryKey().defaultRandom(),
  orderId:        uuid('order_id').notNull().references(() => customerPurchaseOrders.id, { onDelete: 'cascade' }),
  orderItemId:    uuid('order_item_id').notNull().references(() => customerPurchaseOrderItems.id, { onDelete: 'cascade' }),
  batchId:        uuid('batch_id').notNull().references(() => batches.id, { onDelete: 'restrict' }),
  linkedQuantity: numeric('linked_quantity', { precision: 12, scale: 3 }).notNull(),
  remarks:        text('remarks'),
  linkedBy:       uuid('linked_by').references(() => users.id, { onDelete: 'set null' }),
  linkedAt:       timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('cpo_batches_order_id_idx').on(t.orderId),
  index('cpo_batches_order_item_id_idx').on(t.orderItemId),
  index('cpo_batches_batch_id_idx').on(t.batchId),
  uniqueIndex('cpo_batches_item_batch_unique').on(t.orderItemId, t.batchId),
])

export const customerPurchaseOrderBatchesRelations = relations(customerPurchaseOrderBatches, ({ one }) => ({
  order:     one(customerPurchaseOrders,     { fields: [customerPurchaseOrderBatches.orderId],     references: [customerPurchaseOrders.id] }),
  orderItem: one(customerPurchaseOrderItems, { fields: [customerPurchaseOrderBatches.orderItemId], references: [customerPurchaseOrderItems.id] }),
  batch:     one(batches,                    { fields: [customerPurchaseOrderBatches.batchId],     references: [batches.id] }),
  linker:    one(users,                      { fields: [customerPurchaseOrderBatches.linkedBy],    references: [users.id] }),
}))

export type CustomerPurchaseOrderBatch    = typeof customerPurchaseOrderBatches.$inferSelect
export type NewCustomerPurchaseOrderBatch = typeof customerPurchaseOrderBatches.$inferInsert
