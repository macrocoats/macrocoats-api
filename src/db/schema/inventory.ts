import { pgTable, uuid, text, numeric, integer, boolean, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users.js'

export const inventoryItems = pgTable('inventory_items', {
  id:        uuid('id').primaryKey().defaultRandom(),
  material:  text('material').notNull(),
  unit:      text('unit', { enum: ['Kg', 'L'] }).notNull(),
  price:     numeric('price', { precision: 10, scale: 2 }).notNull().default('0'),
  stock:             text('stock').notNull().default(''),
  supplier:          text('supplier').notNull().default(''),
  stockQty:          numeric('stock_qty', { precision: 10, scale: 2 }),
  lowStockThreshold: integer('low_stock_threshold').notNull().default(10),
  sortOrder: integer('sort_order').notNull().default(0),
  /** true = part of the factory-default 23 items; used by resetToDefaults */
  isDefault: boolean('is_default').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
})

export const inventoryItemsRelations = relations(inventoryItems, ({ one }) => ({
  updatedByUser: one(users, { fields: [inventoryItems.updatedBy], references: [users.id] }),
}))

export type InventoryItem    = typeof inventoryItems.$inferSelect
export type NewInventoryItem = typeof inventoryItems.$inferInsert
