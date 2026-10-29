ALTER TABLE "product_formulation_variants"
ADD COLUMN IF NOT EXISTS "formula_overrides" jsonb;
