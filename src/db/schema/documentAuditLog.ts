import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { productDocuments } from './productDocuments.js'
import { users } from './users.js'

export const documentAuditLog = pgTable('document_audit_log', {
  id:                uuid('id').primaryKey().defaultRandom(),
  productDocumentId: uuid('product_document_id').notNull().references(() => productDocuments.id, { onDelete: 'cascade' }),
  userId:            uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action:            text('action', { enum: ['created', 'updated', 'status_changed'] }).notNull(),
  fromStatus:        text('from_status'),
  toStatus:          text('to_status'),
  notes:             text('notes'),
  at:                timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('document_audit_log_doc_idx').on(t.productDocumentId, t.at),
])

export const documentAuditLogRelations = relations(documentAuditLog, ({ one }) => ({
  productDocument: one(productDocuments, { fields: [documentAuditLog.productDocumentId], references: [productDocuments.id] }),
  user:             one(users, { fields: [documentAuditLog.userId], references: [users.id] }),
}))

export type DocumentAuditLogEntry    = typeof documentAuditLog.$inferSelect
export type NewDocumentAuditLogEntry = typeof documentAuditLog.$inferInsert
