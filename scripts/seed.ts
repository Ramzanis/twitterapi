// Local dev seed: creates a user, their personal org, a live API key, and a
// signup-bonus ledger entry. Prints the API key ONCE (only the hash is stored).
// Run: pnpm seed

import "dotenv/config";
import { randomBytes, createHash } from "crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as tables from "../db/schema";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client, { schema: tables });

async function main() {
  const email = "dev@example.com";
  const existing = await db.select().from(tables.users);
  if (existing.some((u) => u.email === email)) {
    console.log("Seed user already exists — wipe the DB (docker compose down -v) to reseed.");
    return;
  }

  const [user] = await db
    .insert(tables.users)
    .values({
      googleSub: `dev-${randomBytes(8).toString("hex")}`,
      email,
      name: "Dev User",
      tosVersion: "2026-08-01",
      tosAcceptedAt: new Date(),
    })
    .returning();

  const [org] = await db
    .insert(tables.organizations)
    .values({
      name: "Dev User",
      slug: "dev-user",
      planCode: "payg",
      spendAlertThresholds: [50, 80, 100],
    })
    .returning();

  await db.insert(tables.organizationMembers).values({
    orgId: org.id,
    userId: user.id,
    role: "owner",
  });

  const rawKey = `sk_live_${randomBytes(24).toString("hex")}`;
  await db.insert(tables.apiKeys).values({
    orgId: org.id,
    name: "Local dev key",
    keyPrefix: rawKey.slice(0, 12) + "…",
    keyHash: createHash("sha256").update(rawKey).digest("hex"),
    environment: "live",
    createdBy: user.id,
  });

  const bonusMicros = 100_000; // $0.10 — same as the landing page promise
  await db.insert(tables.creditLedger).values({
    orgId: org.id,
    amountMicros: bonusMicros,
    type: "bonus",
    bucket: "bonus",
    reference: "signup-bonus",
    balanceAfterMicros: bonusMicros,
  });

  await db.insert(tables.auditLogs).values({
    orgId: org.id,
    actorUserId: null,
    action: "org.seeded",
    metadata: { plan: "payg", bonus_micros: bonusMicros },
  });

  console.log("Seeded org:", org.slug, `(plan: ${org.planCode})`);
  console.log("Balance: $" + (bonusMicros / 1_000_000).toFixed(2));
  console.log("\nYour API key (store it — only the hash is saved):\n");
  console.log("  " + rawKey + "\n");
  console.log('Try: curl "http://localhost:3000/api/x/tweet/search?query=AI+agents" -H "X-API-Key: <key>"');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
