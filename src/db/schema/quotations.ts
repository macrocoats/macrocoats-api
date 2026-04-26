import {
  pgTable, uuid, text, integer, numeric, date,
  timestamp, primaryKey,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users.js'

// ── Quotations ────────────────────────────────────────────────────────────────
export const quotations = pgTable('quotations', {
  id:           uuid('id').primaryKey().defaultRandom(),
  quotNumber:   text('quot_number').notNull().unique(),   // 'UNIK-2026-001'
  customerName: text('customer_name').notNull(),
  quotDate:     date('quot_date').notNull(),
  validDays:    integer('valid_days').notNull().default(30),
  validUntil:   date('valid_until').notNull(),
  createdBy:    uuid('created_by').notNull().references(() => users.id),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const quotationsRelations = relations(quotations, ({ one, many }) => ({
  creator:   one(users, { fields: [quotations.createdBy], references: [users.id] }),
  lineItems: many(quotationLineItems),
}))

// ── Quotation line items ───────────────────────────────────────────────────────
export const quotationLineItems = pgTable('quotation_line_items', {
  id:           uuid('id').primaryKey().defaultRandom(),
  quotationId:  uuid('quotation_id').notNull().references(() => quotations.id, { onDelete: 'cascade' }),
  sortOrder:    integer('sort_order').notNull(),
  catalogId:    integer('catalog_id').notNull(),       // matches RATE_CATALOG id on frontend
  description:  text('description').notNull(),
  code:         text('code').notNull(),
  qty:          numeric('qty', { precision: 12, scale: 3 }),  // nullable
  rate:         numeric('rate', { precision: 10, scale: 2 }).notNull(),
})

export const quotationLineItemsRelations = relations(quotationLineItems, ({ one }) => ({
  quotation: one(quotations, { fields: [quotationLineItems.quotationId], references: [quotations.id] }),
}))

// ── Per-year atomic sequence counter ──────────────────────────────────────────
export const quotationSequences = pgTable('quotation_sequences', {
  year:   integer('year').primaryKey(),
  lastN:  integer('last_n').notNull().default(0),
})

export type Quotation        = typeof quotations.$inferSelect
export type NewQuotation     = typeof quotations.$inferInsert
export type QuotationLineItem = typeof quotationLineItems.$inferSelect
