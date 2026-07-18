import { z } from 'zod'

export const documentMetaSchema = z.object({
  orderNumber: z.string().min(1).max(100),
  orderDate:   z.string().min(1),
  orderAmount: z.coerce.number().nonnegative().optional(),
  remarks:     z.string().max(1000).optional(),
})

export type DocumentMeta = z.infer<typeof documentMetaSchema>
