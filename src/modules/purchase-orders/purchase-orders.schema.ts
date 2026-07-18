import { z } from 'zod'
import { PO_STATUSES } from '../../db/schema/purchaseOrders.js'

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const itemSchema = z.object({
  materialId:  z.string().uuid(),
  description: z.string().max(500).optional(),
  quantity:    z.coerce.number().positive(),
  unit:        z.enum(['Kg', 'L']),
  unitPrice:   z.coerce.number().min(0),
  gstPercent:  z.coerce.number().min(0).default(18),
})

export const createPurchaseOrderSchema = z.object({
  vendorId:             z.string().uuid(),
  poDate:               dateSchema,
  expectedDeliveryDate: dateSchema.optional(),
  paymentTerms:         z.string().max(200).optional(),
  deliveryAddress:      z.string().max(500).optional(),
  remarks:              z.string().max(1000).optional(),
  items:                z.array(itemSchema).min(1),
})

export const updateItemsSchema = z.object({
  items: z.array(itemSchema).min(1),
})

// Deliberately narrower than the full PO_STATUSES enum — auto-computed
// statuses (partially_invoiced, fully_invoiced, partially_paid, paid) are
// never a valid PATCH .../status target; they're derived by the service
// layer from invoices/payment state.
export const transitionStatusSchema = z.object({
  status: z.enum(['issued', 'confirmed', 'closed', 'cancelled']),
  notes:  z.string().max(1000).optional(),
})

export const cancelSchema = z.object({
  reason: z.string().max(500),
})

export const updatePaymentSchema = z.object({
  paymentStatus:          z.enum(['pending', 'partially_paid', 'paid']),
  paymentDate:            dateSchema.optional(),
  paymentReferenceNumber: z.string().max(200).optional(),
  paymentRemarks:         z.string().max(1000).optional(),
})

export const listQuerySchema = z.object({
  vendorId:      z.string().uuid().optional(),
  status:        z.enum(PO_STATUSES).optional(),
  paymentStatus: z.enum(['pending', 'partially_paid', 'paid']).optional(),
  poDateFrom:    dateSchema.optional(),
  poDateTo:      dateSchema.optional(),
  search:        z.string().max(200).optional(),
  page:          z.coerce.number().int().min(1).default(1),
  limit:         z.coerce.number().int().min(1).max(100).default(20),
  sortBy:        z.enum(['poDate', 'poNumber', 'status', 'totalValue']).optional(),
  sortDir:       z.enum(['asc', 'desc']).optional(),
})

export type PoItemInput             = z.infer<typeof itemSchema>
export type CreatePurchaseOrderBody = z.infer<typeof createPurchaseOrderSchema>
export type UpdateItemsBody         = z.infer<typeof updateItemsSchema>
export type TransitionStatusBody    = z.infer<typeof transitionStatusSchema>
export type CancelBody              = z.infer<typeof cancelSchema>
export type UpdatePaymentBody       = z.infer<typeof updatePaymentSchema>
export type ListPurchaseOrdersQuery = z.infer<typeof listQuerySchema>
