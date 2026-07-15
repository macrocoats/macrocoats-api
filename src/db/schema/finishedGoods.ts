import { pgTable, uuid, text, numeric, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { batches } from './batches.js'
import { productFormulationVariants } from './productFormulationVariants.js'

// ── Finished Goods Inventory ───────────────────────────────────────────────────
export const finishedGoods = pgTable('finished_goods', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  batchId:            uuid('batch_id').notNull().unique().references(() => batches.id, { onDelete: 'cascade' }),
  productCode:        text('product_code').notNull(),
  companyName:        text('company_name').notNull(),
  variantId:          uuid('variant_id').references(() => productFormulationVariants.id, { onDelete: 'set null' }),
  variantName:        text('variant_name'),
  producedQuantity:   numeric('produced_quantity', { precision: 12, scale: 3 }).notNull(),
  dispatchedQuantity: numeric('dispatched_quantity', { precision: 12, scale: 3 }).notNull().default('0'),
  reservedQuantity:   numeric('reserved_quantity', { precision: 12, scale: 3 }).notNull().default('0'),
  status:             text('status', { enum: ['Available', 'Partially Dispatched', 'Fully Dispatched', 'Cancelled'] })
                        .notNull()
                        .default('Available'),
  cancelReason:       text('cancel_reason'),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('finished_goods_batch_id_idx').on(t.batchId),
  index('finished_goods_status_idx').on(t.status),
  index('finished_goods_company_name_idx').on(t.companyName),
  index('finished_goods_product_code_idx').on(t.productCode),
])

export const finishedGoodsRelations = relations(finishedGoods, ({ one }) => ({
  batch:   one(batches,                    { fields: [finishedGoods.batchId],   references: [batches.id] }),
  variant: one(productFormulationVariants, { fields: [finishedGoods.variantId], references: [productFormulationVariants.id] }),
}))

export type FinishedGood    = typeof finishedGoods.$inferSelect
export type NewFinishedGood = typeof finishedGoods.$inferInsert
