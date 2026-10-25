import { and, asc, count, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import type { Plan } from "@/config/plans";

export type StreamRule = typeof tables.streamRules.$inferSelect;

/** Public shape of a rule. */
export function ruleJson(rule: StreamRule) {
  return {
    id: rule.id,
    value: rule.value,
    tag: rule.tag,
    created_at: rule.createdAt.toISOString(),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function listRules(orgId: string): Promise<StreamRule[]> {
  return db
    .select()
    .from(tables.streamRules)
    .where(eq(tables.streamRules.orgId, orgId))
    .orderBy(asc(tables.streamRules.createdAt));
}

/** One of the org's own rules, or null — never another org's, even by id. */
export async function getRule(orgId: string, ruleId: string): Promise<StreamRule | null> {
  if (!UUID.test(ruleId)) return null;
  const [rule] = await db
    .select()
    .from(tables.streamRules)
    .where(and(eq(tables.streamRules.orgId, orgId), eq(tables.streamRules.id, ruleId)))
    .limit(1);
  return rule ?? null;
}

export type CreateRuleResult =
  | { ok: true; rule: StreamRule }
  | { ok: false; status: number; error: string };

export async function createRule(
  orgId: string,
  plan: Plan,
  input: { value?: unknown; tag?: unknown },
): Promise<CreateRuleResult> {
  // Topics match case-insensitively upstream, so two rules differing only in
  // case would deliver every post twice.
  const value = typeof input.value === "string" ? input.value.trim().toLowerCase() : "";
  if (!value || value.length > 128) {
    return { ok: false, status: 400, error: "value is required, up to 128 characters" };
  }
  const tag = typeof input.tag === "string" && input.tag.trim() ? input.tag.trim().slice(0, 64) : null;

  const [{ n }] = await db
    .select({ n: count() })
    .from(tables.streamRules)
    .where(eq(tables.streamRules.orgId, orgId));
  if (n >= plan.maxStreamRules) {
    return {
      ok: false,
      status: 403,
      error: `Your ${plan.name} plan allows ${plan.maxStreamRules} stream rule${plan.maxStreamRules === 1 ? "" : "s"}. Delete one or upgrade.`,
    };
  }

  const [rule] = await db
    .insert(tables.streamRules)
    .values({ orgId, value, tag })
    .onConflictDoNothing()
    .returning();
  if (!rule) return { ok: false, status: 409, error: `A rule for "${value}" already exists` };
  return { ok: true, rule };
}

export async function deleteRule(orgId: string, ruleId: string): Promise<boolean> {
  if (!UUID.test(ruleId)) return false;
  const deleted = await db
    .delete(tables.streamRules)
    .where(and(eq(tables.streamRules.orgId, orgId), eq(tables.streamRules.id, ruleId)))
    .returning({ id: tables.streamRules.id });
  return deleted.length > 0;
}
