import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users.js'
import { companyProductAccess } from './companyProductAccess.js'

export const companies = pgTable('companies', {
  id:             uuid('id').primaryKey().defaultRandom(),
  key:            text('key').notNull().unique(),          // 'rane', 'tvs', etc.
  displayName:    text('display_name').notNull(),
  accessToken:    text('access_token').notNull().unique(), // /access/:token value
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),  // null = never
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const companiesRelations = relations(companies, ({ many }) => ({
  users:         many(users),
  productAccess: many(companyProductAccess),
}))

export type Company    = typeof companies.$inferSelect
export type NewCompany = typeof companies.$inferInsert
