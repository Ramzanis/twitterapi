import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { resolvePlan, type Plan } from "@/config/plans";

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export interface AuthContext {
  org: typeof tables.organizations.$inferSelect;
  apiKey: typeof tables.apiKeys.$inferSelect;
  plan: Plan;
}

export type AuthResult =
  | { ok: true; ctx: AuthContext }
  | { ok: false; status: number; error: string };

export async function authenticate(request: Request): Promise<AuthResult> {
  const rawKey = request.headers.get("x-api-key");
  if (!rawKey) {
    return { ok: false, status: 401, error: "Missing X-API-Key header" };
  }

  const [row] = await db
    .select({ apiKey: tables.apiKeys, org: tables.organizations })
    .from(tables.apiKeys)
    .innerJoin(tables.organizations, eq(tables.apiKeys.orgId, tables.organizations.id))
    .where(eq(tables.apiKeys.keyHash, sha256(rawKey)))
    .limit(1);

  if (!row || row.apiKey.status !== "active") {
    return { ok: false, status: 401, error: "Invalid or revoked API key" };
  }
  if (row.org.status !== "active") {
    return { ok: false, status: 403, error: `Organization is ${row.org.status}` };
  }

  return {
    ok: true,
    ctx: {
      org: row.org,
      apiKey: row.apiKey,
      plan: resolvePlan(row.org.planCode, row.org.planOverrides),
    },
  };
}
