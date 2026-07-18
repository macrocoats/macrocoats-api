import { z } from 'zod'

export const DATE_RANGES = ['today', 'week', 'month', 'quarter', 'year', 'custom'] as const

export const dashboardFilterSchema = z.object({
  range:      z.enum(DATE_RANGES).default('month'),
  from:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customerId: z.string().uuid().optional(),
  productKey: z.string().optional(),
}).refine(
  (d) => d.range !== 'custom' || (d.from && d.to),
  { message: 'from and to are required when range=custom', path: ['range'] },
)

export const projectionsQuerySchema = z.object({
  conversionRate: z.coerce.number().min(0).max(1).default(0.3),
})

export type DashboardFilter    = z.infer<typeof dashboardFilterSchema>
export type ProjectionsQuery   = z.infer<typeof projectionsQuerySchema>
export type DateRange          = typeof DATE_RANGES[number]
