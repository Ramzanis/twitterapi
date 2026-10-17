import { eq, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { plans } from "@/config/plans";

/** Turn an email local part into a URL-safe org slug base. */
function slugBase(email: string): string {
  const local = email.split("@")[0] ?? "user";
  const cleaned = local.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "user";
}

async function uniqueSlug(base: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const [taken] = await db
      .select({ id: tables.organizations.id })
      .from(tables.organizations)
      .where(eq(tables.organizations.slug, candidate))
      .limit(1);
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export interface ProvisionedIdentity {
  userId: string;
  orgId: string;
}

/**
 * Idempotent onboarding, keyed on the Google subject id. First sign-in creates
 * the user, their personal organization, an owner membership and the free-plan
 * signup bonus — all in one transaction. Later sign-ins just refresh profile
 * fields and return the existing ids.
 *
 * No API key is minted here: keys are only ever shown once, at the moment they
 * are created, so the first key is created explicitly from the dashboard.
 */
export async function provisionIdentity(profile: {
  googleSub: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}): Promise<ProvisionedIdentity> {
  const [existing] = await db
    .select({ id: tables.users.id })
    .from(tables.users)
    .where(eq(tables.users.googleSub, profile.googleSub))
    .limit(1);

  if (existing) {
    await db
      .update(tables.users)
      .set({
        email: profile.email,
        name: profile.name ?? undefined,
        avatarUrl: profile.avatarUrl ?? undefined,
        lastLoginAt: new Date(),
      })
      .where(eq(tables.users.id, existing.id));

    const [membership] = await db
      .select({ orgId: tables.organizationMembers.orgId })
      .from(tables.organizationMembers)
      .where(eq(tables.organizationMembers.userId, existing.id))
      .limit(1);

    if (membership) return { userId: existing.id, orgId: membership.orgId };
  }

  const slug = await uniqueSlug(slugBase(profile.email));
  const bonusMicros = plans.free.signupBonusMicros;

  return db.transaction(async (tx) => {
    let userId = existing?.id;
    if (!userId) {
      const [created] = await tx
        .insert(tables.users)
        .values({
          googleSub: profile.googleSub,
          email: profile.email,
          name: profile.name ?? null,
          avatarUrl: profile.avatarUrl ?? null,
          lastLoginAt: new Date(),
        })
        .returning({ id: tables.users.id });
      userId = created.id;
    }

    const [org] = await tx
      .insert(tables.organizations)
      .values({
        name: profile.name ?? profile.email,
        slug,
        planCode: "free",
        spendAlertThresholds: [50, 80, 100],
      })
      .returning({ id: tables.organizations.id });

    await tx.insert(tables.organizationMembers).values({
      orgId: org.id,
      userId,
      role: "owner",
    });

    if (bonusMicros > 0) {
      await tx.insert(tables.creditLedger).values({
        orgId: org.id,
        amountMicros: bonusMicros,
        type: "bonus",
        bucket: "bonus",
        reference: "signup-bonus",
        balanceAfterMicros: bonusMicros,
      });
    }

    await tx.insert(tables.auditLogs).values({
      orgId: org.id,
      actorUserId: userId,
      action: "org.created",
      metadata: { via: "signup", plan: "free", bonus_micros: bonusMicros },
    });

    return { userId, orgId: org.id };
  });
}

/** Accept the current terms version for a user (recorded at first sign-in). */
export async function recordTosAcceptance(userId: string, version: string) {
  await db
    .update(tables.users)
    .set({ tosVersion: version, tosAcceptedAt: sql`now()` })
    .where(eq(tables.users.id, userId));
}
