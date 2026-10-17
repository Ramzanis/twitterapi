import { desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { db, tables } from "@/db";

const since = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

export interface PlatformStats {
  orgs: number;
  users: number;
  activeKeys: number;
  requests: number;
  errors: number;
  cacheHits: number;
  revenueMicros: number;
  upstreamCostMicros: number;
  failedJobs: number;
  outstandingCreditsMicros: number;
}

/** Platform-wide numbers for the admin overview. */
export async function getPlatformStats(days = 30): Promise<PlatformStats> {
  const from = since(days);

  const [[counts], [usage], [jobs], [credits]] = await Promise.all([
    db
      .select({
        orgs: sql<number>`(select count(*) from organizations)::int`,
        users: sql<number>`(select count(*) from users where deleted_at is null)::int`,
        activeKeys: sql<number>`(select count(*) from api_keys where status = 'active')::int`,
      })
      .from(sql`(select 1) as t`),
    db
      .select({
        requests: sql<number>`count(*)::int`,
        errors: sql<number>`count(*) filter (where ${tables.apiRequests.statusCode} >= 400)::int`,
        cacheHits: sql<number>`count(*) filter (where ${tables.apiRequests.cacheHit})::int`,
        revenueMicros: sql<number>`coalesce(sum(${tables.apiRequests.creditsCostMicros}), 0)::int`,
      })
      .from(tables.apiRequests)
      .where(gte(tables.apiRequests.createdAt, from)),
    db
      .select({
        upstreamCostMicros: sql<number>`coalesce(sum(${tables.fetchJobs.upstreamCostMicros}), 0)::int`,
        failedJobs: sql<number>`count(*) filter (where ${tables.fetchJobs.status} in ('failed','timed_out'))::int`,
      })
      .from(tables.fetchJobs)
      .where(gte(tables.fetchJobs.queuedAt, from)),
    // What we owe in unused credits: the newest row per (org, bucket), summed.
    db
      .select({
        outstandingCreditsMicros: sql<number>`coalesce(sum(latest.balance), 0)::bigint`,
      })
      .from(
        sql`(select distinct on (org_id, bucket) balance_after_micros as balance
             from credit_ledger order by org_id, bucket, id desc) as latest`,
      ),
  ]);

  return {
    orgs: counts?.orgs ?? 0,
    users: counts?.users ?? 0,
    activeKeys: counts?.activeKeys ?? 0,
    requests: usage?.requests ?? 0,
    errors: usage?.errors ?? 0,
    cacheHits: usage?.cacheHits ?? 0,
    revenueMicros: usage?.revenueMicros ?? 0,
    upstreamCostMicros: jobs?.upstreamCostMicros ?? 0,
    failedJobs: jobs?.failedJobs ?? 0,
    outstandingCreditsMicros: Number(credits?.outstandingCreditsMicros ?? 0),
  };
}

export interface AdminOrgRow {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "closed";
  planCode: "free" | "payg" | "teams" | "scale";
  /** Custom entitlements are merged over the plan, so a tier change may not bite. */
  hasPlanOverrides: boolean;
  createdAt: Date;
  balanceMicros: number;
  requests: number;
  spentMicros: number;
  members: number;
}

/**
 * Every organization with its balance and recent usage, busiest first.
 *
 * Deliberately four flat queries merged in memory rather than correlated
 * subqueries: Drizzle renders a column reference inside `sql` without its
 * table prefix, so `where org_id = ${organizations.id}` becomes an ambiguous
 * bare `"id"`. This shape is also easier to point at usage_rollups_daily
 * later.
 */
export async function listOrganizations(days = 30): Promise<AdminOrgRow[]> {
  const from = since(days);

  const [orgs, balances, usage, memberCounts] = await Promise.all([
    db.select().from(tables.organizations),
    db
      .select({
        orgId: sql<string>`latest.org_id`,
        balance: sql<number>`sum(latest.balance)::bigint`,
      })
      .from(
        sql`(select distinct on (org_id, bucket) org_id, balance_after_micros as balance
             from credit_ledger order by org_id, bucket, id desc) as latest`,
      )
      .groupBy(sql`latest.org_id`),
    db
      .select({
        orgId: tables.apiRequests.orgId,
        requests: sql<number>`count(*)::int`,
        spentMicros: sql<number>`coalesce(sum(${tables.apiRequests.creditsCostMicros}), 0)::int`,
      })
      .from(tables.apiRequests)
      .where(gte(tables.apiRequests.createdAt, from))
      .groupBy(tables.apiRequests.orgId),
    db
      .select({
        orgId: tables.organizationMembers.orgId,
        members: sql<number>`count(*)::int`,
      })
      .from(tables.organizationMembers)
      .groupBy(tables.organizationMembers.orgId),
  ]);

  const balanceBy = new Map(balances.map((b) => [b.orgId, Number(b.balance ?? 0)]));
  const usageBy = new Map(usage.map((u) => [u.orgId, u]));
  const membersBy = new Map(memberCounts.map((m) => [m.orgId, m.members]));

  return orgs
    .map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      planCode: org.planCode,
      hasPlanOverrides: org.planOverrides != null,
      createdAt: org.createdAt,
      balanceMicros: balanceBy.get(org.id) ?? 0,
      requests: usageBy.get(org.id)?.requests ?? 0,
      spentMicros: usageBy.get(org.id)?.spentMicros ?? 0,
      members: membersBy.get(org.id) ?? 0,
    }))
    .sort((a, b) => b.requests - a.requests || a.name.localeCompare(b.name));
}

/**
 * Postgres rejects a malformed uuid in an equality test rather than returning
 * no rows, so an id comparison is only added when the term actually looks like
 * one — otherwise every search for "acme" would be a 500.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Organizations matching a search term, by their own identity and by the
 * things staff actually have to hand when someone asks for help: a member's
 * email, or the key prefix off a log line.
 */
export async function searchOrganizationIds(query: string): Promise<Set<string>> {
  const term = `%${query}%`;
  const byId = UUID_PATTERN.test(query) ? eq(tables.organizations.id, query) : undefined;

  const [orgs, keys, members] = await Promise.all([
    db
      .select({ id: tables.organizations.id })
      .from(tables.organizations)
      .where(or(ilike(tables.organizations.name, term), ilike(tables.organizations.slug, term), byId)),
    db
      .select({ id: tables.apiKeys.orgId })
      .from(tables.apiKeys)
      .where(ilike(tables.apiKeys.keyPrefix, term)),
    db
      .select({ id: tables.organizationMembers.orgId })
      .from(tables.organizationMembers)
      .innerJoin(tables.users, eq(tables.users.id, tables.organizationMembers.userId))
      .where(or(ilike(tables.users.email, term), ilike(tables.users.name, term))),
  ]);

  return new Set([...orgs, ...keys, ...members].map((row) => row.id));
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  isStaff: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  deletedAt: Date | null;
  orgs: { id: string; name: string; role: string }[];
}

/**
 * Users matching a search term, with the organizations they belong to.
 *
 * Memberships are fetched in a second query rather than joined: a join would
 * multiply a user by their membership count, and the limit would then cut a
 * user's rows in half instead of limiting users.
 */
export async function searchUsers(query: string, limit = 25): Promise<AdminUserRow[]> {
  const term = `%${query}%`;
  const byId = UUID_PATTERN.test(query) ? eq(tables.users.id, query) : undefined;

  const matched = await db
    .select({
      id: tables.users.id,
      email: tables.users.email,
      name: tables.users.name,
      isStaff: tables.users.isStaff,
      createdAt: tables.users.createdAt,
      lastLoginAt: tables.users.lastLoginAt,
      deletedAt: tables.users.deletedAt,
    })
    .from(tables.users)
    .where(or(ilike(tables.users.email, term), ilike(tables.users.name, term), byId))
    .orderBy(desc(tables.users.createdAt))
    .limit(limit);

  if (matched.length === 0) return [];

  const memberships = await db
    .select({
      userId: tables.organizationMembers.userId,
      orgId: tables.organizations.id,
      orgName: tables.organizations.name,
      role: tables.organizationMembers.role,
    })
    .from(tables.organizationMembers)
    .innerJoin(
      tables.organizations,
      eq(tables.organizations.id, tables.organizationMembers.orgId),
    )
    .where(
      inArray(
        tables.organizationMembers.userId,
        matched.map((user) => user.id),
      ),
    );

  const orgsBy = new Map<string, AdminUserRow["orgs"]>();
  for (const row of memberships) {
    const list = orgsBy.get(row.userId) ?? [];
    list.push({ id: row.orgId, name: row.orgName, role: row.role });
    orgsBy.set(row.userId, list);
  }

  return matched.map((user) => ({ ...user, orgs: orgsBy.get(user.id) ?? [] }));
}

export async function getOrgDetail(orgId: string) {
  const [org] = await db
    .select()
    .from(tables.organizations)
    .where(eq(tables.organizations.id, orgId))
    .limit(1);
  if (!org) return null;

  const [members, keys, ledger, recent] = await Promise.all([
    db
      .select({
        userId: tables.users.id,
        email: tables.users.email,
        name: tables.users.name,
        isStaff: tables.users.isStaff,
        role: tables.organizationMembers.role,
        lastLoginAt: tables.users.lastLoginAt,
      })
      .from(tables.organizationMembers)
      .innerJoin(tables.users, eq(tables.users.id, tables.organizationMembers.userId))
      .where(eq(tables.organizationMembers.orgId, orgId)),
    db
      .select()
      .from(tables.apiKeys)
      .where(eq(tables.apiKeys.orgId, orgId))
      .orderBy(desc(tables.apiKeys.createdAt)),
    db
      .select()
      .from(tables.creditLedger)
      .where(eq(tables.creditLedger.orgId, orgId))
      .orderBy(desc(tables.creditLedger.id))
      .limit(25),
    db
      .select()
      .from(tables.apiRequests)
      .where(eq(tables.apiRequests.orgId, orgId))
      .orderBy(desc(tables.apiRequests.createdAt))
      .limit(15),
  ]);

  return { org, members, keys, ledger, recent };
}

export async function getRecentAuditLogs(limit = 25) {
  return db
    .select({
      id: tables.auditLogs.id,
      orgId: tables.auditLogs.orgId,
      orgName: tables.organizations.name,
      actorUserId: tables.auditLogs.actorUserId,
      actorEmail: tables.users.email,
      action: tables.auditLogs.action,
      metadata: tables.auditLogs.metadata,
      createdAt: tables.auditLogs.createdAt,
    })
    .from(tables.auditLogs)
    .leftJoin(tables.organizations, eq(tables.organizations.id, tables.auditLogs.orgId))
    .leftJoin(tables.users, eq(tables.users.id, tables.auditLogs.actorUserId))
    .orderBy(desc(tables.auditLogs.id))
    .limit(limit);
}

/**
 * Traffic and revenue per endpoint — which of our products people actually
 * use, and which of them carry their weight. Cache hits are the margin, so
 * they are reported alongside the money rather than as a separate curiosity.
 */
export async function getEndpointStats(days = 30) {
  return db
    .select({
      endpoint: tables.apiRequests.endpoint,
      requests: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${tables.apiRequests.statusCode} >= 400)::int`,
      cacheHits: sql<number>`count(*) filter (where ${tables.apiRequests.cacheHit})::int`,
      revenueMicros: sql<number>`coalesce(sum(${tables.apiRequests.creditsCostMicros}), 0)::int`,
      avgLatencyMs: sql<number>`coalesce(round(avg(${tables.apiRequests.latencyMs})), 0)::int`,
    })
    .from(tables.apiRequests)
    .where(gte(tables.apiRequests.createdAt, since(days)))
    .groupBy(tables.apiRequests.endpoint)
    .orderBy(desc(sql`count(*)`));
}

/**
 * Upstream calls that did not succeed. Every attempt still cost us, so this is
 * both an operational view and part of the margin story.
 */
export async function getRecentFailedJobs(limit = 20) {
  return db
    .select({
      id: tables.fetchJobs.id,
      providerCode: tables.fetchJobs.providerCode,
      endpoint: tables.fetchJobs.endpoint,
      status: tables.fetchJobs.status,
      attempts: tables.fetchJobs.attempts,
      costMicros: tables.fetchJobs.upstreamCostMicros,
      error: tables.fetchJobs.error,
      queuedAt: tables.fetchJobs.queuedAt,
    })
    .from(tables.fetchJobs)
    .where(inArray(tables.fetchJobs.status, ["failed", "timed_out"]))
    .orderBy(desc(tables.fetchJobs.queuedAt))
    .limit(limit);
}

/** Provider health from fetch_jobs — the reconciliation view for upstream spend. */
export async function getProviderStats(days = 30) {
  return db
    .select({
      providerCode: tables.fetchJobs.providerCode,
      jobs: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where ${tables.fetchJobs.status} in ('failed','timed_out'))::int`,
      costMicros: sql<number>`coalesce(sum(${tables.fetchJobs.upstreamCostMicros}), 0)::int`,
    })
    .from(tables.fetchJobs)
    .where(gte(tables.fetchJobs.queuedAt, since(days)))
    .groupBy(tables.fetchJobs.providerCode)
    .orderBy(desc(sql`count(*)`));
}
