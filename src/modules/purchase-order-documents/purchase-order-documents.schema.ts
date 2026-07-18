import { z } from 'zod'

export const docCategorySchema = z.enum([
  'original_po',
  'vendor_quotation',
  'vendor_acknowledgement',
  'invoice',
  'email_attachment',
  'supporting',
])

export const listDocumentsQuerySchema = z.object({
  docCategory: docCategorySchema.optional(),
})

export type DocCategory              = z.infer<typeof docCategorySchema>
export type ListDocumentsQuery       = z.infer<typeof listDocumentsQuerySchema>
