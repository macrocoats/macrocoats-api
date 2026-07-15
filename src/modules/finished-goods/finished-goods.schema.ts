import { z } from 'zod'

export const FINISHED_GOODS_STATUSES = ['Available', 'Partially Dispatched', 'Fully Dispatched', 'Cancelled'] as const
export type FinishedGoodsStatus = typeof FINISHED_GOODS_STATUSES[number]

export const listFinishedGoodsQuerySchema = z.object({
  companyName:  z.string().optional(),
  productCode:  z.string().optional(),
  status:       z.enum(FINISHED_GOODS_STATUSES).optional(),
  batchNumbers: z.string().optional(),   // comma-joined list, e.g. 'RA-20260426-001,RA-20260426-002'
  page:         z.coerce.number().int().min(1).default(1),
  limit:        z.coerce.number().int().min(1).max(100).default(20),
})

export const setFinishedGoodsStatusSchema = z.object({
  status: z.enum(['Cancelled', 'Available']),
  reason: z.string().max(500).optional(),
})

// Manual backfill for batches created before the Finished Goods feature existed —
// operator enters the quantity actually still physically in stock; everything
// else is derived from the batch's original produced quantity.
export const backfillFinishedGoodsSchema = z.object({
  remainingQuantity: z.number().min(0),
})

export type ListFinishedGoodsQuery      = z.infer<typeof listFinishedGoodsQuerySchema>
export type SetFinishedGoodsStatusBody  = z.infer<typeof setFinishedGoodsStatusSchema>
export type BackfillFinishedGoodsBody   = z.infer<typeof backfillFinishedGoodsSchema>
