import {
  pgTable, uuid, text, integer, numeric,
  timestamp, jsonb, primaryKey, index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users.js'
import { productFormulationVariants } from './productFormulationVariants.js'
import { productionWorkOrders } from './productionWorkOrders.js'

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
  paidAt:              timestamp('paid_at', { withTimezone: true }),
  variantId:           uuid('variant_id').references(() => productFormulationVariants.id, { onDelete: 'set null' }),
  variantName:         text('variant_name'),
  batchType:           text('batch_type').notNull().default('Production'),
  lifecycleStatus:     text('lifecycle_status', {
                           enum: ['planned', 'in_progress', 'awaiting_qc', 'on_hold', 'released', 'rejected', 'cancelled', 'closed', 'needs_review'],
                         }).notNull().default('needs_review'),
  actualYield:         numeric('actual_yield', { precision: 12, scale: 3 }),
  expiryDate:          text('expiry_date'),
  releaseNotes:        text('release_notes'),
  releasedBy:          uuid('released_by').references(() => users.id),
  releasedAt:          timestamp('released_at', { withTimezone: true }),
  version:             integer('version').notNull().default(1),
  coaSnapshot:         jsonb('coa_snapshot'),
  notes:               text('notes'),
  // Set when the batch is produced against a production work order (null for
  // legacy/formula-page batches). One work order may own several batches.
  workOrderId:         uuid('work_order_id').references(() => productionWorkOrders.id, { onDelete: 'set null' }),
  // Client-supplied Idempotency-Key — a retried create returns the existing batch.
  clientRequestId:     text('client_request_id').unique(),
  createdBy:           uuid('created_by').references(() => users.id),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('batches_company_name_idx').on(t.companyName),
  index('batches_created_by_idx').on(t.createdBy),
  // Filter/sort columns used by cost-intelligence and investor-dashboard aggregations
  index('batches_production_date_idx').on(t.productionDate),
  index('batches_product_code_idx').on(t.productCode),
  index('batches_variant_id_idx').on(t.variantId),
  index('batches_lifecycle_status_idx').on(t.lifecycleStatus),
  index('batches_created_at_idx').on(t.createdAt),
  index('batches_work_order_id_idx').on(t.workOrderId),
])

export const batchesRelations = relations(batches, ({ one }) => ({
  creator: one(users,                      { fields: [batches.createdBy],  references: [users.id] }),
  variant: one(productFormulationVariants, { fields: [batches.variantId],  references: [productFormulationVariants.id] }),
}))

// ── Per-company per-day atomic sequence counter ───────────────────────────────
export const batchSequences = pgTable('batch_sequences', {
  dateKey:     text('date_key').notNull(),      // 'YYYYMMDD'
  companyCode: text('company_code').notNull(),  // first 2 chars of company name, uppercase
  lastN:       integer('last_n').notNull().default(0),
}, (t) => ({ pk: primaryKey({ columns: [t.dateKey, t.companyCode] }) }))

export type Batch    = typeof batches.$inferSelect
export type NewBatch = typeof batches.$inferInsert
