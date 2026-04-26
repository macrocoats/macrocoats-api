import { pgTable, uuid, text, json, timestamp, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { products } from './products.js'
import { users } from './users.js'

export const productDocuments = pgTable(
  'product_documents',
  {
    id:         uuid('id').primaryKey().defaultRandom(),
    productKey: text('product_key').notNull().references(() => products.key, { onDelete: 'cascade' }),
    docType:    text('doc_type', { enum: ['tds', 'msds', 'formula', 'label', 'coa'] }).notNull(),
    docNumber:  text('doc_number').notNull(),          // 'TDS-USP-001'
    revision:   text('revision').notNull(),            // 'Rev 01 — Apr 2026'
    /** Complete sections object stored as JSONB — shape varies by docType */
    body:       json('body').notNull().$type<Record<string, unknown>>(),
    footer:     json('footer').notNull().$type<{ left: string; center: string; right: string }>(),
    updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy:  uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => ({ uniq: unique().on(t.productKey, t.docType) }),
)

export const productDocumentsRelations = relations(productDocuments, ({ one }) => ({
  product:    one(products, { fields: [productDocuments.productKey], references: [products.key] }),
  updatedByUser: one(users, { fields: [productDocuments.updatedBy], references: [users.id] }),
}))

export type ProductDocument    = typeof productDocuments.$inferSelect
export type NewProductDocument = typeof productDocuments.$inferInsert
