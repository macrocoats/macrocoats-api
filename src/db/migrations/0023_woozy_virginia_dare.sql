CREATE TABLE IF NOT EXISTS "letterhead_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"body_html" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "letterhead_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid,
	"reference_no" text,
	"letter_date" text,
	"customer_name" text,
	"company_name" text,
	"subject" text,
	"attention" text,
	"prepared_by" text,
	"approved_by" text,
	"designation" text,
	"body_html" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_document_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "letterhead_templates" ADD CONSTRAINT "letterhead_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "letterhead_documents" ADD CONSTRAINT "letterhead_documents_template_id_letterhead_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."letterhead_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "letterhead_documents" ADD CONSTRAINT "letterhead_documents_supersedes_document_id_letterhead_documents_id_fk" FOREIGN KEY ("supersedes_document_id") REFERENCES "public"."letterhead_documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "letterhead_documents" ADD CONSTRAINT "letterhead_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "letterhead_documents_template_id_idx" ON "letterhead_documents" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "letterhead_documents_supersedes_idx" ON "letterhead_documents" USING btree ("supersedes_document_id");