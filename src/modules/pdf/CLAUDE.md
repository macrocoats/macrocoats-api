# CLAUDE.md — pdf module

Server-side PDF generation for quotations, TDS, MSDS, CoA, and batch documents. This module intentionally does **not** follow the standard `*.routes.ts` / `*.service.ts` / `*.schema.ts` 3-file pattern used elsewhere in `src/modules/` — do not use it as a template for new modules.

---

## Structure

```
pdf.routes.ts          Fastify routes: POST /pdf/quotation, /tds, /msds, /coa, /batch
pdf.service.ts         PDFService (singleton via getInstance()) — Puppeteer orchestration
template.service.ts    TemplateService (singleton via getInstance()) — Handlebars compilation
pdf.types.ts           Shared types for this module (aspirational — generatePDF's actual
                        payload is untyped Record<string, unknown>; these interfaces are
                        not enforced on the real tds/msds/coa payload shapes)
test-render.ts         Standalone script to render a template to disk without going through Fastify — use for visually debugging a template change
helpers/
  currency.helper.ts      Handlebars helper: currency formatting
  date.helper.ts          Handlebars helper: date formatting
  ghs-print.helper.ts     GHS pictogram SVGs + H/P hazard-statement parsing, ported
                          from safteyDataSheet's config/ghs.jsx and MSDSPage.jsx so
                          the downloaded MSDS PDF matches the frontend's rendering
  handlebars.helpers.ts   Registers all helpers with the Handlebars instance
partials/
  company-info.hbs, footer.hbs, header.hbs, signature-block.hbs
styles/
  document.css            Shared CSS injected into every rendered template
templates/
  batch.hbs, coa.hbs, msds.hbs, quotation.hbs, tds.hbs
assets/
  macro-coats-logo.png    Icon-only mark, embedded as a base64 data URI in the
                          Puppeteer header template (see `getLogoDataUri()` in
                          pdf.service.ts) — used for header logos only.
  p1.png                  Full lockup (icon + "MACRO COATS" wordmark), embedded
                          as a base64 data URI for the page watermark only (see
                          `getWatermarkDataUri()` in pdf.service.ts) — a
                          deliberately different asset from the header logo;
                          mirrors safteyDataSheet/src/assets/p1.png, which the
                          frontend's .print-watermark uses for the same reason.
                          The `build` script must keep copying this dir to dist/.
```

## Header/footer: three treatments, gated by docType

`pdf.service.ts` picks one of three header/footer/margin treatments per `docType`:

1. **Print-matched** (`tds`, `msds` — `PRINT_MATCHED_DOC_TYPES`): `buildPrintMatchedHeader`/`buildPrintMatchedFooter` reproduce safteyDataSheet's `TDSPage.jsx`/`MSDSPage.jsx` print-to-PDF header/footer byte-for-byte (same px sizes, colors, copy — see "TDS/MSDS print parity" below). Margin: `26mm/16mm/14mm/14mm`.
2. **Legacy branded** (`coa` only — `LEGACY_BRANDED_DOC_TYPES`): `buildHeaderTemplate`/`buildFooterTemplate`'s branded branch — logo, "Metal Surface Treatment Specialists" tagline, Email/Web only, expanded footer with "computer generated"/"Confidential"/Page X of Y. Margin: `30mm/22mm/14mm/14mm`. This is CoA's own polished letterhead — do not merge it with the print-matched treatment above.
3. **Plain** (`quotation`, `batch`, `salary`): `buildHeaderTemplate`/`buildFooterTemplate`'s non-branded branch — full company address/GSTIN/phone, unchanged from the module's original design.

All three of `tds`/`msds`/`coa` (`WATERMARK_DOC_TYPES`) get the faint centered logo watermark via `wrapBody()`, independent of which header/footer treatment they use.

When adding a doc type to any of these sets, verify the other doc types still render byte-identical to before.

## TDS/MSDS print parity

`tds.hbs`/`msds.hbs` bodies, the print-matched header/footer, and the
`.tds-print-*`/`.msds-print-*` classes in `document.css` are a deliberate port
of safteyDataSheet's `TDSPage.jsx`/`MSDSPage.jsx` print-only JSX and
`documents.css` — same sections, same order, same copy, same colors —
so **Download PDF** produces the same document as **Print** on those two
pages. Consequences of that design choice:

- The old generic elements (gradient title banner, compliance ribbon,
  meta-table, signature/authorization block) are intentionally **not**
  rendered for `tds`/`msds` — print doesn't have them either. `coa`,
  `quotation`, and `batch` still use those shared `document.css` classes
  normally.
- `msds.hbs` needs data the frontend derives client-side
  (`parseStatements`, `pGroups`, `isSimpleComposition`, the physical-properties
  pairing, the signal-word default). `buildMsdsContext()` in `pdf.service.ts`
  recomputes all of it server-side from the same raw `sections` payload the
  frontend sends, and injects it into the template context as `hStmts`,
  `pGroupsPrevention`/`Response`/`Storage`/`Disposal`, `isSimpleComposition`,
  `physicalPaired`, `effectiveSignalWord`, `sections11to16Entries`. If
  `MSDSPage.jsx`'s derivation logic changes, mirror the change in
  `buildMsdsContext()` too — the two must stay in sync.
- GHS hazard pictograms are rendered via the `ghsDiamond` Handlebars helper
  (`helpers/ghs-print.helper.ts`, registered in `handlebars.helpers.ts`),
  which returns the same inline SVG diamonds as `GHS_PRINT_DIAMOND` in
  `safteyDataSheet/src/config/ghs.jsx`. Keep the two in sync if a pictogram
  is added/changed on the frontend.
- Puppeteer's `headerTemplate`/`footerTemplate` repeat on every PDF page,
  whereas the frontend's header appears once (normal content flow) and its
  footer repeats (`position: fixed`) — this is an accepted, minor difference
  from the print output, not a bug.
- Because `.tds-print-*`/`.msds-print-*` class names don't collide with any
  other class in `document.css`, that section is safe to edit without
  affecting `quotation.hbs`/`batch.hbs`/`coa.hbs`.

## Service split

- **`template.service.ts`** — loads and compiles `.hbs` templates + partials, registers helpers, returns rendered HTML. Has no knowledge of Puppeteer or HTTP.
- **`pdf.service.ts`** — takes rendered HTML from `TemplateService`, drives Puppeteer to produce a PDF buffer, and is what `pdf.routes.ts` calls. Keep this split: template compilation and browser rendering are different failure modes and should stay testable independently (`test-render.ts` exercises `TemplateService` alone).

## Conventions

- Add a new document type by: adding a `.hbs` file to `templates/`, wiring a case in `pdf.service.ts`, and adding a route in `pdf.routes.ts` — follow the existing pattern for one of the five current types rather than inventing a new structure.
- Shared visual elements (company header, footer, signature block) belong in `partials/`, not duplicated inline in each template.
- CSS lives in `styles/document.css`, not inline `<style>` blocks in the `.hbs` files, so print-layout fixes apply consistently across all five document types.
- Currency and date formatting must go through `helpers/currency.helper.ts` / `helpers/date.helper.ts` — don't hand-format numbers/dates inside a template.
