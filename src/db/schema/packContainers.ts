import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { batches } from './batches.js'
import { users } from './users.js'

/** Stock per container type. The types themselves are fixed in code: batches/packContainers.ts. */
export const packContainerStock = pgTable('pack_container_stock', {
  containerId:       text('container_id').primaryKey(),
  stockQty:          integer('stock_qty').notNull().default(0),
  lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy:         uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
})

/** Every change to container stock. `quantityChange` is signed: negative when stock goes down. */
export const packContainerMovements = pgTable('pack_container_movements', {
  id:             uuid('id').primaryKey().defaultRandom(),
  containerId:    text('container_id').notNull(),
  movementType:   text('movement_type', { enum: ['issue', 'return', 'receipt', 'count'] }).notNull(),
  quantityChange: integer('quantity_change').notNull(),
  stockAfter:     integer('stock_after').notNull(),
  batchId:        uuid('batch_id').references(() => batches.id, { onDelete: 'set null' }),
  // Kept as text so the history still names a batch after it's deleted.
  batchNumber:    text('batch_number'),
  note:           text('note'),
  createdBy:      uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('pack_container_movements_container_idx').on(t.containerId),
  index('pack_container_movements_batch_idx').on(t.batchId),
])
