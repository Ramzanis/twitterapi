"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, tables } from "@/db";
import { assertStaff } from "@/lib/authz";
import { appendLedgerEntry } from "@/lib/ledger";
import { fulfilTopupRequest } from "@/lib/billing";
import { plans, type PlanCode } from "@/config/plans";

export interface AdminResult {
  error?: string;
  success?: string;
}

const orgStatuses = ["active", "suspended", "closed"] as const;

export async function setOrgStatus(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  const staff = await assertStaff();
  const orgId = String(formData.get("orgId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!orgStatuses.includes(status as (typeof orgStatuses)[number])) {
    return { error: "Unknown status" };
  }

  const updated = await db
    .update(tables.organizations)
    .set({ status: status as (typeof orgStatuses)[number] })
    .where(eq(tables.organizations.id, orgId))
    .returning({ id: tables.organizations.id, name: tables.organizations.name });
  if (updated.length === 0) return { error: "Organization not found" };

  await db.insert(tables.auditLogs).values({
    orgId,
    actorUserId: staff.userId,
    action: "admin.org_status_changed",
    metadata: { status, by: staff.email },
  });

  revalidatePath("/admin", "layout");
  return { success: `${updated[0].name} is now ${status}` };
}

export async function setOrgPlan(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  const staff = await assertStaff();
  const orgId = String(formData.get("orgId") ?? "");
  const planCode = String(formData.get("planCode") ?? "") as PlanCode;
  if (!(planCode in plans)) return { error: "Unknown plan" };

  const [before] = await db
    .select({ planCode: tables.organizations.planCode })
    .from(tables.organizations)
    .where(eq(tables.organizations.id, orgId))
    .limit(1);
  if (!before) return { error: "Organization not found" };

  await db
    .update(tables.organizations)
    .set({ planCode })
    .where(eq(tables.organizations.id, orgId));

  await db.insert(tables.auditLogs).values({
    orgId,
    actorUserId: staff.userId,
    action: "admin.plan_changed",
    metadata: { from: before.planCode, to: planCode, by: staff.email },
  });

  revalidatePath("/admin", "layout");
  return { success: `Plan changed from ${before.planCode} to ${planCode}` };
}

/**
 * Manual credit movement — the Phase 0 stand-in for a payment provider.
 * Goes through the same append-only ledger as usage, so the balance stays
 * derived from one auditable chain.
 */
export async function adjustCredits(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  const staff = await assertStaff();
  const orgId = String(formData.get("orgId") ?? "");
  const rawAmount = String(formData.get("amountUsd") ?? "").trim();
  const type = String(formData.get("type") ?? "purchase");
  const note = String(formData.get("note") ?? "").trim();

  const dollars = Number(rawAmount);
  if (!Number.isFinite(dollars) || dollars === 0) {
    return { error: "Enter a non-zero dollar amount (negative to deduct)" };
  }
  if (!["purchase", "bonus", "refund", "adjustment"].includes(type)) {
    return { error: "Unknown ledger type" };
  }

  const [org] = await db
    .select({ id: tables.organizations.id, name: tables.organizations.name })
    .from(tables.organizations)
    .where(eq(tables.organizations.id, orgId))
    .limit(1);
  if (!org) return { error: "Organization not found" };

  const amountMicros = Math.round(dollars * 1_000_000);
  const result = await db.transaction(async (tx) =>
    appendLedgerEntry(tx, {
      orgId,
      amountMicros,
      type: type as "purchase" | "bonus" | "refund" | "adjustment",
      reference: note || `manual-${type}`,
    }),
  );

  await db.insert(tables.auditLogs).values({
    orgId,
    actorUserId: staff.userId,
    action: "admin.credits_adjusted",
    metadata: { amount_micros: amountMicros, type, note, by: staff.email },
  });

  revalidatePath("/admin", "layout");
  return {
    success: `${dollars > 0 ? "Added" : "Deducted"} $${Math.abs(dollars).toFixed(
      2,
    )} — new balance $${(result.balanceAfterMicros / 1_000_000).toFixed(2)}`,
  };
}

/**
 * Fulfil a top-up: mark it paid and credit the ledger in one transaction, so
 * a request can never be marked paid without the money appearing (or vice
 * versa). Guarded on status='pending', which makes a double-click idempotent.
 */
export async function markTopupPaid(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  const staff = await assertStaff();
  const id = String(formData.get("id") ?? "");

  const result = await fulfilTopupRequest(id, staff.userId);
  if (!result) return { error: "Already handled, or no longer pending" };

  await db.insert(tables.auditLogs).values({
    orgId: result.orgId,
    actorUserId: staff.userId,
    action: "topup.paid",
    metadata: {
      via: "staff",
      reference: result.reference,
      requested_cents: result.amountCents,
      credited_cents: result.creditedCents,
      by: staff.email,
    },
  });

  revalidatePath("/admin", "layout");
  return {
    success: `Credited $${(result.creditedCents / 100).toFixed(2)} — paid balance now $${(
      result.balanceAfterMicros / 1_000_000
    ).toFixed(2)}`,
  };
}

export async function setStaffFlag(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  const staff = await assertStaff();
  const userId = String(formData.get("userId") ?? "");
  const makeStaff = formData.get("isStaff") === "true";

  // Refuse self-demotion so the last admin can't lock themselves out here.
  if (userId === staff.userId && !makeStaff) {
    return { error: "You cannot remove your own staff access" };
  }

  const updated = await db
    .update(tables.users)
    .set({ isStaff: makeStaff })
    .where(eq(tables.users.id, userId))
    .returning({ email: tables.users.email });
  if (updated.length === 0) return { error: "User not found" };

  await db.insert(tables.auditLogs).values({
    orgId: null,
    actorUserId: staff.userId,
    action: "admin.staff_flag_changed",
    metadata: { user: updated[0].email, is_staff: makeStaff, by: staff.email },
  });

  revalidatePath("/admin", "layout");
  return {
    success: `${updated[0].email} ${makeStaff ? "is now staff" : "is no longer staff"}`,
  };
}
