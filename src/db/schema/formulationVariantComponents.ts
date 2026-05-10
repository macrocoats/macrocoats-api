import { pgTable, uuid, text, numeric, integer, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { productFormulationVariants } from './productFormulationVariants.js'

export const formulationVariantComponents = pgTable('formulation_variant_components', {
  id:           uuid('id').primaryKey().defaultRandom(),
  variantId:    uuid('variant_id').notNull().references(() => productFormulationVariants.id, { onDelete: 'cascade' }),
  materialName: text('material_name').notNull(),
  percentage:   numeric('percentage', { precision: 5, scale: 2 }),  // null = water (auto-calculated)
  unit:         text('unit', { enum: ['L', 'Kg'] }).notNull(),
  sortOrder:    integer('sort_order').notNull().default(0),
}, (t) => [
  index('fvc_variant_id_idx').on(t.variantId),
])

export const formulationVariantComponentsRelations = relations(formulationVariantComponents, ({ one }) => ({
  variant: one(productFormulationVariants, {
    fields:     [formulationVariantComponents.variantId],
    references: [productFormulationVariants.id],
  }),
}))

export type FormulationVariantComponent    = typeof formulationVariantComponents.$inferSelect
export type NewFormulationVariantComponent = typeof formulationVariantComponents.$inferInsert
