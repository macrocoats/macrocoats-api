CREATE TABLE IF NOT EXISTS "document_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_document_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"notes" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_documents" ADD COLUMN "status" text DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_documents" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_audit_log" ADD CONSTRAINT "document_audit_log_product_document_id_product_documents_id_fk" FOREIGN KEY ("product_document_id") REFERENCES "public"."product_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_audit_log" ADD CONSTRAINT "document_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_audit_log_doc_idx" ON "document_audit_log" USING btree ("product_document_id","at");