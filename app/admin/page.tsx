import type { Metadata } from "next";
import Link from "next/link";
import {
  getEndpointStats,
  getPlatformStats,
  getProviderStats,
  listOrganizations,
} from "@/lib/admin";
import { countPendingTopups } from "@/lib/billing";
import StatTile, { usd, usdAuto } from "@/components/ui/StatTile";

export const metadata: Metadata = { title: "Overview — Skylark admin" };

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export default async function AdminOverviewPage() {
  const [stats, orgs, endpoints, providers, pendingTopups] = await Promise.all([
    getPlatformStats(),
    listOrganizations(),
    getEndpointStats(),
    getProviderStats(),
    countPendingTopups(),
  ]);

  const marginMicros = stats.revenueMicros - stats.upstreamCostMicros;
  const marginPct = pct(marginMicros, stats.revenueMicros);
  const cacheHitRate = pct(stats.cacheHits, stats.requests);
  const errorRate = pct(stats.errors, stats.requests);

  const topOrgs = [...orgs].sort((a, b) => b.spentMicros - a.spentMicros).slice(0, 5);
  const busiestOrg = topOrgs[0];
  const topEndpoint = endpoints[0];

  const needsAttention = [
    pendingTopups > 0
      ? {
          href: "/admin/topups",
          label: `${pendingTopups} top-up${pendingTopups === 1 ? "" : "s"} awaiting payment`,
        }
      : null,
    stats.failedJobs > 0
      ? {
          href: "/admin/activity",
          label: `${stats.failedJobs} failed upstream job${stats.failedJobs === 1 ? "" : "s"}`,
        }
      : null,
  ].filter((item) => item !== null);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-slate-600">
          What the platform earned, spent and served over the last 30 days.
        </p>
      </div>

      {needsAttention.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {needsAttention.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full border border-amber-300 bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
            >
              {item.label} →
            </Link>
          ))}
        </div>
      )}

      <div>
        <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Money</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Revenue billed"
            value={usdAuto(stats.revenueMicros)}
            hint="credits charged to customers"
          />
          <StatTile
            label="Upstream cost"
            value={usdAuto(stats.upstreamCostMicros)}
            hint="paid to data providers, retries included"
          />
          <StatTile
            label="Gross margin"
            value={usdAuto(marginMicros)}
            hint={`${marginPct}% of revenue`}
            tone={marginMicros >= 0 ? "positive" : "negative"}
          />
          <StatTile
            label="Outstanding credits"
            value={usdAuto(stats.outstandingCreditsMicros)}
            hint="unused balances we owe"
          />
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Usage</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Requests"
            value={stats.requests.toLocaleString()}
            hint={`${errorRate}% returned an error`}
            tone={errorRate > 10 ? "negative" : "default"}
          />
          <StatTile
            label="Cache hit rate"
            value={`${cacheHitRate}%`}
            hint="served without paying upstream"
            tone={cacheHitRate > 0 ? "positive" : "default"}
          />
          <StatTile
            label="Busiest customer"
            value={busiestOrg?.name ?? "—"}
            hint={
              busiestOrg
                ? `${usdAuto(busiestOrg.spentMicros)} across ${busiestOrg.requests.toLocaleString()} calls`
                : "no billed traffic yet"
            }
          />
          <StatTile
            label="Top endpoint"
            value={topEndpoint?.endpoint ?? "—"}
            hint={
              topEndpoint
                ? `${topEndpoint.requests.toLocaleString()} calls · ${topEndpoint.avgLatencyMs}ms avg`
                : "no traffic yet"
            }
          />
        </div>
      </div>

      <Section
        title="Top customers"
        description="By credits spent in the last 30 days."
        action={
          <Link href="/admin/orgs" className="text-sm font-medium text-blue-600 hover:text-blue-700">
            All {stats.orgs} organizations →
          </Link>
        }
      >
        {topOrgs.length === 0 ? (
          <p className="text-sm text-slate-500">No organizations yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="pb-2 font-medium">Organization</th>
                <th className="pb-2 font-medium">Plan</th>
                <th className="pb-2 text-right font-medium">Spent</th>
                <th className="pb-2 text-right font-medium">Requests</th>
                <th className="pb-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topOrgs.map((org) => (
                <tr key={org.id} className="hover:bg-slate-50">
                  <td className="py-3">
                    <Link
                      href={`/admin/orgs/${org.id}`}
                      className="font-medium text-blue-600 hover:text-blue-700"
                    >
                      {org.name}
                    </Link>
                  </td>
                  <td className="py-3">
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                      {org.planCode}
                    </span>
                  </td>
                  <td className="py-3 text-right font-medium">{usdAuto(org.spentMicros)}</td>
                  <td className="py-3 text-right">{org.requests.toLocaleString()}</td>
                  <td
                    className={`py-3 text-right ${org.balanceMicros <= 0 ? "text-red-600" : "text-slate-600"}`}
                  >
                    {usd(org.balanceMicros, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Endpoints"
          description="Traffic and revenue by product, last 30 days."
        >
          {endpoints.length === 0 ? (
            <p className="text-sm text-slate-500">No traffic yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="pb-2 font-medium">Endpoint</th>
                  <th className="pb-2 text-right font-medium">Calls</th>
                  <th className="pb-2 text-right font-medium">Cached</th>
                  <th className="pb-2 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {endpoints.map((row) => (
                  <tr key={row.endpoint}>
                    <td className="py-2.5 font-mono text-xs">{row.endpoint}</td>
                    <td className="py-2.5 text-right">
                      {row.requests.toLocaleString()}
                      {row.errors > 0 && (
                        <span className="ml-1 text-xs text-red-600">
                          ({row.errors} err)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right text-slate-500">
                      {pct(row.cacheHits, row.requests)}%
                    </td>
                    <td className="py-2.5 text-right font-medium">{usdAuto(row.revenueMicros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section
          title="Providers"
          description="Upstream jobs and cost — reconcile against provider invoices."
        >
          {providers.length === 0 ? (
            <p className="text-sm text-slate-500">No upstream jobs yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="pb-2 font-medium">Provider</th>
                  <th className="pb-2 text-right font-medium">Jobs</th>
                  <th className="pb-2 text-right font-medium">Failed</th>
                  <th className="pb-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {providers.map((p) => (
                  <tr key={p.providerCode}>
                    <td className="py-2.5 font-mono text-xs">{p.providerCode}</td>
                    <td className="py-2.5 text-right">{p.jobs.toLocaleString()}</td>
                    <td
                      className={`py-2.5 text-right ${p.failed > 0 ? "text-red-600" : "text-slate-500"}`}
                    >
                      {p.failed}
                    </td>
                    <td className="py-2.5 text-right">{usd(p.costMicros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    </>
  );
}
