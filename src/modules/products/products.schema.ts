import { z } from 'zod'
import { PRODUCT_KEYS, DOC_TYPES } from '../../types/index.js'

export const productParamsSchema = z.object({
  productLine: z.enum(PRODUCT_KEYS as [string, ...string[]]),
  docType:     z.enum(DOC_TYPES as [string, ...string[]]),
})

export const updateDocumentSchema = z.object({
  docNumber: z.string().optional(),
  revision:  z.string().optional(),
  body:      z.record(z.unknown()).optional(),
  footer:    z.object({
    left:   z.string(),
    center: z.string(),
    right:  z.string(),
  }).optional(),
})

export type ProductParams    = z.infer<typeof productParamsSchema>
export type UpdateDocumentBody = z.infer<typeof updateDocumentSchema>
