import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { productDocuments } from './productDocuments.js'

export const products = pgTable('products', {
  key:         text('key').primaryKey(),           // 'uniklean-sp'
  displayName: text('display_name').notNull(),      // 'UNIKLEAN-SP'
  code:        text('code').notNull(),              // 'SP'
  category:    text('category').notNull(),
  subtitle:    text('subtitle').notNull(),
  accentColor: text('accent_color').notNull(),      // '#1e6b5a'
  active:      boolean('active').notNull().default(true),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const productsRelations = relations(products, ({ many }) => ({
  documents: many(productDocuments),
}))

export type Product    = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
