# Database architecture

Data model and storage plan for Skylark: a third-party X/Twitter data API. Customers call our API; we serve from cache or dispatch the request to a scraper / third-party data collector, return the result, meter the usage, and bill per call.

## Recommended stack

| Concern | Store | Why |
|---|---|---|
| Core relational data | **PostgreSQL** | Accounts, keys, plans, billing, jobs — transactional integrity matters |
| Raw request log | Postgres **partitioned by day** (pg_partman / Timescale); move to **ClickHouse** past ~tens of millions rows/month | High write volume, mostly append-only, queried in aggregate |
| Rate limiting, quotas, queues, provider health | **Redis** | Sub-ms counters (token bucket per key), job queue (BullMQ) or SQS |
| Large response payloads | **S3** (DB stores a pointer) | Keeps Postgres lean |
| Billing source of truth | **Stripe** (mirrored locally for display) | Don't rebuild invoicing, taxes, dunning |

## Entities

### 1. Identity & accounts

**users** — from Google OAuth
- `id` uuid PK, `google_sub` unique (stable Google subject id — key on this, not email), `email`, `email_verified`, `name`, `avatar_url`, `created_at`, `last_login_at`, `deleted_at` (soft delete for GDPR flow)

**organizations** — billing/usage always hangs off an org, never a user (industry pattern: GitHub, Vercel, Stripe). Every user gets a personal org on signup; the Teams plan just adds members. This avoids a painful user→team migration later.
- `id` uuid PK, `name`, `slug` unique, `created_at`

**organization_members**
- `org_id` FK, `user_id` FK, `role` enum(`owner`,`admin`,`member`,`billing`), `created_at` — PK (org_id, user_id)

### 2. API access

**api_keys** — never store the plaintext key; store a hash and a display prefix
- `id` uuid PK, `org_id` FK, `name`, `key_prefix` (e.g. `sk_live_a1b2…`, for the dashboard), `key_hash` (SHA-256), `scopes` text[], `status` enum(`active`,`revoked`), `created_by` FK users, `last_used_at`, `expires_at`, `revoked_at`

### 3. Plans, subscriptions & billing

**plans** — catalog, one row per tier. Answers "what plan is this client on and what are they entitled to".
- `id` PK, `code` unique enum-ish (`free`, `payg`, `teams`, `scale`), `name`, `monthly_price_cents`, `included_credits`, `rate_limit_rps`, `max_api_keys`, `max_seats`, `features` jsonb, `is_active`

**subscriptions** — one active row per org; state machine driven by Stripe webhooks
- `id` PK, `org_id` FK, `plan_id` FK, `status` enum(`trialing`,`active`,`past_due`,`canceled`,`paused`), `stripe_customer_id`, `stripe_subscription_id`, `current_period_start/end`, `cancel_at_period_end`, `created_at`

**credit_ledger** — append-only; the source of truth for balance (never a mutable `balance` column — ledgers are auditable and race-safe)
- `id` bigserial PK, `org_id` FK, `amount_micros` (+ purchase / − usage), `type` enum(`purchase`,`bonus`,`usage`,`refund`,`adjustment`), `reference` (request_id / stripe invoice id), `balance_after_micros`, `created_at`

**spend_limits** — the "spend cap you set" from the landing page
- `org_id` PK/FK, `monthly_cap_cents`, `alert_thresholds` int[] (e.g. 50/80/100%), `hard_stop` bool

**invoices** — read-only mirror of Stripe invoices for the dashboard.

Per-org entitlement overrides for custom enterprise deals: **entitlement_overrides** (`org_id`, `feature`, `value` jsonb) — resolved at request time as plan defaults + overrides, cached in Redis.

### 4. Usage metering

**api_requests** — one row per API call; partitioned by day, raw rows purged after ~90 days (rollups kept forever)
- `id` ulid PK, `org_id`, `api_key_id`, `endpoint`, `method`, `status_code`, `credits_cost_micros`, `latency_ms`, `provider_id` (nullable), `cache_hit` bool, `ip_hash`, `created_at`

**usage_rollups_daily** (and hourly) — powers the usage dashboard and quota checks cheaply
- `org_id`, `api_key_id`, `endpoint`, `period` date, `request_count`, `error_count`, `credits_spent_micros`, `p50_latency_ms`, `p95_latency_ms` — PK (org_id, api_key_id, endpoint, period)

Live rate limiting is **not** a table: Redis token bucket keyed by `api_key_id`, config read from the plan.

### 5. Scraper / provider pipeline

**providers** — the scrapers / third-party collectors we buy data from
- `id` PK, `name`, `kind` enum(`scraper`,`third_party_api`), `base_url`, `priority`, `status` enum(`healthy`,`degraded`,`down`), `cost_per_call_micros`, `rate_limit_rps`

**fetch_jobs** — one row per upstream fetch; links customer request to upstream work
- `id` ulid PK, `request_id` FK api_requests, `org_id`, `provider_id` FK, `endpoint`, `params` jsonb, `params_hash`, `status` enum(`queued`,`running`,`succeeded`,`failed`,`timed_out`), `attempts`, `max_attempts`, `error`, `queued_at`, `started_at`, `finished_at`, `upstream_latency_ms`, `upstream_cost_micros`

**response_cache** — dedupes identical queries within a TTL; your biggest margin lever (a cache hit costs you nothing upstream but still bills the customer)
- `params_hash` PK, `endpoint`, `payload` jsonb or S3 pointer, `fetched_at`, `expires_at`, `hit_count`

### 6. Delivery (streams & webhooks)

- **stream_rules**: `id`, `org_id`, `rule`, `status`
- **webhook_endpoints**: `id`, `org_id`, `url`, `secret`, `events` text[], `status`
- **webhook_deliveries**: `id`, `endpoint_id`, `event`, `payload_ref`, `status`, `attempts`, `next_retry_at`, `delivered_at`

### 7. Ops & compliance (industry-standard additions)

- **audit_logs** — `org_id`, `actor_user_id`, `action`, `target`, `ip`, `metadata` jsonb, `created_at`. Table stakes for Teams/enterprise plans.
- **idempotency_keys** — `key` PK, `org_id`, `request_hash`, `response_ref`, `expires_at`. Lets customers safely retry writes; Stripe popularized this and API customers expect it.
- Data retention: purge raw `api_requests` and cached payloads on a schedule; a hard-delete job for GDPR erasure that walks users → personal org → keys/ledger (keep anonymized ledger rows for accounting).

## Request lifecycle (how the pieces connect)

1. Request arrives with an API key → hash lookup in `api_keys` → resolves org, plan, subscription status (cached in Redis).
2. Redis checks: rate limit (token bucket from plan), credit balance, spend cap. Reject with 402/429 if exceeded.
3. `response_cache` lookup by `params_hash`. **Hit:** serve immediately, log `api_requests` row with `cache_hit=true`, append usage to `credit_ledger`.
4. **Miss:** enqueue `fetch_job` → worker picks a provider by priority + health → calls the scraper/third-party → writes result to cache → responds to customer.
5. `api_requests` row + ledger entry written; hourly job folds raw rows into `usage_rollups_*`.
6. Stripe webhooks keep `subscriptions` current; a monthly job invoices metered usage (or credits are decremented in real time for prepaid).

## How plan tracking answers "what plan is this client on?"

`org → subscriptions (status=active) → plans.code` gives free/payg/teams/scale. Entitlements (rate limit, seats, endpoints) come from `plans` + `entitlement_overrides`, resolved once and cached in Redis with a short TTL so plan changes propagate in seconds without a DB hit per request.
