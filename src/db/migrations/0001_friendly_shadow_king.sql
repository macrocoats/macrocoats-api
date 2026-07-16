ALTER TABLE "inventory_items" ADD COLUMN "stock_qty" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "low_stock_threshold" integer DEFAULT 10 NOT NULL;