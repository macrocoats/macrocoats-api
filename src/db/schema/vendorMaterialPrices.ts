import { pgTable, uuid, text, numeric, date, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { vendors } from './vendors.js'
import { inventoryItems } from './inventory.js'
import { users } from './users.js'

export const vendorMaterialPrices = pgTable('vendor_material_prices', {
  id:              uuid('id').primaryKey().defaultRandom(),
  vendorId:        uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  inventoryItemId: uuid('inventory_item_id').notNull().references(() => inventoryItems.id, { onDelete: 'restrict' }),
  effectiveFrom:   date('effective_from').notNull(),
  effectiveTo:     date('effective_to'), // NULL = currently active — mirrors batches.paidAt / dispatches.voidedAt idiom, no separate isActive boolean
  unitPrice:       numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  currency:        text('currency').notNull().default('INR'), // column ready for future multi-currency; Zod restricts to INR in Phase 1
  unit:            text('unit', { enum: ['Kg', 'L'] }).notNull(), // denormalized snapshot of the unit at quote time
  minimumOrderQty: numeric('minimum_order_qty', { precision: 10, scale: 2 }),
  leadTimeDays:    integer('lead_time_days'),
  remarks:         text('remarks'),
  createdBy:       uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('vmp_vendor_id_idx').on(t.vendorId),
  index('vmp_inventory_item_id_idx').on(t.inventoryItemId),
  index('vmp_vendor_item_effective_idx').on(t.vendorId, t.inventoryItemId, t.effectiveFrom),
  // At most one currently-active price per (vendor, material) — same partial-unique-index
  // pattern already used in productFormulationVariants.ts (pfv_product_company_default_unique).
  uniqueIndex('vmp_one_active_per_vendor_material').on(t.vendorId, t.inventoryItemId).where(sql`effective_to IS NULL`),
])

export const vendorMaterialPricesRelations = relations(vendorMaterialPrices, ({ one }) => ({
  vendor:        one(vendors,        { fields: [vendorMaterialPrices.vendorId],        references: [vendors.id] }),
  inventoryItem: one(inventoryItems, { fields: [vendorMaterialPrices.inventoryItemId], references: [inventoryItems.id] }),
  creator:       one(users,          { fields: [vendorMaterialPrices.createdBy],       references: [users.id] }),
}))

export type VendorMaterialPrice    = typeof vendorMaterialPrices.$inferSelect
export type NewVendorMaterialPrice = typeof vendorMaterialPrices.$inferInsert
