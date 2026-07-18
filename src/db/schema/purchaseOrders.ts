import {
  pgTable, uuid, text, integer, numeric, date,
  timestamp, index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { vendors } from './vendors.js'
import { inventoryItems } from './inventory.js'
import { users } from './users.js'

// ── Purchase order status enum ────────────────────────────────────────────────
// Exported so backend-developer's purchase-orders.schema.ts can derive the Zod
// enum from this instead of duplicating the list.
export const PO_STATUSES = [
  'draft',
  'issued',
  'confirmed',
  'partially_invoiced',
  'fully_invoiced',
  'partially_paid',
  'paid',
  'closed',
  'cancelled',
] as const

// ── Purchase orders ────────────────────────────────────────────────────────────
export const purchaseOrders = pgTable('purchase_orders', {
  id:                     uuid('id').primaryKey().defaultRandom(),
  poNumber:               text('po_number').notNull().unique(),   // 'PO-2026-0001'
  vendorId:               uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'restrict' }),
  poDate:                 date('po_date').notNull(),
  expectedDeliveryDate:   date('expected_delivery_date'),
  paymentTerms:           text('payment_terms'),
  deliveryAddress:        text('delivery_address'),
  remarks:                text('remarks'),
  status:                 text('status', { enum: PO_STATUSES }).notNull().default('draft'),
  paymentStatus:          text('payment_status', { enum: ['pending', 'partially_paid', 'paid'] }).notNull().default('pending'),
  paymentDate:            date('payment_date'),
  paymentReferenceNumber: text('payment_reference_number'),
  paymentRemarks:         text('payment_remarks'),
  cancelledAt:            timestamp('cancelled_at', { withTimezone: true }),
  cancelReason:           text('cancel_reason'),
  createdBy:              uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  updatedBy:              uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:              timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:              timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('po_vendor_id_idx').on(t.vendorId),
  index('po_status_idx').on(t.status),
  index('po_po_date_idx').on(t.poDate),
])

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  vendor:    one(vendors, { fields: [purchaseOrders.vendorId], references: [vendors.id] }),
  creator:   one(users,   { fields: [purchaseOrders.createdBy], references: [users.id] }),
  updater:   one(users,   { fields: [purchaseOrders.updatedBy], references: [users.id] }),
  items:     many(purchaseOrderItems),
  documents: many(purchaseOrderDocuments),
  invoices:  many(purchaseOrderInvoices),
  timeline:  many(purchaseOrderTimeline),
}))

// ── Purchase order line items ─────────────────────────────────────────────────
export const purchaseOrderItems = pgTable('purchase_order_items', {
  id:              uuid('id').primaryKey().defaultRandom(),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  sortOrder:       integer('sort_order').notNull(),
  materialId:      uuid('material_id').notNull().references(() => inventoryItems.id, { onDelete: 'restrict' }),
  description:     text('description'),
  quantity:        numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  unit:            text('unit', { enum: ['Kg', 'L'] }).notNull(),
  unitPrice:       numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  gstPercent:      numeric('gst_percent', { precision: 5, scale: 2 }).notNull().default('18.00'),
  gstAmount:       numeric('gst_amount', { precision: 10, scale: 2 }),
  // NOTE: no totalAmount/lineTotal column — computed at read time by the service layer.
}, (t) => [
  index('poi_purchase_order_id_idx').on(t.purchaseOrderId),
  index('poi_material_id_idx').on(t.materialId),
])

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
  purchaseOrder: one(purchaseOrders,  { fields: [purchaseOrderItems.purchaseOrderId], references: [purchaseOrders.id] }),
  material:      one(inventoryItems,  { fields: [purchaseOrderItems.materialId],      references: [inventoryItems.id] }),
}))

// ── Per-year atomic sequence counter ──────────────────────────────────────────
export const purchaseOrderSequences = pgTable('purchase_order_sequences', {
  year:  integer('year').primaryKey(),
  lastN: integer('last_n').notNull().default(0),
})

// ── Purchase order documents ───────────────────────────────────────────────────
export const purchaseOrderDocuments = pgTable('purchase_order_documents', {
  id:              uuid('id').primaryKey().defaultRandom(),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  docCategory:     text('doc_category', {
    enum: ['original_po', 'vendor_quotation', 'vendor_acknowledgement', 'invoice', 'email_attachment', 'supporting'],
  }).notNull(),
  filename:   text('filename').notNull(),
  storageKey: text('storage_key').notNull(),
  mimeType:   text('mime_type').notNull(),
  sizeBytes:  integer('size_bytes').notNull(),
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('pod_purchase_order_id_idx').on(t.purchaseOrderId),
  index('pod_doc_category_idx').on(t.docCategory),
])

export const purchaseOrderDocumentsRelations = relations(purchaseOrderDocuments, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, { fields: [purchaseOrderDocuments.purchaseOrderId], references: [purchaseOrders.id] }),
  uploader:      one(users,          { fields: [purchaseOrderDocuments.uploadedBy],      references: [users.id] }),
}))

// ── Purchase order invoices ────────────────────────────────────────────────────
export const purchaseOrderInvoices = pgTable('purchase_order_invoices', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  purchaseOrderId:    uuid('purchase_order_id').notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  invoiceNumber:      text('invoice_number').notNull(),
  invoiceDate:        date('invoice_date').notNull(),
  invoiceAmount:      numeric('invoice_amount', { precision: 10, scale: 2 }).notNull(),
  invoiceDocumentId:  uuid('invoice_document_id').references(() => purchaseOrderDocuments.id, { onDelete: 'set null' }),
  remarks:            text('remarks'),
  createdBy:          uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('poinv_purchase_order_id_idx').on(t.purchaseOrderId),
])

export const purchaseOrderInvoicesRelations = relations(purchaseOrderInvoices, ({ one }) => ({
  purchaseOrder:   one(purchaseOrders,         { fields: [purchaseOrderInvoices.purchaseOrderId],   references: [purchaseOrders.id] }),
  invoiceDocument: one(purchaseOrderDocuments, { fields: [purchaseOrderInvoices.invoiceDocumentId],  references: [purchaseOrderDocuments.id] }),
  creator:         one(users,                  { fields: [purchaseOrderInvoices.createdBy],         references: [users.id] }),
}))

// ── Purchase order timeline / audit log ───────────────────────────────────────
export const purchaseOrderTimeline = pgTable('purchase_order_timeline', {
  id:              uuid('id').primaryKey().defaultRandom(),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  userId:          uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action', {
    enum: [
      'created',
      'updated',
      'status_changed',
      'document_uploaded',
      'document_deleted',
      'invoice_added',
      'invoice_updated',
      'invoice_deleted',
      'payment_updated',
      'cancelled',
    ],
  }).notNull(),
  fromStatus: text('from_status'),
  toStatus:   text('to_status'),
  notes:      text('notes'),
  at:         timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('pot_purchase_order_id_idx').on(t.purchaseOrderId, t.at),
])

export const purchaseOrderTimelineRelations = relations(purchaseOrderTimeline, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, { fields: [purchaseOrderTimeline.purchaseOrderId], references: [purchaseOrders.id] }),
  user:          one(users,          { fields: [purchaseOrderTimeline.userId],          references: [users.id] }),
}))

export type PurchaseOrder       = typeof purchaseOrders.$inferSelect
export type NewPurchaseOrder    = typeof purchaseOrders.$inferInsert
export type PurchaseOrderItem   = typeof purchaseOrderItems.$inferSelect
export type NewPurchaseOrderItem = typeof purchaseOrderItems.$inferInsert
export type PurchaseOrderDocument    = typeof purchaseOrderDocuments.$inferSelect
export type NewPurchaseOrderDocument = typeof purchaseOrderDocuments.$inferInsert
export type PurchaseOrderInvoice     = typeof purchaseOrderInvoices.$inferSelect
export type NewPurchaseOrderInvoice  = typeof purchaseOrderInvoices.$inferInsert
export type PurchaseOrderTimelineEntry    = typeof purchaseOrderTimeline.$inferSelect
export type NewPurchaseOrderTimelineEntry = typeof purchaseOrderTimeline.$inferInsert
