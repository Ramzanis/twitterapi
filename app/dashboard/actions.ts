"use server";

import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db, tables } from "@/db";
import { sha256 } from "@/lib/apiAuth";
import { resolvePlan } from "@/config/plans";

export interface CreateKeyState {
  error?: string;
  /** Returned exactly once, at creation — only the hash is stored. */
  rawKey?: string;
}

export async function createApiKey(
  _prev: CreateKeyState,
  formData: FormData,
): Promise<CreateKeyState> {
  const session = await auth();
  if (!session) return { error: "Not signed in" };

  const environment = formData.get("environment") === "test" ? "test" : "live";
  const name = String(formData.get("name") ?? "").trim() || "Default key";

  const [org] = await db
    .select()
    .from(tables.organizations)
    .where(eq(tables.organizations.id, session.orgId))
    .limit(1);
  if (!org) return { error: "Organization not found" };

  const plan = resolvePlan(org.planCode, org.planOverrides);
  const active = await db
    .select({ id: tables.apiKeys.id })
    .from(tables.apiKeys)
    .where(
      and(eq(tables.apiKeys.orgId, org.id), eq(tables.apiKeys.status, "active")),
    );
  if (active.length >= plan.maxApiKeys) {
    return {
      error: `Your ${plan.name} plan allows ${plan.maxApiKeys} active key${
        plan.maxApiKeys === 1 ? "" : "s"
      }. Revoke one first or upgrade.`,
    };
  }

  const rawKey = `sk_${environment}_${randomBytes(24).toString("hex")}`;
  await db.insert(tables.apiKeys).values({
    orgId: org.id,
    name,
    keyPrefix: rawKey.slice(0, 12) + "…",
    keyHash: sha256(rawKey),
    environment,
    createdBy: session.user.id,
  });

  await db.insert(tables.auditLogs).values({
    orgId: org.id,
    actorUserId: session.user.id,
    action: "api_key.created",
    metadata: { name, environment },
  });

  revalidatePath("/dashboard");
  return { rawKey };
}

/**
 * Replace a key: mint a new one, revoke the old one, show the new value once.
 * The rotation path customers need, since a stored hash can never be revealed.
 */
export async function rollApiKey(
  _prev: CreateKeyState,
  formData: FormData,
): Promise<CreateKeyState> {
  const session = await auth();
  if (!session) return { error: "Not signed in" };

  const keyId = String(formData.get("keyId") ?? "");
  const [existing] = await db
    .select()
    .from(tables.apiKeys)
    .where(and(eq(tables.apiKeys.id, keyId), eq(tables.apiKeys.orgId, session.orgId)))
    .limit(1);
  if (!existing) return { error: "Key not found" };

  const rawKey = `sk_${existing.environment}_${randomBytes(24).toString("hex")}`;
  await db.transaction(async (tx) => {
    await tx.insert(tables.apiKeys).values({
      orgId: existing.orgId,
      name: existing.name,
      keyPrefix: rawKey.slice(0, 12) + "…",
      keyHash: sha256(rawKey),
      environment: existing.environment,
      createdBy: session.user.id,
    });
    await tx
      .update(tables.apiKeys)
      .set({ status: "revoked" })
      .where(eq(tables.apiKeys.id, keyId));
  });

  await db.insert(tables.auditLogs).values({
    orgId: session.orgId,
    actorUserId: session.user.id,
    action: "api_key.rolled",
    metadata: { name: existing.name, environment: existing.environment },
  });

  revalidatePath("/dashboard");
  return { rawKey };
}

export async function revokeApiKey(formData: FormData) {
  const session = await auth();
  if (!session) return;

  const keyId = String(formData.get("keyId") ?? "");
  // Scope the update to the caller's org so an id from elsewhere can't match.
  const revoked = await db
    .update(tables.apiKeys)
    .set({ status: "revoked" })
    .where(and(eq(tables.apiKeys.id, keyId), eq(tables.apiKeys.orgId, session.orgId)))
    .returning({ id: tables.apiKeys.id, name: tables.apiKeys.name });

  if (revoked.length > 0) {
    await db.insert(tables.auditLogs).values({
      orgId: session.orgId,
      actorUserId: session.user.id,
      action: "api_key.revoked",
      metadata: { key_id: keyId, name: revoked[0].name },
    });
  }
  revalidatePath("/dashboard");
}
