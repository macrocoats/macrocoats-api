import { pgTable, uuid, text, integer, numeric, date, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { batches } from './batches.js'
import { companies } from './companies.js'
import { quotations } from './quotations.js'
import { users } from './users.js'
import { customerPurchaseOrders } from './customerPurchaseOrders.js'
import { customerPurchaseOrderItems } from './customerPurchaseOrderItems.js'

// ── Dispatches ──────────────────────────────────────────────────────────────────
export const dispatches = pgTable('dispatches', {
  id:                          uuid('id').primaryKey().defaultRandom(),
  dispatchNumber:              text('dispatch_number').notNull().unique(),
  batchId:                     uuid('batch_id').notNull().references(() => batches.id, { onDelete: 'restrict' }),
  companyId:                   uuid('company_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  quotationId:                 uuid('quotation_id').references(() => quotations.id, { onDelete: 'set null' }),
  /** Optional link to the customer PO this dispatch fulfills — mirrors quotationId's nullable/set-null pattern. */
  customerPurchaseOrderId:     uuid('customer_purchase_order_id').references(() => customerPurchaseOrders.id, { onDelete: 'set null' }),
  customerPurchaseOrderItemId: uuid('customer_purchase_order_item_id').references(() => customerPurchaseOrderItems.id, { onDelete: 'set null' }),
  invoiceNumber:               text('invoice_number'),
  dispatchDate:                date('dispatch_date').notNull(),
  quantity:                    numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  transportDetails: jsonb('transport_details').$type<{
    vehicleNumber?: string
    transporterName?: string
    driverName?: string
    driverPhone?: string
    lrNumber?: string
  }>(),
  remarks:          text('remarks'),
  voidedAt:         timestamp('voided_at', { withTimezone: true }),
  voidReason:       text('void_reason'),
  createdBy:        uuid('created_by').references(() => users.id),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('dispatches_batch_id_idx').on(t.batchId),
  index('dispatches_company_id_idx').on(t.companyId),
  index('dispatches_dispatch_date_idx').on(t.dispatchDate),
  index('dispatches_cpo_id_idx').on(t.customerPurchaseOrderId),
])

export const dispatchesRelations = relations(dispatches, ({ one }) => ({
  batch:               one(batches,                    { fields: [dispatches.batchId],                     references: [batches.id] }),
  company:             one(companies,                   { fields: [dispatches.companyId],                   references: [companies.id] }),
  quotation:           one(quotations,                  { fields: [dispatches.quotationId],                 references: [quotations.id] }),
  customerOrder:       one(customerPurchaseOrders,      { fields: [dispatches.customerPurchaseOrderId],     references: [customerPurchaseOrders.id] }),
  customerOrderItem:   one(customerPurchaseOrderItems,  { fields: [dispatches.customerPurchaseOrderItemId], references: [customerPurchaseOrderItems.id] }),
  creator:             one(users,                       { fields: [dispatches.createdBy],                   references: [users.id] }),
}))

// ── Per-day atomic sequence counter ───────────────────────────────────────────
export const dispatchSequences = pgTable('dispatch_sequences', {
  dateKey: text('date_key').primaryKey(),  // 'YYYYMMDD'
  lastN:   integer('last_n').notNull().default(0),
})

export type Dispatch    = typeof dispatches.$inferSelect
export type NewDispatch = typeof dispatches.$inferInsert
