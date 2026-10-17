"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, tables } from "@/db";
import { requireUser } from "@/lib/authz";

export interface FormResult {
  error?: string;
  success?: string;
}

/** Org-level settings require owner or admin on that org. */
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

export async function updateProfile(
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name cannot be empty" };

  await db.update(tables.users).set({ name }).where(eq(tables.users.id, user.userId));
  revalidatePath("/dashboard/account");
  return { success: "Profile updated" };
}

export async function updateOrganization(
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const user = await requireOrgAdmin();
  if (!user) return { error: "Only owners and admins can change organization settings" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Organization name cannot be empty" };

  await db
    .update(tables.organizations)
    .set({ name })
    .where(eq(tables.organizations.id, user.orgId));

  await db.insert(tables.auditLogs).values({
    orgId: user.orgId,
    actorUserId: user.userId,
    action: "org.renamed",
    metadata: { name },
  });

  revalidatePath("/dashboard/account");
  revalidatePath("/dashboard");
  return { success: "Organization updated" };
}
