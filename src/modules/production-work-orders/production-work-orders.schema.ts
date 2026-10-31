import { z } from 'zod'
import { PACK_CONTAINER_IDS } from '../batches/packContainers.js'

export const WORK_ORDER_STATUSES = ['draft', 'planned', 'released_to_production', 'in_progress', 'completed', 'cancelled'] as const

const demandSchema = z.object({
  orderId: z.string().uuid(),
  orderItemId: z.string().uuid(),
  plannedQuantity: z.number().positive(),
})

export const createWorkOrderSchema = z.object({
  demandType: z.enum(['customer_order', 'stock_build', 'trial']),
  productKey: z.string().min(1),
  variantId: z.string().uuid().nullable().optional(),
  plannedQuantity: z.number().positive(),
  unit: z.string().min(1).max(20),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  ownerId: z.string().uuid().nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  demand: demandSchema.optional(),
  // Skip the separate "release to production" click when materials are ready.
  releaseNow: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.demandType === 'customer_order' && !data.demand) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['demand'], message: 'Customer-order work requires an order line.' })
  }
  if (data.demandType !== 'customer_order' && !data.reason?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Stock-build and trial work require a reason.' })
  }
  if (data.demand && data.demand.plannedQuantity > data.plannedQuantity) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['demand', 'plannedQuantity'], message: 'Demand quantity cannot exceed work-order quantity.' })
  }
})

export const WORK_ORDER_VIEWS = ['active', 'awaiting_qc', 'ready_to_ship', 'exceptions', 'done'] as const

export const listWorkOrdersQuerySchema = z.object({
  status: z.enum(WORK_ORDER_STATUSES).optional(),
  view: z.enum(WORK_ORDER_VIEWS).optional(),
  productKey: z.string().optional(),
  scheduledFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scheduledTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const transitionWorkOrderSchema = z.object({
  status: z.enum(WORK_ORDER_STATUSES),
  version: z.number().int().positive(),
  // Required for cancel, and for completing with output outside tolerance.
  reason: z.string().trim().min(1).max(500).optional(),
})

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const createWorkOrderBatchSchema = z.object({
  batchSize: z.number().positive(),
  packContainerId: z.enum(PACK_CONTAINER_IDS).optional(),
  productionDate: isoDate.refine((d) => d <= new Date().toISOString().slice(0, 10), { message: 'productionDate cannot be in the future' }).optional(),
  expiryDate: isoDate,
  notes: z.string().max(2000).optional(),
  version: z.number().int().positive().optional(),
}).superRefine((data, ctx) => {
  const produced = data.productionDate ?? new Date().toISOString().slice(0, 10)
  if (data.expiryDate <= produced) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiryDate'], message: 'Expiry must be after the production date.' })
  }
})

export const idempotencyKeySchema = z.string().trim().min(8).max(100).optional()

export type CreateWorkOrderBody = z.infer<typeof createWorkOrderSchema>
export type CreateWorkOrderBatchBody = z.infer<typeof createWorkOrderBatchSchema>
export type ListWorkOrdersQuery = z.infer<typeof listWorkOrdersQuerySchema>
export type TransitionWorkOrderBody = z.infer<typeof transitionWorkOrderSchema>
