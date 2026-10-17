import Link from "next/link";
import { signOut } from "@/auth";
import { requireStaff } from "@/lib/authz";
import { countPendingTopups } from "@/lib/billing";
import NavTabs from "@/components/ui/NavTabs";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gate the whole segment: non-staff are redirected to their own dashboard.
  const user = await requireStaff();
  const pendingTopups = await countPendingTopups();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <Link href="/admin" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="block size-2.5 rounded-full bg-amber-400"></span>
            skylark
          </Link>
          <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
            Staff console
          </span>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-slate-300 hover:text-white">
              My dashboard
            </Link>
            <span className="hidden text-slate-400 sm:block">{user.email}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="cursor-pointer font-medium text-slate-300 hover:text-white"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-6">
          <NavTabs
            tone="dark"
            tabs={[
              { href: "/admin", label: "Overview" },
              { href: "/admin/orgs", label: "Organizations" },
              {
                href: "/admin/topups",
                label: pendingTopups > 0 ? `Top-ups (${pendingTopups})` : "Top-ups",
              },
              { href: "/admin/activity", label: "Activity" },
            ]}
          />
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">{children}</main>
    </div>
  );
}
