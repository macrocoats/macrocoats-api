import { pgTable, uuid, text, integer, numeric, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { customerPurchaseOrders } from './customerPurchaseOrders.js'
import { products } from './products.js'
import { productFormulationVariants } from './productFormulationVariants.js'

export const customerPurchaseOrderItems = pgTable('customer_purchase_order_items', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  orderId:             uuid('order_id').notNull().references(() => customerPurchaseOrders.id, { onDelete: 'cascade' }),
  sortOrder:           integer('sort_order').notNull(),
  productKey:          text('product_key').notNull().references(() => products.key, { onDelete: 'restrict' }),
  variantId:           uuid('variant_id').references(() => productFormulationVariants.id, { onDelete: 'set null' }),
  customerProductCode: text('customer_product_code'),
  quantityOrdered:     numeric('quantity_ordered', { precision: 12, scale: 3 }).notNull(),
  unit:                text('unit').notNull().default('L'),
  unitPrice:           numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  /** amount = quantityOrdered * unitPrice, computed server-side on write — never trust a client-supplied amount. */
  amount:              numeric('amount', { precision: 12, scale: 2 }).notNull(),
  remarks:             text('remarks'),
}, (t) => [
  index('cpo_items_order_id_idx').on(t.orderId),
  index('cpo_items_product_key_idx').on(t.productKey),
])

export const customerPurchaseOrderItemsRelations = relations(customerPurchaseOrderItems, ({ one }) => ({
  order:   one(customerPurchaseOrders,     { fields: [customerPurchaseOrderItems.orderId],    references: [customerPurchaseOrders.id] }),
  product: one(products,                   { fields: [customerPurchaseOrderItems.productKey], references: [products.key] }),
  variant: one(productFormulationVariants, { fields: [customerPurchaseOrderItems.variantId],  references: [productFormulationVariants.id] }),
}))

export type CustomerPurchaseOrderItem    = typeof customerPurchaseOrderItems.$inferSelect
export type NewCustomerPurchaseOrderItem = typeof customerPurchaseOrderItems.$inferInsert
