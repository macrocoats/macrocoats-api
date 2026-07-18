import { pgTable, uuid, text, integer, timestamp, index, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { customerPurchaseOrders } from './customerPurchaseOrders.js'
import { users } from './users.js'

/**
 * Attachments on a customer PO: the PO PDF itself, email confirmation,
 * customer drawings/specs, and other supporting documents. Version history
 * is a chain via supersedesDocumentId — uploading a new version of an existing
 * document inserts a new row pointing back at the one it replaces rather than
 * overwriting it in place.
 */
export const customerPurchaseOrderDocuments = pgTable('customer_purchase_order_documents', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  orderId:              uuid('order_id').notNull().references(() => customerPurchaseOrders.id, { onDelete: 'cascade' }),
  category:             text('category', {
                           enum: ['po_pdf', 'email_confirmation', 'drawing', 'specification', 'supporting'],
                         }).notNull(),
  filename:             text('filename').notNull(),
  storageKey:           text('storage_key').notNull(),
  mimeType:             text('mime_type').notNull(),
  sizeBytes:            integer('size_bytes').notNull(),
  version:              integer('version').notNull().default(1),
  supersedesDocumentId: uuid('supersedes_document_id').references((): AnyPgColumn => customerPurchaseOrderDocuments.id, { onDelete: 'set null' }),
  remarks:              text('remarks'),
  uploadedBy:           uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  uploadedAt:           timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('cpo_documents_order_id_idx').on(t.orderId),
  index('cpo_documents_category_idx').on(t.category),
])

export const customerPurchaseOrderDocumentsRelations = relations(customerPurchaseOrderDocuments, ({ one }) => ({
  order:      one(customerPurchaseOrders,        { fields: [customerPurchaseOrderDocuments.orderId],              references: [customerPurchaseOrders.id] }),
  supersedes: one(customerPurchaseOrderDocuments, { fields: [customerPurchaseOrderDocuments.supersedesDocumentId], references: [customerPurchaseOrderDocuments.id] }),
  uploader:   one(users,                          { fields: [customerPurchaseOrderDocuments.uploadedBy],          references: [users.id] }),
}))

export type CustomerPurchaseOrderDocument    = typeof customerPurchaseOrderDocuments.$inferSelect
export type NewCustomerPurchaseOrderDocument = typeof customerPurchaseOrderDocuments.$inferInsert
