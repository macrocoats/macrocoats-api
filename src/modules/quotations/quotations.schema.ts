import { z } from 'zod'

export const lineItemSchema = z.object({
  catalogId:   z.number().int().positive(),
  description: z.string().min(1).max(300),
  code:        z.string().min(1).max(100),
  qty:         z.number().positive().nullable().default(null),
  rate:        z.number().min(0),
})

export const createQuotationSchema = z.object({
  customerName: z.string().min(1).max(200),
  quotDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  validDays:    z.number().int().min(1).max(365).default(30),
  lineItems:    z.array(lineItemSchema).min(1).max(50),
})

export const listQuotationsQuerySchema = z.object({
  page:         z.coerce.number().int().min(1).default(1),
  limit:        z.coerce.number().int().min(1).max(100).default(20),
  customerName: z.string().optional(),
})

export type CreateQuotationBody      = z.infer<typeof createQuotationSchema>
export type ListQuotationsQuery      = z.infer<typeof listQuotationsQuerySchema>
