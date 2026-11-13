import { z } from 'zod'

export const portalListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  search: z.string().trim().max(100).default(''),
})

export const portalIdSchema = z.string().uuid()

export const zohoInvoiceIdSchema = z.string().regex(/^\d{1,50}$/)
