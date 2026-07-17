import puppeteer, { type Browser, type Page } from 'puppeteer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { templateService } from './template.service.js';
import { nowFormatted } from './helpers/date.helper.js';
import { PDFError } from './pdf.types.js';
import type { DocType, PDFOptions, RenderResult } from './pdf.types.js';
import { env } from '../../config/env.js';

interface PoolEntry {
  browser: Browser;
  inUse: number;
  createdAt: number;
}

// TDS/MSDS/CoA get the branded letterhead (logo + expanded meta); all other
// doc types keep the pre-existing header/footer byte-for-byte.
const BRANDED_LETTERHEAD_DOC_TYPES: ReadonlySet<DocType> = new Set(['tds', 'msds', 'coa']);

let logoDataUriCache: string | null = null;

async function getLogoDataUri(): Promise<string> {
  if (logoDataUriCache) return logoDataUriCache;
  const logoPath = path.resolve(__dirname, 'assets', 'macro-coats-logo.png');
  const buf = await fs.readFile(logoPath);
  logoDataUriCache = `data:image/png;base64,${buf.toString('base64')}`;
  return logoDataUriCache;
}

class PDFService {
  private static instance: PDFService;

  private pool: PoolEntry[] = [];
  private readonly MAX_POOL_SIZE    = env.PDF_BROWSER_POOL_SIZE;
  private readonly PAGE_TIMEOUT_MS  = env.PDF_PAGE_TIMEOUT_MS;
  private readonly RENDER_TIMEOUT_MS = env.PDF_RENDER_TIMEOUT_MS;
  private readonly BROWSER_MAX_AGE_MS = 30 * 60 * 1000;

  private constructor() {}

  static getInstance(): PDFService {
    if (!PDFService.instance) PDFService.instance = new PDFService();
    return PDFService.instance;
  }

  // ── Browser pool ─────────────────────────────────────────────────────────

  private async launchBrowser(): Promise<Browser> {
    return puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        '--disable-gpu', '--disable-extensions', '--disable-background-networking',
        '--no-default-browser-check', '--font-render-hinting=none',
      ],
    });
  }

  private async acquireBrowser(): Promise<PoolEntry> {
    const alive = this.pool.filter((e) => e.browser.connected);
    const candidate = alive
      .filter((e) => Date.now() - e.createdAt < this.BROWSER_MAX_AGE_MS)
      .sort((a, b) => a.inUse - b.inUse)[0];

    if (candidate) { candidate.inUse++; return candidate; }

    this.pool = alive.filter((e) => Date.now() - e.createdAt < this.BROWSER_MAX_AGE_MS);

    if (this.pool.length >= this.MAX_POOL_SIZE) {
      await new Promise((r) => setTimeout(r, 500));
      const retry = this.pool.filter((e) => e.browser.connected).sort((a, b) => a.inUse - b.inUse)[0];
      if (retry) { retry.inUse++; return retry; }
      throw new PDFError('Browser pool exhausted', 'BROWSER_UNAVAILABLE');
    }

    const browser = await this.launchBrowser();
    const entry: PoolEntry = { browser, inUse: 1, createdAt: Date.now() };
    this.pool.push(entry);
    return entry;
  }

  private releaseBrowser(entry: PoolEntry): void {
    entry.inUse = Math.max(0, entry.inUse - 1);
  }

  // ── Core generation ───────────────────────────────────────────────────────

  async generatePDF(
    docType: DocType,
    payload: Record<string, unknown>,
    options: PDFOptions = {},
  ): Promise<RenderResult> {
    const { date, time } = nowFormatted();
    const branded = BRANDED_LETTERHEAD_DOC_TYPES.has(docType);
    const logoDataUri = branded ? await getLogoDataUri() : null;

    const ctx: Record<string, unknown> = {
      ...payload,
      _meta: { generatedDate: date, generatedTime: time, docTitle: docTypeLabel(docType) },
    };

    let html: string;
    try {
      const css  = await templateService.getCSS();
      const body = await templateService.renderTemplate(docType, ctx);
      html = wrapBody(body, css, branded ? logoDataUri : null);
    } catch (err) {
      if (err instanceof PDFError) throw err;
      throw new PDFError('Template render failed', 'RENDER_FAILED', err);
    }

    const docTitle    = docTypeLabel(docType);
    const productName = String(payload['productName'] ?? '');
    const docNumber   = String(
      payload['productCode'] ?? payload['quotationNumber'] ?? payload['batchNumber'] ?? '',
    );
    const revisionDate = String(payload['revisionDate'] ?? '');
    const headerHtml = buildHeaderTemplate(docTitle, productName, docNumber, { docType, logoDataUri, revisionDate });
    const footerHtml = buildFooterTemplate(date, time, docTitle, productName, { docType });

    const entry = await this.acquireBrowser();
    let page: Page | null = null;

    try {
      page = await entry.browser.newPage();
      page.setDefaultTimeout(this.PAGE_TIMEOUT_MS);
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: this.RENDER_TIMEOUT_MS });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: false,
        margin: { top: '30mm', bottom: '22mm', left: '14mm', right: '14mm' },
        displayHeaderFooter: true,
        headerTemplate: headerHtml,
        footerTemplate: footerHtml,
      });

      const buffer = Buffer.from(pdfBuffer);

      if (options.format === 'file' && options.outputPath) {
        await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
        await fs.writeFile(options.outputPath, buffer);
        return { filePath: options.outputPath, generatedAt: new Date().toISOString() };
      }

      return { buffer, generatedAt: new Date().toISOString() };
    } catch (err) {
      if (err instanceof PDFError) throw err;
      throw new PDFError(
        !entry.browser.connected ? 'Browser crashed during render' : 'PDF generation failed',
        !entry.browser.connected ? 'BROWSER_CRASH' : 'RENDER_FAILED',
        err,
      );
    } finally {
      if (page) { try { await page.close(); } catch { /* ignore */ } }
      this.releaseBrowser(entry);
    }
  }

  toStream(buffer: Buffer): Readable {
    const r = new Readable({ read() {} });
    r.push(buffer);
    r.push(null);
    return r;
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.pool.map(async (e) => { try { await e.browser.close(); } catch { /* ignore */ } }));
    this.pool = [];
  }
}

// ─── Document type labels ─────────────────────────────────────────────────────

function docTypeLabel(docType: DocType): string {
  const labels: Record<string, string> = {
    quotation: 'Quotation',
    tds:       'Technical Data Sheet',
    msds:      'Material Safety Data Sheet',
    coa:       'Certificate of Analysis',
    batch:     'Batch Manufacturing Record',
    salary:    'Salary Slip',
  };
  return labels[docType] ?? docType.toUpperCase();
}

// ─── HTML wrapper ─────────────────────────────────────────────────────────────

function wrapBody(body: string, css: string, watermarkDataUri?: string | null): string {
  const watermarkCss = watermarkDataUri
    ? `
  .doc-watermark {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 999;
  }
  .doc-watermark img {
    width: 45%;
    max-width: 100mm;
    opacity: 0.06;
    filter: grayscale(1);
    transform: rotate(-28deg);
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }`
    : '';
  const watermarkHtml = watermarkDataUri
    ? `<div class="doc-watermark"><img src="${watermarkDataUri}" alt="" /></div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${css}${watermarkCss}</style>
</head>
<body>${watermarkHtml}${body}</body>
</html>`;
}

// ─── Puppeteer header template ────────────────────────────────────────────────

function buildHeaderTemplate(
  docTitle: string,
  productName: string,
  docNumber: string,
  opts: { docType: DocType; logoDataUri?: string | null; revisionDate?: string },
): string {
  const subParts = [
    docTitle    ? esc(docTitle)    : '',
    productName ? esc(productName) : '',
    docNumber   ? esc(docNumber)   : '',
  ].filter(Boolean);
  const subLine = subParts.join(' &nbsp;|&nbsp; ');

  const branded = BRANDED_LETTERHEAD_DOC_TYPES.has(opts.docType) && !!opts.logoDataUri;

  if (!branded) {
    return `
<style>
  html { font-size: 10pt; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', Arial, 'Helvetica Neue', Helvetica, sans-serif; }
  .hw { width: 100%; background: #ffffff; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .hb { display: flex; justify-content: space-between; align-items: flex-start; padding: 3mm 14mm 2.5mm 14mm; gap: 4mm; }
  .h-left { flex: 1; min-width: 0; }
  .h-company { font-size: 13pt; font-weight: 800; color: #123A6D; line-height: 1.1; letter-spacing: -.02em; }
  .h-tagline { font-size: 6.5pt; font-weight: 700; color: #5C6470; margin-top: 0.5mm; text-transform: uppercase; letter-spacing: .05em; }
  .h-addr { font-size: 6.5pt; color: #5C6470; margin-top: 1.5mm; line-height: 1.5; }
  .h-subdoc  { font-size: 7pt; color: #2D4D7A; margin-top: 1mm; font-weight: 700; letter-spacing: .02em; }
  .h-right { text-align: right; flex-shrink: 0; border-left: 1px solid #C5D3E8; padding-left: 3mm; }
  .h-row { font-size: 6.5pt; line-height: 1.65; color: #5C6470; }
  .h-row b { color: #123A6D; font-weight: 700; }
  .h-rule  { height: 2px; background: #123A6D; margin: 0 14mm; -webkit-print-color-adjust: exact !important; }
</style>
<div class="hw">
  <div class="hb">
    <div class="h-left">
      <div class="h-company">Macro Coats</div>
      <div class="h-tagline">Specialty Surface Treatment Chemicals</div>
      <div class="h-addr">SF.NO 224/11, Kalaimagal Nagar, Pazhanthandalam, Chennai - 600132, Tamil Nadu, India</div>
      ${subLine ? `<div class="h-subdoc">${subLine}</div>` : ''}
    </div>
    <div class="h-right">
      <div class="h-row"><b>GSTIN:</b> 33AARCM7377G1ZY</div>
      <div class="h-row"><b>Ph:</b> +91 98840 80377</div>
      <div class="h-row"><b>Email:</b> info@macrocoats.in</div>
    </div>
  </div>
  <div class="h-rule"></div>
</div>`;
  }

  // ── Branded letterhead — TDS / MSDS only ──────────────────────────────────
  const revLine = opts.revisionDate
    ? `<div class="h-row"><b>Rev. Date:</b> ${esc(opts.revisionDate)}</div>`
    : '';

  return `
<style>
  html { font-size: 10pt; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', Arial, 'Helvetica Neue', Helvetica, sans-serif; }
  .hw { width: 100%; background: #ffffff; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .hb { display: flex; align-items: center; padding: 3mm 14mm 2.5mm 14mm; gap: 4mm; }
  .h-logo { height: 13mm; width: auto; max-width: 40mm; object-fit: contain; flex-shrink: 0; }
  .h-left { flex: 1; min-width: 0; border-left: 1px solid #C5D3E8; padding-left: 4mm; }
  .h-company { font-size: 12.5pt; font-weight: 800; color: #123A6D; line-height: 1.1; letter-spacing: -.02em; }
  .h-tagline { font-size: 7.5pt; font-weight: 700; color: #5C6470; margin-top: 0.5mm; text-transform: uppercase; letter-spacing: .06em; }
  .h-subdoc  { font-size: 8pt; color: #2D4D7A; margin-top: 1.5mm; font-weight: 700; letter-spacing: .02em; }
  .h-right { text-align: right; flex-shrink: 0; border-left: 1px solid #C5D3E8; padding-left: 3mm; }
  .h-row { font-size: 7.5pt; line-height: 1.6; color: #5C6470; }
  .h-row b { color: #123A6D; font-weight: 700; }
  .h-rule  { height: 2px; background: #123A6D; margin: 0 14mm; -webkit-print-color-adjust: exact !important; }
</style>
<div class="hw">
  <div class="hb">
    <img class="h-logo" src="${opts.logoDataUri}" />
    <div class="h-left">
      <div class="h-company">Macro Coats Pvt. Ltd.</div>
      <div class="h-tagline">Metal Surface Treatment Specialists</div>
      ${subLine ? `<div class="h-subdoc">${subLine}</div>` : ''}
    </div>
    <div class="h-right">
      <div class="h-row"><b>Email:</b> info@macrocoats.in</div>
      <div class="h-row"><b>Web:</b> www.macrocoats.in</div>
      ${revLine}
    </div>
  </div>
  <div class="h-rule"></div>
</div>`;
}

// ─── Puppeteer footer template ────────────────────────────────────────────────

function buildFooterTemplate(
  date: string,
  time: string,
  docTitle: string,
  productName: string,
  opts: { docType: DocType },
): string {
  const leftParts = ['Macro Coats', productName, docTitle].filter(Boolean).map(esc);
  const branded = BRANDED_LETTERHEAD_DOC_TYPES.has(opts.docType);

  if (!branded) {
    return `
<style>
  html { font-size: 7.5pt; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', Arial, 'Helvetica Neue', Helvetica, sans-serif; }
  .fw { width: 100%; padding: 0 14mm; }
  .f-rule { height: 0.5px; background: #ccc; margin-bottom: 1mm; }
  .fb { display: flex; justify-content: space-between; align-items: baseline; }
  .f-left { font-size: 7.5pt; color: #888; letter-spacing: .02em; }
  .f-left b { color: #5C6470; }
  .f-right { font-size: 7.5pt; color: #888; }
</style>
<div class="fw">
  <div class="f-rule"></div>
  <div class="fb">
    <div class="f-left"><b>${leftParts[0]}</b> &nbsp;·&nbsp; ${leftParts.slice(1).join(' &nbsp;·&nbsp; ')} &nbsp;·&nbsp; Generated ${esc(date)} ${esc(time)}</div>
    <div class="f-right">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
  </div>
</div>`;
  }

  // ── Branded footer — TDS / MSDS only ──────────────────────────────────────
  return `
<style>
  html { font-size: 7.5pt; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', Arial, 'Helvetica Neue', Helvetica, sans-serif; }
  .fw { width: 100%; padding: 0 14mm; }
  .f-rule { height: 0.5px; background: #ccc; margin-bottom: 1mm; }
  .fb { display: flex; justify-content: space-between; align-items: baseline; }
  .f-left { font-size: 7.5pt; color: #888; letter-spacing: .02em; }
  .f-left b { color: #123A6D; }
  .f-right { font-size: 7.5pt; color: #888; text-align: right; }
  .f-tag { font-size: 6.5pt; color: #A6ADB4; letter-spacing: .03em; margin-top: 0.5mm; text-transform: uppercase; }
</style>
<div class="fw">
  <div class="f-rule"></div>
  <div class="fb">
    <div class="f-left"><b>${leftParts[0]}</b> &nbsp;·&nbsp; ${leftParts.slice(1).join(' &nbsp;·&nbsp; ')} &nbsp;·&nbsp; www.macrocoats.in</div>
    <div class="f-right">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
  </div>
  <div class="f-tag">This document is computer generated &nbsp;·&nbsp; Confidential &nbsp;·&nbsp; Generated ${esc(date)} ${esc(time)}</div>
</div>`;
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const pdfService = PDFService.getInstance();
