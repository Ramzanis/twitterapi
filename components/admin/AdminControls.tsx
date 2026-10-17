"use client";

import { useActionState, useRef } from "react";
import {
  adjustCredits,
  markTopupPaid,
  setOrgPlan,
  setOrgStatus,
  setStaffFlag,
  type AdminResult,
} from "@/app/admin/actions";
import { plans } from "@/config/plans";

function Feedback({ state }: { state: AdminResult }) {
  if (state.error)
    return <p className="mt-2 text-xs text-red-600">{state.error}</p>;
  if (state.success)
    return <p className="mt-2 text-xs text-emerald-600">{state.success}</p>;
  return null;
}

const selectClass =
  "rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500";
const btnClass =
  "cursor-pointer rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60";

/** Options come from the plan catalog, so adding a plan never needs a UI edit. */
const planOptions = Object.entries(plans).map(([code, plan]) => ({ code, name: plan.name }));

export function PlanControl({ orgId, planCode }: { orgId: string; planCode: string }) {
  const [state, action, pending] = useActionState<AdminResult, FormData>(setOrgPlan, {});
  return (
    <form action={action}>
      <div className="flex items-center gap-2">
        <input type="hidden" name="orgId" value={orgId} />
        <select name="planCode" defaultValue={planCode} className={selectClass}>
          {planOptions.map((option) => (
            <option key={option.code} value={option.code}>
              {option.code} — {option.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className={btnClass}>
          {pending ? "…" : "Apply"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

/**
 * Plan control sized for a table cell: changing the select submits it, so a
 * tier change is one interaction from the organization list. The action writes
 * an audit_logs row either way, which is what makes an inline control on a
 * billing field defensible — every change has a name against it.
 */
export function InlinePlanControl({
  orgId,
  planCode,
  hasOverrides,
}: {
  orgId: string;
  planCode: string;
  hasOverrides: boolean;
}) {
  const [state, action, pending] = useActionState<AdminResult, FormData>(setOrgPlan, {});
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="orgId" value={orgId} />
      <select
        name="planCode"
        defaultValue={planCode}
        disabled={pending}
        onChange={() => formRef.current?.requestSubmit()}
        aria-label="Plan"
        className="cursor-pointer rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700 outline-none hover:border-blue-300 focus:border-blue-500 disabled:opacity-60"
      >
        {planOptions.map((option) => (
          <option key={option.code} value={option.code}>
            {option.code}
          </option>
        ))}
      </select>
      {hasOverrides && (
        <span
          title="This organization has plan_overrides set. They are merged over the plan, so changing the tier may not change its entitlements."
          className="ml-1.5 cursor-help text-xs font-medium text-amber-600"
        >
          custom
        </span>
      )}
      {pending && <span className="ml-1.5 text-xs text-slate-400">saving…</span>}
      {!pending && state.success && <span className="ml-1.5 text-xs text-emerald-600">saved</span>}
      {!pending && state.error && (
        <span className="ml-1.5 text-xs text-red-600">{state.error}</span>
      )}
    </form>
  );
}

export function StatusControl({ orgId, status }: { orgId: string; status: string }) {
  const [state, action, pending] = useActionState<AdminResult, FormData>(setOrgStatus, {});
  return (
    <form action={action}>
      <div className="flex items-center gap-2">
        <input type="hidden" name="orgId" value={orgId} />
        <select name="status" defaultValue={status} className={selectClass}>
          <option value="active">active</option>
          <option value="suspended">suspended</option>
          <option value="closed">closed</option>
        </select>
        <button type="submit" disabled={pending} className={btnClass}>
          {pending ? "…" : "Apply"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function CreditsControl({ orgId }: { orgId: string }) {
  const [state, action, pending] = useActionState<AdminResult, FormData>(adjustCredits, {});
  return (
    <form action={action}>
      <div className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="orgId" value={orgId} />
        <div>
          <label className="text-xs font-medium text-slate-600">Amount (USD)</label>
          <input
            name="amountUsd"
            type="number"
            step="0.01"
            placeholder="5.00"
            className={`${selectClass} mt-1 block w-28`}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Type</label>
          <select name="type" defaultValue="purchase" className={`${selectClass} mt-1 block`}>
            <option value="purchase">purchase</option>
            <option value="bonus">bonus</option>
            <option value="refund">refund</option>
            <option value="adjustment">adjustment</option>
          </select>
        </div>
        <div className="flex-1 min-w-40">
          <label className="text-xs font-medium text-slate-600">Note / reference</label>
          <input
            name="note"
            placeholder="bank transfer 2026-08"
            className={`${selectClass} mt-1 block w-full`}
          />
        </div>
        <button type="submit" disabled={pending} className={btnClass}>
          {pending ? "Applying…" : "Apply"}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Negative amounts deduct. Every change appends to the ledger — nothing is overwritten.
      </p>
      <Feedback state={state} />
    </form>
  );
}

/** Marks a top-up paid and credits the ledger in one transaction. */
export function MarkPaidButton({ id, amountCents }: { id: string; amountCents: number }) {
  const [state, action, pending] = useActionState<AdminResult, FormData>(markTopupPaid, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "Crediting…" : `Mark paid · $${(amountCents / 100).toFixed(2)}`}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function StaffToggle({
  userId,
  email,
  isStaff,
}: {
  userId: string;
  email: string;
  isStaff: boolean;
}) {
  const [state, action, pending] = useActionState<AdminResult, FormData>(setStaffFlag, {});
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="isStaff" value={(!isStaff).toString()} />
      <button
        type="submit"
        disabled={pending}
        title={isStaff ? `Remove staff from ${email}` : `Make ${email} staff`}
        className={`cursor-pointer text-xs font-medium ${
          isStaff ? "text-red-600 hover:text-red-700" : "text-blue-600 hover:text-blue-700"
        } disabled:opacity-60`}
      >
        {pending ? "…" : isStaff ? "Revoke staff" : "Make staff"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
