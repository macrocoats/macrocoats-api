import { pgTable, uuid, text, numeric, date, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { dispatches } from './dispatches.js'

/**
 * Pull-only mirror of a Zoho Invoice's status for a dispatch. One row per
 * dispatch (unique FK). `status` is stored as free text — it's Zoho's own
 * vocabulary (paid/overdue/sent/void/...), not one this codebase owns, so it
 * is deliberately not constrained to a DB enum. Display-only: nothing here
 * writes back to `batches.paidAt`, which stays a manual, independent toggle.
 */
export const zohoInvoiceSyncs = pgTable('zoho_invoice_syncs', {
  id:                uuid('id').primaryKey().defaultRandom(),
  dispatchId:        uuid('dispatch_id').notNull().unique().references(() => dispatches.id, { onDelete: 'cascade' }),
  zohoInvoiceId:     text('zoho_invoice_id'),
  zohoInvoiceNumber: text('zoho_invoice_number'),
  status:            text('status'),
  total:             numeric('total', { precision: 12, scale: 2 }),
  balance:           numeric('balance', { precision: 12, scale: 2 }),
  invoiceDate:       date('invoice_date'),
  dueDate:           date('due_date'),
  lastSyncedAt:      timestamp('last_synced_at', { withTimezone: true }),
  /** Last sync error message, if the most recent attempt failed. Cleared on the next successful sync. */
  syncError:         text('sync_error'),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('zoho_invoice_syncs_status_idx').on(t.status),
])

export const zohoInvoiceSyncsRelations = relations(zohoInvoiceSyncs, ({ one }) => ({
  dispatch: one(dispatches, { fields: [zohoInvoiceSyncs.dispatchId], references: [dispatches.id] }),
}))

export type ZohoInvoiceSync    = typeof zohoInvoiceSyncs.$inferSelect
export type NewZohoInvoiceSync = typeof zohoInvoiceSyncs.$inferInsert
