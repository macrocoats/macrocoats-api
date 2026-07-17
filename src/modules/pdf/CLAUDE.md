# CLAUDE.md — pdf module

Server-side PDF generation for quotations, TDS, MSDS, CoA, and batch documents. This module intentionally does **not** follow the standard `*.routes.ts` / `*.service.ts` / `*.schema.ts` 3-file pattern used elsewhere in `src/modules/` — do not use it as a template for new modules.

---

## Structure

```
pdf.routes.ts          Fastify routes: POST /pdf/quotation, /tds, /msds, /coa, /batch
pdf.service.ts         PDFService (singleton via getInstance()) — Puppeteer orchestration
template.service.ts    TemplateService (singleton via getInstance()) — Handlebars compilation
pdf.types.ts           Shared types for this module
test-render.ts         Standalone script to render a template to disk without going through Fastify — use for visually debugging a template change
helpers/
  currency.helper.ts      Handlebars helper: currency formatting
  date.helper.ts          Handlebars helper: date formatting
  handlebars.helpers.ts   Registers all helpers with the Handlebars instance
partials/
  company-info.hbs, footer.hbs, header.hbs, signature-block.hbs
styles/
  document.css            Shared CSS injected into every rendered template
templates/
  batch.hbs, coa.hbs, msds.hbs, quotation.hbs, tds.hbs
assets/
  macro-coats-logo.png    Embedded as a base64 data URI in the Puppeteer header
                          template (see `getLogoDataUri()` in pdf.service.ts) —
                          the `build` script must keep copying this dir to dist/
```

## Branded letterhead (TDS / MSDS / CoA)

`pdf.service.ts` has two header/footer variants gated by `BRANDED_LETTERHEAD_DOC_TYPES`
(currently `tds`, `msds`, `coa`): a branded variant (logo, "Metal Surface Treatment
Specialists" tagline, Email/Web only — no address/GST/phone, expanded footer with
"computer generated"/"Confidential"/Page X of Y) and the original plain variant for
every other doc type (`quotation`, `batch`, `salary`). When adding a doc type to the
branded set, verify the other doc types still render byte-identical to before —
`buildHeaderTemplate`/`buildFooterTemplate` branch on `opts.docType` precisely to
guarantee this.

## Service split

- **`template.service.ts`** — loads and compiles `.hbs` templates + partials, registers helpers, returns rendered HTML. Has no knowledge of Puppeteer or HTTP.
- **`pdf.service.ts`** — takes rendered HTML from `TemplateService`, drives Puppeteer to produce a PDF buffer, and is what `pdf.routes.ts` calls. Keep this split: template compilation and browser rendering are different failure modes and should stay testable independently (`test-render.ts` exercises `TemplateService` alone).

## Conventions

- Add a new document type by: adding a `.hbs` file to `templates/`, wiring a case in `pdf.service.ts`, and adding a route in `pdf.routes.ts` — follow the existing pattern for one of the five current types rather than inventing a new structure.
- Shared visual elements (company header, footer, signature block) belong in `partials/`, not duplicated inline in each template.
- CSS lives in `styles/document.css`, not inline `<style>` blocks in the `.hbs` files, so print-layout fixes apply consistently across all five document types.
- Currency and date formatting must go through `helpers/currency.helper.ts` / `helpers/date.helper.ts` — don't hand-format numbers/dates inside a template.
