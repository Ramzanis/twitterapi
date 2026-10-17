import Link from "next/link";
import { eq } from "drizzle-orm";
import { signOut } from "@/auth";
import { db, tables } from "@/db";
import { requireUser } from "@/lib/authz";
import NavTabs from "@/components/ui/NavTabs";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [org] = await db
    .select({ name: tables.organizations.name })
    .from(tables.organizations)
    .where(eq(tables.organizations.id, user.orgId))
    .limit(1);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="block size-2.5 rounded-full bg-blue-600"></span>
            skylark
          </Link>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {org?.name ?? "Organization"}
          </span>
          <div className="ml-auto flex items-center gap-4">
            {user.isStaff && (
              <Link
                href="/admin"
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
              >
                Admin
              </Link>
            )}
            <span className="hidden text-sm text-slate-500 sm:block">{user.email}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-6">
          <NavTabs
            tabs={[
              { href: "/dashboard", label: "Dashboard" },
              { href: "/dashboard/docs", label: "API reference" },
              { href: "/dashboard/billing", label: "Billing" },
              { href: "/dashboard/payment-methods", label: "Payment methods" },
              { href: "/dashboard/account", label: "Account" },
            ]}
          />
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">{children}</main>
    </div>
  );
}
