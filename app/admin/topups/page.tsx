import type { Metadata } from "next";
import Link from "next/link";
import { listPendingTopupsForStaff } from "@/lib/billing";
import { MarkPaidButton } from "@/components/admin/AdminControls";

export const metadata: Metadata = { title: "Top-ups — Skylark admin" };

export default async function AdminTopupsPage() {
  const pending = await listPendingTopupsForStaff();
  const totalCents = pending.reduce((sum, row) => sum + row.amountCents, 0);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Top-ups</h1>
        <p className="mt-1 text-sm text-slate-600">
          Customers asking to add credits. Match the bank reference against your account, then mark
          it paid — that credits their ledger in the same transaction, so the money and the record
          can never disagree.
        </p>
      </div>

      {pending.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">
            Nothing awaiting payment. New requests appear here and in the nav as soon as a customer
            submits one.
          </p>
        </section>
      ) : (
        <section className="rounded-2xl border border-amber-300 bg-amber-50/60 p-6">
          <h2 className="text-lg font-semibold">
            Awaiting payment ({pending.length}) · ${(totalCents / 100).toFixed(2)}
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            Credit what actually arrived, not what was requested — they differ on fees and currency
            conversion.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-600">
                <tr className="border-b border-amber-200">
                  <th className="pb-2 font-medium">Organization</th>
                  <th className="pb-2 font-medium">Reference</th>
                  <th className="pb-2 font-medium">Requested by</th>
                  <th className="pb-2 font-medium">Note</th>
                  <th className="pb-2 font-medium">When</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-200/70">
                {pending.map((t) => (
                  <tr key={t.id}>
                    <td className="py-3">
                      <Link
                        href={`/admin/orgs/${t.orgId}`}
                        className="font-medium text-blue-700 hover:text-blue-800"
                      >
                        {t.orgName}
                      </Link>
                      <div className="font-mono text-xs text-slate-500">{t.orgSlug}</div>
                    </td>
                    <td className="py-3 font-mono text-xs">{t.reference}</td>
                    <td className="py-3 text-slate-600">{t.requestedByEmail ?? "—"}</td>
                    <td className="py-3 text-slate-600">{t.note ?? "—"}</td>
                    <td className="py-3 text-slate-500">
                      {new Date(t.createdAt).toLocaleDateString("en-US")}
                    </td>
                    <td className="py-3 text-right font-semibold">
                      ${(t.amountCents / 100).toFixed(2)}
                    </td>
                    <td className="py-3 text-right">
                      <MarkPaidButton id={t.id} amountCents={t.amountCents} />
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
