import { z } from 'zod'
import { PRODUCT_KEYS } from '../../types/index.js'
import { OPTIMIZATION_GOALS } from './optimizer.types.js'

export const optimizerComponentInputSchema = z.object({
  materialName: z.string().min(1),
  percentage:   z.number().min(0).max(100).nullable(),
  unit:         z.enum(['L', 'Kg']),
})

export const optimizerTargetsSchema = z.object({
  sellingPricePerL: z.number().min(0).max(100_000).nullable().optional(),
  profitMarginPct:  z.number().min(-100).max(100).nullable().optional(),
  ph:               z.number().min(0).max(14).nullable().optional(),
  specificGravity:  z.number().min(0.1).max(5).nullable().optional(),
  /** Annual production volume in litres — used for annual savings projection. */
  annualVolumeL:    z.number().min(0).nullable().optional(),
})

export const analyzeSchema = z
  .object({
    productKey: z.enum(PRODUCT_KEYS as unknown as [string, ...string[]]),
    variantId:  z.string().uuid().nullable().optional(),
    /**
     * When provided, overrides the variant's persisted components — used by
     * the frontend "what-if" simulation flow before anything is saved.
     */
    components:       z.array(optimizerComponentInputSchema).optional(),
    goals:            z.array(z.enum(OPTIMIZATION_GOALS as unknown as [string, ...string[]])).min(1),
    targets:          optimizerTargetsSchema.optional(),
    performanceNotes: z.string().max(2000).nullable().optional(),
    priceOverrides:   z.record(z.number().min(0)).optional(),
  })
  .refine((data) => Boolean(data.variantId) || Boolean(data.components && data.components.length > 0), {
    message: 'Either variantId or a non-empty components array must be provided',
    path: ['variantId'],
  })

export type OptimizerComponentInputBody = z.infer<typeof optimizerComponentInputSchema>
export type OptimizerTargetsBody        = z.infer<typeof optimizerTargetsSchema>
export type AnalyzeBody                 = z.infer<typeof analyzeSchema>
