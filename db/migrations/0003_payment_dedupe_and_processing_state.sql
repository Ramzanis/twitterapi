ALTER TYPE "public"."topup_status" ADD VALUE 'processing' BEFORE 'paid';--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "billing_provider" NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"signature_valid" boolean NOT NULL,
	"payload" jsonb,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "topup_requests" ADD COLUMN "amount_received_cents" integer;--> statement-breakpoint
ALTER TABLE "topup_requests" ADD COLUMN "currency" text DEFAULT 'usd' NOT NULL;--> statement-breakpoint
ALTER TABLE "topup_requests" ADD COLUMN "provider_payment_id" text;--> statement-breakpoint
ALTER TABLE "topup_requests" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_idx" ON "webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_created_idx" ON "webhook_events" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_source_id_idx" ON "credit_ledger" USING btree ("source_id") WHERE "credit_ledger"."source_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "topup_requests_provider_payment_idx" ON "topup_requests" USING btree ("provider_payment_id") WHERE "topup_requests"."provider_payment_id" is not null;