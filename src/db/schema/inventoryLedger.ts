import { pgTable, uuid, text, numeric, date, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { inventoryItems } from './inventory.js'
import { productionWorkOrders } from './productionWorkOrders.js'
import { batches } from './batches.js'
import { users } from './users.js'

export const inventoryLots = pgTable('inventory_lots', {
  id: uuid('id').primaryKey().defaultRandom(),
  inventoryItemId: uuid('inventory_item_id').notNull().references(() => inventoryItems.id, { onDelete: 'restrict' }),
  lotNumber: text('lot_number').notNull(),
  supplierLotNumber: text('supplier_lot_number'),
  receivedQuantity: numeric('received_quantity', { precision: 14, scale: 3 }).notNull(),
  availableQuantity: numeric('available_quantity', { precision: 14, scale: 3 }).notNull(),
  unit: text('unit').notNull(),
  receivedDate: date('received_date').notNull(),
  expiryDate: date('expiry_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('inventory_lots_item_lot_unique').on(t.inventoryItemId, t.lotNumber),
  index('inventory_lots_expiry_idx').on(t.expiryDate),
])

export const materialReservations = pgTable('material_reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  workOrderId: uuid('work_order_id').notNull().references(() => productionWorkOrders.id, { onDelete: 'cascade' }),
  lotId: uuid('lot_id').notNull().references(() => inventoryLots.id, { onDelete: 'restrict' }),
  quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull(),
  status: text('status', { enum: ['active', 'consumed', 'released'] }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('material_reservations_work_order_idx').on(t.workOrderId), index('material_reservations_lot_idx').on(t.lotId)])

export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  lotId: uuid('lot_id').notNull().references(() => inventoryLots.id, { onDelete: 'restrict' }),
  movementType: text('movement_type', { enum: ['receipt', 'reservation', 'reservation_release', 'issue', 'reversal', 'adjustment'] }).notNull(),
  quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull(),
  workOrderId: uuid('work_order_id').references(() => productionWorkOrders.id, { onDelete: 'set null' }),
  batchId: uuid('batch_id').references(() => batches.id, { onDelete: 'set null' }),
  reason: text('reason'),
  metadata: jsonb('metadata'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('inventory_movements_lot_idx').on(t.lotId),
  index('inventory_movements_work_order_idx').on(t.workOrderId),
  index('inventory_movements_batch_idx').on(t.batchId),
])

export const batchMaterialConsumptions = pgTable('batch_material_consumptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  batchId: uuid('batch_id').notNull().references(() => batches.id, { onDelete: 'restrict' }),
  lotId: uuid('lot_id').notNull().references(() => inventoryLots.id, { onDelete: 'restrict' }),
  quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull(),
  unit: text('unit').notNull(),
  recordedBy: uuid('recorded_by').references(() => users.id, { onDelete: 'set null' }),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('batch_material_consumptions_batch_idx').on(t.batchId), index('batch_material_consumptions_lot_idx').on(t.lotId)])
