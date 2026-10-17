// Top-up fulfilment check: money is credited exactly once, even when the
// "mark paid" action fires twice at the same moment.
// Run: pnpm tsx scripts/verify-topup.ts
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, tables } from "../db";
import { fulfilTopupRequest, makeTopupReference } from "../lib/billing";
import { getBalances } from "../lib/ledger";

async function main() {
  const [org] = await db
    .select()
    .from(tables.organizations)
    .where(eq(tables.organizations.slug, "founder"))
    .limit(1);
  const [staff] = await db.select().from(tables.users).where(eq(tables.users.isStaff, true)).limit(1);

  const before = await getBalances(org.id);
  console.log("paid balance before:", before.paidMicros);

  const reference = makeTopupReference(org.slug);
  const [req] = await db
    .insert(tables.topupRequests)
    .values({ orgId: org.id, amountCents: 2500, reference, requestedBy: staff.id })
    .returning({ id: tables.topupRequests.id });
  console.log("requested $25.00, reference", reference);

  // Two staff clicks landing at the same instant.
  const [a, b] = await Promise.all([
    fulfilTopupRequest(req.id, staff.id).catch(() => null),
    fulfilTopupRequest(req.id, staff.id).catch(() => null),
  ]);
  const winners = [a, b].filter(Boolean).length;
  console.log(`concurrent fulfilments that credited: ${winners}`, winners === 1 ? "OK" : "DOUBLE CREDIT");

  const after = await getBalances(org.id);
  const delta = after.paidMicros - before.paidMicros;
  console.log(`paid balance after: ${after.paidMicros} (delta ${delta})`, delta === 25_000_000 ? "OK" : "WRONG AMOUNT");

  const entries = await db
    .select({ id: tables.creditLedger.id })
    .from(tables.creditLedger)
    .where(eq(tables.creditLedger.sourceId, `topup:${req.id}`));
  console.log(`ledger entries for this request: ${entries.length}`, entries.length === 1 ? "OK" : "DUPLICATED");

  const [row] = await db
    .select({ status: tables.topupRequests.status, completedBy: tables.topupRequests.completedBy })
    .from(tables.topupRequests)
    .where(eq(tables.topupRequests.id, req.id));
  console.log("request status:", row.status, row.completedBy ? "(completed_by recorded)" : "(no completer!)");

  // A third attempt on an already-paid request must be refused.
  const third = await fulfilTopupRequest(req.id, staff.id).catch(() => null);
  console.log("re-fulfil already-paid request:", third === null ? "refused OK" : "CREDITED AGAIN");

  // Partial capture: credit what arrived, not what was asked for.
  const ref2 = makeTopupReference(org.slug);
  const [req2] = await db
    .insert(tables.topupRequests)
    .values({ orgId: org.id, amountCents: 5000, reference: ref2, requestedBy: staff.id })
    .returning({ id: tables.topupRequests.id });
  const partial = await fulfilTopupRequest(req2.id, staff.id, {
    amountReceivedCents: 4870, // $50 requested, $48.70 captured after conversion
    providerPaymentId: `pi_test_${Date.now()}`,
  });
  console.log(
    `requested $50.00, captured $48.70 → credited $${((partial?.creditedCents ?? 0) / 100).toFixed(2)}`,
    partial?.creditedCents === 4870 ? "OK" : "WRONG AMOUNT",
  );

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
