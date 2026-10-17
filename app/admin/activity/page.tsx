import type { Metadata } from "next";
import Link from "next/link";
import { getRecentAuditLogs, getRecentFailedJobs } from "@/lib/admin";
import { usd } from "@/components/ui/StatTile";
import LocalTime, { TimeZoneNote } from "@/components/ui/LocalTime";

export const metadata: Metadata = { title: "Activity — Skylark admin" };

export default async function AdminActivityPage() {
  const [audit, failedJobs] = await Promise.all([
    getRecentAuditLogs(60),
    getRecentFailedJobs(20),
  ]);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-slate-600">
          What changed and what broke. <TimeZoneNote />.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Failed upstream jobs</h2>
        <p className="mt-1 text-sm text-slate-600">
          From <code className="text-xs">fetch_jobs</code>. Customers were not charged for these,
          but every attempt was billed to us — which is why the cost column is not zero.
        </p>
        {failedJobs.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No failures recorded.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="pb-2 font-medium">When</th>
                  <th className="pb-2 font-medium">Endpoint</th>
                  <th className="pb-2 font-medium">Provider</th>
                  <th className="pb-2 font-medium">Reason</th>
                  <th className="pb-2 text-right font-medium">Attempts</th>
                  <th className="pb-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {failedJobs.map((job) => (
                  <tr key={job.id}>
                    <td className="py-2.5 whitespace-nowrap text-slate-500">
                      <LocalTime iso={new Date(job.queuedAt).toISOString()} mode="datetime" />
                    </td>
                    <td className="py-2.5 font-mono text-xs">{job.endpoint}</td>
                    <td className="py-2.5 font-mono text-xs text-slate-500">{job.providerCode}</td>
                    <td className="py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          job.status === "timed_out"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {job.status}
                      </span>
                      {job.error && (
                        <span className="ml-2 text-xs text-slate-500">{job.error}</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">{job.attempts}</td>
                    <td className="py-2.5 text-right text-slate-600">
                      {usd(job.costMicros ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Audit log</h2>
        <p className="mt-1 text-sm text-slate-600">
          From <code className="text-xs">audit_logs</code>. No actor means a system action.
        </p>
        {audit.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Nothing recorded yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="pb-2 font-medium">When</th>
                  <th className="pb-2 font-medium">Action</th>
                  <th className="pb-2 font-medium">Organization</th>
                  <th className="pb-2 font-medium">Actor</th>
                  <th className="pb-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {audit.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2.5 whitespace-nowrap text-slate-500">
                      <LocalTime iso={new Date(row.createdAt).toISOString()} mode="datetime" />
                    </td>
                    <td className="py-2.5 font-mono text-xs text-slate-700">{row.action}</td>
                    <td className="py-2.5">
                      {row.orgId ? (
                        <Link
                          href={`/admin/orgs/${row.orgId}`}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          {row.orgName ?? row.orgId}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 text-slate-600">{row.actorEmail ?? "system"}</td>
                    <td className="py-2.5 font-mono text-xs text-slate-500">
                      {row.metadata ? JSON.stringify(row.metadata) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
