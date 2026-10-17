// Grant (or revoke) staff access — the bootstrap for the first admin, since
// the staff toggle in the console itself requires staff access.
//
//   pnpm staff you@example.com
//   pnpm staff you@example.com --revoke

import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as tables from "../db/schema";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client, { schema: tables });

async function main() {
  const email = process.argv[2];
  const revoke = process.argv.includes("--revoke");
  if (!email) {
    console.error("Usage: pnpm staff <email> [--revoke]");
    process.exitCode = 1;
    return;
  }

  const updated = await db
    .update(tables.users)
    .set({ isStaff: !revoke })
    .where(eq(tables.users.email, email))
    .returning({ email: tables.users.email, isStaff: tables.users.isStaff });

  if (updated.length === 0) {
    console.error(`No user with email ${email}. Sign in once first, then re-run.`);
    process.exitCode = 1;
    return;
  }

  await db.insert(tables.auditLogs).values({
    orgId: null,
    actorUserId: null,
    action: "admin.staff_flag_changed",
    metadata: { user: email, is_staff: !revoke, by: "cli" },
  });

  console.log(`${updated[0].email} → is_staff = ${updated[0].isStaff}`);
  console.log(revoke ? "Admin console access removed." : "Open http://localhost:3000/admin");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
