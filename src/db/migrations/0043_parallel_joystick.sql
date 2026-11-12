ALTER TABLE "companies" ADD COLUMN "zoho_customer_id" text;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_zoho_customer_id_unique" UNIQUE("zoho_customer_id");