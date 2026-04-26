import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { companies } from './companies.js'
import { accessLog } from './accessLog.js'
import { refreshTokens } from './refreshTokens.js'

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  name:         text('name').notNull(),
  username:     text('username').notNull().unique(),   // normalized: lowercase, no spaces
  passwordHash: text('password_hash').notNull(),       // bcrypt cost 12
  role:         text('role', { enum: ['superadmin', 'company'] }).notNull(),
  companyId:    uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const usersRelations = relations(users, ({ one, many }) => ({
  company:       one(companies, { fields: [users.companyId], references: [companies.id] }),
  accessLogs:    many(accessLog),
  refreshTokens: many(refreshTokens),
}))

export type User        = typeof users.$inferSelect
export type NewUser     = typeof users.$inferInsert
