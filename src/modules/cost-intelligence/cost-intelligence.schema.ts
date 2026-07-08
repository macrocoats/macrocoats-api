import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const overviewQuerySchema = z.object({
  productCode: z.string().optional(),
  variantId:   z.string().uuid().optional(),
  companyName: z.string().optional(),
  batchNumber: z.string().optional(),
})

export const trendsQuerySchema = z.object({
  granularity: z.enum(['daily', 'weekly', 'monthly']).optional().default('monthly'),
  productCode: z.string().optional(),
  variantId:   z.string().uuid().optional(),
  companyName: z.string().optional(),
  dateFrom:    isoDate.optional(),
  dateTo:      isoDate.optional(),
})

export const batchCostQuerySchema = z.object({
  productCode: z.string().optional(),
  variantId:   z.string().uuid().optional(),
  companyName: z.string().optional(),
  dateFrom:    isoDate.optional(),
  dateTo:      isoDate.optional(),
  page:        z.coerce.number().int().min(1).default(1),
  limit:       z.coerce.number().int().min(1).max(100).default(20),
})

export const profitabilityQuerySchema = z.object({
  dateFrom: isoDate.optional(),
  dateTo:   isoDate.optional(),
})

export const comparisonQuerySchema = z.object({
  productCode: z.string().min(1),
  variantId:   z.string().uuid().optional(),
  companyName: z.string().optional(),
})

export type OverviewQuery      = z.infer<typeof overviewQuerySchema>
export type TrendsQuery        = z.infer<typeof trendsQuerySchema>
export type BatchCostQuery     = z.infer<typeof batchCostQuerySchema>
export type ProfitabilityQuery = z.infer<typeof profitabilityQuerySchema>
export type ComparisonQuery    = z.infer<typeof comparisonQuerySchema>
