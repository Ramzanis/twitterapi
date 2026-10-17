import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db, tables } from "@/db";

export interface SessionUser {
  userId: string;
  orgId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isStaff: boolean;
}

/** Signed-in user, with staff status read fresh from the database. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [row] = await db
    .select({
      id: tables.users.id,
      email: tables.users.email,
      name: tables.users.name,
      avatarUrl: tables.users.avatarUrl,
      isStaff: tables.users.isStaff,
      deletedAt: tables.users.deletedAt,
    })
    .from(tables.users)
    .where(eq(tables.users.id, session.user.id))
    .limit(1);

  if (!row || row.deletedAt) return null;

  return {
    userId: row.id,
    orgId: session.orgId,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    isStaff: row.isStaff,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/signin");
  return user;
}

/**
 * Staff gate. `is_staff` is re-read from the database on every call rather
 * than trusted from the session token, so revoking staff takes effect at once
 * instead of at the user's next sign-in.
 */
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isStaff) redirect("/dashboard");
  return user;
}

/** For server actions: throws instead of redirecting. */
export async function assertStaff(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user?.isStaff) throw new Error("Forbidden: staff only");
  return user;
}
