# DATABASE.md — macrocoats-api

Reference for the PostgreSQL schema and Drizzle migration workflow. See `CLAUDE.md` for request lifecycle, RBAC, and module-level behavior.

---

## Database schema

26 tables across `src/db/schema/`:

| Table | Purpose |
|---|---|
| `users` | User accounts; roles superadmin or company |
| `companies` | Client companies; holds `accessToken` + `tokenExpiresAt` for magic-link login |
| `company_product_access` | Junction: which products each company may view |
| `company_product_prices` | Per-company special pricing for specific products |
| `products` | Product line definitions (12 chemical products) |
| `product_documents` | TDS/MSDS/Formula/Label/COA per product (JSONB body); also carries `status`, `createdAt`, `updatedAt`, `updatedBy` |
| `document_audit_log` | Per-document history: created/updated/status_changed events, who, when, notes |
| `product_formulation_variants` | Product variant headers (e.g. customized formulations) |
| `formulation_variant_components` | Line items (materials) for formulation variants |
| `inventory_items` | Raw materials: price, stock, supplier, reorder threshold |
| `quotations` | Sales quotations with auto-generated UNIK-YYYY-NNN numbers |
| `quotation_line_items` | Line items in a quotation (FK → quotations, cascade delete) |
| `quotation_sequences` | Per-year atomic counter for quotation numbering |
| `batches` | Manufacturing batch records with formulation/label/cost snapshots; `batchType` column (`'Production'` \| `'Trial'`, default `'Production'`) |
| `batch_sequences` | Per-company per-day atomic counter for batch numbering |
| `access_log` | Audit trail: who accessed which product/docType, when, from where |
| `refresh_tokens` | Valid refresh token bcrypt hashes; null `revokedAt` = still valid |
| `employee_salary_records` | Staff salary payments and records |
| `staff` | Employee information |
| `vendors` | Vendor/supplier information |
| `vendor_material_prices` | Date-effective vendor pricing per inventory item; at most one currently-active row (`effective_to IS NULL`) per `(vendor, material)` |
| `purchase_entries` | Purchase receipts logged against an inventory item; `unitPrice` is the actual price paid, `suggestedUnitPrice`/`priceSource` retain what auto-lookup from `vendor_material_prices` returned for audit |
| `ingredient_hazard_profiles` | Reference dictionary mapping real raw-material names to IP-safe generic descriptions and GHS hazard data; used to sanitize TDS/MSDS composition sections for non-superadmin roles |
| `finished_goods` | Finished-goods inventory per batch: produced/dispatched/reserved quantities and status (`Available` → `Partially Dispatched` → `Fully Dispatched`, or `Cancelled`) |
| `dispatches` | Dispatch records against a batch/company, with transport details (JSONB) and void tracking (`voidedAt`/`voidReason`) |
| `dispatch_sequences` | Per-day atomic counter for dispatch numbering |

## Migration workflow (canonical)

Always use Drizzle's generator — **never hand-write migration SQL files**. Hand-written files are not registered in the Drizzle journal and cause schema drift and 500 errors.

```
# Correct flow for any schema change:
1. Edit the schema file in src/db/schema/
2. npm run db:generate   # generates a versioned migration file + updates journal
3. npm run db:migrate    # applies pending migrations
4. npm run seed          # re-seed if new tables were added
```

**Before generating a new migration:**
- Run `npm run db:studio` or inspect the DB to check if the column/table already exists — avoid duplicate-column errors from re-applying changes that were applied manually earlier.
- Check `src/db/migrations/` folder: every `.sql` file must have a matching entry in `src/db/migrations/meta/_journal.json`. If they are out of sync, resolve that before generating new migrations.

## Entity relationship rules

- **Staff** and **Vendors** are standalone entities — they are NOT linked to the `companies` table and have no FK to it.
- `companies` links only to: `users`, `company_product_access`, `quotations`, `batches`, `access_log`.
- When building new modules, confirm relationship assumptions before writing the schema — do not assume a new entity belongs to a company unless the user explicitly says so.

## Recovery from a failed migration

If a migration left tables partially created or the journal is out of sync:
1. Inspect actual DB state: `npm run db:studio`
2. Compare against `src/db/migrations/meta/_journal.json` to identify unregistered files
3. Use `npm run db:generate` to create a corrective migration — do not manually edit `.sql` files in `drizzle/`
4. As a last resort in dev only: `npm run db:reset` then `npm run db:migrate` then `npm run seed`
