import fs from 'node:fs/promises';
import path from 'node:path';
import Handlebars from 'handlebars';
import { registerHelpers } from './helpers/handlebars.helpers.js';
import { PDFError } from './pdf.types.js';
import type { DocType } from './pdf.types.js';

const TEMPLATES_DIR = path.resolve(__dirname, 'templates');
const PARTIALS_DIR  = path.resolve(__dirname, 'partials');
const STYLES_DIR    = path.resolve(__dirname, 'styles');

class TemplateService {
  private static instance: TemplateService;
  private templateCache = new Map<string, HandlebarsTemplateDelegate>();
  private cssCache: string | null = null;
  private ready = false;

  private constructor() {}

  static getInstance(): TemplateService {
    if (!TemplateService.instance) TemplateService.instance = new TemplateService();
    return TemplateService.instance;
  }

  async init(): Promise<void> {
    if (this.ready) return;
    registerHelpers();
    await this.loadPartials();
    this.ready = true;
  }

  private async loadPartials(): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(PARTIALS_DIR);
    } catch {
      return; // partials dir optional
    }
    await Promise.all(
      entries
        .filter((f) => f.endsWith('.hbs'))
        .map(async (file) => {
          const name = path.basename(file, '.hbs');
          const src = await fs.readFile(path.join(PARTIALS_DIR, file), 'utf-8');
          Handlebars.registerPartial(name, src);
        }),
    );
  }

  async renderTemplate(docType: DocType, data: Record<string, unknown>): Promise<string> {
    await this.init();
    const tmpl = await this.getTemplate(docType);
    return tmpl(data);
  }

  private async getTemplate(docType: DocType): Promise<HandlebarsTemplateDelegate> {
    const isDev = process.env['NODE_ENV'] !== 'production';
    if (!isDev && this.templateCache.has(docType)) return this.templateCache.get(docType)!;

    const filePath = path.join(TEMPLATES_DIR, `${docType}.hbs`);
    let src: string;
    try {
      src = await fs.readFile(filePath, 'utf-8');
    } catch {
      throw new PDFError(`Template not found: ${docType}.hbs`, 'TEMPLATE_NOT_FOUND');
    }
    const compiled = Handlebars.compile(src);
    if (!isDev) this.templateCache.set(docType, compiled);
    return compiled;
  }

  async getCSS(): Promise<string> {
    const isDev = process.env['NODE_ENV'] !== 'production';
    if (!isDev && this.cssCache) return this.cssCache;
    const cssPath = path.join(STYLES_DIR, 'document.css');
    try {
      this.cssCache = await fs.readFile(cssPath, 'utf-8');
    } catch {
      this.cssCache = '';
    }
    return this.cssCache;
  }

  bustCache(docType?: DocType): void {
    if (docType) {
      this.templateCache.delete(docType);
    } else {
      this.templateCache.clear();
      this.cssCache = null;
    }
  }
}

export const templateService = TemplateService.getInstance();
