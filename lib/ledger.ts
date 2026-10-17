import { and, desc, eq, sql } from "drizzle-orm";
import { db, tables } from "@/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Bucket = "paid" | "bonus";

export interface Balances {
  paidMicros: number;
  bonusMicros: number;
  totalMicros: number;
}

/** Balance thresholds (whole dollars) customers are warned at. */
export const BALANCE_ALERT_DOLLARS = [10, 5, 1, 0];

async function latestBalance(
  runner: Tx | typeof db,
  orgId: string,
  bucket: Bucket,
): Promise<number> {
  const [row] = await runner
    .select({ balance: tables.creditLedger.balanceAfterMicros })
    .from(tables.creditLedger)
    .where(
      and(eq(tables.creditLedger.orgId, orgId), eq(tables.creditLedger.bucket, bucket)),
    )
    .orderBy(desc(tables.creditLedger.id))
    .limit(1);
  return row?.balance ?? 0;
}

export async function getBalances(orgId: string): Promise<Balances> {
  const [paidMicros, bonusMicros] = await Promise.all([
    latestBalance(db, orgId, "paid"),
    latestBalance(db, orgId, "bonus"),
  ]);
  return { paidMicros, bonusMicros, totalMicros: paidMicros + bonusMicros };
}

/** Total spendable credits, the figure the API's 402 check uses. */
export async function getBalanceMicros(orgId: string): Promise<number> {
  return (await getBalances(orgId)).totalMicros;
}

/**
 * Append one entry to a bucket. Locks the org row first so concurrent writers
 * cannot compute the same balance_after (race-safe).
 */
export async function appendLedgerEntry(
  tx: Tx,
  args: {
    orgId: string;
    amountMicros: number;
    type: "purchase" | "bonus" | "usage" | "refund" | "adjustment";
    bucket?: Bucket;
    reference?: string;
    /**
     * External cause of this entry (topup_request id, gateway payment id).
     * Unique in the database, so passing it makes a double-credit impossible
     * even if the calling code is wrong.
     */
    sourceId?: string;
    /** Set when the caller already holds the org row lock. */
    locked?: boolean;
  },
): Promise<{ balanceAfterMicros: number }> {
  const bucket: Bucket = args.bucket ?? (args.type === "bonus" ? "bonus" : "paid");
  if (!args.locked) {
    await tx.execute(sql`SELECT id FROM organizations WHERE id = ${args.orgId} FOR UPDATE`);
  }

  const balanceAfterMicros = (await latestBalance(tx, args.orgId, bucket)) + args.amountMicros;
  await tx.insert(tables.creditLedger).values({
    orgId: args.orgId,
    amountMicros: args.amountMicros,
    type: args.type,
    bucket,
    reference: args.reference,
    sourceId: args.sourceId,
    balanceAfterMicros,
  });

  // A top-up re-arms the low-balance warnings.
  if (args.amountMicros > 0 && (args.type === "purchase" || args.type === "bonus")) {
    await tx
      .update(tables.organizations)
      .set({ lastBalanceAlertDollars: null })
      .where(eq(tables.organizations.id, args.orgId));
  }

  return { balanceAfterMicros };
}

export interface DebitResult extends Balances {
  fromBonusMicros: number;
  fromPaidMicros: number;
}

/**
 * Charge usage, spending bonus credits first — they are the expiring,
 * zero-cost-basis money, and draining them first keeps paid credits (a real
 * liability) available. A charge that straddles both buckets writes one entry
 * per bucket so each chain stays continuous.
 */
export async function debitCredits(
  tx: Tx,
  args: { orgId: string; amountMicros: number; reference?: string },
): Promise<DebitResult> {
  await tx.execute(sql`SELECT id FROM organizations WHERE id = ${args.orgId} FOR UPDATE`);

  const bonusBefore = await latestBalance(tx, args.orgId, "bonus");
  const fromBonusMicros = Math.max(0, Math.min(bonusBefore, args.amountMicros));
  const fromPaidMicros = args.amountMicros - fromBonusMicros;

  let bonusAfter = bonusBefore;
  if (fromBonusMicros > 0) {
    const res = await appendLedgerEntry(tx, {
      orgId: args.orgId,
      amountMicros: -fromBonusMicros,
      type: "usage",
      bucket: "bonus",
      reference: args.reference,
      locked: true,
    });
    bonusAfter = res.balanceAfterMicros;
  }

  let paidAfter = await latestBalance(tx, args.orgId, "paid");
  if (fromPaidMicros > 0) {
    const res = await appendLedgerEntry(tx, {
      orgId: args.orgId,
      amountMicros: -fromPaidMicros,
      type: "usage",
      bucket: "paid",
      reference: args.reference,
      locked: true,
    });
    paidAfter = res.balanceAfterMicros;
  }

  return {
    paidMicros: paidAfter,
    bonusMicros: bonusAfter,
    totalMicros: paidAfter + bonusAfter,
    fromBonusMicros,
    fromPaidMicros,
  };
}

/**
 * Record a low-balance warning at most once per threshold per top-up cycle.
 * Returns the threshold to notify about, or null if nothing is due. Delivery
 * is not wired up yet — the audit row is the durable record that it fired.
 */
export async function recordBalanceAlert(
  orgId: string,
  balanceMicros: number,
): Promise<number | null> {
  const dollars = balanceMicros / 1_000_000;

  const [org] = await db
    .select({ last: tables.organizations.lastBalanceAlertDollars })
    .from(tables.organizations)
    .where(eq(tables.organizations.id, orgId))
    .limit(1);
  let last = org?.last ?? null;

  // Self-heal: if the balance has climbed back above the level we last warned
  // at, re-arm here rather than relying on the top-up having gone through
  // appendLedgerEntry. Without this, a credit added by any other route (a
  // manual SQL fix, an import) would silently suppress every future warning.
  if (last !== null && dollars > last) {
    await db
      .update(tables.organizations)
      .set({ lastBalanceAlertDollars: null })
      .where(eq(tables.organizations.id, orgId));
    last = null;
  }

  const crossed = BALANCE_ALERT_DOLLARS.filter((t) => dollars <= t);
  if (crossed.length === 0) return null;
  const lowest = Math.min(...crossed);

  // Already warned at this level or lower — stay quiet until they top up.
  if (last !== null && last <= lowest) return null;

  await db
    .update(tables.organizations)
    .set({ lastBalanceAlertDollars: lowest })
    .where(eq(tables.organizations.id, orgId));
  await db.insert(tables.auditLogs).values({
    orgId,
    actorUserId: null,
    action: "balance_alert",
    metadata: { threshold_dollars: lowest, balance_micros: balanceMicros },
  });
  return lowest;
}
