import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { requireUser } from "@/lib/authz";
import { getBalances } from "@/lib/ledger";
import {
  getLedger,
  getLifetimePurchasedMicros,
  getPendingTopups,
  listTopupRequests,
} from "@/lib/billing";
import {
  bankDetailsConfigured,
  bankTransfer,
  billingContactEmail,
  minTopupDollars,
  topupPresets,
} from "@/config/billing";
import { getUsageSummary } from "@/lib/usage";
import LocalTime from "@/components/ui/LocalTime";
import StatTile, { usd, usdAuto } from "@/components/ui/StatTile";
import TopupForm, { type PendingTopup } from "@/components/dashboard/TopupForm";
import { SpendControlsForm } from "@/components/dashboard/AccountForms";

export const metadata: Metadata = { title: "Billing — Skylark" };

const ledgerLabels: Record<string, string> = {
  purchase: "Top-up",
  bonus: "Bonus",
  usage: "API usage",
  refund: "Refund",
  adjustment: "Adjustment",
};

const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export default async function BillingPage() {
  const user = await requireUser();

  const [org] = await db
    .select()
    .from(tables.organizations)
    .where(eq(tables.organizations.id, user.orgId))
    .limit(1);
  if (!org) return null;

  const [balances, ledger, requests, pending, lifetime, usage] = await Promise.all([
    getBalances(org.id),
    getLedger(org.id),
    listTopupRequests(org.id),
    getPendingTopups(org.id),
    getLifetimePurchasedMicros(org.id),
    getUsageSummary(org.id),
  ]);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-slate-600">
          Credits, top-ups and every charge on your account.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Credit balance"
          value={usdAuto(balances.totalMicros)}
          hint={`${usdAuto(balances.paidMicros)} recharge · ${usdAuto(balances.bonusMicros)} bonus`}
          tone={balances.totalMicros <= 1_000_000 ? "negative" : "default"}
        />
        <StatTile label="Spent" value={usd(usage.creditsSpentMicros)} hint="last 30 days" />
        <StatTile
          label="Purchased"
          value={usdAuto(lifetime)}
          hint="lifetime top-ups"
        />
        <StatTile
          label="Pending top-ups"
          value={String(pending.length)}
          hint={pending.length > 0 ? "awaiting payment" : "none outstanding"}
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Add credits</h2>
        <p className="mt-1 text-sm text-slate-600">
          Credits never expire and are drawn down per call. Bonus credits are spent
          before the ones you paid for.
        </p>
        <div className="mt-5">
          <TopupForm
            presets={topupPresets}
            minDollars={minTopupDollars}
            pending={pending as PendingTopup[]}
            bankDetails={bankTransfer}
            bankConfigured={bankDetailsConfigured}
          />
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Card payments aren&apos;t enabled yet — see{" "}
          <Link href="/dashboard/payment-methods" className="font-medium underline">
            payment methods
          </Link>
          . Questions:{" "}
          <a href={`mailto:${billingContactEmail}`} className="font-medium underline">
            {billingContactEmail}
          </a>
          .
        </p>
      </section>

      {requests.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Top-up history</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="pb-2 font-medium">Requested</th>
                  <th className="pb-2 font-medium">Reference</th>
                  <th className="pb-2 font-medium">Method</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 text-slate-500">
                      <LocalTime iso={new Date(r.createdAt).toISOString()} mode="datetime" />
                    </td>
                    <td className="py-2.5 font-mono text-xs">{r.reference}</td>
                    <td className="py-2.5 text-slate-600">
                      {r.provider === "manual" ? "bank transfer" : r.provider}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${statusStyles[r.status]}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-medium">
                      ${(r.amountCents / 100).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Transactions</h2>
          <a
            href="/api/usage/export?days=30"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Export usage (CSV)
          </a>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Every credit and debit, newest first. Each usage row is one API call, charged
          the moment it was served.
        </p>
        {ledger.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No transactions yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Bucket</th>
                  <th className="pb-2 font-medium">Reference</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                  <th className="pb-2 text-right font-medium">Bucket balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2.5 text-slate-500">
                      <LocalTime iso={new Date(row.createdAt).toISOString()} mode="datetime" />
                    </td>
                    <td className="py-2.5">{ledgerLabels[row.type] ?? row.type}</td>
                    <td className="py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          row.bucket === "bonus"
                            ? "bg-violet-50 text-violet-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {row.bucket}
                      </span>
                    </td>
                    <td className="py-2.5 font-mono text-xs text-slate-400">
                      {row.reference ? row.reference.slice(0, 18) : "—"}
                    </td>
                    <td
                      className={`py-2.5 text-right font-medium ${
                        row.amountMicros >= 0 ? "text-emerald-600" : "text-slate-700"
                      }`}
                    >
                      {row.amountMicros >= 0 ? "+" : "−"}
                      {usd(Math.abs(row.amountMicros))}
                    </td>
                    <td className="py-2.5 text-right text-slate-500">
                      {usd(row.balanceAfterMicros)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Spend controls</h2>
        <p className="mt-1 text-sm text-slate-600">
          Caps and alerts on what this organization can spend.
        </p>
        <div className="mt-4 max-w-md">
          <SpendControlsForm
            spendCapCents={org.spendCapCents}
            hardStop={org.hardStop}
            thresholds={org.spendAlertThresholds ?? []}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Invoices</h2>
        <p className="mt-1 text-sm text-slate-600">
          Invoices appear here once a payment provider is connected. Until then we
          issue them by email against your top-up reference.
        </p>
      </section>
    </>
  );
}
