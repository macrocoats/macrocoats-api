import { z } from 'zod'

const transportDetailsSchema = z.object({
  vehicleNumber:   z.string().optional(),
  transporterName: z.string().optional(),
  driverName:      z.string().optional(),
  driverPhone:     z.string().optional(),
  lrNumber:        z.string().optional(),
})

export const createDispatchSchema = z.object({
  batchId:                     z.string().uuid(),
  companyId:                   z.string().uuid(),
  quotationId:                 z.string().uuid().nullable().optional(),
  customerPurchaseOrderId:     z.string().uuid().nullable().optional(),
  customerPurchaseOrderItemId: z.string().uuid().nullable().optional(),
  invoiceNumber:    z.string().max(100).nullable().optional(),
  dispatchCategory: z.enum(['order_fulfillment', 'stock_transfer', 'sample', 'replacement', 'other']).optional(),
  exceptionReason:  z.string().max(500).nullable().optional(),
  dispatchDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity:         z.number().positive(),
  transportDetails: transportDetailsSchema.optional(),
  remarks:          z.string().max(2000).nullable().optional(),
}).refine(
  (data) => data.dispatchDate <= new Date().toISOString().slice(0, 10),
  { message: 'dispatchDate cannot be in the future', path: ['dispatchDate'] },
).refine(
  (data) => !data.customerPurchaseOrderItemId || !!data.customerPurchaseOrderId,
  { message: 'customerPurchaseOrderId is required when customerPurchaseOrderItemId is set', path: ['customerPurchaseOrderId'] },
).superRefine((data, ctx) => {
  if (!!data.customerPurchaseOrderId !== !!data.customerPurchaseOrderItemId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customerPurchaseOrderItemId'], message: 'Order-backed dispatch requires both order and order item.' })
  }
  if (!data.customerPurchaseOrderId && !data.exceptionReason?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['exceptionReason'], message: 'Non-PO dispatch requires an exception reason.' })
  }
  if (!data.customerPurchaseOrderId && (!data.dispatchCategory || data.dispatchCategory === 'order_fulfillment')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dispatchCategory'], message: 'Non-PO dispatch requires an exception category.' })
  }
  if (data.customerPurchaseOrderId && data.dispatchCategory && data.dispatchCategory !== 'order_fulfillment') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dispatchCategory'], message: 'Order-backed dispatch must use order_fulfillment.' })
  }
})

export const updateDispatchSchema = z.object({
  companyId:        z.string().uuid().optional(),
  quotationId:      z.string().uuid().nullable().optional(),
  invoiceNumber:    z.string().max(100).nullable().optional(),
  dispatchDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  quantity:         z.number().positive().optional(),
  transportDetails: transportDetailsSchema.optional(),
  remarks:          z.string().max(2000).nullable().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided.' },
).refine(
  (data) => !data.dispatchDate || data.dispatchDate <= new Date().toISOString().slice(0, 10),
  { message: 'dispatchDate cannot be in the future', path: ['dispatchDate'] },
)

export const voidDispatchSchema = z.object({
  reason: z.string().min(1).max(500),
})

export const listDispatchesQuerySchema = z.object({
  batchNumber:   z.string().optional(),
  companyId:     z.string().uuid().optional(),
  dateFrom:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeVoided: z.enum(['true', 'false']).optional(),
  page:          z.coerce.number().int().min(1).default(1),
  limit:         z.coerce.number().int().min(1).max(100).default(20),
})

export const dispatchTrendQuerySchema = z.object({
  granularity: z.enum(['week', 'month']).default('week'),
  periods:     z.coerce.number().int().min(1).max(52).default(12),
})

export type CreateDispatchBody   = z.infer<typeof createDispatchSchema>
export type DispatchTrendQuery   = z.infer<typeof dispatchTrendQuerySchema>
export type UpdateDispatchBody   = z.infer<typeof updateDispatchSchema>
export type VoidDispatchBody     = z.infer<typeof voidDispatchSchema>
export type ListDispatchesQuery  = z.infer<typeof listDispatchesQuerySchema>
