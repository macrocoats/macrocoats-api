/**
 * Loads Zoho invoice line items into `zoho_invoice_details` at Zoho's rate
 * limit (60 reads, then a 60s pause), so invoiced-sales figures (Sales →
 * Invoiced sales, Revenue MTD, Investor Dashboard) are complete without
 * waiting for page loads to fill them in. Read-only against Zoho; it only
 * writes the local cache table. Re-running reads nothing already cached
 * unless Zoho shows the invoice changed.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-zoho-invoice-details.ts             # status only (no Zoho detail reads)
 *   npx tsx --env-file=.env.local scripts/backfill-zoho-invoice-details.ts --apply     # read up to 3000 invoices
 *   npx tsx --env-file=.env.local scripts/backfill-zoho-invoice-details.ts --apply --max 600
 */
import { fillInvoiceDetails, listInvoicesWithDetails } from '../src/modules/customer-supply/customer-supply.service.js'
import { isZohoConfigured } from '../src/modules/zoho-invoice/zoho-invoice.service.js'

async function main() {
  if (!isZohoConfigured()) {
    console.error('Zoho is not configured (ZOHO_* env vars missing) — nothing to do.')
    process.exit(1)
  }
  const apply = process.argv.includes('--apply')
  const maxArg = process.argv.indexOf('--max')
  const maxReads = maxArg > -1 ? Number(process.argv[maxArg + 1]) : 3000

  if (!apply) {
    const { listed, pending } = await listInvoicesWithDetails({ force: true, readLimit: 0 })
    console.log(`Zoho invoices listed: ${listed.length} · still to read: ${pending}. Re-run with --apply to load them.`)
    process.exit(0)
  }

  const result = await fillInvoiceDetails({ maxReads, log: (m) => console.log(new Date().toISOString(), m) })
  console.log(`Done — read ${result.read}, still pending ${result.pending}, failed ${result.failed}.`)
  process.exit(result.failed > 0 && result.read === 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
