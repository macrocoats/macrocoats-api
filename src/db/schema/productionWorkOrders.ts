import { pgTable, uuid, text, integer, numeric, date, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { products } from './products.js'
import { productFormulationVariants } from './productFormulationVariants.js'
import { customerPurchaseOrders } from './customerPurchaseOrders.js'
import { customerPurchaseOrderItems } from './customerPurchaseOrderItems.js'
import { users } from './users.js'

export const productionWorkOrders = pgTable('production_work_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  workOrderNumber: text('work_order_number').notNull().unique(),
  demandType: text('demand_type', { enum: ['customer_order', 'stock_build', 'trial'] }).notNull(),
  productKey: text('product_key').notNull().references(() => products.key, { onDelete: 'restrict' }),
  variantId: uuid('variant_id').references(() => productFormulationVariants.id, { onDelete: 'set null' }),
  formulaSnapshot: jsonb('formula_snapshot').notNull(),
  plannedQuantity: numeric('planned_quantity', { precision: 12, scale: 3 }).notNull(),
  unit: text('unit').notNull(),
  scheduledDate: date('scheduled_date').notNull(),
  dueDate: date('due_date'),
  priority: text('priority', { enum: ['low', 'normal', 'high', 'urgent'] }).notNull().default('normal'),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  status: text('status', { enum: ['draft', 'planned', 'released_to_production', 'in_progress', 'completed', 'cancelled'] }).notNull().default('draft'),
  materialReadinessSnapshot: jsonb('material_readiness_snapshot'),
  reason: text('reason'),
  notes: text('notes'),
  // Required when a work order is completed with output outside the ±5% tolerance.
  completionReason: text('completion_reason'),
  version: integer('version').notNull().default(1),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('production_work_orders_status_idx').on(t.status),
  index('production_work_orders_product_idx').on(t.productKey),
  index('production_work_orders_schedule_idx').on(t.scheduledDate),
  index('production_work_orders_owner_idx').on(t.ownerId),
])

export const productionWorkOrderDemands = pgTable('production_work_order_demands', {
  id: uuid('id').primaryKey().defaultRandom(),
  workOrderId: uuid('work_order_id').notNull().references(() => productionWorkOrders.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id').notNull().references(() => customerPurchaseOrders.id, { onDelete: 'restrict' }),
  orderItemId: uuid('order_item_id').notNull().references(() => customerPurchaseOrderItems.id, { onDelete: 'restrict' }),
  plannedQuantity: numeric('planned_quantity', { precision: 12, scale: 3 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('production_work_order_demands_wo_idx').on(t.workOrderId),
  index('production_work_order_demands_item_idx').on(t.orderItemId),
  uniqueIndex('production_work_order_demands_wo_item_unique').on(t.workOrderId, t.orderItemId),
])

export const productionWorkOrderSequences = pgTable('production_work_order_sequences', {
  year: integer('year').primaryKey(),
  lastN: integer('last_n').notNull().default(0),
})

export const productionWorkOrdersRelations = relations(productionWorkOrders, ({ one, many }) => ({
  product: one(products, { fields: [productionWorkOrders.productKey], references: [products.key] }),
  variant: one(productFormulationVariants, { fields: [productionWorkOrders.variantId], references: [productFormulationVariants.id] }),
  owner: one(users, { fields: [productionWorkOrders.ownerId], references: [users.id] }),
  creator: one(users, { fields: [productionWorkOrders.createdBy], references: [users.id] }),
  demands: many(productionWorkOrderDemands),
}))

export const productionWorkOrderDemandsRelations = relations(productionWorkOrderDemands, ({ one }) => ({
  workOrder: one(productionWorkOrders, { fields: [productionWorkOrderDemands.workOrderId], references: [productionWorkOrders.id] }),
  order: one(customerPurchaseOrders, { fields: [productionWorkOrderDemands.orderId], references: [customerPurchaseOrders.id] }),
  orderItem: one(customerPurchaseOrderItems, { fields: [productionWorkOrderDemands.orderItemId], references: [customerPurchaseOrderItems.id] }),
}))

export type ProductionWorkOrder = typeof productionWorkOrders.$inferSelect
export type NewProductionWorkOrder = typeof productionWorkOrders.$inferInsert

// Append-only audit trail for production control — every work-order
// transition (manual or automatic) and every batch command run from the
// work-order hub writes one row. Never updated or deleted.
export const productionEvents = pgTable('production_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  workOrderId: uuid('work_order_id').references(() => productionWorkOrders.id, { onDelete: 'cascade' }),
  batchId: uuid('batch_id'),
  action: text('action').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  payload: jsonb('payload'),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('production_events_work_order_idx').on(t.workOrderId, t.createdAt),
  index('production_events_batch_idx').on(t.batchId),
])

export type ProductionEvent = typeof productionEvents.$inferSelect
