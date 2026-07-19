import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users.js'

/**
 * Reusable letter templates (Customer Introduction, Welcome Letter, etc.)
 * users can create/edit/duplicate from the Letterhead editor. bodyHtml is
 * TipTap-authored HTML and may contain {{Variable}} placeholders resolved
 * at letter-creation time.
 */
export const letterheadTemplates = pgTable('letterhead_templates', {
  id:         uuid('id').primaryKey().defaultRandom(),
  name:       text('name').notNull(),
  category:   text('category'),
  bodyHtml:   text('body_html').notNull(),
  createdBy:  uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const letterheadTemplatesRelations = relations(letterheadTemplates, ({ one }) => ({
  creator: one(users, { fields: [letterheadTemplates.createdBy], references: [users.id] }),
}))

export type LetterheadTemplate    = typeof letterheadTemplates.$inferSelect
export type NewLetterheadTemplate = typeof letterheadTemplates.$inferInsert
