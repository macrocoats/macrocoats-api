CREATE TABLE IF NOT EXISTS "company_formula_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "variant_id" uuid NOT NULL,
  "product_key" text NOT NULL,
  "is_default_for_company" boolean DEFAULT false NOT NULL,
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "assigned_by" uuid
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_formula_assignments" ADD CONSTRAINT "company_formula_assignments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_formula_assignments" ADD CONSTRAINT "company_formula_assignments_variant_id_product_formulation_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_formulation_variants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_formula_assignments" ADD CONSTRAINT "company_formula_assignments_product_key_products_key_fk" FOREIGN KEY ("product_key") REFERENCES "public"."products"("key") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_formula_assignments" ADD CONSTRAINT "company_formula_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cfa_company_variant_unique" ON "company_formula_assignments" USING btree ("company_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cfa_company_product_default_unique" ON "company_formula_assignments" USING btree ("company_id","product_key") WHERE is_default_for_company = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cfa_company_id_idx" ON "company_formula_assignments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cfa_variant_id_idx" ON "company_formula_assignments" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cfa_product_key_idx" ON "company_formula_assignments" USING btree ("product_key");--> statement-breakpoint

INSERT INTO "company_formula_assignments" ("company_id", "variant_id", "product_key", "is_default_for_company")
SELECT v."company_id", v."id", v."product_key", v."is_default"
FROM "product_formulation_variants" v
WHERE v."company_id" IS NOT NULL
ON CONFLICT ("company_id", "variant_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "company_product_access" ("company_id", "product_key")
SELECT DISTINCT a."company_id", a."product_key"
FROM "company_formula_assignments" a
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "product_formulation_variants"
SET "is_default" = false
WHERE "company_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "product_formulation_variants"
SET "company_id" = NULL
WHERE "company_id" IS NOT NULL;
--> statement-breakpoint

WITH inserted AS (
  INSERT INTO "product_formulation_variants" ("product_key", "company_id", "variant_name", "is_default", "status")
  SELECT d."product_key", NULL, 'Base Formula', true, 'approved'
  FROM "product_documents" d
  WHERE d."doc_type" = 'formula'
    AND NOT EXISTS (
      SELECT 1
      FROM "product_formulation_variants" v
      WHERE v."product_key" = d."product_key"
        AND v."company_id" IS NULL
        AND v."is_default" = true
    )
  RETURNING "id", "product_key"
)
INSERT INTO "formulation_variant_components" ("variant_id", "material_name", "percentage", "unit", "sort_order")
SELECT
  inserted."id",
  component.value ->> 'name',
  CASE
    WHEN component.value ->> 'percentWV' IS NULL THEN NULL
    ELSE (component.value ->> 'percentWV')::numeric
  END,
  CASE WHEN lower(component.value ->> 'unit') = 'kg' THEN 'Kg' ELSE 'L' END,
  component.ordinality::integer - 1
FROM inserted
JOIN "product_documents" d
  ON d."product_key" = inserted."product_key"
 AND d."doc_type" = 'formula'
JOIN LATERAL json_array_elements(d."body" -> 'composition') WITH ORDINALITY AS component(value, ordinality)
  ON true;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pfv_product_global_default_unique" ON "product_formulation_variants" USING btree ("product_key") WHERE is_default = true AND company_id IS NULL;
