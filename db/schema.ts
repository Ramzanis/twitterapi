import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Enums
export const orgStatus = pgEnum("org_status", ["active", "suspended", "closed"]);
export const planCode = pgEnum("plan_code", ["free", "payg", "teams", "scale"]);
export const billingProvider = pgEnum("billing_provider", ["stripe", "revolut", "manual"]);
export const memberRole = pgEnum("member_role", ["owner", "admin", "member"]);
export const keyEnvironment = pgEnum("key_environment", ["live", "test"]);
export const keyStatus = pgEnum("key_status", ["active", "revoked"]);
export const ledgerType = pgEnum("ledger_type", ["purchase", "bonus", "usage", "refund", "adjustment"]);
// Paid credits are deferred revenue and a real liability; bonus credits are
// marketing spend with no cost basis. They are consumed bonus-first and are
// reported separately, so the balance is tracked per bucket.
export const ledgerBucket = pgEnum("ledger_bucket", ["paid", "bonus"]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "succeeded", "failed", "timed_out"]);
/**
 * `pending`    — waiting for the customer to pay.
 * `processing` — the gateway says money is moving but it hasn't settled;
 *                bank transfers and SEPA direct debits sit here for days.
 * `paid`       — credited to the ledger.
 */
export const topupStatus = pgEnum("topup_status", [
  "pending",
  "processing",
  "paid",
  "cancelled",
]);

// ── Identity ──────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  googleSub: text("google_sub").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  isStaff: boolean("is_staff").notNull().default(false),
  tosVersion: text("tos_version"),
  tosAcceptedAt: timestamp("tos_accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: orgStatus("status").notNull().default("active"),
  planCode: planCode("plan_code").notNull().default("free"),
  planOverrides: jsonb("plan_overrides"),
  billingProvider: billingProvider("billing_provider").notNull().default("manual"),
  billingCustomerId: text("billing_customer_id"),
  spendCapCents: integer("spend_cap_cents"),
  spendAlertThresholds: integer("spend_alert_thresholds").array(),
  hardStop: boolean("hard_stop").notNull().default(false),
  /**
   * Lowest balance threshold (in whole dollars) already warned about. Without
   * this, a cron re-sends the same warning on every tick; it resets to null on
   * any purchase so a customer who tops up gets warned again next time.
   */
  lastBalanceAlertDollars: integer("last_balance_alert_dollars"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    role: memberRole("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.userId] }),
    // The PK covers org lookups; this one answers "which orgs is this user in".
    index("organization_members_user_idx").on(t.userId),
  ],
);

// ── API access ────────────────────────────────────────────────────────

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    // Unique already gives us the index the auth hot path looks up on.
    keyHash: text("key_hash").notNull().unique(),
    environment: keyEnvironment("environment").notNull().default("live"),
    status: keyStatus("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("api_keys_org_idx").on(t.orgId)],
);

// ── Streams ───────────────────────────────────────────────────────────

/**
 * What an organization wants the stream to deliver. `value` is the topic the
 * upstream filters on; `tag` is the customer's own label, echoed back on every
 * matching post so one connection can serve several consumers. Rules belong to
 * the org rather than to a key, so rotating a key doesn't lose them.
 */
export const streamRules = pgTable(
  "stream_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    value: text("value").notNull(),
    tag: text("tag"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("stream_rules_org_value_idx").on(t.orgId, t.value)],
);

// ── Money ─────────────────────────────────────────────────────────────

// Append-only; source of truth for balance. Debits happen in the same
// transaction as the api_requests insert, with the org row locked.
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    amountMicros: bigint("amount_micros", { mode: "number" }).notNull(),
    type: ledgerType("type").notNull(),
    bucket: ledgerBucket("bucket").notNull().default("paid"),
    /** Free text for humans: an invoice note, a request id, a bank reference. */
    reference: text("reference"),
    /**
     * The external event that caused this entry — a topup_request id, or a
     * gateway payment id. Unique when present, which makes a double-credit
     * impossible at the database level no matter what the application does.
     * Null for entries with no external cause (manual staff adjustments),
     * which the partial index leaves unconstrained.
     */
    sourceId: text("source_id"),
    /** Balance of this row's bucket after the entry. */
    balanceAfterMicros: bigint("balance_after_micros", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Balance is the newest row per (org, bucket), read on every billable request.
    index("credit_ledger_org_bucket_id_idx").on(t.orgId, t.bucket, t.id.desc()),
    uniqueIndex("credit_ledger_source_id_idx")
      .on(t.sourceId)
      .where(sql`${t.sourceId} is not null`),
  ],
);

/**
 * A customer's request to add credits. While billing is manual this is the
 * work queue: the customer raises one, pays by transfer quoting `reference`,
 * and staff mark it paid — which appends the ledger entry. When a payment
 * provider is wired up, its webhook marks the same row paid instead, so the
 * fulfilment path does not change.
 */
export const topupRequests = pgTable(
  "topup_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    requestedBy: uuid("requested_by").references(() => users.id),
    /** What the customer asked to add. */
    amountCents: integer("amount_cents").notNull(),
    /**
     * What the gateway actually captured — credit THIS, not the request.
     * They diverge on currency conversion, fees deducted at source, or a
     * customer simply transferring a different number.
     */
    amountReceivedCents: integer("amount_received_cents"),
    currency: text("currency").notNull().default("usd"),
    status: topupStatus("status").notNull().default("pending"),
    provider: billingProvider("provider").notNull().default("manual"),
    /** The gateway's payment id (pi_…), so two events about one payment dedupe. */
    providerPaymentId: text("provider_payment_id"),
    /** Short code the customer quotes on their transfer. */
    reference: text("reference").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by").references(() => users.id),
    /** Set when the reconciliation job last asked the gateway about this. */
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  },
  (t) => [
    index("topup_requests_org_idx").on(t.orgId, t.createdAt.desc()),
    // The staff queue and the reconciliation sweep: unsettled, oldest first.
    index("topup_requests_status_idx").on(t.status, t.createdAt),
    uniqueIndex("topup_requests_provider_payment_idx")
      .on(t.providerPaymentId)
      .where(sql`${t.providerPaymentId} is not null`),
  ],
);

/**
 * Every webhook delivery, kept for dedupe and for arguing about payments six
 * weeks later. `(provider, event_id)` is unique: a retried delivery carries the
 * same event id, so inserting first and treating a conflict as "already seen"
 * makes handling idempotent for every event type, not just crediting ones.
 */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: billingProvider("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    signatureValid: boolean("signature_valid").notNull(),
    payload: jsonb("payload"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("webhook_events_provider_event_idx").on(t.provider, t.eventId),
    index("webhook_events_created_idx").on(t.createdAt.desc()),
  ],
);

// ── Usage ─────────────────────────────────────────────────────────────

export const apiRequests = pgTable(
  "api_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull(),
    apiKeyId: uuid("api_key_id").notNull(),
    endpoint: text("endpoint").notNull(),
    statusCode: integer("status_code").notNull(),
    creditsCostMicros: integer("credits_cost_micros").notNull().default(0),
    latencyMs: integer("latency_ms"),
    cacheHit: boolean("cache_hit").notNull().default(false),
    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Every dashboard and admin query filters by org over a time window; the
  // second index supports the platform-wide aggregates and the purge job.
  (t) => [
    index("api_requests_org_created_idx").on(t.orgId, t.createdAt.desc()),
    index("api_requests_created_idx").on(t.createdAt.desc()),
  ],
);

// ── Scraper pipeline ──────────────────────────────────────────────────

export const fetchJobs = pgTable(
  "fetch_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").references(() => apiRequests.id),
    providerCode: text("provider_code").notNull(),
    endpoint: text("endpoint").notNull(),
    params: jsonb("params").notNull(),
    paramsHash: text("params_hash").notNull(),
    status: jobStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    upstreamCostMicros: integer("upstream_cost_micros"),
  },
  // The first index is the queue claim (status='queued' order by queued_at,
  // FOR UPDATE SKIP LOCKED); the second is provider cost reconciliation.
  (t) => [
    index("fetch_jobs_status_queued_idx").on(t.status, t.queuedAt),
    index("fetch_jobs_provider_idx").on(t.providerCode, t.queuedAt.desc()),
  ],
);

export const responseCache = pgTable(
  "response_cache",
  {
    paramsHash: text("params_hash").primaryKey(),
    endpoint: text("endpoint").notNull(),
    payload: jsonb("payload").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    hitCount: integer("hit_count").notNull().default(0),
  },
  // Supports the expiry sweep.
  (t) => [index("response_cache_expires_idx").on(t.expiresAt)],
);

// ── Activity ──────────────────────────────────────────────────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orgId: uuid("org_id"),
    actorUserId: uuid("actor_user_id"), // null = system action
    action: text("action").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_org_idx").on(t.orgId, t.id.desc()),
    // Also read as a global feed in the admin console.
    index("audit_logs_action_idx").on(t.action, t.id.desc()),
  ],
);
