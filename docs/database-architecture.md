# Database architecture

Data model and storage plan for Skylark: a third-party X/Twitter data API. Customers call our API; we serve from cache or dispatch the request to a scraper / third-party data collector, return the result, meter the usage, and bill per call.

**Strategy:** design the schema for the end state (expensive to change with live customers), deploy minimal infrastructure for the current one (cheap to upgrade). Day one is a single Postgres; everything else is added when a measured trigger fires.

**Simplicity rule:** the Phase 0 core is **12 tables** (9 at first, plus `topup_requests` and `webhook_events` for payments and `stream_rules` for streams). Anything that would be a 1:1 table becomes columns; anything that changes rarely and has no runtime state becomes config in code; anything serving a feature that hasn't shipped isn't created yet.

## Phase 0 stack (first ~1–5 customers)

| Concern | Day-one answer |
|---|---|
| All relational data | **One managed Postgres** (Neon / Supabase free tier is enough) |
| Request log | Plain `api_requests` table; the dashboard queries it directly (aggregating a few million rows is instant at this scale) |
| Job queue | Postgres: `SELECT … FOR UPDATE SKIP LOCKED` on `fetch_jobs`, or pg-boss which wraps it |
| Rate limiting | Counter in Postgres or in-process |
| Response cache payloads | JSONB in the `response_cache` table |
| Auth | Google via Auth.js with **JWT sessions** — no session/account tables needed, just `users` |
| Billing | Invoice + bank transfer (SEPA) or payment links; the internal `credit_ledger` tracks balances. Provider-agnostic columns — see "Payment provider" below |

## Config as code, not tables

These change rarely, have no runtime state, and get free versioning/review through git. Each earns a table only when you need to edit it at runtime or build an admin UI for it:

- **Plans** (`free`, `payg`, `teams`, `scale`): price, included credits, rate limit, seat cap, feature flags — a typed constant. The org stores only `plan_code`.
- **Endpoint pricing** ($0.15/1k tweet reads, $0.18/1k profile reads, …): a map of endpoint → credit cost. What was actually charged is recorded per call in `api_requests`, so history stays auditable even as config changes.
- **Providers** (your scrapers / third-party collectors): base URL, cost per call, priority — config keyed by a `provider_code` string that `fetch_jobs` references. Promote to a table when you need runtime health tracking or per-provider dashboards.
- **Provider credentials** never go in the database — secrets manager / env config.

## Core tables (Phase 0 — all 9)

### Identity

**users**
- `id` uuid PK, `google_sub` unique (stable Google subject id — key on this, not email), `email`, `name`, `avatar_url`, `is_staff` bool, `tos_version`, `tos_accepted_at`, `created_at`, `last_login_at`, `deleted_at` (soft delete for GDPR)

**organizations** — billing/usage always hangs off an org, never a user (GitHub/Vercel/Stripe pattern). Every user gets a personal org on signup; Teams later just adds members. Plan, billing identity, and spend caps are 1:1 with the org, so they're columns here — not separate tables.
- `id` uuid PK, `name`, `slug` unique, `status` enum(`active`,`suspended`,`closed`)
- `plan_code` (`free`,`payg`,`teams`,`scale`), `plan_overrides` jsonb nullable (custom deals)
- `billing_provider` enum(`stripe`,`revolut`,`manual`) , `billing_customer_id` (the provider's customer reference)
- `spend_cap_cents` nullable, `spend_alert_thresholds` int[] (e.g. {50,80,100}), `hard_stop` bool
- `last_balance_alert_dollars` nullable — the lowest balance threshold ($10/$5/$1/$0) already warned about. Without it a scheduled job re-sends the same warning on every tick. It clears on a top-up, and `recordBalanceAlert` also self-heals: if the balance is above the level last warned at, it re-arms, so credits added by any route (a manual SQL fix, an import) can't silently suppress every future warning.
- `created_at`

**organization_members**
- `org_id` FK, `user_id` FK, `role` enum(`owner`,`admin`,`member`), `created_at` — PK (org_id, user_id)

### API access

**api_keys** — never store the plaintext key; store a hash and a display prefix
- `id` uuid PK, `org_id` FK, `name`, `key_prefix` (e.g. `sk_live_a1b2…`), `key_hash` (SHA-256), `environment` enum(`live`,`test`) (test keys don't bill or hit real providers — cheap now, annoying to retrofit), `status` enum(`active`,`revoked`), `created_by` FK users, `created_at`, `last_used_at`

### Money

**credit_ledger** — append-only; the source of truth for balance (never a mutable `balance` column — ledgers are auditable and race-safe). Keep this discipline from customer #1.
- `id` bigserial PK, `org_id` FK, `amount_micros` (+ purchase / − usage), `type` enum(`purchase`,`bonus`,`usage`,`refund`,`adjustment`), `bucket` enum(`paid`,`bonus`), `reference` (request_id / invoice ref), `balance_after_micros` (of that bucket), `created_at`

**Why two buckets.** Paid credits are deferred revenue and a real liability; bonus credits are marketing spend with no cost basis. Keeping them in separate chains means the books can distinguish them and a promotion can expire without touching money someone paid for. Usage is charged **bonus-first** — the expiring, zero-cost money goes first — and a charge that straddles both writes one row per bucket sharing the request id, so each chain stays continuous. Total balance is the newest row per `(org_id, bucket)`, summed.

### Billing workflow

**topup_requests** — a customer's request to add credits, and the staff work queue while billing is manual.
- `id` PK, `org_id` FK, `requested_by` FK users, `amount_cents`, `status` enum(`pending`,`paid`,`cancelled`), `provider` enum(`stripe`,`revolut`,`manual`), `reference` (the code the customer quotes on their transfer), `note`, `created_at`, `completed_at`, `completed_by`

The customer raises a request on the billing page, pays by transfer quoting `reference`, and staff mark it paid — which appends the ledger entry **in the same transaction**, so a request can never be marked paid without the money appearing, or vice versa. That path is `fulfilTopupRequest`, and it does not change when a provider is wired up: a webhook or the reconciliation job calls it instead of a human.

**webhook_events** — every delivery, kept for dedupe and for arguing about a payment six weeks later.
- `id` PK, `provider`, `event_id`, `event_type`, `signature_valid`, `payload` jsonb, `processed_at`, `error`, `created_at` — unique on `(provider, event_id)`

**Three independent defences against double-crediting**, because one is a single point of failure:
1. **The gateway's event id** — unique on `(provider, event_id)`. The webhook route inserts this *before* acting, so a retried delivery conflicts and stops without touching money. Covers every event type, not just crediting ones.
2. **The status guard** — fulfilment matches only `pending` or `processing` rows, so a settled request matches nothing.
3. **`credit_ledger.source_id`** — a partial unique index (`where source_id is not null`) on the top-up id. This one is enforced by Postgres, so a second credit is *physically impossible* even if the application logic is wrong. Manual staff adjustments leave it null and stay unconstrained.

**Credit what was captured, not what was requested.** `amount_received_cents` holds the gateway's figure and is what reaches the ledger; `amount_cents` stays as the customer's request. They diverge on currency conversion, fees deducted at source, and — very commonly with bank transfers — a customer simply transferring a different number. Keeping both makes a shortfall visible instead of silently mis-credited.

**Never credit on a non-terminal state.** `processing` means money is moving but has not settled; SEPA transfers and direct debits sit there for days. The customer sees it, the ledger does not.

The safety net for a webhook that never arrives is a scheduled sweep (`findStaleTopups`) that asks the gateway what really happened and fulfils through the same function, so the webhook and the reconciler can race harmlessly. Anything unresolved past 24 hours writes a `topup.stuck` audit row for a human.

This is also why no `payment_methods` table exists: with bank transfer there is no method to store, and with a provider the card lives at the provider. `organizations.billing_provider` + `billing_customer_id` are the only references we keep.

### Usage

**api_requests** — one row per API call, **including rejected ones** (429 throttled, 402 out of credits, 502 upstream failure) at zero cost. An invisible 429 just looks like a broken API from the customer's side, so throttling is logged and shown on their dashboard; it is also the most honest upgrade prompt you have. Under a sustained flood this does write a row per rejected call — worth revisiting when rate limiting moves to Redis. Plain table now; partition by day and purge raw rows after ~90 days once volume demands it.
- `id` ulid PK, `org_id`, `api_key_id`, `endpoint`, `status_code`, `credits_cost_micros`, `latency_ms`, `cache_hit` bool, `ip_hash`, `created_at`

### Scraper pipeline

**fetch_jobs** — one row per upstream fetch; links a customer request to upstream work, doubles as the Phase 0 job queue, and is the record you reconcile provider invoices against.
- `id` ulid PK, `request_id` FK api_requests, `provider_code`, `endpoint`, `params` jsonb, `params_hash`, `status` enum(`queued`,`running`,`succeeded`,`failed`,`timed_out`), `attempts`, `error`, `queued_at`, `started_at`, `finished_at`, `upstream_cost_micros`

**response_cache** — dedupes identical queries within a TTL; your biggest margin lever (a cache hit costs nothing upstream but still bills the customer)
- `params_hash` PK, `endpoint`, `payload` jsonb (S3 pointer later), `fetched_at`, `expires_at`, `hit_count`

### Everything else

**audit_logs** — one generic activity table instead of several narrow ones. `actor_user_id` null = system action, so it also records plan changes, suspensions, and sent spend alerts (`action='spend_alert'`, threshold in metadata — check the latest row before alerting again).
- `id` PK, `org_id`, `actor_user_id` nullable FK, `action`, `metadata` jsonb, `created_at`

## Deferred tables (create when the feature or trigger arrives)

| Table | Create when |
|---|---|
| `subscriptions` (plan history, PSP subscription id, period, `past_due` state) | Self-serve recurring billing goes live. Until then `organizations.plan_code` + audit_logs history is enough for 5 hand-managed customers |
| `plans`, `endpoint_pricing`, `providers` as tables | You need runtime editing or an admin UI for them |
| `usage_rollups_daily` | Dashboard queries over `api_requests` get slow |
| `invitations` | Teams plan ships (inviting people who don't have accounts yet) |
| `stream_rules` | Streaming ships (done) |
| `idempotency_keys` | You add write endpoints customers retry |
| `user_agreements` (full acceptance history) | Lawyers ask for more than the current-version columns on `users` |

None of these change the 9 core tables — they attach alongside.

## Payment provider: Stripe vs Revolut

Fee reality: Stripe is ~1.5% + €0.25 for EEA consumer cards (more for UK/international, plus 0.7% extra if you use Stripe Billing); Revolut's merchant acquiring runs roughly 1% + €0.20 — genuinely cheaper per transaction. But the decision at Phase 0 isn't really about fees:

- **At 1–5 customers the fee difference is noise.** On €1,000/month of card volume, Stripe vs Revolut differs by €10–15/month — far less than the engineering time Stripe's billing tooling (metered billing, dunning, hosted invoices, webhooks, tax) saves you.
- **Cheapest option at this stage is neither:** send an invoice and take a SEPA bank transfer into a business account (Revolut Business works well as the *bank*), then top up the customer's `credit_ledger` manually. Zero card fees, entirely normal for your first B2B customers.
- **The schema keeps you free to switch.** `billing_provider` + `billing_customer_id` on `organizations` are provider-agnostic, and the ledger — not the PSP — is your source of truth for balances. Moving from manual → Stripe → Revolut (or adding Revolut Pay as a payment method) is config, not migration.
- **When self-serve signup ships**, reassess: Stripe if you want subscriptions/metering handled for you; Revolut acquiring if by then your volume makes the fee delta real and you're happy running more billing logic yourself; a merchant of record (Paddle, Lemon Squeezy, ~5% + fixed) if global consumer VAT compliance becomes the bigger headache than fees.

## Implementation status (local, mocked)

The upstream data source is a **separate service** (`driftnet`, a sibling directory) that speaks real HTTP with auth, pagination, rate limiting and injectable faults. The client in `lib/providers/client.ts` therefore exercises genuine request building, timeouts, retries with backoff, and error classification — so swapping in a paid scraper is a base URL and a key. `fetch_jobs` distinguishes `failed` from `timed_out`, records the attempt count, and bills `upstream_cost_micros` for **every** attempt including retries, which keeps the admin console's margin figure honest. A failed upstream never charges the customer: the 502 is logged to `api_requests` at zero cost.

Built and verified end to end against a local Postgres: all 12 tables (`db/schema.ts`), sign-in with provisioning, the customer dashboard, API-key auth, in-process rate limiting, the response cache, the append-only ledger with row-locked debits, and the 13 metered endpoints under `/api/x` plus the stream gateway. Data comes from the `driftnet` mock provider and top-ups are requested by the customer and marked paid by staff — no real scraper and no payment provider are wired up.

**Sign-in and provisioning.** Auth.js v5 with JWT sessions, so no session or account tables are needed — `users` alone is enough, as the schema assumed. First sign-in runs `provisionIdentity()`: user, personal organization on the free plan, owner membership, the $0.10 signup bonus as a ledger entry, and an `org.created` audit row, all in one transaction, keyed idempotently on the Google subject id. **No API key is minted at signup** — a key is only ever displayable at the moment it is created, so the first key is created explicitly from the dashboard, which shows it once. Google OAuth activates as soon as `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are set; without them, dev builds fall back to a local email login that production refuses to register.

**Entitlements in practice.** The dashboard resolves `organizations.plan_code` through `config/plans.ts` merged with `plan_overrides`, exactly as the plan-tracking section describes. Both plan limits are enforced live: the free plan's 2 req/sec returns 429 on the third rapid call, and its one-active-key cap refuses a second key with an upgrade message.

One deliberate deviation from the lifecycle below: on a cache miss the API **calls the provider synchronously** and writes the `fetch_jobs` row as a record of the upstream call, rather than queueing it. A search endpoint has to return data in the same request, so the queue-and-worker split (`SKIP LOCKED`) only becomes necessary for genuinely async work — bulk exports, backfill, stream ingestion. The table is already shaped for both.

**Admin console.** `/admin` is gated on `users.is_staff`, re-read from the database on each request rather than trusted from the session token. It reads the same tables to show revenue, upstream cost from `fetch_jobs`, gross margin, outstanding credit liability (the sum of each org's latest ledger balance — what we owe in unused credits), and per-provider totals for reconciling supplier invoices. Staff can change an org's plan, suspend it, and move credits; credit moves append to `credit_ledger` through the same locked path as usage, so the balance stays derived from one auditable chain. Every mutation writes an `audit_logs` row, which is what makes that table earn its place instead of separate history tables.

**Migrations.** The schema is the source of truth in `db/schema.ts`; `drizzle-kit generate` diffs it into versioned SQL under `db/migrations`, committed to git, and `drizzle-kit migrate` applies them. The database has been rebuilt from those files from empty to verify they work. Indexes were added at the same time — notably `credit_ledger (org_id, id desc)`, which serves the balance lookup on every billable request, and `api_requests (org_id, created_at desc)` for the dashboards.

Not yet built: real provider integration, any payment provider, team invitations, and the usage rollup job (the dashboard aggregates `api_requests` directly, which is the documented Phase 0 behaviour).

One property worth knowing: `response_cache` is keyed by `params_hash` alone, so it is **shared across organizations** — one customer's query warms the cache for the next. That is deliberate for public data and is what makes the cache a margin lever, but it means cache-hit rates are a property of total traffic, not per-customer traffic.

## Request lifecycle

1. Request arrives with an API key → hash lookup in `api_keys` → org, `plan_code`, status (cached in-process).
2. Rate limit + credit balance + spend cap checks → 402/429 if exceeded.
3. `response_cache` lookup by `params_hash`. **Hit:** serve, log `api_requests` with `cache_hit=true`, debit `credit_ledger`.
4. **Miss:** insert `fetch_job` → worker claims it (`SKIP LOCKED`) → picks provider from config by priority → calls scraper/third-party → caches result → responds.
5. `api_requests` row + ledger debit written in the same transaction.
6. Billing: top-ups land in the ledger (manual transfer or payment link); plan changes flip `organizations.plan_code` and leave an audit_logs row.

## How plan tracking answers "what plan is this client on?"

`organizations.plan_code` → plan config in code gives free/payg/teams/scale; entitlements = plan defaults merged with `plan_overrides`. Resolved once per request and cached in-process with a short TTL, so a plan change propagates in seconds without a DB hit per request.
