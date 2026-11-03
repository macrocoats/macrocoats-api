ALTER TABLE "inventory_items" ALTER COLUMN "stock_qty" SET DATA TYPE numeric(14, 3);--> statement-breakpoint
ALTER TABLE "inventory_movements" ALTER COLUMN "lot_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "inventory_item_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_movements_item_idx" ON "inventory_movements" USING btree ("inventory_item_id");