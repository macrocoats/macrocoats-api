import { pgTable, uuid, text, numeric, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { companies } from './companies.js'

export const companyProductPrices = pgTable(
  'company_product_prices',
  {
    companyId:     uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    productKey:    text('product_key').notNull(),
    pricePerLitre: numeric('price_per_litre', { precision: 10, scale: 2 }).notNull(),
    updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.companyId, t.productKey] }) }),
)

export const companyProductPricesRelations = relations(companyProductPrices, ({ one }) => ({
  company: one(companies, { fields: [companyProductPrices.companyId], references: [companies.id] }),
}))

export type CompanyProductPrice    = typeof companyProductPrices.$inferSelect
export type NewCompanyProductPrice = typeof companyProductPrices.$inferInsert
