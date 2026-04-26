import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users.js'

export const refreshTokens = pgTable('refresh_tokens', {
  id:         uuid('id').primaryKey().defaultRandom(),
  userId:     uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** bcrypt hash of the raw token — never store raw */
  tokenHash:  text('token_hash').notNull().unique(),
  expiresAt:  timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt:  timestamp('revoked_at', { withTimezone: true }),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}))

export type RefreshToken = typeof refreshTokens.$inferSelect
