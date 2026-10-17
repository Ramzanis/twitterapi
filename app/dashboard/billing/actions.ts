"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, tables } from "@/db";
import { requireUser } from "@/lib/authz";
import { makeTopupReference } from "@/lib/billing";
import {
  activeBillingProvider,
  maxTopupDollars,
  minTopupDollars,
} from "@/config/billing";

export interface TopupState {
  error?: string;
  success?: string;
  reference?: string;
}

export interface FormResult {
  error?: string;
  success?: string;
}

/** Spend controls are org-level settings: owner or admin only. */
async function requireOrgAdmin() {
  const user = await requireUser();
  const [membership] = await db
    .select({ role: tables.organizationMembers.role })
    .from(tables.organizationMembers)
    .where(
      and(
        eq(tables.organizationMembers.orgId, user.orgId),
        eq(tables.organizationMembers.userId, user.userId),
      ),
    )
    .limit(1);
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return null;
  }
  return user;
}

export async function requestTopup(
  _prev: TopupState,
  formData: FormData,
): Promise<TopupState> {
  const user = await requireUser();
  const dollars = Number(String(formData.get("amountUsd") ?? "").trim());

  if (!Number.isFinite(dollars) || dollars < minTopupDollars) {
    return { error: `Minimum top-up is $${minTopupDollars}.` };
  }
  if (dollars > maxTopupDollars) {
    return { error: `For more than $${maxTopupDollars.toLocaleString("en-US")}, contact us directly.` };
  }

  const [org] = await db
    .select({ slug: tables.organizations.slug, status: tables.organizations.status })
    .from(tables.organizations)
    .where(eq(tables.organizations.id, user.orgId))
    .limit(1);
  if (!org) return { error: "Organization not found" };
  if (org.status !== "active") {
    return { error: `Your organization is ${org.status}. Contact support before topping up.` };
  }

  const reference = makeTopupReference(org.slug);
  await db.insert(tables.topupRequests).values({
    orgId: user.orgId,
    requestedBy: user.userId,
    amountCents: Math.round(dollars * 100),
    provider: activeBillingProvider,
    reference,
    note: String(formData.get("note") ?? "").trim() || null,
  });

  await db.insert(tables.auditLogs).values({
    orgId: user.orgId,
    actorUserId: user.userId,
    action: "topup.requested",
    metadata: { amount_cents: Math.round(dollars * 100), reference },
  });

  revalidatePath("/dashboard/billing");
  return {
    success: `Top-up of $${dollars.toFixed(2)} requested.`,
    reference,
  };
}

export async function cancelTopup(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");

  const cancelled = await db
    .update(tables.topupRequests)
    .set({ status: "cancelled", completedAt: new Date() })
    // Scoped to the caller's org and to pending rows: a paid request can never
    // be cancelled away after the money has been credited.
    .where(
      and(
        eq(tables.topupRequests.id, id),
        eq(tables.topupRequests.orgId, user.orgId),
        eq(tables.topupRequests.status, "pending"),
      ),
    )
    .returning({ reference: tables.topupRequests.reference });

  if (cancelled.length > 0) {
    await db.insert(tables.auditLogs).values({
      orgId: user.orgId,
      actorUserId: user.userId,
      action: "topup.cancelled",
      metadata: { reference: cancelled[0].reference },
    });
  }
  revalidatePath("/dashboard/billing");
}

export async function updateSpendControls(
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const user = await requireOrgAdmin();
  if (!user) return { error: "Only owners and admins can change spend controls" };

  const rawCap = String(formData.get("spendCap") ?? "").trim();
  const hardStop = formData.get("hardStop") === "on";

  let spendCapCents: number | null = null;
  if (rawCap !== "") {
    const dollars = Number(rawCap);
    if (!Number.isFinite(dollars) || dollars < 0) {
      return { error: "Spend cap must be a positive number, or blank for no cap" };
    }
    spendCapCents = Math.round(dollars * 100);
  }

  const thresholds = ["50", "80", "100"].filter((t) => formData.get(`alert${t}`) === "on");

  await db
    .update(tables.organizations)
    .set({
      spendCapCents,
      hardStop,
      spendAlertThresholds: thresholds.map(Number),
    })
    .where(eq(tables.organizations.id, user.orgId));

  await db.insert(tables.auditLogs).values({
    orgId: user.orgId,
    actorUserId: user.userId,
    action: "org.spend_controls_updated",
    metadata: { spend_cap_cents: spendCapCents, hard_stop: hardStop, thresholds },
  });

  revalidatePath("/dashboard/billing");
  return { success: "Spend controls saved" };
}
