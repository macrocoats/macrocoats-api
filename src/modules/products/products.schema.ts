import { z } from 'zod'
import { PRODUCT_KEYS, DOC_TYPES, DOCUMENT_VIEW_MODES } from '../../types/index.js'

export const productParamsSchema = z.object({
  productLine: z.enum(PRODUCT_KEYS as [string, ...string[]]),
  docType:     z.enum(DOC_TYPES as [string, ...string[]]),
})

export const documentQuerySchema = z.object({
  variantId: z.string().uuid().optional(),
  view:      z.enum(DOCUMENT_VIEW_MODES).optional(),
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

export const transitionStatusSchema = z.object({
  status: z.enum(['draft', 'pending_review', 'qa_review', 'published', 'archived']),
  notes:  z.string().optional(),
})

export type ProductParams      = z.infer<typeof productParamsSchema>
export type DocumentQuery      = z.infer<typeof documentQuerySchema>
export type UpdateDocumentBody = z.infer<typeof updateDocumentSchema>
export type TransitionStatusBody = z.infer<typeof transitionStatusSchema>
