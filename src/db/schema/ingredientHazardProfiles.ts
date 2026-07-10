import { pgTable, uuid, text, jsonb, numeric, boolean, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users.js'

/**
 * Reference dictionary mapping real raw-material names (as used in
 * `formulation_variant_components.materialName` / `products.formula` composition
 * rows) to generic, IP-safe descriptions and GHS hazard data.
 *
 * Consumed by `src/modules/document-sanitization/` to derive sanitized TDS/MSDS
 * composition + hazard sections for non-superadmin roles, without ever exposing
 * the real material name/percentage.
 */
export const ingredientHazardProfiles = pgTable('ingredient_hazard_profiles', {
  id:            uuid('id').primaryKey().defaultRandom(),
  /** Normalized lookup key — see hazard-profiles.normalize.ts normalizeIngredientName() */
  canonicalName: text('canonical_name').notNull().unique(),
  displayName:   text('display_name').notNull(),
  /** Raw spelling variants (unnormalized) that should resolve to this row */
  aliases:       jsonb('aliases').notNull().default('[]').$type<string[]>(),
  casNo:         text('cas_no'),
  /** TDS-safe generic name, e.g. "Performance-enhancing volatile solvent" */
  genericDescription: text('generic_description').notNull(),
  /** e.g. "Corrosion inhibition package" */
  functionCategory:   text('function_category').notNull(),
  compatNotes:   text('compat_notes'),
  /** [{class, category, tagType, hStatementCode, hStatementText, pStatementCodes[]}] */
  hazardClassifications: jsonb('hazard_classifications').notNull().default('[]').$type<Array<{
    class:            string
    category:         string
    tagType:          string
    hStatementCode:   string
    hStatementText:   string
    pStatementCodes:  string[]
  }>>(),
  /** GHS pictogram string keys, e.g. ['corrosive', 'irritant'] */
  pictograms:    jsonb('pictograms').notNull().default('[]').$type<string[]>(),
  /** Concentration (%) at/above which this ingredient's hazard contribution is unioned in */
  thresholdPercent: numeric('threshold_percent', { precision: 5, scale: 2 }).notNull().default('1.00'),
  disclosureRequired: boolean('disclosure_required').notNull().default(false),
  disclosureThresholdPercent: numeric('disclosure_threshold_percent', { precision: 5, scale: 2 }),
  notes:         text('notes'),
  isActive:      boolean('is_active').notNull().default(true),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy:     uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
})

export const ingredientHazardProfilesRelations = relations(ingredientHazardProfiles, ({ one }) => ({
  updatedByUser: one(users, { fields: [ingredientHazardProfiles.updatedBy], references: [users.id] }),
}))

export type IngredientHazardProfile    = typeof ingredientHazardProfiles.$inferSelect
export type NewIngredientHazardProfile = typeof ingredientHazardProfiles.$inferInsert
