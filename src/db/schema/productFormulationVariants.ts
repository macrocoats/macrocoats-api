import { pgTable, uuid, text, boolean, timestamp, jsonb, index, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { products } from './products.js'
import { companies } from './companies.js'
import { formulationVariantComponents } from './formulationVariantComponents.js'

export const productFormulationVariants = pgTable('product_formulation_variants', {
  id:          uuid('id').primaryKey().defaultRandom(),
  productKey:  text('product_key').notNull().references(() => products.key, { onDelete: 'cascade' }),
  companyId:   uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  variantName: text('variant_name').notNull(),
  isDefault:   boolean('is_default').notNull().default(false),
  /** AI Formulation Optimizer approval workflow — see VARIANT_STATUS_TRANSITIONS in modules/optimizer/optimizer.types.ts */
  status:      text('status', { enum: ['draft', 'ai_suggested', 'reviewed', 'approved', 'production'] })
                 .notNull()
                 .default('approved'),
  /** Nullable self-reference — the variant this row was generated/optimized from. AI recommendations never mutate an existing variant; they only ever produce a new row that points back here. */
  sourceVariantId: uuid('source_variant_id').references((): AnyPgColumn => productFormulationVariants.id, { onDelete: 'set null' }),
  /** { goals, targets, acceptedRecommendations, provider, generatedAt } — set only for AI-generated variants. */
  optimizationMeta: jsonb('optimization_meta'),
  coaTests:    jsonb('coa_tests'),
  tdsOverrides: jsonb('tds_overrides'),
  msdsOverrides: jsonb('msds_overrides'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Multiple variants per product+company are now allowed; only one may be the DEFAULT.
  uniqueIndex('pfv_product_company_default_unique').on(t.productKey, t.companyId).where(sql`is_default = true`),
  index('pfv_product_key_idx').on(t.productKey),
  index('pfv_company_id_idx').on(t.companyId),
])

export const productFormulationVariantsRelations = relations(productFormulationVariants, ({ one, many }) => ({
  product:    one(products,    { fields: [productFormulationVariants.productKey], references: [products.key] }),
  company:    one(companies,   { fields: [productFormulationVariants.companyId],  references: [companies.id] }),
  components: many(formulationVariantComponents),
}))

export type ProductFormulationVariant    = typeof productFormulationVariants.$inferSelect
export type NewProductFormulationVariant = typeof productFormulationVariants.$inferInsert
