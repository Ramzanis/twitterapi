CREATE TYPE "public"."ledger_bucket" AS ENUM('paid', 'bonus');--> statement-breakpoint
DROP INDEX "credit_ledger_org_id_idx";--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "bucket" "ledger_bucket" DEFAULT 'paid' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "last_balance_alert_dollars" integer;--> statement-breakpoint
CREATE INDEX "credit_ledger_org_bucket_id_idx" ON "credit_ledger" USING btree ("org_id","bucket","id" DESC NULLS LAST);--> statement-breakpoint
-- Backfill: classify existing entries into buckets. Bonus grants become bonus
-- credits; everything else (purchases, usage, refunds, adjustments) is paid.
UPDATE "credit_ledger" SET "bucket" = 'bonus' WHERE "type" = 'bonus';--> statement-breakpoint
-- balance_after_micros now means "balance of this bucket after this entry",
-- so recompute it as a running total partitioned by (org, bucket).
UPDATE "credit_ledger" AS l
SET "balance_after_micros" = r.running
FROM (
  SELECT "id", sum("amount_micros") OVER (
    PARTITION BY "org_id", "bucket" ORDER BY "id"
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running
  FROM "credit_ledger"
) AS r
WHERE r."id" = l."id";
