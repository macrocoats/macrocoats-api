import { z } from 'zod'

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
  paymentDueDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paymentTermDays:     z.number().int().positive().optional().default(45),
})

export const listBatchesQuerySchema = z.object({
  companyName: z.string().optional(),
  productCode: z.string().optional(),
  dateFrom:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page:        z.coerce.number().int().min(1).default(1),
  limit:       z.coerce.number().int().min(1).max(100).default(20),
})

export type CreateBatchBody    = z.infer<typeof createBatchSchema>
export type ListBatchesQuery   = z.infer<typeof listBatchesQuerySchema>
