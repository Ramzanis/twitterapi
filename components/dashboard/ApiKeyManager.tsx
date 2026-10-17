"use client";

import { useActionState, useState } from "react";
import {
  createApiKey,
  revokeApiKey,
  rollApiKey,
  type CreateKeyState,
} from "@/app/dashboard/actions";

export interface KeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  environment: "live" | "test";
  status: "active" | "revoked";
  createdAt: Date;
  lastUsedAt: Date | null;
}

function formatDate(value: Date | null) {
  if (!value) return "never";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ApiKeyManager({ keys }: { keys: KeyRow[] }) {
  const [createState, formAction, pending] = useActionState<CreateKeyState, FormData>(
    createApiKey,
    {},
  );
  const [rollState, rollAction] = useActionState<CreateKeyState, FormData>(rollApiKey, {});
  const [copied, setCopied] = useState(false);

  // Whichever action last produced a key — it is only ever shown once.
  const state: CreateKeyState = rollState.rawKey || rollState.error ? rollState : createState;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">API keys</h2>
      <p className="mt-1 text-sm text-slate-600">
        Keys are stored as a SHA-256 hash, so the full value is shown only once
        at creation.
      </p>

      {state.rawKey && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-sm font-semibold text-emerald-900">
            Your new API key — copy it now
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-800">
              {state.rawKey}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(state.rawKey!);
                setCopied(true);
              }}
              className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {state.error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <form action={formAction} className="mt-5 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-40">
          <label htmlFor="key-name" className="text-xs font-medium text-slate-600">
            Name
          </label>
          <input
            id="key-name"
            name="name"
            placeholder="Production"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label htmlFor="key-env" className="text-xs font-medium text-slate-600">
            Environment
          </label>
          <select
            id="key-env"
            name="environment"
            defaultValue="live"
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          >
            <option value="live">live</option>
            <option value="test">test (not billed)</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create key"}
        </button>
      </form>

      {keys.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Key</th>
                <th className="pb-2 font-medium">Env</th>
                <th className="pb-2 font-medium">Created</th>
                <th className="pb-2 font-medium">Last used</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {keys.map((key) => (
                <tr key={key.id} className={key.status === "revoked" ? "text-slate-400" : ""}>
                  <td className="py-3">{key.name}</td>
                  <td className="py-3 font-mono text-xs">{key.keyPrefix}</td>
                  <td className="py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        key.environment === "live"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {key.environment}
                    </span>
                  </td>
                  <td className="py-3 text-slate-500">{formatDate(key.createdAt)}</td>
                  <td className="py-3 text-slate-500">{formatDate(key.lastUsedAt)}</td>
                  <td className="py-3">
                    {key.status === "active" ? (
                      <div className="flex justify-end gap-3">
                        <form action={rollAction}>
                          <input type="hidden" name="keyId" value={key.id} />
                          <button
                            type="submit"
                            title="Create a replacement and revoke this one"
                            className="cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-700"
                          >
                            Roll
                          </button>
                        </form>
                        <form action={revokeApiKey}>
                          <input type="hidden" name="keyId" value={key.id} />
                          <button
                            type="submit"
                            className="cursor-pointer text-xs font-medium text-red-600 hover:text-red-700"
                          >
                            Revoke
                          </button>
                        </form>
                      </div>
                    ) : (
                      <div className="text-right text-xs">revoked</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
