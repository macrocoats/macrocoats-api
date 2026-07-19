import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js';
import { pdfService } from './pdf.service.js';
import { PDFError } from './pdf.types.js';
import type { DocType } from './pdf.types.js';

// ─── Filename helpers ─────────────────────────────────────────────────────────

const filenames: Record<DocType, (payload: Record<string, unknown>) => string> = {
  quotation: (p) => `quotation-${p['quotationNumber'] ?? 'draft'}.pdf`,
  tds:       (p) => `tds-${p['productCode'] ?? 'product'}.pdf`,
  msds:      (p) => `msds-${p['productCode'] ?? 'product'}.pdf`,
  coa:       (p) => `coa-${p['batchNumber'] ?? 'batch'}.pdf`,
  batch:     (p) => `batch-${p['batchNumber'] ?? 'batch'}.pdf`,
  salary:    (p) => `salary-${p['employeeId'] ?? 'staff'}.pdf`,
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
    payload: Record<string, unknown>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const result = await pdfService.generatePDF(docType, payload);
    if (!result.buffer) throw new PDFError('PDF buffer missing', 'RENDER_FAILED');
    const filename = filenames[docType](payload);
    return reply
      .code(200)
      .headers({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(result.buffer.length),
        'X-Generated-At': result.generatedAt,
      })
      .send(result.buffer);
  }

  app.post<{ Body: Record<string, unknown> }>('/quotation', { preHandler }, async (request, reply) => {
    try { return await sendPDF('quotation', request.body, reply); }
    catch (err) { return pdfErrorReply(err, reply); }
  });

  app.post<{ Body: Record<string, unknown> }>('/tds', { preHandler }, async (request, reply) => {
    try { return await sendPDF('tds', request.body, reply); }
    catch (err) { return pdfErrorReply(err, reply); }
  });

  app.post<{ Body: Record<string, unknown> }>('/msds', { preHandler }, async (request, reply) => {
    try { return await sendPDF('msds', request.body, reply); }
    catch (err) { return pdfErrorReply(err, reply); }
  });

  app.post<{ Body: Record<string, unknown> }>('/coa', { preHandler }, async (request, reply) => {
    try { return await sendPDF('coa', request.body, reply); }
    catch (err) { return pdfErrorReply(err, reply); }
  });

  app.post<{ Body: Record<string, unknown> }>('/batch', { preHandler }, async (request, reply) => {
    try { return await sendPDF('batch', request.body, reply); }
    catch (err) { return pdfErrorReply(err, reply); }
  });

  app.post<{ Body: Record<string, unknown> }>('/investor-report', { preHandler }, async (request, reply) => {
    try { return await sendPDF('investor-report', request.body, reply); }
    catch (err) { return pdfErrorReply(err, reply); }
  });

  app.post<{ Body: Record<string, unknown> }>('/letterhead', { preHandler }, async (request, reply) => {
    try { return await sendPDF('letterhead', request.body, reply); }
    catch (err) { return pdfErrorReply(err, reply); }
  });
}
