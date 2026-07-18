import puppeteer, { type Browser, type Page } from 'puppeteer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { templateService } from './template.service.js';
import { nowFormatted } from './helpers/date.helper.js';
import { parseStatements, groupPrecautionary } from './helpers/ghs-print.helper.js';
import { PDFError } from './pdf.types.js';
import type { DocType, PDFOptions, RenderResult } from './pdf.types.js';
import { env } from '../../config/env.js';

interface PoolEntry {
  browser: Browser;
  inUse: number;
  createdAt: number;
}

// tds/msds get a header/footer/margin/body that mirrors the frontend's
// print-to-PDF design pixel-for-pixel — see safteyDataSheet's TDSPage.jsx /
// MSDSPage.jsx print CSS. coa keeps its own separately-polished branded
// letterhead (logo + expanded meta) — the two must not be merged.
const PRINT_MATCHED_DOC_TYPES: ReadonlySet<DocType> = new Set(['tds', 'msds']);
const LEGACY_BRANDED_DOC_TYPES: ReadonlySet<DocType> = new Set(['coa']);

// All three get the faint centered watermark.
const WATERMARK_DOC_TYPES: ReadonlySet<DocType> = new Set(['tds', 'msds', 'coa']);

// Per-docType copy for the print-matched header/footer (tds/msds only).
const PRINT_MATCHED_META: Record<string, {
  docTitle: string; subtitle: string; idLabel: string; footerDept: string; footerRightDefault: string;
}> = {
  tds: {
    docTitle: 'Technical Data Sheet',
    subtitle: 'Industrial Performance Product',
    idLabel: 'DOC ID',
    footerDept: 'Technical Data Department',
    footerRightDefault: '',
  },
  msds: {
    docTitle: 'Safety Data Sheet',
    subtitle: 'Globally Harmonized System Compliant',
    idLabel: 'REF',
    footerDept: 'GHS Rev. 9 Standard',
    footerRightDefault: 'Confidential — For Authorised Use Only',
  },
};

const SIMPLE_COMPOSITION_PRODUCT_LINES: ReadonlySet<string> = new Set([
  'unicool-al', 'unikoat-lt-700', 'unisolve-h3',
]);

let logoDataUriCache: string | null = null;

async function getLogoDataUri(): Promise<string> {
  if (logoDataUriCache) return logoDataUriCache;
  const logoPath = path.resolve(__dirname, 'assets', 'macro-coats-logo.png');
  const buf = await fs.readFile(logoPath);
  logoDataUriCache = `data:image/png;base64,${buf.toString('base64')}`;
  return logoDataUriCache;
}

interface PhysicalRow { key?: string; val?: string }
interface PhysicalPair { a: PhysicalRow | null; b: PhysicalRow | null }

// Mirrors MSDSPage.jsx's physical-properties pairing: chunks the flat list
// into rows of two for the 4-column paired table.
function pairPhysicalProperties(items: PhysicalRow[]): PhysicalPair[] {
  const pairs: PhysicalPair[] = [];
  for (let i = 0; i < items.length; i += 2) {
    pairs.push({ a: items[i] ?? null, b: items[i + 1] ?? null });
  }
  return pairs;
}

// Mirrors MSDSPage.jsx's derived-from-raw-payload values (hStmts, pGroups,
// isSimpleComposition, physical pairing, signal word default) so msds.hbs
// can iterate the same shape the frontend print layout renders from,
// without duplicating that logic in Handlebars.
function buildMsdsContext(payload: Record<string, unknown>): Record<string, unknown> {
  const sections = (payload['sections'] as Record<string, unknown> | undefined) ?? {};
  const hazards = (sections['hazards'] as Record<string, unknown> | undefined) ?? {};
  const productLine = String(payload['productLine'] ?? '');
  const physical = (sections['physical'] as PhysicalRow[] | undefined) ?? [];
  const sections11to16 = (sections['sections11to16'] as Record<string, string> | undefined) ?? {};

  const hStmts = parseStatements(hazards['hStatements'] as string | undefined);
  const pStmts = parseStatements(hazards['pStatements'] as string | undefined);
  const pGroups = groupPrecautionary(pStmts);

  return {
    hStmts,
    pGroupsPrevention: pGroups.prevention,
    pGroupsResponse: pGroups.response,
    pGroupsStorage: pGroups.storage,
    pGroupsDisposal: pGroups.disposal,
    isSimpleComposition: SIMPLE_COMPOSITION_PRODUCT_LINES.has(productLine),
    physicalPaired: pairPhysicalProperties(physical),
    effectiveSignalWord: String(payload['signalWord'] ?? 'WARNING').toUpperCase(),
    // Mirrors MSDSPage.jsx's entries11to16.map(([key, val], idx) => `${11 + idx}. ${key}`)
    sections11to16Entries: Object.entries(sections11to16).map(([key, value], idx) => ({
      number: 11 + idx,
      key,
      value,
    })),
  };
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
    const printMatched   = PRINT_MATCHED_DOC_TYPES.has(docType);
    const legacyBranded  = !printMatched && LEGACY_BRANDED_DOC_TYPES.has(docType);
    const watermarked    = WATERMARK_DOC_TYPES.has(docType);
    const logoDataUri    = (printMatched || legacyBranded) ? await getLogoDataUri() : null;

    const ctx: Record<string, unknown> = {
      ...payload,
      ...(docType === 'msds' ? buildMsdsContext(payload) : {}),
      _meta: { generatedDate: date, generatedTime: time, docTitle: docTypeLabel(docType) },
    };

    let html: string;
    try {
      const css  = await templateService.getCSS();
      const body = await templateService.renderTemplate(docType, ctx);
      html = wrapBody(body, css, watermarked ? logoDataUri : null);
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

    const headerHtml = printMatched
      ? buildPrintMatchedHeader(docType, productName, docNumber, logoDataUri, revisionDate)
      : buildHeaderTemplate(docTitle, productName, docNumber, { docType, logoDataUri, revisionDate });
    const footerHtml = printMatched
      ? buildPrintMatchedFooter(docType, productName, docNumber)
      : buildFooterTemplate(date, time, docTitle, productName, { docType });

    // tds/msds reserve less header/footer space than coa's taller branded
    // letterhead — see buildPrintMatchedHeader/Footer for the content that
    // must fit inside these bands.
    const margin = printMatched
      ? { top: '26mm', bottom: '16mm', left: '14mm', right: '14mm' }
      : { top: '30mm', bottom: '22mm', left: '14mm', right: '14mm' };

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
        margin,
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
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
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

  const branded = LEGACY_BRANDED_DOC_TYPES.has(opts.docType) && !!opts.logoDataUri;

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

  // ── Branded letterhead — CoA only (tds/msds use buildPrintMatchedHeader) ──
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
  const branded = LEGACY_BRANDED_DOC_TYPES.has(opts.docType);

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

  // ── Branded footer — CoA only (tds/msds use buildPrintMatchedFooter) ──────
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

// ─── Print-matched header/footer (tds / msds only) ────────────────────────────
// Mirrors safteyDataSheet's TDSPage.jsx / MSDSPage.jsx print CSS byte-for-byte
// where practical (same px sizes, colors, copy) — see documents.css
// .tds-print-header / .msds-print-header / .tds-print-footer / .msds-print-footer.

function buildPrintMatchedHeader(
  docType: DocType,
  productName: string,
  docNumber: string,
  logoDataUri: string | null,
  revisionDate: string,
): string {
  const meta = PRINT_MATCHED_META[docType]!;
  const metaLine = revisionDate
    ? `<div class="h-doc-meta">Rev. Date: ${esc(revisionDate)}</div>`
    : '';

  return `
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .hw { width: 100%; background: #ffffff; }
  .hb { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 3mm 14mm 2.5mm 14mm; }
  .h-logo { height: 56px; width: auto; object-fit: contain; flex-shrink: 0; margin-top: 1px; }
  .h-left { flex: 1; min-width: 0; padding-left: 14px; border-left: 1.5px solid #d8dee5; }
  .h-company { font-size: 20px; font-weight: 900; color: #1a1a1a; line-height: 1; letter-spacing: -0.5px; margin-bottom: 3px; }
  .h-tagline { font-size: 8.5px; font-weight: 700; color: #555; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 7px; }
  .h-addr { font-size: 9.5px; color: #333; line-height: 1.7; }
  .h-right { text-align: right; flex-shrink: 0; }
  .h-doc-title { font-size: 22px; font-weight: 900; color: #1a1a1a; letter-spacing: 0.3px; margin-bottom: 4px; }
  .h-doc-subtitle { font-size: 10px; font-weight: 700; color: #1F3A5F; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 5px; }
  .h-doc-product { font-size: 15px; font-weight: 800; color: #1a1a1a; margin-bottom: 3px; }
  .h-doc-id { font-size: 10.5px; color: #333; }
  .h-doc-meta { font-size: 9px; color: #666; margin-top: 3px; }
  .h-rule { height: 1.5px; background: #1a1a1a; margin: 0 14mm; }
</style>
<div class="hw">
  <div class="hb">
    ${logoDataUri ? `<img class="h-logo" src="${logoDataUri}" />` : ''}
    <div class="h-left">
      <div class="h-company">Macro Coats Pvt. Ltd.</div>
      <div class="h-tagline">Metal Surface Treatment Specialists</div>
      <div class="h-addr">Email: info@macrocoats.in &nbsp;|&nbsp; Web: www.macrocoats.in</div>
    </div>
    <div class="h-right">
      <div class="h-doc-title">${esc(meta.docTitle)}</div>
      <div class="h-doc-subtitle">${esc(meta.subtitle)}</div>
      <div class="h-doc-product">${esc(productName)}</div>
      ${docNumber ? `<div class="h-doc-id">${esc(meta.idLabel)}: ${esc(docNumber)}</div>` : ''}
      ${metaLine}
    </div>
  </div>
  <div class="h-rule"></div>
</div>`;
}

function buildPrintMatchedFooter(docType: DocType, productName: string, docNumber: string): string {
  const meta = PRINT_MATCHED_META[docType]!;
  const isTds = docType === 'tds';
  const leftText = isTds
    ? `Macro Coats Pvt. Ltd. &nbsp;•&nbsp; ${esc(meta.footerDept)} &nbsp;•&nbsp; Product Code: ${esc(docNumber)}`
    : `Macro Coats Pvt. Ltd. &nbsp;•&nbsp; ${esc(productName)} &nbsp;•&nbsp; ${esc(meta.footerDept)}`;
  const rightText = isTds ? esc(productName) : esc(meta.footerRightDefault);

  return `
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .fw { width: 100%; padding: 0 14mm; }
  .f-rule { height: 0.5px; background: #ccc; margin-bottom: 4px; }
  .fb { display: flex; justify-content: space-between; }
  .f-row { font-size: 7.5px; color: #888; letter-spacing: 0.3px; text-transform: uppercase; }
  .f-tag { margin-top: 2px; color: #aaa; font-size: 7px; text-transform: uppercase; letter-spacing: 0.3px; }
</style>
<div class="fw">
  <div class="f-rule"></div>
  <div class="fb">
    <div class="f-row">${leftText}</div>
    <div class="f-row">${rightText}</div>
  </div>
  <div class="f-tag">www.macrocoats.in &nbsp;•&nbsp; This document is computer generated &nbsp;•&nbsp; Confidential</div>
</div>`;
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const pdfService = PDFService.getInstance();
