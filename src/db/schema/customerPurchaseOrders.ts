import {
  pgTable, uuid, text, integer, numeric, date,
  timestamp, index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { companies } from './companies.js'
import { quotations } from './quotations.js'
import { users } from './users.js'

/**
 * Sales orders received from customers — tracks a customer PO from receipt
 * through production, batch manufacturing, and dispatch to completion.
 * Not an accounting/invoicing entity: no GST, no ledger, no payment terms
 * here (payment tracking already lives per-batch on `batches`).
 */
export const customerPurchaseOrders = pgTable('customer_purchase_orders', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  poNumber:             text('po_number').notNull().unique(),          // 'CPO-2026-001'
  customerId:           uuid('customer_id').notNull().references(() => companies.id, { onDelete: 'restrict' }),
  customerPoNumber:     text('customer_po_number').notNull(),
  customerPoDate:       date('customer_po_date').notNull(),
  referenceQuotationId: uuid('reference_quotation_id').references(() => quotations.id, { onDelete: 'set null' }),
  expectedDeliveryDate: date('expected_delivery_date'),
  customerContact:      text('customer_contact'),
  remarks:              text('remarks'),
  /** Auto-determined by service layer from item production/dispatch state — see STATUS_TRANSITIONS in customer-purchase-orders.service.ts. draft/confirmed/cancelled are the only manually-set transitions. */
  status:               text('status', {
                           enum: [
                             'draft', 'confirmed', 'production_planned', 'in_production',
                             'partially_produced', 'ready_for_dispatch', 'partially_dispatched',
                             'completed', 'cancelled',
                           ],
                         }).notNull().default('draft'),
  priority:             text('priority', { enum: ['low', 'normal', 'high', 'urgent'] }).notNull().default('normal'),
  /** Denormalized sums over customer_purchase_order_items, kept in sync on item writes — avoids recomputing on every list-page read. */
  totalQuantity:        numeric('total_quantity', { precision: 12, scale: 3 }).notNull().default('0'),
  totalValue:           numeric('total_value', { precision: 12, scale: 2 }).notNull().default('0'),
  createdBy:            uuid('created_by').references(() => users.id),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  /** Soft delete — list/detail queries filter WHERE deleted_at IS NULL. First table in this codebase to use this pattern (existing modules hard-delete or use a status flag); introduced here because the spec explicitly asks for it. */
  deletedAt:            timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('cpo_customer_id_idx').on(t.customerId),
  index('cpo_status_idx').on(t.status),
  index('cpo_customer_po_number_idx').on(t.customerPoNumber),
])

// Child tables (items/documents/batchLinks/timeline) each import this file and
// declare their own one() relation back to it — omitted here to avoid a
// circular import, matching the productDocuments.ts / documentAuditLog.ts precedent.
export const customerPurchaseOrdersRelations = relations(customerPurchaseOrders, ({ one }) => ({
  customer:  one(companies,  { fields: [customerPurchaseOrders.customerId],           references: [companies.id] }),
  quotation: one(quotations, { fields: [customerPurchaseOrders.referenceQuotationId], references: [quotations.id] }),
  creator:   one(users,      { fields: [customerPurchaseOrders.createdBy],            references: [users.id] }),
}))

// ── Per-year atomic sequence counter ──────────────────────────────────────────
export const customerPurchaseOrderSequences = pgTable('customer_purchase_order_sequences', {
  year:  integer('year').primaryKey(),
  lastN: integer('last_n').notNull().default(0),
})

export type CustomerPurchaseOrder    = typeof customerPurchaseOrders.$inferSelect
export type NewCustomerPurchaseOrder = typeof customerPurchaseOrders.$inferInsert
