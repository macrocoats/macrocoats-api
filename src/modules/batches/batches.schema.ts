import { z } from 'zod'

export const BATCH_TYPES = ['Production', 'Trial'] as const
export type BatchType = typeof BATCH_TYPES[number]

const formulationComponentSchema = z.object({
  name:             z.string(),
  percentage:       z.number(),
  quantityUsed:     z.number(),
  unit:             z.string(),
  materialRate:     z.number(),
  costContribution: z.number(),
})

const labelSnapshotSchema = z.object({
  productName:      z.string(),
  companyName:      z.string().optional(),
  batchNumber:      z.string().optional(),
  manufactureDate:  z.string(),
  expiryDate:       z.string(),
  netWeight:        z.string(),
  hazardPictograms: z.array(z.string()),
  signalWord:       z.string(),
  qrCode:           z.string().optional(),
})

const costSummarySchema = z.object({
  rawMaterialCostPerL:  z.number(),
  lossAdjustmentPerL:   z.number(),
  transportCostPerL:    z.number(),
  handlingBufferPerL:   z.number(),
  packagingCostPerL:    z.number().optional(),
  productionCostPerL:   z.number(),
  sellingPricePerL:     z.number(),
  profitPerL:           z.number(),
  profitMargin:         z.number(),
})

export const createBatchSchema = z.object({
  productCode:         z.string().min(1),
  companyName:         z.string().min(1).max(200),
  batchSize:           z.number().positive(),
  formulationSnapshot: z.object({ components: z.array(formulationComponentSchema) }),
  labelSnapshot:       labelSnapshotSchema,
  costSummary:         costSummarySchema,
  // Defaults to today (server-side) when omitted — see createBatch() in
  // batches.service.ts. Accepted so historical/backfilled batches can be
  // recorded with their real production date instead of the entry date.
  productionDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
                          (d) => d <= new Date().toISOString().slice(0, 10),
                          { message: 'productionDate cannot be in the future' },
                        ).optional(),
  paymentDueDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paymentTermDays:     z.number().int().positive().optional().default(45),
  variantId:           z.string().uuid().nullable().optional(),
  variantName:         z.string().nullable().optional(),
  notes:               z.string().max(2000).optional(),
  batchType:           z.enum(BATCH_TYPES).optional().default('Production'),
})

const coaTestSchema = z.object({
  parameter:     z.string(),
  method:        z.string(),
  specification: z.string(),
  result:        z.string(),
  status:        z.enum(['Pass', 'Fail']),
})

export const saveCoaSnapshotSchema = z.object({
  tests:        z.array(coaTestSchema).min(1),
  customerName: z.string().optional(),
  poNumber:     z.string().optional(),
  prodDate:     z.string().optional(),
  savedAt:      z.string().optional(),
})

export type SaveCoaSnapshotBody = z.infer<typeof saveCoaSnapshotSchema>

export const setPaymentStatusSchema = z.object({
  paid: z.boolean(),
})

export type SetPaymentStatusBody = z.infer<typeof setPaymentStatusSchema>

export const listBatchesQuerySchema = z.object({
  companyName: z.string().optional(),
  productCode: z.string().optional(),
  batchType:   z.enum(BATCH_TYPES).optional(),
  paid:        z.enum(['true', 'false']).optional(),
  dateFrom:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page:        z.coerce.number().int().min(1).default(1),
  limit:       z.coerce.number().int().min(1).max(100).default(20),
})

export type CreateBatchBody    = z.infer<typeof createBatchSchema>
export type ListBatchesQuery   = z.infer<typeof listBatchesQuerySchema>
