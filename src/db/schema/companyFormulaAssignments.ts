import { relations, sql } from 'drizzle-orm'
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { companies } from './companies.js'
import { productFormulationVariants } from './productFormulationVariants.js'
import { products } from './products.js'
import { users } from './users.js'

export const companyFormulaAssignments = pgTable('company_formula_assignments', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  companyId:           uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  variantId:           uuid('variant_id').notNull().references(() => productFormulationVariants.id, { onDelete: 'cascade' }),
  productKey:          text('product_key').notNull().references(() => products.key, { onDelete: 'cascade' }),
  isDefaultForCompany: boolean('is_default_for_company').notNull().default(false),
  assignedAt:          timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  assignedBy:          uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
}, (t) => [
  uniqueIndex('cfa_company_variant_unique').on(t.companyId, t.variantId),
  uniqueIndex('cfa_company_product_default_unique')
    .on(t.companyId, t.productKey)
    .where(sql`is_default_for_company = true`),
  index('cfa_company_id_idx').on(t.companyId),
  index('cfa_variant_id_idx').on(t.variantId),
  index('cfa_product_key_idx').on(t.productKey),
])

export const companyFormulaAssignmentsRelations = relations(companyFormulaAssignments, ({ one }) => ({
  company:    one(companies, { fields: [companyFormulaAssignments.companyId], references: [companies.id] }),
  variant:    one(productFormulationVariants, { fields: [companyFormulaAssignments.variantId], references: [productFormulationVariants.id] }),
  product:    one(products, { fields: [companyFormulaAssignments.productKey], references: [products.key] }),
  assignedByUser: one(users, { fields: [companyFormulaAssignments.assignedBy], references: [users.id] }),
}))

export type CompanyFormulaAssignment    = typeof companyFormulaAssignments.$inferSelect
export type NewCompanyFormulaAssignment = typeof companyFormulaAssignments.$inferInsert
