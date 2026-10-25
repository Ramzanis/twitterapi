# Tasks

What's left to do on Skylark, roughly in priority order. See [docs/handoff.html](docs/handoff.html) for background.

## Before the first paying customer

- [ ] Replace the placeholder bank details in `config/billing.ts` (or set the `BILLING_*` env vars)
- [ ] Add an email provider and send the balance-alert emails ($10/$5/$1/$0) that are already tracked

## Payments (needed for self-serve signup)

- [ ] Implement `getGateway()` in `lib/payments/gateway.ts` for Stripe or Revolut
- [ ] Add the gateway's secrets to `.env.example`
- [ ] Schedule `/api/cron/reconcile-topups` to run every 10–15 minutes with `CRON_SECRET`
- [ ] Build the invoices section on `/dashboard/billing` (currently a placeholder)

## Product

- [ ] Team invitations: invite flow plus role management for `organization_members`
- [ ] Provider failover: `pickProvider()` currently always returns the one provider
- [ ] Streams: record upstream stream cost in `fetch_jobs`, so the admin margin includes streams
- [ ] Streams: share connection counts across instances (Redis) before running more than one `pnpm stream`
- [ ] Streams: deploy the gateway alongside the app and set `STREAM_URL`

## Quality

- [ ] Add a test framework and turn `scripts/verify-ledger.ts` and `scripts/verify-topup.ts` into tests
- [ ] Add linting and a `typecheck` script to `package.json`
- [ ] Set up CI to run typecheck, lint, tests and the build

## Deployment

- [ ] Choose a host (Railway, Render, Fly or a Hetzner VPS) and a managed Postgres
- [ ] Add a Dockerfile or the host's build config
- [ ] Run `pnpm db:migrate` as part of each deploy
- [ ] Add the production domain to the Google OAuth client (origin + `/api/auth/callback/google` redirect URI), and publish the consent screen so it isn't limited to test users

## Later (only once traffic calls for it)

- [ ] Redis for rate limits, once limit checks add noticeable latency (the in-process limiter also breaks with multiple instances)
- [ ] Usage rollups, once dashboard queries over `api_requests` get slow
- [ ] S3 for cached payloads, once `response_cache` outgrows instance RAM
- [ ] Partition `api_requests`, then move it to ClickHouse at tens of millions of rows a month

## Done

- [x] Settle on `master` as the default branch, locally and on GitHub
- [x] Commit and push the backend, dashboard, admin, DB and docs work
- [x] Configure Google sign-in for local development (`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`)
- [x] Fix the docs: provider is `../driftnet` (`npm run dev`), and the table count
- [x] Build every endpoint the landing page lists: 12 REST reads (with new driftnet routes), stream rules, backfill, and a WebSocket stream gateway
- [x] Landing page: real endpoint count, no `/webhooks` (customers won't get webhooks — only the payment provider's incoming one is needed), sample stream shows real message types
- [x] Architecture diagram: `docs/architecture.html`
