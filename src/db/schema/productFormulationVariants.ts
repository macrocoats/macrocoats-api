import { pgTable, uuid, text, boolean, timestamp, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { products } from './products.js'
import { companies } from './companies.js'
import { formulationVariantComponents } from './formulationVariantComponents.js'

export const productFormulationVariants = pgTable('product_formulation_variants', {
  id:          uuid('id').primaryKey().defaultRandom(),
  productKey:  text('product_key').notNull().references(() => products.key, { onDelete: 'cascade' }),
  companyId:   uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  variantName: text('variant_name').notNull(),
  isDefault:   boolean('is_default').notNull().default(false),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('pfv_product_company_unique').on(t.productKey, t.companyId),
])

export const productFormulationVariantsRelations = relations(productFormulationVariants, ({ one, many }) => ({
  product:    one(products,    { fields: [productFormulationVariants.productKey], references: [products.key] }),
  company:    one(companies,   { fields: [productFormulationVariants.companyId],  references: [companies.id] }),
  components: many(formulationVariantComponents),
}))

export type ProductFormulationVariant    = typeof productFormulationVariants.$inferSelect
export type NewProductFormulationVariant = typeof productFormulationVariants.$inferInsert
