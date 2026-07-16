import { pgTable, uuid, text, numeric, date, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { vendors } from './vendors.js'
import { inventoryItems } from './inventory.js'
import { users } from './users.js'
import { vendorMaterialPrices } from './vendorMaterialPrices.js'

export const purchaseEntries = pgTable('purchase_entries', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  vendorId:           uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'restrict' }),
  inventoryItemId:    uuid('inventory_item_id').notNull().references(() => inventoryItems.id, { onDelete: 'restrict' }),
  purchaseDate:       date('purchase_date').notNull(),
  quantity:           numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  unit:               text('unit', { enum: ['Kg', 'L'] }).notNull(),
  unitPrice:          numeric('unit_price', { precision: 10, scale: 2 }).notNull(),        // actual price paid
  suggestedUnitPrice: numeric('suggested_unit_price', { precision: 10, scale: 2 }),         // what auto-lookup returned, kept even when overridden, for audit
  priceSource:        text('price_source', { enum: ['vendor_price_history', 'manual'] }).notNull(),
  vendorPriceId:      uuid('vendor_price_id').references(() => vendorMaterialPrices.id, { onDelete: 'set null' }),
  invoiceNumber:      text('invoice_number'),
  remarks:            text('remarks'),
  createdBy:          uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('pe_vendor_id_idx').on(t.vendorId),
  index('pe_inventory_item_id_idx').on(t.inventoryItemId),
  index('pe_purchase_date_idx').on(t.purchaseDate),
])

export const purchaseEntriesRelations = relations(purchaseEntries, ({ one }) => ({
  vendor:        one(vendors,             { fields: [purchaseEntries.vendorId],        references: [vendors.id] }),
  inventoryItem: one(inventoryItems,      { fields: [purchaseEntries.inventoryItemId], references: [inventoryItems.id] }),
  vendorPrice:   one(vendorMaterialPrices,{ fields: [purchaseEntries.vendorPriceId],    references: [vendorMaterialPrices.id] }),
  creator:       one(users,               { fields: [purchaseEntries.createdBy],       references: [users.id] }),
}))

export type PurchaseEntry    = typeof purchaseEntries.$inferSelect
export type NewPurchaseEntry = typeof purchaseEntries.$inferInsert
