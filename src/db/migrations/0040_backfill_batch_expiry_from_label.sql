-- 0033 added batches.expiry_date without a backfill, so every batch created
-- before it has NULL there even though its label snapshot carries an expiry.
-- The QC release gate reads the column, so those batches stayed blocked with
-- "No expiry date set" even after a passing CoA. Copy the label's ISO date
-- across; non-ISO values are left NULL rather than guessed.
UPDATE "batches"
SET "expiry_date" = "label_snapshot"->>'expiryDate'
WHERE "expiry_date" IS NULL
  AND "label_snapshot"->>'expiryDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
