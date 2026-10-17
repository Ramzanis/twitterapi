import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { resolvePlan } from "@/config/plans";
import { requireUser } from "@/lib/authz";
import { getBalances } from "@/lib/ledger";
import {
  getEndpointBreakdown,
  getDailyUsage,
  getRecentRequests,
  getUsageSummary,
  getWindowUsage,
} from "@/lib/usage";
import ApiKeyManager, { type KeyRow } from "@/components/dashboard/ApiKeyManager";
import ConsumptionWindows from "@/components/dashboard/ConsumptionWindows";
import CopyButton from "@/components/ui/CopyButton";
import CreditBalance from "@/components/dashboard/CreditBalance";
import FirstCallGuide from "@/components/dashboard/FirstCallGuide";
import LocalTime, { TimeZoneNote } from "@/components/ui/LocalTime";
import StatTile, { usd } from "@/components/ui/StatTile";
import UsageChart from "@/components/dashboard/UsageChart";

export const metadata: Metadata = { title: "Dashboard — Skylark" };

export default async function DashboardPage() {
  const user = await requireUser();

  const [org] = await db
    .select()
    .from(tables.organizations)
    .where(eq(tables.organizations.id, user.orgId))
    .limit(1);
  if (!org) return null;

  const plan = resolvePlan(org.planCode, org.planOverrides);

  const [balances, summary, windows, daily, byEndpoint, recent, keys] = await Promise.all([
    getBalances(org.id),
    getUsageSummary(org.id),
    getWindowUsage(org.id),
    getDailyUsage(org.id),
    getEndpointBreakdown(org.id),
    getRecentRequests(org.id),
    db
      .select({
        id: tables.apiKeys.id,
        name: tables.apiKeys.name,
        keyPrefix: tables.apiKeys.keyPrefix,
        environment: tables.apiKeys.environment,
        status: tables.apiKeys.status,
        createdAt: tables.apiKeys.createdAt,
        lastUsedAt: tables.apiKeys.lastUsedAt,
      })
      .from(tables.apiKeys)
      .where(eq(tables.apiKeys.orgId, org.id))
      .orderBy(desc(tables.apiKeys.createdAt)),
  ]);

  const activeKey = keys.find((k) => k.status === "active");
  const cacheHitRate =
    summary.requests > 0 ? Math.round((summary.cacheHits / summary.requests) * 100) : 0;
  const lastDay = windows.find((w) => w.label === "1 day");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">
            On the <span className="font-medium">{plan.name}</span> plan ·{" "}
            {plan.rateLimitRps} req/sec · up to {plan.maxApiKeys} active key
            {plan.maxApiKeys === 1 ? "" : "s"}
          </p>
        </div>
        {org.status !== "active" && (
          <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
            Organization {org.status}
          </span>
        )}
      </div>

      {/* User information */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">User information</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-slate-500">Organization ID</dt>
            <dd className="mt-1 flex items-center gap-2">
              <code className="font-mono text-xs text-slate-700">{org.id}</code>
              <CopyButton text={org.id} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">User ID</dt>
            <dd className="mt-1 font-mono text-xs text-slate-700">{user.userId}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Active API key</dt>
            <dd className="mt-1 font-mono text-xs text-slate-700">
              {activeKey ? (
                <>
                  {activeKey.keyPrefix}
                  <span className="ml-2 font-sans text-slate-400">
                    stored hashed · roll it below to replace
                  </span>
                </>
              ) : (
                <span className="font-sans text-slate-400">none — create one below</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <CreditBalance
        balances={balances}
        spendCapCents={org.spendCapCents}
        hardStop={org.hardStop}
      />

      {/* API usage headline */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Calls"
          value={(lastDay?.calls ?? 0).toLocaleString()}
          hint="last 24 hours"
        />
        <StatTile
          label="Spent"
          value={usd(lastDay?.creditsMicros ?? 0)}
          hint="last 24 hours"
        />
        <StatTile
          label="Cache hit rate"
          value={`${cacheHitRate}%`}
          hint={
            summary.avgLatencyMs !== null
              ? `${summary.avgLatencyMs} ms average`
              : "no successful calls yet"
          }
        />
        <StatTile
          label="Throttled"
          value={summary.throttled.toLocaleString()}
          hint={
            summary.throttled > 0
              ? `429s in 30 days — plan allows ${plan.rateLimitRps}/s`
              : "no rate limiting hit"
          }
          tone={summary.throttled > 0 ? "negative" : "default"}
        />
      </div>

      {summary.requests === 0 && (
        <FirstCallGuide keyPrefix={activeKey?.keyPrefix.replace("…", "") ?? null} />
      )}

      <ConsumptionWindows windows={windows} />

      <UsageChart data={daily} />

      {byEndpoint.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Top endpoints</h2>
          <table className="mt-4 w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="pb-2 font-medium">Endpoint</th>
                <th className="pb-2 text-right font-medium">Requests</th>
                <th className="pb-2 text-right font-medium">Spent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {byEndpoint.map((row) => (
                <tr key={row.endpoint}>
                  <td className="py-2.5 font-mono text-xs">{row.endpoint}</td>
                  <td className="py-2.5 text-right">{row.requests.toLocaleString()}</td>
                  <td className="py-2.5 text-right">{usd(row.creditsSpentMicros)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <ApiKeyManager keys={keys as KeyRow[]} />

      {recent.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Recent API calls</h2>
            <a
              href="/api/usage/export?days=30"
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Export 30 days (CSV)
            </a>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="pb-2 font-medium">Endpoint</th>
                  <th className="pb-2 font-medium">Key</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 text-right font-medium">Credits</th>
                  <th className="pb-2 text-right font-medium">Latency</th>
                  <th className="pb-2 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recent.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2.5 font-mono text-xs">{row.endpoint}</td>
                    <td className="py-2.5 text-slate-600">
                      {row.keyName ?? "—"}
                      {row.keyEnvironment === "test" && (
                        <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                          test
                        </span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={
                          row.statusCode < 400
                            ? "text-emerald-600"
                            : row.statusCode === 429
                              ? "text-amber-600"
                              : "text-red-600"
                        }
                      >
                        {row.statusCode}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-500">
                      {row.statusCode >= 400 ? "—" : row.cacheHit ? "cache" : "upstream"}
                    </td>
                    <td className="py-2.5 text-right">{usd(row.creditsCostMicros)}</td>
                    <td className="py-2.5 text-right text-slate-500">{row.latencyMs} ms</td>
                    <td className="py-2.5 text-right text-slate-500">
                      <LocalTime iso={new Date(row.createdAt).toISOString()} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Showing the {recent.length} most recent calls · <TimeZoneNote />
          </p>
        </section>
      )}
    </>
  );
}
