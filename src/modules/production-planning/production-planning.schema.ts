import { z } from 'zod'

export const overviewQuerySchema = z.object({
  /** Window size in days from today — items due within this window, plus any
   * item with no expectedDeliveryDate at all (surfaced separately as "unscheduled"). */
  days: z.coerce.number().int().min(1).max(90).default(7),
})

export type OverviewQuery = z.infer<typeof overviewQuerySchema>
