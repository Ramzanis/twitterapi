// Ledger correctness check: balance chain + concurrent-debit safety.
// Run: pnpm tsx scripts/verify-ledger.ts
import "dotenv/config";
import { db, tables } from "../db";
import { appendLedgerEntry, debitCredits, getBalances, getBalanceMicros } from "../lib/ledger";
import { eq, sql } from "drizzle-orm";

async function main() {
  const [org] = await db
    .select()
    .from(tables.organizations)
    .where(eq(tables.organizations.slug, "dev-user"))
    .limit(1);

  const start = await getBalanceMicros(org.id);
  console.log("start balance:", start);

  // 1. A manual top-up, the same call the admin credits control makes.
  await db.transaction(async (tx) =>
    appendLedgerEntry(tx, {
      orgId: org.id,
      amountMicros: 5_000_000,
      type: "purchase",
      reference: "verify-topup",
    }),
  );
  const afterTopUp = await getBalanceMicros(org.id);
  console.log("after +$5.00:", afterTopUp, afterTopUp === start + 5_000_000 ? "OK" : "MISMATCH");

  // 2. Ten concurrent debits through the real billing path. debitCredits now
  //    reads two bucket balances and may write two rows per charge, all under
  //    the org row lock — more to get wrong, so this is the load-bearing test.
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      db.transaction(async (tx) =>
        debitCredits(tx, {
          orgId: org.id,
          amountMicros: 150,
          reference: `verify-concurrent-${i}`,
        }),
      ),
    ),
  );
  const afterDebits = await getBalanceMicros(org.id);
  const expected = afterTopUp - 1500;
  console.log(
    "after 10 concurrent debits:",
    afterDebits,
    afterDebits === expected ? "OK" : `MISMATCH (expected ${expected})`,
  );

  // 3. No duplicate balance_after within a bucket means no lost update.
  const rows = await db
    .select({
      bucket: tables.creditLedger.bucket,
      balance: tables.creditLedger.balanceAfterMicros,
    })
    .from(tables.creditLedger)
    .where(eq(tables.creditLedger.orgId, org.id));
  const keys = rows.map((r) => `${r.bucket}:${r.balance}`);
  const distinct = new Set(keys);
  console.log(
    `ledger rows: ${rows.length}, distinct (bucket,balance): ${distinct.size}`,
    distinct.size === rows.length ? "OK (no lost updates)" : "DUPLICATE BALANCES",
  );

  // 4. The per-bucket chains must reconcile with the sum of their amounts.
  const balances = await getBalances(org.id);
  const [sums] = await db
    .select({
      paid: sql<number>`coalesce(sum(${tables.creditLedger.amountMicros}) filter (where ${tables.creditLedger.bucket} = 'paid'), 0)::bigint`,
      bonus: sql<number>`coalesce(sum(${tables.creditLedger.amountMicros}) filter (where ${tables.creditLedger.bucket} = 'bonus'), 0)::bigint`,
    })
    .from(tables.creditLedger)
    .where(eq(tables.creditLedger.orgId, org.id));
  console.log(
    "chain vs sum of amounts:",
    `paid ${balances.paidMicros} vs ${Number(sums.paid)},`,
    `bonus ${balances.bonusMicros} vs ${Number(sums.bonus)}`,
    balances.paidMicros === Number(sums.paid) && balances.bonusMicros === Number(sums.bonus)
      ? "OK"
      : "CHAIN DRIFT",
  );

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
