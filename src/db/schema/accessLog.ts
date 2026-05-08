import { pgTable, uuid, text, inet, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users.js'
import { companies } from './companies.js'

export const accessLog = pgTable('access_log', {
  id:         uuid('id').primaryKey().defaultRandom(),
  userId:     uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  companyKey: text('company_key'),
  productKey: text('product_key'),
  docType:    text('doc_type'),
  ip:         inet('ip'),
  userAgent:  text('user_agent'),
  at:         timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('access_log_at_idx').on(t.at),
  index('access_log_company_key_idx').on(t.companyKey),
])

export const accessLogRelations = relations(accessLog, ({ one }) => ({
  user: one(users, { fields: [accessLog.userId], references: [users.id] }),
}))

export type AccessLogEntry = typeof accessLog.$inferSelect
