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

    const ctx: Record<string, unknown> = {
      ...payload,
      _meta: { generatedDate: date, generatedTime: time, docTitle: docTypeLabel(docType) },
    };

    let html: string;
    try {
      const css  = await templateService.getCSS();
      const body = await templateService.renderTemplate(docType, ctx);
      html = wrapBody(body, css);
    } catch (err) {
      if (err instanceof PDFError) throw err;
      throw new PDFError('Template render failed', 'RENDER_FAILED', err);
    }

    const docTitle    = docTypeLabel(docType);
    const productName = String(payload['productName'] ?? '');
    const docNumber   = String(
      payload['productCode'] ?? payload['quotationNumber'] ?? payload['batchNumber'] ?? '',
    );
    const headerHtml = buildHeaderTemplate(docTitle, productName, docNumber);
    const footerHtml = buildFooterTemplate(date, time);

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

function wrapBody(body: string, css: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${css}</style>
</head>
<body>${body}</body>
</html>`;
}

// ─── Puppeteer header template ────────────────────────────────────────────────

function buildHeaderTemplate(
  docTitle: string,
  productName: string,
  docNumber: string,
): string {
  const subParts = [
    docTitle    ? esc(docTitle)    : '',
    productName ? esc(productName) : '',
    docNumber   ? esc(docNumber)   : '',
  ].filter(Boolean);
  const subLine = subParts.join(' &nbsp;|&nbsp; ');

  return `
<style>
  html { font-size: 10pt; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; }
  .hw { width: 100%; background: #ffffff; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .hb { display: flex; justify-content: space-between; align-items: center; padding: 3mm 14mm 2.5mm 14mm; gap: 4mm; }
  .h-logo-box {
    width: 12mm; height: 12mm; background: #163B6D;
    display: flex; align-items: center; justify-content: center;
    border-radius: 2px; flex-shrink: 0;
    -webkit-print-color-adjust: exact !important;
  }
  .h-logo-text { color: #ffffff; font-size: 12pt; font-weight: 800; font-style: italic; line-height: 1; letter-spacing: -.02em; }
  .h-center { flex: 1; padding-left: 3mm; border-left: 1px solid #C5D3E8; }
  .h-company { font-size: 11pt; font-weight: 800; font-style: italic; color: #163B6D; line-height: 1.1; }
  .h-tagline { font-size: 6.5pt; color: #5C6470; margin-top: 0.5mm; font-style: italic; }
  .h-subdoc  { font-size: 7pt; color: #2D4D7A; margin-top: 1mm; font-weight: 700; letter-spacing: .02em; }
  .h-right { text-align: right; flex-shrink: 0; border-left: 1px solid #C5D3E8; padding-left: 3mm; }
  .h-row { font-size: 6.5pt; line-height: 1.65; color: #5C6470; }
  .h-row b { color: #163B6D; font-weight: 700; }
  .h-rule  { height: 2px; background: #163B6D; margin: 0 14mm; -webkit-print-color-adjust: exact !important; }
  .h-rule2 { height: 1px; background: #4E7BAF; margin: 1px 14mm 0; -webkit-print-color-adjust: exact !important; }
</style>
<div class="hw">
  <div class="hb">
    <div class="h-logo-box"><span class="h-logo-text">MC</span></div>
    <div class="h-center">
      <div class="h-company">Macro Coats Pvt Ltd</div>
      <div class="h-tagline">Specialty Surface Treatment Chemicals</div>
      ${subLine ? `<div class="h-subdoc">${subLine}</div>` : ''}
    </div>
    <div class="h-right">
      <div class="h-row"><b>GST:</b> 33AARCM7377G1ZY</div>
      <div class="h-row"><b>Ph:</b> 9884080377 / 9444905992</div>
      <div class="h-row"><b>Email:</b> info@macrocoats.in</div>
    </div>
  </div>
  <div class="h-rule"></div>
  <div class="h-rule2"></div>
</div>`;
}

// ─── Puppeteer footer template ────────────────────────────────────────────────

function buildFooterTemplate(date: string, time: string): string {
  return `
<style>
  html { font-size: 9pt; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; }
  .fw { width: 100%; padding: 0 14mm; }
  .f-rule  { height: 2px; background: #163B6D; margin-bottom: 1px; -webkit-print-color-adjust: exact !important; }
  .f-rule2 { height: 1px; background: #4E7BAF; margin-bottom: 2mm; -webkit-print-color-adjust: exact !important; }
  .fb { display: flex; justify-content: space-between; align-items: flex-start; }
  .f-co  { font-size: 7pt; font-weight: 700; font-style: italic; color: #163B6D; line-height: 1.3; }
  .f-addr { font-size: 6pt; color: #5C6470; line-height: 1.55; margin-top: 0.3mm; }
  .f-mid { text-align: center; }
  .f-ctrl { font-size: 6.5pt; font-weight: 700; color: #163B6D; text-transform: uppercase; letter-spacing: .05em; }
  .f-unc  { font-size: 5.5pt; color: #8A9099; font-style: italic; margin-top: 0.3mm; }
  .f-right { text-align: right; }
  .f-gen  { font-size: 6pt; color: #5C6470; }
  .f-pg   { font-size: 7pt; font-weight: 700; color: #163B6D; margin-top: 0.5mm; }
</style>
<div class="fw">
  <div class="f-rule"></div>
  <div class="f-rule2"></div>
  <div class="fb">
    <div>
      <div class="f-co">Macro Coats Pvt Ltd</div>
      <div class="f-addr">SF.NO 224/11, Kalaimagal Nagar, Pazhanthandalam, Chennai – 600132<br>Ph: 9884080377 / 9444905992 &nbsp;|&nbsp; info@macrocoats.in &nbsp;|&nbsp; GST: 33AARCM7377G1ZY</div>
    </div>
    
    <div class="f-right">
      <div class="f-gen">Generated: ${esc(date)} ${esc(time)}</div>
      <div class="f-pg">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
    </div>
  </div>
</div>`;
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const pdfService = PDFService.getInstance();
