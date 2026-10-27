import type { FastifyInstance, FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js';
import { checkProductAccess } from '../../middleware/checkProductAccess.js';
import { pdfService } from './pdf.service.js';
import { findStoredPdf } from './pdf-store.service.js';
import { PDFError } from './pdf.types.js';
import { pdfBodySchemas } from './pdf.schema.js';
import { AppErrors } from '../../types/errors.js';
import type { DocType, RenderResult } from './pdf.types.js';
import type { StoredDocType } from './pdf-store.service.js';

const BROCHURE_CACHE_TTL_MS = 10 * 60 * 1000;
const BROCHURE_CACHE_MAX_ENTRIES = 32;
const brochureCache = new Map<string, { result: RenderResult; expiresAt: number }>();
const brochureRenders = new Map<string, Promise<RenderResult>>();

function brochureCacheKey(payload: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

const STORED_DOC_TYPES = new Set<DocType>(['tds', 'msds', 'brochure']);

async function generateBrochure(
  payload: Record<string, unknown>,
): Promise<{ result: RenderResult; cacheStatus: 'HIT' | 'MISS' }> {
  const key = brochureCacheKey(payload);
  const now = Date.now();
  const cached = brochureCache.get(key);
  if (cached && cached.expiresAt > now) {
    return { result: cached.result, cacheStatus: 'HIT' };
  }
  if (cached) brochureCache.delete(key);

  const pending = brochureRenders.get(key);
  if (pending) return { result: await pending, cacheStatus: 'HIT' };

  const render = pdfService.generatePDF('brochure', payload);
  brochureRenders.set(key, render);
  try {
    const result = await render;
    brochureCache.set(key, { result, expiresAt: now + BROCHURE_CACHE_TTL_MS });
    while (brochureCache.size > BROCHURE_CACHE_MAX_ENTRIES) {
      const oldest = brochureCache.keys().next().value as string | undefined;
      if (!oldest) break;
      brochureCache.delete(oldest);
    }
    return { result, cacheStatus: 'MISS' };
  } finally {
    brochureRenders.delete(key);
  }
}

// ─── Filename helpers ─────────────────────────────────────────────────────────

const filenames: Record<DocType, (payload: Record<string, unknown>) => string> = {
  quotation: (p) => `quotation-${p['quotationNumber'] ?? 'draft'}.pdf`,
  tds:       (p) => `tds-${p['productCode'] ?? 'product'}.pdf`,
  msds:      (p) => `msds-${p['productCode'] ?? 'product'}.pdf`,
  brochure:  (p) => `brochure-${p['productName'] ?? 'product'}.pdf`,
  coa:       (p) => `coa-${p['batchNumber'] ?? 'batch'}.pdf`,
  batch:     (p) => `batch-${p['batchNumber'] ?? 'batch'}.pdf`,
  'investor-report': (p) => `investor-report-${p['from'] ?? ''}_to_${p['to'] ?? ''}.pdf`,
  letterhead: (p) => `letterhead-${p['referenceNo'] ?? 'draft'}.pdf`,
};

function pdfErrorReply(err: unknown, reply: FastifyReply): FastifyReply {
  if (err instanceof PDFError) {
    const status =
      err.code === 'TEMPLATE_NOT_FOUND' ? 404
      : err.code === 'INVALID_PAYLOAD'  ? 400
      : err.code === 'TIMEOUT'          ? 504
      : 500;
    return reply.code(status).send({ error: err.message, code: err.code });
  }
  return reply.code(500).send({ error: 'Internal server error' });
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function pdfRoutes(app: FastifyInstance): Promise<void> {
  const preHandler = [authenticate, requireAuth, requireSuperAdmin];

  async function sendPDF(
    docType: DocType,
    body: unknown,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const parsed = pdfBodySchemas[docType].safeParse(body);
    if (!parsed.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, details: parsed.error.flatten() });
    }
    const payload = parsed.data as Record<string, unknown>;

    // Pre-rendered copy from the deploy-time queue, served only on an exact payload match.
    const stored = STORED_DOC_TYPES.has(docType)
      ? await findStoredPdf(docType as StoredDocType, payload)
      : null;
    const generated: { result: RenderResult; cacheStatus: 'HIT' | 'MISS' | 'STORED' | null } = stored
      ? { result: stored, cacheStatus: 'STORED' }
      : docType === 'brochure'
        ? await generateBrochure(payload)
        : { result: await pdfService.generatePDF(docType, payload), cacheStatus: null };
    const { result, cacheStatus } = generated;
    if (!result.buffer) throw new PDFError('PDF buffer missing', 'RENDER_FAILED');
    const filename = filenames[docType](payload);
    return reply
      .code(200)
      .headers({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(result.buffer.length),
        'X-Generated-At': result.generatedAt,
        ...(cacheStatus ? { 'X-PDF-Cache': cacheStatus } : {}),
      })
      .send(result.buffer);
  }

  app.post<{ Body: unknown }>('/quotation', { preHandler }, async (request, reply) => {
    try { return await sendPDF('quotation', request.body, reply); }
    catch (err) { return pdfErrorReply(err, reply); }
  });

  app.post<{ Body: unknown }>('/tds', { preHandler }, async (request, reply) => {
    try { return await sendPDF('tds', request.body, reply); }
    catch (err) { return pdfErrorReply(err, reply); }
  });

  app.post<{ Body: unknown }>('/msds', { preHandler }, async (request, reply) => {
    try { return await sendPDF('msds', request.body, reply); }
    catch (err) { return pdfErrorReply(err, reply); }
  });

  app.post<{ Params: { productLine: string; docType: string }; Body: unknown }>(
    '/brochure/:productLine',
    { preHandler: [authenticate, requireAuth, checkProductAccess] },
    async (request, reply) => {
      try {
        const body = request.body as Record<string, unknown>;
        if (body?.['productLine'] !== request.params.productLine) {
          return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR });
        }
        return await sendPDF('brochure', request.body, reply);
      } catch (err) { return pdfErrorReply(err, reply); }
    },
  );

  // Same brochure as the PDF route, returned as a standalone HTML page (all
  // assets inlined) for viewing in a browser tab.
  app.post<{ Params: { productLine: string; docType: string }; Body: unknown }>(
    '/brochure/:productLine/html',
    { preHandler: [authenticate, requireAuth, checkProductAccess] },
    async (request, reply) => {
      try {
        const body = request.body as Record<string, unknown>;
        if (body?.['productLine'] !== request.params.productLine) {
          return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR });
        }
        const parsed = pdfBodySchemas.brochure.safeParse(body);
        if (!parsed.success) {
          return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, details: parsed.error.flatten() });
        }
        const html = await pdfService.renderHTML('brochure', parsed.data as Record<string, unknown>);
        return reply
          .code(200)
          .headers({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
          .send(html);
      } catch (err) { return pdfErrorReply(err, reply); }
    },
  );

  app.post<{ Body: unknown }>('/coa', { preHandler }, async (request, reply) => {
    try { return await sendPDF('coa', request.body, reply); }
    catch (err) { return pdfErrorReply(err, reply); }
  });

  app.post<{ Body: unknown }>('/batch', { preHandler }, async (request, reply) => {
    try { return await sendPDF('batch', request.body, reply); }
    catch (err) { return pdfErrorReply(err, reply); }
  });

  app.post<{ Body: unknown }>('/investor-report', { preHandler }, async (request, reply) => {
    try { return await sendPDF('investor-report', request.body, reply); }
    catch (err) { return pdfErrorReply(err, reply); }
  });

  app.post<{ Body: unknown }>('/letterhead', { preHandler }, async (request, reply) => {
    try { return await sendPDF('letterhead', request.body, reply); }
    catch (err) { return pdfErrorReply(err, reply); }
  });
}
