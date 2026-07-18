import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { customerPurchaseOrders } from './customerPurchaseOrders.js'
import { users } from './users.js'

/**
 * Append-only event log for a customer PO — mirrors the document_audit_log
 * pattern (same-transaction insert alongside the state change it records,
 * never written outside the transaction). metadata carries the cross-reference
 * id (batchId / dispatchId / documentId / fromStatus+toStatus) relevant to
 * the event type.
 */
export const customerPurchaseOrderTimeline = pgTable('customer_purchase_order_timeline', {
  id:        uuid('id').primaryKey().defaultRandom(),
  orderId:   uuid('order_id').notNull().references(() => customerPurchaseOrders.id, { onDelete: 'cascade' }),
  eventType: text('event_type', {
               enum: [
                 'po_received', 'status_changed', 'production_planned', 'batch_linked',
                 'qc_completed', 'coa_generated', 'label_generated', 'document_uploaded',
                 'dispatched', 'completed', 'cancelled', 'note',
               ],
             }).notNull(),
  userId:    uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  remarks:   text('remarks'),
  metadata:  jsonb('metadata').$type<{
               batchId?: string
               dispatchId?: string
               documentId?: string
               fromStatus?: string
               toStatus?: string
             }>(),
  at:        timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('cpo_timeline_order_idx').on(t.orderId, t.at),
])

export const customerPurchaseOrderTimelineRelations = relations(customerPurchaseOrderTimeline, ({ one }) => ({
  order: one(customerPurchaseOrders, { fields: [customerPurchaseOrderTimeline.orderId], references: [customerPurchaseOrders.id] }),
  user:  one(users,                  { fields: [customerPurchaseOrderTimeline.userId],  references: [users.id] }),
}))

export type CustomerPurchaseOrderTimelineEntry    = typeof customerPurchaseOrderTimeline.$inferSelect
export type NewCustomerPurchaseOrderTimelineEntry = typeof customerPurchaseOrderTimeline.$inferInsert
