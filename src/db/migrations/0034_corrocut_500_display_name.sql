-- Custom SQL migration file, put your code below! --
-- Spelling fix: CORRUCUT 500 -> CORROCUT 500 (display name only; the key `corrucut-500` is unchanged).
-- No API endpoint edits products.display_name. Idempotent: matches only the old spelling.
UPDATE "products" SET "display_name" = 'CORROCUT 500' WHERE "key" = 'corrucut-500' AND "display_name" = 'CORRUCUT 500';
