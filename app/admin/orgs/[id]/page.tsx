import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgDetail } from "@/lib/admin";
import { resolvePlan } from "@/config/plans";
import { getBalanceMicros } from "@/lib/ledger";
import StatTile, { usd } from "@/components/ui/StatTile";
import {
  CreditsControl,
  PlanControl,
  StaffToggle,
  StatusControl,
} from "@/components/admin/AdminControls";

export const metadata: Metadata = { title: "Organization — Admin" };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function AdminOrgPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getOrgDetail(id);
  if (!detail) notFound();

  const { org, members, keys, ledger, recent } = detail;
  const plan = resolvePlan(org.planCode, org.planOverrides);
  const balanceMicros = await getBalanceMicros(org.id);
  const activeKeys = keys.filter((k) => k.status === "active").length;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-blue-600 hover:text-blue-700">
            ← All organizations
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{org.name}</h1>
          <p className="mt-1 font-mono text-xs text-slate-500">
            {org.slug} · {org.id}
          </p>
        </div>
        <div className="text-right text-sm text-slate-600">
          <div>
            Plan <span className="font-medium text-slate-900">{plan.name}</span>
          </div>
          <div>
            Status <span className="font-medium text-slate-900">{org.status}</span>
          </div>
          <div>Joined {new Date(org.createdAt).toLocaleDateString()}</div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Credit balance"
          value={usd(balanceMicros, 2)}
          tone={balanceMicros <= 0 ? "negative" : "default"}
        />
        <StatTile label="Active keys" value={`${activeKeys} / ${plan.maxApiKeys}`} />
        <StatTile label="Rate limit" value={`${plan.rateLimitRps}/s`} />
        <StatTile label="Members" value={`${members.length} / ${plan.maxSeats}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Plan">
          <PlanControl orgId={org.id} planCode={org.planCode} />
          {org.planOverrides != null && typeof org.planOverrides === "object" ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              This organization has custom terms pinning{" "}
              <span className="font-mono">
                {Object.keys(org.planOverrides as Record<string, unknown>).join(", ")}
              </span>
              . Overrides are merged over the plan, so changing the tier will not change those
              values — clear <code>plan_overrides</code> to make the plan take full effect.
            </p>
          ) : (
            <p className="mt-3 text-xs text-slate-400">
              Entitlements resolve from config. Takes effect on the next API call.
            </p>
          )}
        </Card>
        <Card title="Status">
          <StatusControl orgId={org.id} status={org.status} />
          <p className="mt-3 text-xs text-slate-400">
            Suspending returns 403 on every API call immediately.
          </p>
        </Card>
      </div>

      <section
        id="credits"
        className="scroll-mt-6 rounded-2xl border border-blue-200 bg-blue-50/40 p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold">Add or deduct credits</h2>
        <p className="mt-1 text-sm text-slate-600">
          Manual credit movement for {org.name} — the stand-in for a payment
          provider. Appends to the same ledger as usage, so the balance stays one
          auditable chain.
        </p>
        <div className="mt-4">
          <CreditsControl orgId={org.id} />
        </div>
      </section>

      <Card title="Members">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="pb-2 font-medium">User</th>
              <th className="pb-2 font-medium">Role</th>
              <th className="pb-2 font-medium">Last login</th>
              <th className="pb-2 text-right font-medium">Staff</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((m) => (
              <tr key={m.userId}>
                <td className="py-3">
                  <div className="font-medium">{m.name ?? "—"}</div>
                  <div className="text-xs text-slate-500">{m.email}</div>
                </td>
                <td className="py-3">{m.role}</td>
                <td className="py-3 text-slate-500">
                  {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString() : "never"}
                </td>
                <td className="py-3 text-right">
                  <div className="flex flex-col items-end">
                    {m.isStaff && (
                      <span className="mb-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                        staff
                      </span>
                    )}
                    <StaffToggle userId={m.userId} email={m.email} isStaff={m.isStaff} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="API keys">
        {keys.length === 0 ? (
          <p className="text-sm text-slate-500">No keys created yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Prefix</th>
                <th className="pb-2 font-medium">Env</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Last used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {keys.map((k) => (
                <tr key={k.id} className={k.status === "revoked" ? "text-slate-400" : ""}>
                  <td className="py-2.5">{k.name}</td>
                  <td className="py-2.5 font-mono text-xs">{k.keyPrefix}</td>
                  <td className="py-2.5">{k.environment}</td>
                  <td className="py-2.5">{k.status}</td>
                  <td className="py-2.5 text-slate-500">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Ledger">
          {ledger.length === 0 ? (
            <p className="text-sm text-slate-500">No entries.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="pb-2 font-medium">When</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                  <th className="pb-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 text-xs text-slate-500">
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2">{l.type}</td>
                    <td
                      className={`py-2 text-right ${
                        l.amountMicros >= 0 ? "text-emerald-600" : "text-slate-700"
                      }`}
                    >
                      {l.amountMicros >= 0 ? "+" : "−"}
                      {usd(Math.abs(l.amountMicros))}
                    </td>
                    <td className="py-2 text-right text-slate-500">
                      {usd(l.balanceAfterMicros)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Recent requests">
          {recent.length === 0 ? (
            <p className="text-sm text-slate-500">No requests yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="pb-2 font-medium">When</th>
                  <th className="pb-2 font-medium">Endpoint</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 text-xs text-slate-500">
                      {new Date(r.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="py-2 font-mono text-xs">{r.endpoint}</td>
                    <td className="py-2">
                      <span className={r.statusCode < 400 ? "text-emerald-600" : "text-red-600"}>
                        {r.statusCode}
                      </span>
                      {r.cacheHit && <span className="ml-1 text-xs text-slate-400">cache</span>}
                    </td>
                    <td className="py-2 text-right text-slate-500">{r.latencyMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
