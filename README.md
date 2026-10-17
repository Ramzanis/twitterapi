# Skylark — X (formerly Twitter) data API

Landing page, sign-in, and the metered API backend for Skylark, a third-party X data service. Built with [Next.js](https://nextjs.org) (App Router, TypeScript), [Tailwind CSS v4](https://tailwindcss.com), [Drizzle ORM](https://orm.drizzle.team) on Postgres, managed with [pnpm](https://pnpm.io).

Everything runs locally against a Docker Postgres and a **standalone mock data provider** — no real scraper, no payment provider, no traffic to X.

The upstream data source is a separate service, [`driftnet`](../driftnet), that speaks real HTTP with real auth, pagination, rate limiting and failure modes. Pointing this app at a paid provider means changing `PROVIDER_BASE_URL` and `PROVIDER_API_KEY` — not the code.

## Project structure

```
twitterapi/
├── auth.ts                         # Auth.js: Google + dev login, JWT sessions
├── app/
│   ├── layout.tsx                  # Root layout: metadata and fonts
│   ├── page.tsx                    # Landing page
│   ├── globals.css                 # Tailwind import, theme tokens
│   ├── signin/page.tsx             # Sign-in page
│   ├── dashboard/                  # Customer area (page + actions per section)
│   │   ├── billing/                # Credits, top-ups, transactions
│   │   ├── payment-methods/        # How you pay
│   │   └── account/                # Profile, organization, plan
│   ├── admin/                      # Staff console (+ orgs/[id] detail)
│   └── api/
│       ├── auth/[...nextauth]/     # Auth.js handlers
│       ├── x/tweet/search/route.ts # Metered API endpoint
│       ├── usage/export/           # CSV export
│       ├── webhooks/[provider]/    # Payment gateway webhook
│       └── cron/reconcile-topups/  # Safety net for lost webhooks
├── components/
│   ├── ui/                         # Shared primitives: StatTile, CopyButton,
│   │                               # LocalTime, NavTabs
│   ├── marketing/                  # Landing page + sign-in: Header, CodeCard,
│   │                               # Faq, SignInForm
│   ├── dashboard/                  # Customer-facing: CreditBalance, TopupForm,
│   │                               # ApiKeyManager, UsageChart, AccountForms…
│   └── admin/                      # Staff console: AdminControls
├── config/                         # Config as code (not DB tables)
│   ├── plans.ts                    # free / payg / teams / scale entitlements
│   ├── pricing.ts                  # Credit cost per endpoint
│   ├── providers.ts                # Scraper / third-party catalog
│   └── billing.ts                  # Bank details, top-up presets
├── lib/
│   ├── apiAuth.ts                  # API key hash → org + plan
│   ├── authz.ts                    # Session, requireUser, requireStaff
│   ├── rateLimit.ts                # In-process limiter (Redis later)
│   ├── ledger.ts                   # Append-only credit ledger, buckets
│   ├── billing.ts                  # Top-up requests and fulfilment
│   ├── provisioning.ts             # First sign-in → user + org + bonus
│   ├── usage.ts                    # Dashboard aggregations
│   ├── admin.ts                    # Platform-wide queries
│   ├── payments/gateway.ts         # Stripe/Revolut seam (unimplemented)
│   └── providers/
│       ├── client.ts               # HTTP client: timeouts, retries, backoff
│       └── tweets.ts               # Endpoint calls + response mapping
├── db/
│   ├── schema.ts                   # Table definitions — the source of truth
│   ├── migrations/                 # Numbered, named, committed SQL
│   └── index.ts                    # Drizzle client
├── scripts/
│   ├── seed.ts                     # Dev user, org, API key, signup bonus
│   ├── make-staff.ts               # Grant admin console access
│   ├── verify-ledger.ts            # Balance + concurrency checks
│   └── verify-topup.ts             # Exactly-once payment fulfilment check
├── docs/                           # Architecture + design-diagram prompt
└── docker-compose.yml              # Local Postgres
```

## Getting started

Requires Node.js 20+, pnpm, and Docker Desktop.

```bash
pnpm install
cp .env.example .env      # then fill in AUTH_SECRET (command is in the file)
pnpm db:up                # Start Postgres in Docker
pnpm db:migrate           # Apply migrations
pnpm dev
```

In a second terminal, start the upstream data provider — the API returns 502 without it:

```bash
cd ../driftnet && npm run dev                    # http://localhost:4000
```

Open [http://localhost:3000](http://localhost:3000), click **Sign in**, and you land on the dashboard. Create a key there — it is shown once, because only its SHA-256 hash is stored.

`pnpm seed` still exists if you want a pre-made org and key without signing in.

### Signing in without Google credentials

Google OAuth needs credentials from the [Google Cloud console](https://console.cloud.google.com/apis/credentials) (redirect URI `http://localhost:3000/api/auth/callback/google`). Until `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are set, dev builds show a **local developer login** instead — type any email and you're in, with the same provisioning as a real sign-up. It is never registered in a production build.

First sign-in creates the user, a personal organization on the free plan, an owner membership, and the $0.10 signup bonus — in one transaction, idempotent on repeat logins.

## Trying the API

```bash
curl "http://localhost:3000/api/x/tweet/search?query=AI+agents" \
  -H "X-API-Key: sk_live_..."
```

The response `meta` block shows the metering in action:

```json
{
  "meta": {
    "cache_hit": false,
    "credits_charged_micros": 150,
    "balance_micros": 99850,
    "environment": "live",
    "latency_ms": 342
  }
}
```

Call it twice with the same query: the second is a cache hit — roughly 7x faster, costs nothing upstream, and still bills the customer. That gap is the margin lever described in the architecture doc.

Error paths: `401` missing/invalid or revoked key, `402` insufficient credits, `403` suspended organization, `429` over the plan's rate limit, `400` missing query.

## The dashboard

`/dashboard` reads the same tables the API writes to, so calls show up immediately — and because every call is logged in the same transaction as its ledger debit, the usage shown always agrees with the balance. There is deliberately no "these numbers may be undercounted" caveat, because they aren't estimates.

- **User information** — organization and user IDs, and the active key's prefix. The full key is never shown again after creation; only its SHA-256 hash is stored, so rotation is a **Roll** button (mint a replacement, revoke the old one) rather than a reveal toggle.
- **Credit balance** — split into recharge and bonus credits, with the dollar and credit figures side by side (1 credit = $0.000001). Usage spends bonus credits first. Email warnings fire at $10/$5/$1/$0, once per threshold per top-up cycle.
- **Headline tiles** — calls and spend in the last 24 hours, cache hit rate with average latency, and **throttled** requests, so 429s are visible instead of looking like an outage.
- **Credit consumption** — exact counts over 30 min / 1 hour / 1 day / 7 days / 30 days, flagging throttled calls per window.
- **Requests per day**, **top endpoints**, and **recent API calls** — the last 15 calls attributed to the key that made them, with status, source, cost, latency, and timestamps rendered in the viewer's own timezone. **Export 30 days (CSV)** for finance.
- **API keys** — create (shown once), roll, revoke, last-used. Creation enforces the plan cap: on the free plan a second key is refused with an upgrade message.
- **First-call guide** — an account with no traffic gets a runnable `curl` command instead of an empty table.

### Testing upstream failures

The collector can be told to misbehave, which exercises paths that otherwise never run. Faults are per-request query parameters, so no restart is needed — call Driftnet directly to see the shape, or set `FAIL_RATE` / `BASE_LATENCY_MS` in its `wrangler.toml` to make every call misbehave:

```bash
BASE=http://localhost:4000
curl "$BASE/v1/tweets/search?query=x&_fail=1"      -H "X-Provider-Key: $KEY"   # 503 → retries, then a 502 here and no charge
curl "$BASE/v1/tweets/search?query=x&_latency=9000" -H "X-Provider-Key: $KEY"  # slower than the 5s client timeout
curl "$BASE/v1/tweets/search?query=x&_truncate=1"  -H "X-Provider-Key: $KEY"   # malformed JSON → parse failure
curl "$BASE/v1/tweets/search?query=x&_status=429"  -H "X-Provider-Key: $KEY"   # forced status code
```

Stopping Driftnet entirely is the other useful fault: every call then returns 502 with `fetch_jobs.status = 'failed'` at three attempts, and the customer is not billed.

Failure handling, verified against it:

| Upstream behaviour | `fetch_jobs` | Customer sees | Charged |
|---|---|---|---|
| Success | `succeeded`, 1 attempt | `200` with data | yes |
| 503 on every try | `failed`, 3 attempts | `502` | **no** |
| Slower than timeout | `timed_out`, 3 attempts | `502` + "provider timed out" | **no** |

Retries use exponential backoff with jitter. Every attempt costs us, so `upstream_cost_micros` records all of them — a job that retried three times bills us 3× the per-call cost, which is what makes the admin console's margin figure honest.

### Topping up credits locally

Billing is mocked — there is no payment provider wired up. A top-up is just a ledger entry:

```sql
INSERT INTO credit_ledger (org_id, amount_micros, type, reference, balance_after_micros)
SELECT org_id, 5000000, 'purchase', 'manual-topup', 5000000
FROM credit_ledger ORDER BY id DESC LIMIT 1;
```

## Billing and payment methods

`/dashboard/billing` and `/dashboard/payment-methods` are separate pages from Account, which keeps profile, organization and plan.

**Billing** shows the credit balance split by bucket, lifetime purchases, and pending top-ups; a top-up form with preset amounts; the full transaction ledger; spend controls; and an invoices placeholder. Requesting a top-up creates a `topup_requests` row with a reference to quote on a bank transfer — so the button does real work rather than opening a mail client.

**Payment methods** shows bank transfer as the active method and card payments as not connected, with no fake card UI. Bank details come from [config/billing.ts](config/billing.ts) and are **placeholders** — set `BILLING_ACCOUNT_NAME`, `BILLING_IBAN`, `BILLING_BIC`, `BILLING_BANK_NAME` (or edit the file) before inviting anyone to pay. Until they are set, the page says instructions will be emailed instead of showing an unusable IBAN.

Staff fulfil top-ups from the admin console: **Mark paid** flips the request and appends the ledger entry in one transaction, guarded on `status='pending'` so a double-click cannot double-credit. When you connect Stripe or Revolut, its webhook marks the same row paid and nothing else changes.

## Admin console

`/admin` is staff-only, gated on `users.is_staff`, which is re-read from the database on every request so revoking access takes effect immediately rather than at the user's next sign-in. Non-staff are redirected to their own dashboard.

Grant yourself access after signing in once:

```bash
pnpm staff you@example.com            # revoke with --revoke
```

It shows platform revenue, upstream provider cost, gross margin, outstanding credit liability, cache hit rate and failed jobs; every organization with balance and usage; provider totals for reconciling supplier invoices; and a live `audit_logs` feed. Opening an organization gives you plan changes, suspension, manual credit adjustments (the stand-in for a payment provider), members with staff toggles, keys, ledger and recent requests. Every mutation writes an audit row.

## Database migrations

The schema lives in [db/schema.ts](db/schema.ts); migrations are generated from it and committed to git.

```bash
pnpm db:generate --name=add_something   # Diff schema.ts → db/migrations/000N_add_something.sql
pnpm db:migrate                         # Apply pending migrations (use this in deploys)
pnpm db:studio                          # Browse data in Drizzle Studio
pnpm db:push                            # Sync without a migration — local prototyping only
```

**Always pass `--name`.** Without it Drizzle invents a random name like `0001_fancy_plazm`, which tells you nothing in a code review or a git log. Files are numbered and applied in order:

```
0000_initial_schema.sql
0001_credit_buckets_and_alerts.sql
0002_topup_requests.sql
0003_payment_dedupe_and_processing_state.sql
```

**One file per change set, not per statement.** A migration is the unit that gets applied and rolled back together, so everything belonging to one logical change stays in one file — splitting each `CREATE INDEX` into its own file would break that atomicity and add ordering hazards for no benefit. The descriptive name is what makes the folder readable, not the file count.

Renaming an existing migration is safe if you also update its `tag` in `db/migrations/meta/_journal.json`: the applied-migrations table keys on a hash of the file *contents*, not the filename.

Edit `db/schema.ts`, run `db:generate --name=...`, **read the generated SQL**, and commit it alongside the schema change. Generated SQL adds columns but never knows how to fill them — [0001](db/migrations/0001_credit_buckets_and_alerts.sql) carries a hand-written backfill that classifies existing ledger rows into buckets and recomputes running balances. Use `db:push` only for throwaway local iteration: it mutates the database without leaving a migration, so it must never touch an environment with real data.

## Payments

Nothing credits an account except a signal we can verify. The browser redirect after a payment is a UX cue only — it never touches the ledger.

- **[Webhook route](app/api/webhooks/[provider]/route.ts)** — verifies the signature over the raw body, records the gateway's event id **first** (unique on `(provider, event_id)`, so a retried delivery stops there), then acts only on a terminal success. Duplicates return 2xx so the gateway stops retrying.
- **[Reconciliation job](app/api/cron/reconcile-topups/route.ts)** — the safety net for a webhook that never arrived. Schedule every 10–15 minutes:
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/reconcile-topups
  ```
  It asks the gateway what really happened to unsettled top-ups and fulfils them through the same code path the webhook uses, so the two can race safely. Anything stuck past 24 hours is escalated with a `topup.stuck` audit row.
- **[Gateway seam](lib/payments/gateway.ts)** — implementing Stripe or Revolut means filling in one object; no caller changes. `getGateway()` returns null today, so the webhook refuses everything, which is the safe default.
- **Three defences against double-crediting**: the gateway event id, the `pending|processing` status guard, and a unique index on `credit_ledger.source_id` that makes a second credit for the same top-up *physically impossible* regardless of application bugs.
- **Credit what was captured, not what was requested.** `topup_requests.amount_received_cents` holds the gateway's figure; they diverge on currency conversion, fees deducted at source, or a customer transferring a different number.

## Scripts

```bash
pnpm dev      # Dev server
pnpm build    # Production build
pnpm start    # Serve the production build
pnpm db:up    # Start local Postgres
pnpm seed     # Seed a dev org and API key
pnpm staff    # Grant/revoke admin console access
```

## Architecture

[docs/database-architecture.md](docs/database-architecture.md) covers the 9-table schema, the config-as-code decisions, the phased infrastructure plan (and what triggers each upgrade), and the Stripe-vs-Revolut billing analysis. [docs/claude-design-diagram-prompt.md](docs/claude-design-diagram-prompt.md) is a ready-to-paste brief for generating the ERD.

---

Skylark is an independent third-party service. Not affiliated with X Corp. "Twitter" and "X" are trademarks of X Corp.
