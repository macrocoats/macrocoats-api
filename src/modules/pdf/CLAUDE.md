# CLAUDE.md — pdf module

Server-side PDF generation for quotations, TDS, MSDS, CoA, batch documents, the Investor Report, and the Company Letterhead. This module intentionally does **not** follow the standard `*.routes.ts` / `*.service.ts` / `*.schema.ts` 3-file pattern used elsewhere in `src/modules/` — do not use it as a template for new modules.

---

## Structure

```
pdf.routes.ts          Fastify routes: POST /pdf/quotation, /tds, /msds, /coa, /batch, /investor-report, /letterhead
pdf.service.ts         PDFService (singleton via getInstance()) — Puppeteer orchestration
template.service.ts    TemplateService (singleton via getInstance()) — Handlebars compilation
pdf.types.ts           Shared types for this module (aspirational — generatePDF's actual
                        payload is untyped Record<string, unknown>; these interfaces are
                        not enforced on the real tds/msds/coa payload shapes)
branding.constants.ts   Single source of truth for company name/address/GSTIN/phone/email/
                        website/CIN/ISO certification — imported by every header/footer
                        builder in pdf.service.ts instead of each one hardcoding its own
                        literal copy. `cin`/`isoCertification` are blank by default (not
                        fabricated) and only render in the Letterhead header when set.
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
  document.css            Shared CSS injected into every rendered template — `.ir-*` classes
                          near the end are scoped to investor-report.hbs only (cover page +
                          KPI grid have no prior equivalent); `.lh-*` classes (also near the
                          end) are scoped to letterhead.hbs's free-form `{{{bodyHtml}}}`
                          band only; everything else in either template reuses existing
                          `.doc-table`/`.sec-title`/`.callout`/`.doc-list`/`.sig-block`/
                          `.page-break`/`.info-cards` classes.
templates/
  batch.hbs, coa.hbs, msds.hbs, quotation.hbs, tds.hbs, investor-report.hbs, letterhead.hbs
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

## Header/footer: five treatments, gated by docType

`pdf.service.ts` picks one of five header/footer/margin treatments per `docType`:

1. **Print-matched** (`tds`, `msds` — `PRINT_MATCHED_DOC_TYPES`): `buildPrintMatchedHeader`/`buildPrintMatchedFooter` reproduce safteyDataSheet's `TDSPage.jsx`/`MSDSPage.jsx` print-to-PDF header/footer byte-for-byte (same px sizes, colors, copy — see "TDS/MSDS print parity" below). Margin: `26mm/16mm/14mm/14mm`.
2. **Legacy branded** (`coa` only — `LEGACY_BRANDED_DOC_TYPES`): `buildHeaderTemplate`/`buildFooterTemplate`'s branded branch — logo, tagline, Email/Web only, expanded footer with "computer generated"/"Confidential"/Page X of Y. Margin: `30mm/22mm/14mm/14mm`. This is CoA's own polished letterhead — do not merge it with the print-matched treatment above.
3. **Executive** (`investor-report` only — `EXECUTIVE_DOC_TYPES`): `buildExecutiveHeader`/`buildExecutiveFooter` — a taller band (logo + period line, no per-product doc-number meta since this isn't a per-product document) plus a "Confidential" footer tag distinct from CoA's "computer generated" copy. Margin: `32mm/20mm/16mm/16mm`. Added for the Investor Report; do not reuse for a per-product document type.
4. **Letterhead** (`letterhead` only — `LETTERHEAD_DOC_TYPES`): `buildLetterheadHeader`/`buildLetterheadFooter` — same visual weight as CoA's legacy-branded header (logo + legal name + tagline + address) plus optional GSTIN/CIN/ISO lines gated on `branding.constants.ts` fields being non-empty. No per-product doc-number meta — the letter's own date/reference-no/customer/subject/attention band renders inside the document body (`.info-cards` in `letterhead.hbs`), not the header. Margin: `30mm/22mm/14mm/14mm`.
5. **Plain** (`quotation`, `batch`, `salary`): `buildHeaderTemplate`/`buildFooterTemplate`'s non-branded branch — full company address/GSTIN/phone, unchanged from the module's original design.

All company name/address/GSTIN/phone/email/website/CIN/ISO strings in every treatment above come from `branding.constants.ts` — do not reintroduce a hardcoded literal copy when editing any of these builders.

`tds`/`msds`/`coa`/`investor-report`/`letterhead` (`WATERMARK_DOC_TYPES`) get the faint centered logo watermark via `wrapBody()`, independent of which header/footer treatment they use.

When adding a doc type to any of these sets, verify the other doc types still render byte-identical to before.

## Letterhead

`letterhead.hbs` renders the reference-info band (`.info-cards`, reused from `coa.hbs`'s pattern) → the letter body as raw pre-authored HTML (`{{{bodyHtml}}}`, styled by the `.lh-body` rules in `document.css`) → an optional signature block (`.sig-block`/`.sig-slot`, reused from `batch.hbs`/`quotation.hbs`, rendered only when `preparedBy` is set). `bodyHtml` arrives already `{{Variable}}`-resolved from the frontend's TipTap editor — unlike `msds`'s server-side derivation mirror, there is no server-side substitution step here since it's a plain string replace, not layout logic. The frontend's `downloadLetterheadPDF()` (`safteyDataSheet/src/services/pdfService.js`) posts the same `{ referenceNo, letterDate, customerName, companyName, subject, attention, preparedBy, approvedBy, designation, bodyHtml }` shape the `letterheads` module's document rows store.

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

## Investor Report

`investor-report.hbs` is a multi-page document (cover → executive summary → sales
analysis → forecast → final page) using `.page-break` between sections, not separate
Puppeteer calls — one `generatePDF('investor-report', payload)` call produces the whole
report. The frontend's `downloadInvestorReportPDF()` (`safteyDataSheet/src/services/pdfService.js`)
sends the raw `{ range, from, to, preparedBy, kpis, analytics, projections, insights }`
shape — the same objects `investorDashboardService.js`'s four GET calls already return —
so this is a read composition, not a new data source. `buildInvestorReportContext()` in
`pdf.service.ts`:
- Mirrors `ExecutiveInsightsRow.jsx`'s insight-sentence/severity derivation server-side
  (same precedent as `buildMsdsContext()`'s frontend-derivation mirroring) — if that
  component's wording or thresholds change, mirror the change here too.
- Precomputes `barPct` (0–100) on each ranked/trend row for the CSS-only bar visuals in
  the template, since Handlebars has no arithmetic beyond the `multiply` helper.
- Does **not** compute "Receivables" — this system has no accounting/invoicing layer
  (see root `CLAUDE.md`); the report shows `kpis.pendingOrderValue` labeled "Pending
  Order Value" instead, same as the on-screen dashboard.

## Service split

- **`template.service.ts`** — loads and compiles `.hbs` templates + partials, registers helpers, returns rendered HTML. Has no knowledge of Puppeteer or HTTP.
- **`pdf.service.ts`** — takes rendered HTML from `TemplateService`, drives Puppeteer to produce a PDF buffer, and is what `pdf.routes.ts` calls. Keep this split: template compilation and browser rendering are different failure modes and should stay testable independently (`test-render.ts` exercises `TemplateService` alone).

## Conventions

- Add a new document type by: adding a `.hbs` file to `templates/`, wiring a case in `pdf.service.ts`, and adding a route in `pdf.routes.ts` — follow the existing pattern for one of the current types rather than inventing a new structure.
- Shared visual elements (company header, footer, signature block) belong in `partials/`, not duplicated inline in each template.
- CSS lives in `styles/document.css`, not inline `<style>` blocks in the `.hbs` files, so print-layout fixes apply consistently across all five document types.
- Currency and date formatting must go through `helpers/currency.helper.ts` / `helpers/date.helper.ts` — don't hand-format numbers/dates inside a template.
