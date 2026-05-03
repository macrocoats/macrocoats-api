import {
  pgTable, uuid, text, integer, numeric,
  timestamp, jsonb, primaryKey,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users.js'

// ── Batches ───────────────────────────────────────────────────────────────────
export const batches = pgTable('batches', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  batchNumber:         text('batch_number').notNull().unique(),   // 'RA-20260426-001'
  productCode:         text('product_code').notNull(),
  companyName:         text('company_name').notNull(),
  batchSize:           numeric('batch_size', { precision: 12, scale: 3 }).notNull(),
  productionDate:      text('production_date').notNull(),          // 'YYYY-MM-DD'
  formulationSnapshot: jsonb('formulation_snapshot').notNull(),
  labelSnapshot:       jsonb('label_snapshot').notNull(),
  costSummary:         jsonb('cost_summary').notNull(),
  paymentDueDate:      text('payment_due_date'),
  paymentTermDays:     integer('payment_term_days').default(45),
  createdBy:           uuid('created_by').references(() => users.id),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const batchesRelations = relations(batches, ({ one }) => ({
  creator: one(users, { fields: [batches.createdBy], references: [users.id] }),
}))

// ── Per-company per-day atomic sequence counter ───────────────────────────────
export const batchSequences = pgTable('batch_sequences', {
  dateKey:     text('date_key').notNull(),      // 'YYYYMMDD'
  companyCode: text('company_code').notNull(),  // first 2 chars of company name, uppercase
  lastN:       integer('last_n').notNull().default(0),
}, (t) => ({ pk: primaryKey({ columns: [t.dateKey, t.companyCode] }) }))

export type Batch    = typeof batches.$inferSelect
export type NewBatch = typeof batches.$inferInsert
