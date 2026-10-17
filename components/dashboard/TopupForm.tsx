"use client";

import { useActionState, useState } from "react";
import { requestTopup, cancelTopup, type TopupState } from "@/app/dashboard/billing/actions";
import CopyButton from "@/components/ui/CopyButton";

export interface PendingTopup {
  id: string;
  amountCents: number;
  reference: string;
  createdAt: Date;
}

export default function TopupForm({
  presets,
  minDollars,
  pending: pendingRequests,
  bankDetails,
  bankConfigured,
}: {
  presets: number[];
  minDollars: number;
  pending: PendingTopup[];
  bankDetails: { accountName: string; iban: string; bic: string; bankName: string };
  bankConfigured: boolean;
}) {
  const [state, action, submitting] = useActionState<TopupState, FormData>(requestTopup, {});
  const [amount, setAmount] = useState<string>(String(presets[1] ?? presets[0]));

  return (
    <div>
      <form action={action}>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(String(p))}
              className={`cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium ${
                amount === String(p)
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-slate-300 text-slate-700 hover:border-slate-400"
              }`}
            >
              ${p}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="topup-amount" className="text-xs font-medium text-slate-600">
              Amount (USD)
            </label>
            <input
              id="topup-amount"
              name="amountUsd"
              type="number"
              min={minDollars}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div className="min-w-48 flex-1">
            <label htmlFor="topup-note" className="text-xs font-medium text-slate-600">
              Note (optional)
            </label>
            <input
              id="topup-note"
              name="note"
              placeholder="PO number, cost centre…"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="cursor-pointer rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "Requesting…" : "Request top-up"}
          </button>
        </div>
      </form>

      {state.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state.success && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.success} Transfer the amount quoting reference{" "}
          <span className="font-mono font-semibold">{state.reference}</span> and we&apos;ll
          credit your balance.
        </p>
      )}

      {pendingRequests.length > 0 && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <h3 className="text-sm font-semibold text-amber-900">Awaiting payment</h3>
          <ul className="mt-3 space-y-3">
            {pendingRequests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-semibold">${(r.amountCents / 100).toFixed(2)}</span>
                <span className="font-mono text-xs">{r.reference}</span>
                <CopyButton text={r.reference} label="Copy ref" />
                <span className="text-xs text-slate-500">
                  requested {new Date(r.createdAt).toLocaleDateString("en-US")}
                </span>
                <form action={cancelTopup} className="ml-auto">
                  <input type="hidden" name="id" value={r.id} />
                  <button
                    type="submit"
                    className="cursor-pointer text-xs font-medium text-red-600 hover:text-red-700"
                  >
                    Cancel
                  </button>
                </form>
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t border-amber-200 pt-3">
            {bankConfigured ? (
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Account name</dt>
                  <dd className="font-medium">{bankDetails.accountName}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Bank</dt>
                  <dd className="font-medium">{bankDetails.bankName}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">IBAN</dt>
                  <dd className="font-mono font-medium">{bankDetails.iban}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">BIC</dt>
                  <dd className="font-mono font-medium">{bankDetails.bic}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-amber-900">
                Bank details are not configured yet — we&apos;ll email payment
                instructions for this reference.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
