import { pgTable, uuid, text, integer, timestamp, index, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { letterheadTemplates } from './letterheadTemplates.js'
import { users } from './users.js'

/**
 * A generated/drafted letter. Version history is a chain via
 * supersedesDocumentId — saving a new version inserts a new row pointing
 * back at the one it replaces rather than overwriting it in place, the
 * same pattern used by customer_purchase_order_documents.
 */
export const letterheadDocuments = pgTable('letterhead_documents', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  templateId:           uuid('template_id').references(() => letterheadTemplates.id, { onDelete: 'set null' }),
  referenceNo:          text('reference_no'),
  letterDate:           text('letter_date'),
  customerName:         text('customer_name'),
  companyName:          text('company_name'),
  subject:              text('subject'),
  attention:             text('attention'),
  preparedBy:           text('prepared_by'),
  approvedBy:           text('approved_by'),
  designation:          text('designation'),
  bodyHtml:             text('body_html').notNull(),
  status:               text('status', { enum: ['draft', 'final'] }).notNull().default('draft'),
  version:              integer('version').notNull().default(1),
  supersedesDocumentId: uuid('supersedes_document_id').references((): AnyPgColumn => letterheadDocuments.id, { onDelete: 'set null' }),
  createdBy:            uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('letterhead_documents_template_id_idx').on(t.templateId),
  index('letterhead_documents_supersedes_idx').on(t.supersedesDocumentId),
])

export const letterheadDocumentsRelations = relations(letterheadDocuments, ({ one }) => ({
  template:   one(letterheadTemplates,   { fields: [letterheadDocuments.templateId],           references: [letterheadTemplates.id] }),
  supersedes: one(letterheadDocuments,   { fields: [letterheadDocuments.supersedesDocumentId],  references: [letterheadDocuments.id] }),
  creator:    one(users,                 { fields: [letterheadDocuments.createdBy],             references: [users.id] }),
}))

export type LetterheadDocument    = typeof letterheadDocuments.$inferSelect
export type NewLetterheadDocument = typeof letterheadDocuments.$inferInsert
