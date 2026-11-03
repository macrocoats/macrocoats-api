import { pgTable, text, date, jsonb, timestamp, index } from 'drizzle-orm/pg-core'

/**
 * Durable cache of Zoho invoice details (header + line items), one row per
 * Zoho invoice. Reading line items costs one Zoho API call per invoice under
 * a ~100 calls/minute limit, so they are kept here and re-read only when
 * Zoho's `last_modified_time` changes — they survive restarts and deploys.
 * Read-only mirror: nothing here is ever written back to Zoho.
 *
 * `payload` is the normalised `SupplyInvoice` shape from utils/supplySummary.ts
 * (lines carry `amount` = Zoho `item_total`, the taxable value before GST).
 */
export const zohoInvoiceDetails = pgTable('zoho_invoice_details', {
  zohoInvoiceId:  text('zoho_invoice_id').primaryKey(),
  lastModified:   text('last_modified').notNull().default(''),
  invoiceDate:    date('invoice_date'),
  zohoCustomerId: text('zoho_customer_id'),
  payload:        jsonb('payload').notNull(),
  fetchedAt:      timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('zoho_invoice_details_invoice_date_idx').on(t.invoiceDate),
])

export type ZohoInvoiceDetailRow = typeof zohoInvoiceDetails.$inferSelect
