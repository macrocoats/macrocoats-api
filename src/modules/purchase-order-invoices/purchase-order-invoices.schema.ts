import { z } from 'zod'

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const createInvoiceSchema = z.object({
  invoiceNumber:     z.string().min(1).max(100),
  invoiceDate:       dateSchema,
  invoiceAmount:     z.coerce.number().positive(),
  invoiceDocumentId: z.string().uuid().optional(),
  remarks:           z.string().max(1000).optional(),
})

export const updateInvoiceSchema = createInvoiceSchema.partial()

export type CreateInvoiceBody = z.infer<typeof createInvoiceSchema>
export type UpdateInvoiceBody = z.infer<typeof updateInvoiceSchema>
