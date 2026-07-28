import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { companies } from './companies.js'
import { accessLog } from './accessLog.js'
import { refreshTokens } from './refreshTokens.js'

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  name:         text('name').notNull(),
  username:     text('username').notNull().unique(),   // normalized: lowercase, no spaces
  passwordHash: text('password_hash').notNull(),       // bcrypt cost 12
  // No DB-level CHECK constraint backs this — Drizzle's `enum` here is TypeScript-only
  // narrowing, confirmed via \d users. Adding 'operator' needed no migration.
  role:         text('role', { enum: ['superadmin', 'company', 'operator'] }).notNull(),
  companyId:    uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('users_company_id_idx').on(t.companyId),
])

export const usersRelations = relations(users, ({ one, many }) => ({
  company:       one(companies, { fields: [users.companyId], references: [companies.id] }),
  accessLogs:    many(accessLog),
  refreshTokens: many(refreshTokens),
}))

export type User        = typeof users.$inferSelect
export type NewUser     = typeof users.$inferInsert
