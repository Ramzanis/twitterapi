import type { Metadata } from "next";
import Link from "next/link";
import { listOrganizations, searchOrganizationIds, searchUsers } from "@/lib/admin";
import { usd } from "@/components/ui/StatTile";
import { InlinePlanControl, StaffToggle } from "@/components/admin/AdminControls";

export const metadata: Metadata = { title: "Organizations — Skylark admin" };

const statusStyles: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  suspended: "bg-red-50 text-red-700",
  closed: "bg-slate-100 text-slate-500",
};

export default async function AdminOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const query = ((await searchParams).q ?? "").trim();
  const allOrgs = await listOrganizations();

  // Search matches organizations by their own identity, by a member's email and
  // by API key prefix, so a key off a log line is enough to find the account.
  const [matchingOrgIds, users] = query
    ? await Promise.all([searchOrganizationIds(query), searchUsers(query)])
    : [null, []];
  const orgs = matchingOrgIds ? allOrgs.filter((org) => matchingOrgIds.has(org.id)) : allOrgs;

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every account, and the people in them. Usage figures cover the last 30 days.
        </p>
      </div>

      {/* A plain GET form: the query lives in the URL, so a search is shareable
          with a colleague and survives a reload without any client state. */}
      <form method="get" className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search organizations, users, emails or key prefixes…"
          aria-label="Search organizations and users"
          className="min-w-64 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          className="cursor-pointer rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Search
        </button>
        {query && (
          <Link
            href="/admin/orgs"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Clear
          </Link>
        )}
      </form>

      {query && orgs.length === 0 && users.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Nothing matches <span className="font-medium text-slate-900">{query}</span>. Organizations
          match on name, slug, id, a member&apos;s email or an API key prefix; users match on email,
          name or id.
        </p>
      )}

      {query && users.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Users ({users.length})</h2>
          <p className="mt-1 text-sm text-slate-600">
            Matching <span className="font-medium text-slate-900">{query}</span>. Plans belong to
            organizations, so open one to change a user&apos;s tier.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="pb-2 font-medium">User</th>
                  <th className="pb-2 font-medium">Organizations</th>
                  <th className="pb-2 text-right font-medium">Last login</th>
                  <th className="pb-2 text-right font-medium">Joined</th>
                  <th className="pb-2 text-right font-medium">Staff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="py-3">
                      <div className="font-medium">
                        {user.email}
                        {user.deletedAt && (
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                            deleted
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{user.name ?? "—"}</div>
                    </td>
                    <td className="py-3">
                      {user.orgs.length === 0 ? (
                        <span className="text-slate-400">none</span>
                      ) : (
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {user.orgs.map((org) => (
                            <Link
                              key={org.id}
                              href={`/admin/orgs/${org.id}`}
                              className="text-blue-600 hover:text-blue-700"
                            >
                              {org.name}
                              <span className="text-xs text-slate-400"> · {org.role}</span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-right text-slate-500">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleDateString("en-US")
                        : "never"}
                    </td>
                    <td className="py-3 text-right text-slate-500">
                      {new Date(user.createdAt).toLocaleDateString("en-US")}
                    </td>
                    <td className="py-3 text-right">
                      <StaffToggle userId={user.id} email={user.email} isStaff={user.isStaff} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(!query || orgs.length > 0) && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">
            Organizations{query ? ` (${orgs.length})` : ""}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {query ? (
              <>
                Matching <span className="font-medium text-slate-900">{query}</span>, including by
                member email and API key prefix.{" "}
              </>
            ) : (
              "Busiest first. "
            )}
            Change a plan from the dropdown — it applies immediately and is recorded in the audit
            log. Open an organization for credits, status and members.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="pb-2 font-medium">Organization</th>
                  <th className="pb-2 font-medium">Plan</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Balance</th>
                  <th className="pb-2 text-right font-medium">Requests</th>
                  <th className="pb-2 text-right font-medium">Spent</th>
                  <th className="pb-2 text-right font-medium">Members</th>
                  <th className="pb-2 text-right font-medium">Joined</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orgs.map((org) => (
                  <tr key={org.id} className="hover:bg-slate-50">
                    <td className="py-3">
                      <Link
                        href={`/admin/orgs/${org.id}`}
                        className="font-medium text-blue-600 hover:text-blue-700"
                      >
                        {org.name}
                      </Link>
                      <div className="font-mono text-xs text-slate-400">{org.slug}</div>
                    </td>
                    <td className="py-3">
                      <InlinePlanControl
                        orgId={org.id}
                        planCode={org.planCode}
                        hasOverrides={org.hasPlanOverrides}
                      />
                    </td>
                    <td className="py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${statusStyles[org.status]}`}
                      >
                        {org.status}
                      </span>
                    </td>
                    <td className="py-3 text-right font-medium">{usd(org.balanceMicros, 2)}</td>
                    <td className="py-3 text-right">{org.requests.toLocaleString()}</td>
                    <td className="py-3 text-right">{usd(org.spentMicros)}</td>
                    <td className="py-3 text-right text-slate-500">{org.members}</td>
                    <td className="py-3 text-right text-slate-500">
                      {new Date(org.createdAt).toLocaleDateString("en-US")}
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/admin/orgs/${org.id}#credits`}
                        className="font-medium whitespace-nowrap text-blue-600 hover:text-blue-700"
                      >
                        Add credits
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
