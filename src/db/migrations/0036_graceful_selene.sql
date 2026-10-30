CREATE TABLE IF NOT EXISTS "production_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid,
	"batch_id" uuid,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"payload" jsonb,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "work_order_id" uuid;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "client_request_id" text;--> statement-breakpoint
-- Already added by hand-written 0035 (no snapshot); kept idempotent.
ALTER TABLE "product_formulation_variants" ADD COLUMN IF NOT EXISTS "formula_overrides" jsonb;--> statement-breakpoint
ALTER TABLE "production_work_orders" ADD COLUMN "completion_reason" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_events" ADD CONSTRAINT "production_events_work_order_id_production_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."production_work_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_events" ADD CONSTRAINT "production_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_events_work_order_idx" ON "production_events" USING btree ("work_order_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_events_batch_idx" ON "production_events" USING btree ("batch_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batches" ADD CONSTRAINT "batches_work_order_id_production_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."production_work_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batches_work_order_id_idx" ON "batches" USING btree ("work_order_id");--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_client_request_id_unique" UNIQUE("client_request_id");