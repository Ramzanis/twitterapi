"use client";

import { useActionState } from "react";
import { updateOrganization, updateProfile, type FormResult } from "@/app/dashboard/account/actions";
import { updateSpendControls } from "@/app/dashboard/billing/actions";

function Feedback({ state }: { state: FormResult }) {
  if (state.error)
    return <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;
  if (state.success)
    return (
      <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {state.success}
      </p>
    );
  return null;
}

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500";
const buttonClass =
  "mt-4 cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60";

export function ProfileForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState<FormResult, FormData>(updateProfile, {});
  return (
    <form action={action}>
      <label htmlFor="profile-name" className="text-xs font-medium text-slate-600">
        Display name
      </label>
      <input id="profile-name" name="name" defaultValue={name} className={inputClass} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : "Save"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function OrganizationForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState<FormResult, FormData>(
    updateOrganization,
    {},
  );
  return (
    <form action={action}>
      <label htmlFor="org-name" className="text-xs font-medium text-slate-600">
        Organization name
      </label>
      <input id="org-name" name="name" defaultValue={name} className={inputClass} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : "Save"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function SpendControlsForm({
  spendCapCents,
  hardStop,
  thresholds,
}: {
  spendCapCents: number | null;
  hardStop: boolean;
  thresholds: number[];
}) {
  const [state, action, pending] = useActionState<FormResult, FormData>(
    updateSpendControls,
    {},
  );
  return (
    <form action={action}>
      <label htmlFor="spend-cap" className="text-xs font-medium text-slate-600">
        Monthly spend cap (USD)
      </label>
      <input
        id="spend-cap"
        name="spendCap"
        type="number"
        min="0"
        step="0.01"
        placeholder="No cap"
        defaultValue={spendCapCents !== null ? (spendCapCents / 100).toFixed(2) : ""}
        className={inputClass}
      />
      <p className="mt-1 text-xs text-slate-400">Leave blank for no cap.</p>

      <fieldset className="mt-4">
        <legend className="text-xs font-medium text-slate-600">Alert me at</legend>
        <div className="mt-2 flex gap-4">
          {[50, 80, 100].map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name={`alert${t}`}
                defaultChecked={thresholds.includes(t)}
                className="size-4 rounded border-slate-300"
              />
              {t}%
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="hardStop"
          defaultChecked={hardStop}
          className="size-4 rounded border-slate-300"
        />
        Stop serving requests when the cap is reached
      </label>

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : "Save"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
