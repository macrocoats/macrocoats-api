import { describe, it, expect, afterAll } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq, and } from 'drizzle-orm'
import { db } from '../../src/db/index.js'
import { productDocuments, products } from '../../src/db/schema/index.js'
import { pdfService } from '../../src/modules/pdf/pdf.service.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DOC_TYPES = ['tds', 'msds'] as const

afterAll(async () => {
  await pdfService.shutdown()
})

async function listProductDocTypePairs(): Promise<Array<[string, 'tds' | 'msds']>> {
  const allProducts = await db.select({ key: products.key }).from(products)
  return allProducts.flatMap((p) => DOC_TYPES.map((d) => [p.key, d] as [string, 'tds' | 'msds']))
}

// Resolved at module load (top-level await — this is an ESM test file) so
// it.each below gets one test case per product/docType rather than one
// giant loop inside a single test.
const productDocTypePairs = await listProductDocTypePairs()

// ─────────────────────────────────────────────────────────────────────────────
// Regression 1: every seeded product's TDS/MSDS renders through the real
// production code path (pdfService.generatePDF(), same payload shape
// pdf.routes.ts builds from a product_documents row — see
// src/modules/pdf/test-render.ts, generalized to every product instead of one
// hardcoded key) and lands on the same page count it landed on last time.
//
// There is no single-page constraint anywhere in this codebase for TDS/MSDS
// (confirmed: no page-break markers in the templates, no A4 auto-fit
// mechanism on the backend PDF path — that only exists for the frontend's
// window.print() path via --print-scale). A 16-section MSDS legitimately
// running 3-4 pages is normal, not a bug. So this is a snapshot, not a fixed
// assertion: it records the current page count per product/docType on first
// run and fails only on drift, which could be a real overflow regression or
// a deliberate content change — either way, worth a human look. Accept an
// intentional change with `npx vitest run tests/pdf -u`.
// ─────────────────────────────────────────────────────────────────────────────
describe('TDS/MSDS PDF regression — every seeded product', () => {
  it('every seeded product has a document for both TDS and MSDS', async () => {
    const allProducts = await db.select().from(products)
    expect(allProducts.length).toBeGreaterThan(0)

    const missing: string[] = []
    for (const product of allProducts) {
      for (const docType of DOC_TYPES) {
        const [doc] = await db
          .select({ id: productDocuments.id })
          .from(productDocuments)
          .where(and(eq(productDocuments.productKey, product.key), eq(productDocuments.docType, docType)))
        if (!doc) missing.push(`${product.key} ${docType}`)
      }
    }
    expect(missing, `Missing seeded document(s): ${missing.join(', ')}`).toEqual([])
  })

  it.each(productDocTypePairs)(
    '%s %s renders and matches its recorded page count',
    async (productKey, docType) => {
      const [product] = await db.select().from(products).where(eq(products.key, productKey))
      const [doc] = await db
        .select()
        .from(productDocuments)
        .where(and(eq(productDocuments.productKey, productKey), eq(productDocuments.docType, docType)))

      expect(product, `product ${productKey} not found`).toBeDefined()
      expect(doc, `${productKey} ${docType} document not found`).toBeDefined()
      if (!product || !doc) return

      const payload = {
        productName:  product.displayName,
        productCode:  doc.docNumber,
        productLine:  product.key,
        revisionDate: doc.revision,
        description:  doc.body.description ?? '',
        signalWord:   doc.body.signalWord ?? null,
        sections:     doc.body.sections,
      }

      // One retry — a shared Puppeteer browser pool rendering many documents
      // back-to-back in a test run can hit a transient page/tab crash that a
      // single real request in production never would; a genuine render
      // failure still fails after the retry.
      let buffer: Buffer | undefined
      let lastError: unknown
      for (let attempt = 0; attempt < 2 && !buffer; attempt++) {
        try {
          const result = await pdfService.generatePDF(docType, payload)
          buffer = result.buffer
        } catch (err) {
          lastError = err
        }
      }
      if (!buffer) throw new Error(`${productKey} ${docType} failed to render after retry: ${(lastError as Error)?.message}`)
      expect(buffer.length).toBeGreaterThan(0)

      const pdfDoc = await PDFDocument.load(buffer)
      expect(pdfDoc.getPageCount()).toMatchSnapshot(`${productKey}-${docType}-page-count`)
    },
    30_000,
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Regression 2: print-matched body/data text never regresses to a lighter
// grey. A prior session shipped #3a3a3a for a printed column, found it too
// light once actually printed, and had to push #1a1a1a as a second pass.
// Checked at the CSS source rather than by rasterizing the PDF — direct,
// deterministic, no new rasterization dependency for one color value.
//
// Deliberately excludes callout/accent selectors (`-callout`, `-app-note`,
// `-danger`) — those are intentionally brand-colored (see documents.css:
// "Application note callout — left blue border, blue text"), not the
// neutral-ink body/table text this check is protecting.
// ─────────────────────────────────────────────────────────────────────────────
describe('Print text color regression', () => {
  const relativeLuminance = (hex: string): number => {
    const n = parseInt(hex.slice(1), 16)
    const r = (n >> 16) & 255
    const g = (n >> 8) & 255
    const b = n & 255
    return 0.2126 * r + 0.7152 * g + 0.0722 * b // relative brightness; lower = darker
  }

  const ACCENT_SELECTOR = /-callout|-app-note|-danger|-warning/

  it('.tds-print-*/.msds-print-* body/data text stays at #1a1a1a or darker', async () => {
    const cssPath = path.join(__dirname, '../../src/modules/pdf/styles/document.css')
    const css = await fs.readFile(cssPath, 'utf-8')

    const printMatchedBlocks = css.match(/\.(?:tds|msds)-print-[\w-]+(?:,\s*\.(?:tds|msds)-print-[\w-]+)*\s*\{[^}]*\}/g) ?? []
    expect(printMatchedBlocks.length, 'expected to find .tds-print-*/.msds-print-* rule blocks in document.css').toBeGreaterThan(0)

    const maxAllowedLuminance = relativeLuminance('#1a1a1a')
    const tooLight: string[] = []

    for (const block of printMatchedBlocks) {
      const selector = block.slice(0, block.indexOf('{')).trim()
      if (ACCENT_SELECTOR.test(selector)) continue // deliberately brand-colored, not body/data text

      const match = block.match(/color:\s*(#[0-9a-fA-F]{6})\s*;/)
      if (!match) continue
      const hex = match[1]
      if (relativeLuminance(hex) > maxAllowedLuminance + 1) { // +1 tolerance for float rounding
        tooLight.push(`${selector} → ${hex}`)
      }
    }

    expect(tooLight, `Body/data text color too light for print (must be #1a1a1a or darker):\n${tooLight.join('\n')}`).toEqual([])
  })
})
