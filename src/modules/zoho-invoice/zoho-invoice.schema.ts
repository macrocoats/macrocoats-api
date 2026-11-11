import { z } from 'zod'

export const zohoInvoiceParamsSchema = z.object({
  dispatchId: z.string().uuid(),
})

// Goes into the Zoho URL path, so digits only.
export const zohoInvoicePdfParamsSchema = z.object({
  invoiceId: z.string().regex(/^\d{1,32}$/),
})

export const listZohoInvoicesQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  perPage:  z.coerce.number().int().min(1).max(200).default(25),
  status:   z.string().max(50).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search:   z.string().max(200).optional(),
  // Exact Zoho customer name (Zoho's own limit is 100 chars).
  customer: z.string().min(1).max(100).optional(),
})

type ZohoInvoiceParams       = z.infer<typeof zohoInvoiceParamsSchema>
export type ListZohoInvoicesQuery   = z.infer<typeof listZohoInvoicesQuerySchema>
