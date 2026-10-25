import { z } from 'zod'
import { PRODUCT_KEYS } from '../../types/index.js'
import type { DocType } from './pdf.types.js'

// Body schemas mirror the payloads safteyDataSheet/src/services/pdfService.js
// actually sends (not the aspirational interfaces in pdf.types.ts). Top-level
// fields are validated; deep document structures (`sections`, snapshots, KPI
// blocks) are only checked to be objects because templates read them as-is.
// `.passthrough()` keeps any extra keys so templates keep receiving them.

const text     = (max = 500) => z.string().max(max)
const optText  = (max = 500) => z.string().max(max).nullish()
const numOrStr = z.union([z.number(), z.string().max(50)])
const object   = z.record(z.unknown())

const productLine = z.enum(PRODUCT_KEYS as unknown as [string, ...string[]])

const docHeader = {
  productName:  text(),
  productCode:  text(100),
  productLine,
  revision:     z.union([z.string().max(50), z.number()]).nullish(),
  issueDate:    optText(50),
  revisionDate: optText(50),
}

const signature = z.object({
  preparedBy: optText(),
  checkedBy:  optText(),
  approvedBy: optText(),
  date:       optText(50),
}).passthrough()

const quotationSchema = z.object({
  quotationNumber: text(100),
  quotationDate:   text(50),
  customer:        z.object({ companyName: text() }).passthrough(),
  items:           z.array(object).min(1).max(500),
  totalAmount:     z.number(),
}).passthrough()

const tdsSchema = z.object({
  ...docHeader,
  description: z.string().max(20_000),
  subtitle:    optText(300),
  sections:    object,
}).passthrough()

const msdsSchema = z.object({
  ...docHeader,
  signalWord: optText(50),
  sections:   object,
}).passthrough()

const brochureSchema = z.object({
  ...docHeader,
  category:    text(300),
  subtitle:    optText(300),
  description: z.string().max(20_000),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sections:    object,
}).passthrough()

const coaSchema = z.object({
  productName:       text(),
  productCode:       text(100),
  productLine,
  batchNumber:       text(100),
  manufacturingDate: text(50),
  expiryDate:        optText(50),
  quantity:          numOrStr.nullish(),
  customer:          z.object({ companyName: text(), poNumber: optText(100) }).passthrough().optional(),
  testResults:       z.array(z.object({
    parameter:     text(),
    specification: text(),
    result:        text(),
    unit:          optText(50),
    method:        optText(),
    status:        z.enum(['PASS', 'FAIL', 'NA']),
  }).passthrough()).max(200),
  conclusion:        z.enum(['APPROVED', 'REJECTED', 'CONDITIONAL']),
  remarks:           z.string().max(5_000).nullish(),
  signature:         signature.optional(),
}).passthrough()

const batchSchema = z.object({
  batchNumber:         text(100),
  productCode:         text(100),
  productName:         text(),
  companyName:         optText(),
  productionDate:      text(50),
  batchSize:           numOrStr,
  batchUnit:           optText(20),
  formulationSnapshot: z.unknown(),
  costSummary:         z.unknown(),
  notes:               z.string().max(5_000).nullish(),
}).passthrough()

const investorReportSchema = z.object({
  range:       text(50),
  from:        text(50),
  to:          text(50),
  preparedBy:  optText(),
  kpis:        object,
  analytics:   object,
  projections: object,
  insights:    object,
}).passthrough()

const letterheadSchema = z.object({
  referenceNo:  optText(100),
  letterDate:   optText(50),
  customerName: optText(),
  companyName:  optText(),
  subject:      optText(1_000),
  attention:    optText(),
  preparedBy:   optText(),
  approvedBy:   optText(),
  designation:  optText(),
  // Rendered unescaped ({{{bodyHtml}}}); the render page runs with JavaScript
  // disabled and a network allowlist (see pdf.service.ts), so markup here can't
  // execute or fetch anything.
  bodyHtml:     z.string().max(500_000),
}).passthrough()

export const pdfBodySchemas: Record<DocType, z.ZodTypeAny> = {
  quotation:         quotationSchema,
  tds:               tdsSchema,
  msds:              msdsSchema,
  brochure:          brochureSchema,
  coa:               coaSchema,
  batch:             batchSchema,
  'investor-report': investorReportSchema,
  letterhead:        letterheadSchema,
}
