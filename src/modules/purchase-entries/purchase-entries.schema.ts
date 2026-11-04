import { z } from 'zod'

export const createPurchaseEntrySchema = z.object({
  vendorId:        z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  purchaseDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity:        z.number().positive(),
  unit:            z.enum(['Kg', 'L']),
  unitPrice:       z.number().min(0).optional(),
  invoiceNumber:   z.string().max(100).optional(),
  remarks:         z.string().max(1000).optional(),
})

export const listPurchaseEntriesQuerySchema = z.object({
  vendorId:        z.string().uuid().optional(),
  inventoryItemId: z.string().uuid().optional(),
  dateFrom:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page:            z.coerce.number().int().min(1).default(1),
  limit:           z.coerce.number().int().min(1).max(100).default(20),
  // 'recorded' (default) keeps the original newest-recorded-first order;
  // 'purchaseDate' orders by receipt date, which month/invoice grouping needs.
  sort:            z.enum(['recorded', 'purchaseDate']).default('recorded'),
})

/** GET /purchase-entries/summary — the same optional filters as the list (they scope
 *  `filtered` only), plus how many trailing months the spend series covers. */
export const purchaseSummaryQuerySchema = z.object({
  vendorId:        z.string().uuid().optional(),
  inventoryItemId: z.string().uuid().optional(),
  dateFrom:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  months:          z.coerce.number().int().min(1).max(24).default(6),
})

export type CreatePurchaseEntryBody  = z.infer<typeof createPurchaseEntrySchema>
export type ListPurchaseEntriesQuery = z.infer<typeof listPurchaseEntriesQuerySchema>
export type PurchaseSummaryQuery     = z.infer<typeof purchaseSummaryQuerySchema>
