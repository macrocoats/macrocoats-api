import { z } from 'zod'

const priceEntrySchema = z.object({
  productKey:    z.string().min(1),
  pricePerLitre: z.number().nonnegative(),
})

export const upsertPricingSchema = z.object({
  prices: z.array(priceEntrySchema),
})

export type UpsertPricingBody = z.infer<typeof upsertPricingSchema>
