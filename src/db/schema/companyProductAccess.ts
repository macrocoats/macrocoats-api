import { pgTable, uuid, text, primaryKey } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { companies } from './companies.js'

export const companyProductAccess = pgTable(
  'company_product_access',
  {
    companyId:  uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    productKey: text('product_key').notNull(),   // 'uniklean-sp', etc.
  },
  (t) => ({ pk: primaryKey({ columns: [t.companyId, t.productKey] }) }),
)

export const companyProductAccessRelations = relations(companyProductAccess, ({ one }) => ({
  company: one(companies, { fields: [companyProductAccess.companyId], references: [companies.id] }),
}))

export type CompanyProductAccess = typeof companyProductAccess.$inferSelect
