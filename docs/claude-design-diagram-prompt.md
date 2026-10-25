# Prompt for Claude Design — database architecture diagram

Paste the prompt below into Claude Design (or run `/design` and use it as the brief).

---

Create a database architecture diagram for **Skylark**, a third-party X/Twitter data API service. One landscape artboard, clean SaaS engineering-doc style: light background, dark slate text, blue accent (#2563eb), soft sky-blue cluster backgrounds, rounded corners, JetBrains Mono for field names.

Draw an entity-relationship diagram of the **12-table Phase 0 core**, grouped into color-coded clusters. Each table is a card with its name as a header and key fields listed (mark PK / FK). Connect related tables with labeled crow's-foot lines.

**Cluster 1 — Identity (sky blue):**
- users (id PK, google_sub, email, is_staff, tos_version, deleted_at)
- organizations (id PK, name, slug, status, plan_code, plan_overrides jsonb, billing_provider, billing_customer_id, spend_cap_cents, spend_alert_thresholds)
- organization_members (org_id FK, user_id FK, role)
Relationships: users 1—* organization_members *—1 organizations. Note: "every user gets a personal org; billing and usage hang off the org."

**Cluster 2 — API access (indigo):**
- api_keys (id PK, org_id FK, key_prefix, key_hash, environment: live/test, status, last_used_at)
- stream_rules (id PK, org_id FK, value, tag) — annotate "topic the stream delivers; unique per org"

**Cluster 3 — Money (green):**
- credit_ledger (id PK, org_id FK, amount_micros, type: purchase/usage/refund/adjustment, reference, balance_after_micros) — annotate "append-only, source of truth for balance"
- topup_requests (id PK, org_id FK, requested_by FK, amount_cents, amount_received_cents, status, provider, provider_payment_id, reference) — annotate "credit what was captured, not what was requested"
- webhook_events (id PK, provider, event_id, event_type, signature_valid, processed_at) — annotate "(provider, event_id) unique: a retried delivery is ignored"
Relationships: organizations 1—* topup_requests; a fulfilled top-up writes one credit_ledger row.

**Cluster 4 — Usage (amber):**
- api_requests (id PK, org_id FK, api_key_id FK, endpoint, status_code, credits_cost_micros, latency_ms, cache_hit) — annotate "plain table now; partition + purge later"

**Cluster 5 — Scraper pipeline (violet):**
- fetch_jobs (id PK, request_id FK, provider_code, params_hash, status: queued/running/succeeded/failed, attempts) — annotate "doubles as the job queue (SKIP LOCKED)"
- response_cache (params_hash PK, endpoint, payload, expires_at, hit_count) — annotate "margin lever: cache hits cost nothing upstream"

**Cluster 6 — Activity (slate):**
- audit_logs (id PK, org_id FK, actor_user_id nullable, action, metadata jsonb) — annotate "actor null = system; also records spend alerts and plan changes"

**Side panel (left) — config as code**, a small card stack (not tables, styled differently, e.g. dashed borders): plans (free/payg/teams/scale + entitlements), endpoint pricing (credits per endpoint), providers (scrapers/third-party collectors, keyed by provider_code). Note: "versioned in git; promoted to tables only when runtime editing is needed."

**Side panel (right) — request lifecycle**, a numbered vertical flow with arrows:
1. Client request + API key → gateway
2. Auth (api_keys) + rate limit, credit balance, spend cap checks
3. response_cache lookup — hit: serve
4. Miss: fetch_job → queue → scraper / third-party provider
5. Result cached + returned
6. api_requests logged + credit_ledger debited (same transaction)

**Legend / footnotes (bottom):** deferred additions as dashed tags with their triggers — subscriptions (self-serve billing), usage_rollups_daily (dashboard slows), invitations (Teams ships), customer webhooks (not planned), Redis / S3 / ClickHouse (scale). Note: "the 9 core tables stay identical at every phase; billing columns are provider-agnostic (Stripe, Revolut, or manual invoicing)."
