import { pgTable, uuid, text, integer, numeric, date, timestamp, index } from 'drizzle-orm/pg-core'
import { companies } from './companies.js'
import { users } from './users.js'

/**
 * Purchase orders a company (customer) has sent to Macro Coats — the reverse
 * direction of `purchase_orders` (Macro Coats buying from its own vendors).
 * Deliberately simple: a document repository with order metadata, no status
 * workflow/line-items/timeline — this is a reference document list, not an
 * operational tracker.
 */
export const companyDocuments = pgTable('company_documents', {
  id:          uuid('id').primaryKey().defaultRandom(),
  companyId:   uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  orderNumber: text('order_number').notNull(),
  orderDate:   date('order_date').notNull(),
  orderAmount: numeric('order_amount', { precision: 12, scale: 2 }),
  filename:    text('filename').notNull(),
  storageKey:  text('storage_key').notNull(),
  mimeType:    text('mime_type').notNull(),
  sizeBytes:   integer('size_bytes').notNull(),
  remarks:     text('remarks'),
  uploadedBy:  uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  uploadedAt:  timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('company_documents_company_id_idx').on(t.companyId),
])

export type CompanyDocument    = typeof companyDocuments.$inferSelect
export type NewCompanyDocument = typeof companyDocuments.$inferInsert
