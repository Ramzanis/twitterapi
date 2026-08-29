# Prompt for Claude Design — database architecture diagram

Paste the prompt below into Claude Design (or run `/design` and use it as the brief).

---

Create a database architecture diagram for **Skylark**, a third-party X/Twitter data API service. One landscape artboard, clean SaaS engineering-doc style: light background, dark slate text, blue accent (#2563eb), soft sky-blue cluster backgrounds, rounded corners, JetBrains Mono for field names.

Draw an entity-relationship diagram with tables grouped into color-coded clusters. Each table is a card with its name as a header and key fields listed (mark PK / FK). Connect related tables with labeled crow's-foot lines (1-to-many etc.).

**Cluster 1 — Identity (sky blue):**
- users (id PK, google_sub, email, name, deleted_at)
- organizations (id PK, name, slug)
- organization_members (org_id FK, user_id FK, role: owner/admin/member/billing)
Relationships: users 1—* organization_members *—1 organizations. Note: "every user gets a personal org; billing and usage always hang off an org."

**Cluster 2 — API access (indigo):**
- api_keys (id PK, org_id FK, key_prefix, key_hash, scopes, status, last_used_at)

**Cluster 3 — Plans & billing (green):**
- plans (id PK, code: free/payg/teams/scale, monthly_price_cents, included_credits, rate_limit_rps, features jsonb)
- subscriptions (id PK, org_id FK, plan_id FK, status: trialing/active/past_due/canceled, stripe_customer_id, current_period_start/end)
- credit_ledger (id PK, org_id FK, amount_micros, type: purchase/usage/refund, balance_after_micros) — annotate "append-only, source of truth for balance"
- spend_limits (org_id PK/FK, monthly_cap_cents, hard_stop)
- entitlement_overrides (org_id FK, feature, value)

**Cluster 4 — Usage metering (amber):**
- api_requests (id PK, org_id FK, api_key_id FK, endpoint, status_code, credits_cost_micros, latency_ms, cache_hit) — annotate "partitioned by day, purged after 90 days"
- usage_rollups_daily (org_id, api_key_id, endpoint, period, request_count, credits_spent)

**Cluster 5 — Scraper pipeline (violet):**
- providers (id PK, name, kind: scraper/third_party_api, priority, status, cost_per_call_micros)
- fetch_jobs (id PK, request_id FK, provider_id FK, params_hash, status: queued/running/succeeded/failed, attempts)
- response_cache (params_hash PK, endpoint, payload, expires_at, hit_count)

**Cluster 6 — Delivery & ops (slate):**
- webhook_endpoints, webhook_deliveries, stream_rules, audit_logs, idempotency_keys (compact cards, a few fields each)

**Side panel (right edge) — request lifecycle**, a numbered vertical flow with arrows:
1. Client request + API key → API Gateway
2. Auth (api_keys) + rate limit & credit check (Redis)
3. response_cache lookup — hit: serve
4. Miss: fetch_job → queue → scraper / third-party provider
5. Result cached + returned to client
6. api_requests logged → credit_ledger debited → rollups → dashboard

**Legend / footnotes (bottom):** icons or small tags noting what lives outside Postgres — Redis (rate limits, queues, entitlement cache), ClickHouse or Postgres partitions (api_requests at scale), S3 (large payloads), Stripe (billing source of truth, mirrored locally).
