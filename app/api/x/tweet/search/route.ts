import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { authenticate, sha256 } from "@/lib/apiAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { debitCredits, getBalanceMicros, recordBalanceAlert } from "@/lib/ledger";
import { priceFor } from "@/config/pricing";
import { pickProvider, providers } from "@/config/providers";
import { ProviderError } from "@/lib/providers/client";
import { searchTweets } from "@/lib/providers/tweets";

const ENDPOINT = "/tweet/search";
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Log a rejected call. Throttled and out-of-credit requests are recorded with
 * zero cost so customers can see them — an invisible 429 just looks like a
 * broken API from the outside.
 */
async function logRejection(args: {
  orgId: string;
  apiKeyId: string;
  statusCode: number;
  latencyMs: number;
}) {
  await db.insert(tables.apiRequests).values({
    orgId: args.orgId,
    apiKeyId: args.apiKeyId,
    endpoint: ENDPOINT,
    statusCode: args.statusCode,
    creditsCostMicros: 0,
    latencyMs: args.latencyMs,
    cacheHit: false,
  });
}

export async function GET(request: Request) {
  const startedAt = Date.now();

  // 1. Authenticate: API key hash → org + plan
  const auth = await authenticate(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { org, apiKey, plan } = auth.ctx;

  // 2. Rate limit, then credit balance (test keys bypass billing)
  if (!checkRateLimit(apiKey.id, plan.rateLimitRps)) {
    await logRejection({
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
  const priceMicros = priceFor(ENDPOINT);
  if (isBillable && (await getBalanceMicros(org.id)) < priceMicros) {
    await logRejection({
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

  const query = new URL(request.url).searchParams.get("query")?.trim();
  if (!query) {
    return NextResponse.json({ error: "Missing ?query= parameter" }, { status: 400 });
  }

  // 3. Cache lookup — a hit costs us nothing upstream but still bills
  const paramsHash = sha256(`${ENDPOINT}:${query.toLowerCase()}`);
  const now = new Date();
  const [cached] = await db
    .select()
    .from(tables.responseCache)
    .where(eq(tables.responseCache.paramsHash, paramsHash))
    .limit(1);

  let payload: { tweets: unknown[]; result_count: number } | undefined;
  let cacheHit = false;

  if (cached && cached.expiresAt > now) {
    payload = cached.payload as { tweets: unknown[]; result_count: number };
    cacheHit = true;
    await db
      .update(tables.responseCache)
      .set({ hitCount: sql`${tables.responseCache.hitCount} + 1` })
      .where(eq(tables.responseCache.paramsHash, paramsHash));
  } else {
    // 4. Cache miss: record a fetch_job and call the provider
    const providerCode = pickProvider();
    const [job] = await db
      .insert(tables.fetchJobs)
      .values({
        providerCode,
        endpoint: ENDPOINT,
        params: { query },
        paramsHash,
        status: "running",
        attempts: 1,
        startedAt: now,
      })
      .returning({ id: tables.fetchJobs.id });

    try {
      const result = await searchTweets(query);
      payload = { tweets: result.tweets, result_count: result.result_count };
      const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
      await db
        .insert(tables.responseCache)
        .values({ paramsHash, endpoint: ENDPOINT, payload, fetchedAt: new Date(), expiresAt })
        .onConflictDoUpdate({
          target: tables.responseCache.paramsHash,
          set: { payload, fetchedAt: new Date(), expiresAt },
        });
      await db
        .update(tables.fetchJobs)
        .set({
          status: "succeeded",
          attempts: result.attempts,
          finishedAt: new Date(),
          // Every attempt costs us, so bill ourselves for the retries too.
          upstreamCostMicros: providers[providerCode].costPerCallMicros * result.attempts,
        })
        .where(eq(tables.fetchJobs.id, job.id));
    } catch (err) {
      // A timeout is recorded distinctly from an outright failure — they need
      // different fixes, and the admin console counts both against the provider.
      const providerError = err instanceof ProviderError ? err : null;
      await db
        .update(tables.fetchJobs)
        .set({
          status: providerError?.jobStatus ?? "failed",
          attempts: providerError?.attempts ?? 1,
          finishedAt: new Date(),
          error: err instanceof Error ? err.message.slice(0, 500) : String(err),
          upstreamCostMicros:
            providers[providerCode].costPerCallMicros * (providerError?.attempts ?? 1),
        })
        .where(eq(tables.fetchJobs.id, job.id));

      // The customer is never charged for our upstream's bad day.
      await logRejection({
        orgId: org.id,
        apiKeyId: apiKey.id,
        statusCode: 502,
        latencyMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        {
          error: "Upstream provider failed",
          detail: providerError?.kind === "timeout" ? "The data provider timed out" : undefined,
        },
        { status: 502 },
      );
    }
  }

  // 5. Meter + bill atomically: request log and ledger debit in one transaction
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
        endpoint: ENDPOINT,
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
      endpoint: ENDPOINT,
      cache_hit: cacheHit,
      credits_charged_micros: chargedMicros,
      credits_from_bonus_micros: spentBonusMicros,
      balance_micros: balanceMicros,
      environment: apiKey.environment,
      latency_ms: latencyMs,
    },
  });
}
