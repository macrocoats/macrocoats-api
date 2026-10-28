import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { products } from '../../db/schema/index.js';
import { env } from '../../config/env.js';
import { documentEvents, getDocument } from '../products/products.service.js';
import type { DocumentChange } from '../products/products.service.js';
import { pdfService } from './pdf.service.js';
import { pdfBodySchemas } from './pdf.schema.js';
import type { RenderResult } from './pdf.types.js';

// Pre-rendered TDS / MSDS / brochure PDFs on local disk, regenerated on every
// server start (i.e. every deploy). Jobs run one at a time with a pause in
// between so a full regeneration never competes with live PDF requests for
// the shared Puppeteer pool.
//
// Each file is named after a SHA-256 of the payload it was rendered from
// (`<productLine>/<docType>-<hash>.pdf`). The download routes hash the payload
// they receive and serve the stored file only on an exact match, so a variant,
// the internal view or a just-edited document always falls through to a live
// render instead of getting a stale copy.
//
// Saving or re-statusing a TDS/MSDS queues that product's affected PDFs again
// (`watchDocumentChanges`), so edits don't wait for the next deploy.

export type StoredDocType = 'tds' | 'msds' | 'brochure';
const STORED_DOC_TYPES: StoredDocType[] = ['tds', 'msds', 'brochure'];

const START_DELAY_MS = 10_000;
const JOB_GAP_MS     = 2_000;

interface Job { productLine: string; docType: StoredDocType }

// pino-compatible subset; the server passes app.log in at boot.
interface Logger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}
let logger: Logger = {
  info:  (obj, msg) => console.log(msg, obj),
  warn:  (obj, msg) => console.warn(msg, obj),
  error: (obj, msg) => console.error(msg, obj),
};

const queue: Job[] = [];
const queued = new Set<string>();
let draining: Promise<void> | null = null;
let stopped = false;

const jobKey = (job: Job) => `${job.productLine}:${job.docType}`;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms).unref());

/** JSON with object keys sorted, so the hash doesn't depend on key order. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const payloadHash = (payload: Record<string, unknown>) =>
  createHash('sha256').update(stableStringify(payload)).digest('hex');

const productDir = (productLine: string) => path.resolve(env.PDF_STORAGE_PATH, productLine);

function storedPdfPath(productLine: string, docType: StoredDocType, hash: string): string {
  return path.join(productDir(productLine), `${docType}-${hash}.pdf`);
}

/**
 * The stored PDF for this exact (validated) payload, or null when none was
 * rendered from it. `payload.productLine` is a validated product key.
 */
export async function findStoredPdf(docType: StoredDocType, payload: Record<string, unknown>): Promise<RenderResult | null> {
  const productLine = payload['productLine'];
  if (typeof productLine !== 'string') return null;
  const file = storedPdfPath(productLine, docType, payloadHash(payload));
  try {
    const [buffer, info] = await Promise.all([fs.readFile(file), fs.stat(file)]);
    return { buffer, generatedAt: info.mtime.toISOString() };
  } catch {
    return null;
  }
}

/**
 * Build the same payload the frontend sends for a download, from the
 * published base document (no variant, customer view). Returns null when the
 * document is missing or not published — drafts are never written to disk.
 */
async function buildPayload(productLine: string, docType: StoredDocType): Promise<Record<string, unknown> | null> {
  const [product] = await db.select().from(products).where(eq(products.key, productLine));
  if (!product) return null;

  const sourceDocType = docType === 'brochure' ? 'tds' : docType;
  const doc = await getDocument(productLine, sourceDocType) as Record<string, unknown> | null;
  if (!doc || doc['status'] !== 'published') return null;

  const header = {
    productName:  doc['productName'] ?? product.displayName,
    productLine,
    revision:     doc['revision'] ?? null,
    issueDate:    doc['issueDate'] ?? null,
    revisionDate: doc['revisionDate'] ?? null,
  };
  const sections = (doc['sections'] as Record<string, unknown> | undefined) ?? {};

  if (docType === 'tds') {
    return { ...header, productCode: doc['docNumber'] ?? '', description: doc['description'] ?? '', subtitle: product.subtitle, sections };
  }
  if (docType === 'msds') {
    return { ...header, productCode: doc['docNumber'] ?? '', signalWord: doc['signalWord'] ?? null, sections };
  }
  return {
    ...header,
    productCode: product.code,
    category:    product.category,
    subtitle:    product.subtitle,
    description: doc['description'] ?? '',
    accentColor: product.accentColor,
    sections,
  };
}

/** Delete a doc type's stored renders, except `keep`. */
async function removeStoredPdfs(productLine: string, docType: StoredDocType, keep?: string): Promise<void> {
  const dir = productDir(productLine);
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  for (const name of names) {
    const file = path.join(dir, name);
    if (name.startsWith(`${docType}-`) && name.endsWith('.pdf') && file !== keep) {
      await fs.rm(file, { force: true });
    }
  }
}

async function runJob(job: Job): Promise<void> {
  const payload = await buildPayload(job.productLine, job.docType);
  if (!payload) {
    await removeStoredPdfs(job.productLine, job.docType);
    logger.info(job, 'Stored PDF skipped — document missing or not published');
    return;
  }
  const parsed = pdfBodySchemas[job.docType].safeParse(payload);
  if (!parsed.success) {
    logger.warn({ ...job, issues: parsed.error.flatten() }, 'Stored PDF skipped — payload failed validation');
    return;
  }

  const validated = parsed.data as Record<string, unknown>;
  const result = await pdfService.generatePDF(job.docType, validated);
  if (!result.buffer) throw new Error('PDF buffer missing');

  // Write to a temp file and rename, so a reader never sees a half-written PDF,
  // then drop this doc type's older renders.
  const target = storedPdfPath(job.productLine, job.docType, payloadHash(validated));
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.mkdir(productDir(job.productLine), { recursive: true });
  await fs.writeFile(tmp, result.buffer);
  await fs.rename(tmp, target);
  await removeStoredPdfs(job.productLine, job.docType, target);
  logger.info({ ...job, bytes: result.buffer.length }, 'Stored PDF written');
}

function drain(): Promise<void> {
  draining ??= drainLoop().finally(() => { draining = null; });
  return draining;
}

async function drainLoop(): Promise<void> {
  while (!stopped && queue.length > 0) {
    const job = queue.shift()!;
    queued.delete(jobKey(job));
    try {
      await runJob(job);
    } catch (err) {
      logger.error({ ...job, err }, 'Stored PDF generation failed');
    }
    if (queue.length > 0) await sleep(JOB_GAP_MS);
  }
}

/** Resolves once every queued job has finished (immediately when idle). */
export function waitForStoredPdfQueue(): Promise<void> {
  return draining ?? Promise.resolve();
}

/** Queue one product document for (re)generation. Duplicate pending jobs are dropped. */
export function enqueueStoredPdf(productLine: string, docType: StoredDocType): void {
  if (stopped) return;
  const job = { productLine, docType };
  const key = jobKey(job);
  if (queued.has(key)) return;
  queued.add(key);
  queue.push(job);
  void drain();
}

/** Queue TDS, MSDS and brochure for every active product. */
export async function enqueueAllStoredPdfs(): Promise<number> {
  const rows = await db
    .select({ key: products.key })
    .from(products)
    .where(eq(products.active, true))
    .orderBy(asc(products.key));
  for (const { key } of rows) {
    for (const docType of STORED_DOC_TYPES) enqueueStoredPdf(key, docType);
  }
  return rows.length * STORED_DOC_TYPES.length;
}

let watching = false;

/** Re-render a product's stored PDFs whenever its TDS (also feeds the brochure) or MSDS changes. */
export function watchDocumentChanges(): void {
  if (watching) return;
  watching = true;
  documentEvents.on('changed', ({ productLine, docType }: DocumentChange) => {
    if (docType === 'tds') {
      enqueueStoredPdf(productLine, 'tds');
      enqueueStoredPdf(productLine, 'brochure');
    } else if (docType === 'msds') {
      enqueueStoredPdf(productLine, 'msds');
    }
  });
}

/** Called at boot: watch for edits, and regenerate everything after a short delay, off the startup path. */
export function scheduleStoredPdfRegeneration(log?: Logger): void {
  if (!env.PDF_PREGENERATE || env.NODE_ENV === 'test') return;
  if (log) logger = log;
  watchDocumentChanges();
  setTimeout(() => {
    enqueueAllStoredPdfs()
      .then((count) => logger.info({ count, dir: path.resolve(env.PDF_STORAGE_PATH) }, 'Stored PDF regeneration queued'))
      .catch((err) => logger.error({ err }, 'Stored PDF regeneration could not be queued'));
  }, START_DELAY_MS).unref();
}

/** Stop taking new jobs; the job in progress finishes or is cut off by browser shutdown. */
export function stopStoredPdfQueue(): void {
  stopped = true;
  queue.length = 0;
  queued.clear();
}
