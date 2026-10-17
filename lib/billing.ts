import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { appendLedgerEntry } from "@/lib/ledger";

/** Short human-quotable reference a customer puts on their bank transfer. */
export function makeTopupReference(orgSlug: string): string {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const slug = orgSlug.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase();
  return `SKY-${slug || "ORG"}-${suffix}`;
}

export async function listTopupRequests(orgId: string, limit = 20) {
  return db
    .select()
    .from(tables.topupRequests)
    .where(eq(tables.topupRequests.orgId, orgId))
    .orderBy(desc(tables.topupRequests.createdAt))
    .limit(limit);
}

export async function getPendingTopups(orgId: string) {
  return db
    .select()
    .from(tables.topupRequests)
    .where(
      and(
        eq(tables.topupRequests.orgId, orgId),
        eq(tables.topupRequests.status, "pending"),
      ),
    )
    .orderBy(desc(tables.topupRequests.createdAt));
}

/** Ledger entries for the billing history table. */
export async function getLedger(orgId: string, limit = 50) {
  return db
    .select()
    .from(tables.creditLedger)
    .where(eq(tables.creditLedger.orgId, orgId))
    .orderBy(desc(tables.creditLedger.id))
    .limit(limit);
}

/** Lifetime paid-in total, for the billing summary. */
export async function getLifetimePurchasedMicros(orgId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${tables.creditLedger.amountMicros}) filter (
        where ${tables.creditLedger.type} = 'purchase'
      ), 0)::bigint`,
    })
    .from(tables.creditLedger)
    .where(eq(tables.creditLedger.orgId, orgId));
  return Number(row?.total ?? 0);
}

/**
 * Mark a top-up paid and credit the ledger in one transaction, so a request
 * can never be marked paid without the money appearing (or the reverse).
 *
 * The update is guarded on `status = 'pending'`, which makes it idempotent:
 * a double-click, a retried webhook, or two staff acting at once will find no
 * pending row on the second attempt and return null rather than double-credit.
 */
export async function fulfilTopupRequest(
  id: string,
  completedByUserId: string | null,
  options: {
    /** What the gateway actually captured. Defaults to the requested amount. */
    amountReceivedCents?: number;
    providerPaymentId?: string;
  } = {},
): Promise<{
  orgId: string;
  amountCents: number;
  creditedCents: number;
  reference: string;
  balanceAfterMicros: number;
} | null> {
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(tables.topupRequests)
      .set({
        status: "paid",
        completedAt: new Date(),
        completedBy: completedByUserId,
        amountReceivedCents: options.amountReceivedCents,
        providerPaymentId: options.providerPaymentId,
      })
      // Anything not yet settled can be fulfilled; already-paid and cancelled
      // rows match nothing, which is what makes this idempotent.
      .where(
        and(
          eq(tables.topupRequests.id, id),
          inArray(tables.topupRequests.status, ["pending", "processing"]),
        ),
      )
      .returning({
        orgId: tables.topupRequests.orgId,
        amountCents: tables.topupRequests.amountCents,
        reference: tables.topupRequests.reference,
      });
    if (claimed.length === 0) return null;

    const row = claimed[0];
    // Credit what actually arrived, not what was asked for.
    const creditedCents = options.amountReceivedCents ?? row.amountCents;
    const { balanceAfterMicros } = await appendLedgerEntry(tx, {
      orgId: row.orgId,
      amountMicros: creditedCents * 10_000, // cents → micros
      type: "purchase",
      bucket: "paid",
      reference: row.reference,
      // Database-level guarantee: one credit per top-up request, ever.
      sourceId: `topup:${id}`,
    });
    return { ...row, creditedCents, balanceAfterMicros };
  });
}

/**
 * Unsettled top-ups older than `minutes` — the reconciliation sweep's input.
 * A webhook that never arrived leaves a row sitting here, so this is what
 * turns "the customer paid and got nothing" into a self-healing blip.
 */
export async function findStaleTopups(minutes = 15, limit = 100) {
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  return db
    .select()
    .from(tables.topupRequests)
    .where(
      and(
        inArray(tables.topupRequests.status, ["pending", "processing"]),
        lt(tables.topupRequests.createdAt, cutoff),
      ),
    )
    .orderBy(tables.topupRequests.createdAt)
    .limit(limit);
}

/** Record that the reconciler looked at a request, whatever the outcome. */
export async function markTopupChecked(id: string) {
  await db
    .update(tables.topupRequests)
    .set({ lastCheckedAt: new Date() })
    .where(eq(tables.topupRequests.id, id));
}

/** Size of the staff work queue, for the badge in the admin nav. */
export async function countPendingTopups(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tables.topupRequests)
    .where(eq(tables.topupRequests.status, "pending"));
  return row?.count ?? 0;
}

/** Every top-up awaiting payment, across all orgs — the staff work queue. */
export async function listPendingTopupsForStaff() {
  return db
    .select({
      id: tables.topupRequests.id,
      orgId: tables.topupRequests.orgId,
      orgName: tables.organizations.name,
      orgSlug: tables.organizations.slug,
      amountCents: tables.topupRequests.amountCents,
      reference: tables.topupRequests.reference,
      note: tables.topupRequests.note,
      createdAt: tables.topupRequests.createdAt,
      requestedByEmail: tables.users.email,
    })
    .from(tables.topupRequests)
    .innerJoin(tables.organizations, eq(tables.organizations.id, tables.topupRequests.orgId))
    .leftJoin(tables.users, eq(tables.users.id, tables.topupRequests.requestedBy))
    .where(eq(tables.topupRequests.status, "pending"))
    .orderBy(tables.topupRequests.createdAt);
}
