ALTER TABLE "companies" ADD COLUMN "logo_storage_key" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "logo_mime_type" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "logo_updated_at" timestamp with time zone;