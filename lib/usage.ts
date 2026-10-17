import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, tables } from "@/db";

export interface UsageSummary {
  requests: number;
  errors: number;
  throttled: number;
  creditsSpentMicros: number;
  cacheHits: number;
  avgLatencyMs: number | null;
}

export interface WindowUsage {
  label: string;
  calls: number;
  creditsMicros: number;
  throttled: number;
}

/**
 * Consumption across several time windows in one round trip. These are exact
 * counts, not samples — every call is written in the same transaction as its
 * ledger debit, so this and the balance can never disagree.
 */
export async function getWindowUsage(orgId: string): Promise<WindowUsage[]> {
  const windows: { label: string; minutes: number }[] = [
    { label: "30 min", minutes: 30 },
    { label: "1 hour", minutes: 60 },
    { label: "1 day", minutes: 60 * 24 },
    { label: "7 days", minutes: 60 * 24 * 7 },
    { label: "30 days", minutes: 60 * 24 * 30 },
  ];

  // One small aggregate per window. Each hits the (org_id, created_at) index
  // and they run in parallel; a single clever query buys nothing here.
  const results = await Promise.all(
    windows.map(async (w) => {
      const from = new Date(Date.now() - w.minutes * 60 * 1000);
      const [row] = await db
        .select({
          calls: sql<number>`count(*)::int`,
          creditsMicros: sql<number>`coalesce(sum(${tables.apiRequests.creditsCostMicros}), 0)::int`,
          throttled: sql<number>`count(*) filter (where ${tables.apiRequests.statusCode} = 429)::int`,
        })
        .from(tables.apiRequests)
        .where(
          and(eq(tables.apiRequests.orgId, orgId), gte(tables.apiRequests.createdAt, from)),
        );
      return {
        label: w.label,
        calls: row?.calls ?? 0,
        creditsMicros: row?.creditsMicros ?? 0,
        throttled: row?.throttled ?? 0,
      };
    }),
  );
  return results;
}

/**
 * Aggregate over api_requests. At Phase 0 volumes this is instant; when it
 * slows down, point these same queries at usage_rollups_daily instead.
 */
export async function getUsageSummary(orgId: string, sinceDays = 30): Promise<UsageSummary> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      requests: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${tables.apiRequests.statusCode} >= 400)::int`,
      throttled: sql<number>`count(*) filter (where ${tables.apiRequests.statusCode} = 429)::int`,
      creditsSpentMicros: sql<number>`coalesce(sum(${tables.apiRequests.creditsCostMicros}), 0)::int`,
      cacheHits: sql<number>`count(*) filter (where ${tables.apiRequests.cacheHit})::int`,
      avgLatencyMs: sql<number | null>`avg(${tables.apiRequests.latencyMs}) filter (where ${tables.apiRequests.statusCode} < 400)::int`,
    })
    .from(tables.apiRequests)
    .where(and(eq(tables.apiRequests.orgId, orgId), gte(tables.apiRequests.createdAt, since)));

  return (
    row ?? {
      requests: 0,
      errors: 0,
      throttled: 0,
      creditsSpentMicros: 0,
      cacheHits: 0,
      avgLatencyMs: null,
    }
  );
}

export interface DailyUsage {
  day: string;
  requests: number;
  creditsSpentMicros: number;
}

export async function getDailyUsage(orgId: string, days = 14): Promise<DailyUsage[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${tables.apiRequests.createdAt}), 'YYYY-MM-DD')`,
      requests: sql<number>`count(*)::int`,
      creditsSpentMicros: sql<number>`coalesce(sum(${tables.apiRequests.creditsCostMicros}), 0)::int`,
    })
    .from(tables.apiRequests)
    .where(and(eq(tables.apiRequests.orgId, orgId), gte(tables.apiRequests.createdAt, since)))
    .groupBy(sql`date_trunc('day', ${tables.apiRequests.createdAt})`)
    .orderBy(sql`date_trunc('day', ${tables.apiRequests.createdAt})`);
  return rows;
}

export async function getEndpointBreakdown(orgId: string, sinceDays = 30) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  return db
    .select({
      endpoint: tables.apiRequests.endpoint,
      requests: sql<number>`count(*)::int`,
      creditsSpentMicros: sql<number>`coalesce(sum(${tables.apiRequests.creditsCostMicros}), 0)::int`,
    })
    .from(tables.apiRequests)
    .where(and(eq(tables.apiRequests.orgId, orgId), gte(tables.apiRequests.createdAt, since)))
    .groupBy(tables.apiRequests.endpoint)
    .orderBy(desc(sql`count(*)`));
}

/** Recent calls, attributed to the key that made them. */
export async function getRecentRequests(orgId: string, limit = 15) {
  return db
    .select({
      id: tables.apiRequests.id,
      endpoint: tables.apiRequests.endpoint,
      statusCode: tables.apiRequests.statusCode,
      creditsCostMicros: tables.apiRequests.creditsCostMicros,
      latencyMs: tables.apiRequests.latencyMs,
      cacheHit: tables.apiRequests.cacheHit,
      createdAt: tables.apiRequests.createdAt,
      keyName: tables.apiKeys.name,
      keyEnvironment: tables.apiKeys.environment,
    })
    .from(tables.apiRequests)
    .leftJoin(tables.apiKeys, eq(tables.apiKeys.id, tables.apiRequests.apiKeyId))
    .where(eq(tables.apiRequests.orgId, orgId))
    .orderBy(desc(tables.apiRequests.createdAt))
    .limit(limit);
}

/** Rows for the CSV export, over an arbitrary window. */
export async function getRequestsForExport(orgId: string, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db
    .select({
      createdAt: tables.apiRequests.createdAt,
      endpoint: tables.apiRequests.endpoint,
      statusCode: tables.apiRequests.statusCode,
      creditsCostMicros: tables.apiRequests.creditsCostMicros,
      latencyMs: tables.apiRequests.latencyMs,
      cacheHit: tables.apiRequests.cacheHit,
      keyName: tables.apiKeys.name,
    })
    .from(tables.apiRequests)
    .leftJoin(tables.apiKeys, eq(tables.apiKeys.id, tables.apiRequests.apiKeyId))
    .where(and(eq(tables.apiRequests.orgId, orgId), gte(tables.apiRequests.createdAt, since)))
    .orderBy(desc(tables.apiRequests.createdAt))
    .limit(50_000);
}
