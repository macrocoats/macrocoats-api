import {
  fetchZohoInvoicePdf,
  isZohoConfigured,
  zohoGet,
} from '../zoho-invoice/zoho-invoice.service.js'

interface Invoice {
  invoice_id: string
  customer_id: string
  invoice_number: string
  status: string
  total: number
  balance: number
  date: string
  due_date: string
  currency_code?: string
}

export class PortalInvoiceError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code)
  }
}

function configured(customerId: string | null) {
  if (!customerId) throw new PortalInvoiceError('CUSTOMER_NOT_MAPPED', 409)
  if (!isZohoConfigured())
    throw new PortalInvoiceError('INVOICES_UNAVAILABLE', 503)
  return customerId
}

export async function customerInvoices(
  customerId: string | null,
  page: number,
  search: string,
) {
  const id = configured(customerId)
  const result = await zohoGet<{
    invoices?: Invoice[]
    page_context?: { has_more_page?: boolean }
  }>('/invoice/v3/invoices', {
    customer_id: id,
    page: String(page),
    per_page: '25',
    sort_column: 'date',
    sort_order: 'D',
    ...(search ? { search_text: search } : {}),
  })
  // Do not trust an upstream filter as an authorization boundary.
  const invoices = (result.invoices ?? [])
    .filter((row) => row.customer_id === id && row.status !== 'draft')
    .map((row) => ({
      id: row.invoice_id,
      invoiceNumber: row.invoice_number,
      status: row.status,
      total: Number(row.total),
      balance: Number(row.balance),
      invoiceDate: row.date,
      dueDate: row.due_date,
      currencyCode: row.currency_code ?? 'INR',
    }))
  return {
    items: invoices,
    page,
    hasMore: result.page_context?.has_more_page ?? false,
  }
}

export async function customerInvoicePdf(
  customerId: string | null,
  invoiceId: string,
) {
  const id = configured(customerId)
  const result = await zohoGet<{ invoice?: Invoice }>(
    `/invoice/v3/invoices/${invoiceId}`,
  )
  if (
    !result.invoice ||
    result.invoice.customer_id !== id ||
    result.invoice.status === 'draft'
  ) {
    throw new PortalInvoiceError('NOT_FOUND', 404)
  }
  const pdf = await fetchZohoInvoicePdf(invoiceId)
  if ('code' in pdf) throw new PortalInvoiceError('INVOICES_UNAVAILABLE', 502)
  return pdf.pdf
}
