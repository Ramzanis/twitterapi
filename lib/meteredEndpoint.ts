import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { authenticate, sha256, type AuthContext } from "@/lib/apiAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { debitCredits, getBalanceMicros, recordBalanceAlert } from "@/lib/ledger";
import { priceFor } from "@/config/pricing";
import { pickProvider, providers } from "@/config/providers";
import { ProviderError, type ProviderCallResult } from "@/lib/providers/client";

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

type Params = Record<string, string | number | undefined>;

/** A rejected parse: 400 unless the endpoint says otherwise (e.g. an unknown rule is 404). */
export interface ParseError {
  error: string;
  status?: number;
}

export interface MeteredEndpoint<P extends Params, D> {
  /** Metering key. Matches api_requests.endpoint and config/pricing.ts. */
  endpoint: string;
  /**
   * Validate and normalise the query string. The returned object is also the
   * cache key, so normalise anything case-insensitive here and nowhere else.
   */
  parse(searchParams: URLSearchParams, ctx: AuthContext): P | ParseError | Promise<P | ParseError>;
  /** One upstream call. Must throw ProviderError on failure. */
  fetch(params: P): Promise<ProviderCallResult<D>>;
  /** How long a response may be served from the shared cache. 0 disables caching. */
  cacheTtlMs?: number;
}

function isParseError(value: unknown): value is ParseError {
  return typeof value === "object" && value !== null && "error" in value;
}

/**
 * Log a rejected call. Throttled and out-of-credit requests are recorded with
 * zero cost so customers can see them — an invisible 429 just looks like a
 * broken API from the outside.
 */
async function logRejection(args: {
  endpoint: string;
  orgId: string;
  apiKeyId: string;
  statusCode: number;
  latencyMs: number;
}) {
  await db.insert(tables.apiRequests).values({
    orgId: args.orgId,
    apiKeyId: args.apiKeyId,
    endpoint: args.endpoint,
    statusCode: args.statusCode,
    creditsCostMicros: 0,
    latencyMs: args.latencyMs,
    cacheHit: false,
  });
}

/**
 * Serve one metered GET: authenticate, validate, rate limit, check credit,
 * serve from cache or fetch upstream, then log and bill in one transaction.
 *
 * Every data endpoint goes through here, so the money invariants live in one
 * place: upstream failure is never billed, every upstream attempt is costed,
 * and the request log and ledger debit can never disagree.
 */
export async function serveMetered<P extends Params, D>(
  request: Request,
  spec: MeteredEndpoint<P, D>,
): Promise<NextResponse> {
  const startedAt = Date.now();
  const { endpoint } = spec;

  // 1. Authenticate: API key hash → org + plan
  const auth = await authenticate(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { org, apiKey, plan } = auth.ctx;

  // 2. Validate before spending anything — a malformed call is not logged or billed.
  const parsed = await spec.parse(new URL(request.url).searchParams, auth.ctx);
  if (isParseError(parsed)) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status ?? 400 });
  }
  const params = parsed;

  // 3. Rate limit, then credit balance (test keys bypass billing)
  if (!checkRateLimit(apiKey.id, plan.rateLimitRps)) {
    await logRejection({
      endpoint,
      orgId: org.id,
      apiKeyId: apiKey.id,
      statusCode: 429,
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { error: `Rate limit exceeded — your plan allows ${plan.rateLimitRps} req/sec` },
      { status: 429, headers: { "Retry-After": "1" } },
    );
  }

  const isBillable = apiKey.environment === "live";
  const priceMicros = priceFor(endpoint);
  if (isBillable && (await getBalanceMicros(org.id)) < priceMicros) {
    await logRejection({
      endpoint,
      orgId: org.id,
      apiKeyId: apiKey.id,
      statusCode: 402,
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { error: "Insufficient credits. Top up your balance to continue." },
      { status: 402 },
    );
  }

  // 4. Cache lookup — a hit costs us nothing upstream but still bills
  const cacheTtlMs = spec.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const paramsHash = sha256(`${endpoint}:${JSON.stringify(params)}`);
  const now = new Date();
  let payload: D | undefined;
  let cacheHit = false;

  if (cacheTtlMs > 0) {
    const [cached] = await db
      .select()
      .from(tables.responseCache)
      .where(eq(tables.responseCache.paramsHash, paramsHash))
      .limit(1);
    if (cached && cached.expiresAt > now) {
      payload = cached.payload as D;
      cacheHit = true;
      await db
        .update(tables.responseCache)
        .set({ hitCount: sql`${tables.responseCache.hitCount} + 1` })
        .where(eq(tables.responseCache.paramsHash, paramsHash));
    }
  }

  if (!cacheHit) {
    // 5. Cache miss: record a fetch_job and call the provider
    const providerCode = pickProvider();
    const costPerCall = providers[providerCode].costPerCallMicros;
    const [job] = await db
      .insert(tables.fetchJobs)
      .values({
        providerCode,
        endpoint,
        params,
        paramsHash,
        status: "running",
        attempts: 1,
        startedAt: now,
      })
      .returning({ id: tables.fetchJobs.id });

    try {
      const result = await spec.fetch(params);
      payload = result.data;
      if (cacheTtlMs > 0) {
        const expiresAt = new Date(Date.now() + cacheTtlMs);
        await db
          .insert(tables.responseCache)
          .values({ paramsHash, endpoint, payload, fetchedAt: new Date(), expiresAt })
          .onConflictDoUpdate({
            target: tables.responseCache.paramsHash,
            set: { payload, fetchedAt: new Date(), expiresAt },
          });
      }
      await db
        .update(tables.fetchJobs)
        .set({
          status: "succeeded",
          attempts: result.attempts,
          finishedAt: new Date(),
          // Every attempt costs us, so bill ourselves for the retries too.
          upstreamCostMicros: costPerCall * result.attempts,
        })
        .where(eq(tables.fetchJobs.id, job.id));
    } catch (err) {
      const providerError = err instanceof ProviderError ? err : null;
      const attempts = providerError?.attempts ?? 1;
      // The upstream answered correctly that the thing does not exist. That is
      // not a provider failure, and it is not the customer's bill either.
      const notFound = providerError?.kind === "http" && providerError.status === 404;

      // A timeout is recorded distinctly from an outright failure — they need
      // different fixes, and the admin console counts both against the provider.
      await db
        .update(tables.fetchJobs)
        .set({
          status: notFound ? "succeeded" : (providerError?.jobStatus ?? "failed"),
          attempts,
          finishedAt: new Date(),
          error: err instanceof Error ? err.message.slice(0, 500) : String(err),
          upstreamCostMicros: costPerCall * attempts,
        })
        .where(eq(tables.fetchJobs.id, job.id));

      await logRejection({
        endpoint,
        orgId: org.id,
        apiKeyId: apiKey.id,
        statusCode: notFound ? 404 : 502,
        latencyMs: Date.now() - startedAt,
      });

      if (notFound) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      // The customer is never charged for our upstream's bad day.
      return NextResponse.json(
        {
          error: "Upstream provider failed",
          detail: providerError?.kind === "timeout" ? "The data provider timed out" : undefined,
        },
        { status: 502 },
      );
    }
  }

  // 6. Meter + bill atomically: request log and ledger debit in one transaction
  const latencyMs = Date.now() - startedAt;
  const chargedMicros = isBillable ? priceMicros : 0;
  let balanceMicros: number | null = null;
  let spentBonusMicros = 0;

  await db.transaction(async (tx) => {
    const [req] = await tx
      .insert(tables.apiRequests)
      .values({
        orgId: org.id,
        apiKeyId: apiKey.id,
        endpoint,
        statusCode: 200,
        creditsCostMicros: chargedMicros,
        latencyMs,
        cacheHit,
      })
      .returning({ id: tables.apiRequests.id });

    if (isBillable) {
      const res = await debitCredits(tx, {
        orgId: org.id,
        amountMicros: priceMicros,
        reference: req.id,
      });
      balanceMicros = res.totalMicros;
      spentBonusMicros = res.fromBonusMicros;
    }
  });

  if (balanceMicros !== null) {
    // Fire-and-forget: a warning must never delay or fail the customer's call.
    recordBalanceAlert(org.id, balanceMicros).catch(() => {});
  }
  db.update(tables.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(tables.apiKeys.id, apiKey.id))
    .then(() => {}, () => {});

  return NextResponse.json({
    data: payload,
    meta: {
      endpoint,
      cache_hit: cacheHit,
      credits_charged_micros: chargedMicros,
      credits_from_bonus_micros: spentBonusMicros,
      balance_micros: balanceMicros,
      environment: apiKey.environment,
      latency_ms: latencyMs,
    },
  });
}

// ── parameter helpers ────────────────────────────────────────────────────

/** A required, trimmed query parameter, or a 400 naming it. */
export function required(searchParams: URLSearchParams, name: string): string | ParseError {
  const value = searchParams.get(name)?.trim();
  return value ? value : { error: `Missing ?${name}= parameter` };
}

/** An optional pagination cursor. Opaque and case-sensitive, so never lowercased. */
export function cursorParam(searchParams: URLSearchParams): string | undefined {
  return searchParams.get("cursor")?.trim() || undefined;
}

/** Post ids are numeric strings; anything else is rejected before it costs a call. */
export function tweetIdParam(searchParams: URLSearchParams): string | ParseError {
  const id = required(searchParams, "tweet_id");
  if (typeof id !== "string") return id;
  return /^\d{1,25}$/.test(id) ? id : { error: "tweet_id must be a numeric post id" };
}

/** Usernames are case-insensitive, with or without a leading @. */
export function usernameParam(searchParams: URLSearchParams): string | ParseError {
  const name = required(searchParams, "username");
  if (typeof name !== "string") return name;
  const normalised = name.replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_]{1,30}$/.test(normalised)
    ? normalised
    : { error: "username may contain only letters, digits and underscores" };
}
