import { z } from 'zod'

export const ORDER_STATUSES = [
  'draft', 'confirmed', 'production_planned', 'in_production',
  'partially_produced', 'ready_for_dispatch', 'partially_dispatched',
  'completed', 'cancelled',
] as const

export const DOCUMENT_CATEGORIES = [
  'po_pdf', 'email_confirmation', 'drawing', 'specification', 'supporting',
] as const

export const ORDER_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

export const orderItemSchema = z.object({
  productKey:           z.string().min(1).max(100),
  variantId:            z.string().uuid().nullable().optional(),
  customerProductCode:  z.string().max(100).nullable().optional(),
  quantityOrdered:      z.number().positive(),
  unit:                 z.string().min(1).max(20).default('L'),
  unitPrice:            z.number().min(0),
  remarks:              z.string().max(1000).nullable().optional(),
})

export const createCustomerOrderSchema = z.object({
  customerId:           z.string().uuid(),
  customerPoNumber:     z.string().min(1).max(100),
  customerPoDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  referenceQuotationId: z.string().uuid().nullable().optional(),
  expectedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  customerContact:      z.string().max(200).nullable().optional(),
  priority:             z.enum(ORDER_PRIORITIES).default('normal'),
  remarks:              z.string().max(2000).nullable().optional(),
  items:                z.array(orderItemSchema).min(1).max(100),
})

// PUT = full replace, same shape as create
export const updateCustomerOrderSchema = createCustomerOrderSchema

export const listCustomerOrdersQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
  customerId: z.string().uuid().optional(),
  status:     z.enum(ORDER_STATUSES).optional(),
  priority:   z.enum(ORDER_PRIORITIES).optional(),
  search:     z.string().max(200).optional(),   // matches poNumber / customerPoNumber / customer displayName
  overdue:    z.enum(['true', 'false']).optional(),
  sortBy:     z.enum(['createdAt', 'expectedDeliveryDate', 'customerPoDate', 'totalValue']).default('createdAt'),
  sortDir:    z.enum(['asc', 'desc']).default('desc'),
})

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  reason: z.string().max(500).optional(),
})

export const linkBatchSchema = z.object({
  orderItemId:    z.string().uuid(),
  batchId:        z.string().uuid(),
  linkedQuantity: z.number().positive(),
  remarks:        z.string().max(1000).nullable().optional(),
})

export const addTimelineNoteSchema = z.object({
  remarks: z.string().min(1).max(2000),
})

export const documentMetaSchema = z.object({
  category:             z.enum(DOCUMENT_CATEGORIES),
  remarks:              z.string().max(1000).optional(),
  supersedesDocumentId: z.string().uuid().optional(),
})

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
})

export type OrderItemInput          = z.infer<typeof orderItemSchema>
export type CreateCustomerOrderBody = z.infer<typeof createCustomerOrderSchema>
export type UpdateCustomerOrderBody = z.infer<typeof updateCustomerOrderSchema>
export type ListCustomerOrdersQuery = z.infer<typeof listCustomerOrdersQuerySchema>
export type UpdateOrderStatusBody   = z.infer<typeof updateOrderStatusSchema>
export type LinkBatchBody           = z.infer<typeof linkBatchSchema>
export type AddTimelineNoteBody     = z.infer<typeof addTimelineNoteSchema>
export type DocumentMeta            = z.infer<typeof documentMetaSchema>
export type OrderStatus             = typeof ORDER_STATUSES[number]
export type OrderPriority           = typeof ORDER_PRIORITIES[number]
