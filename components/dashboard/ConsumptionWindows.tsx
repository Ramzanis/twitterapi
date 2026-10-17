import type { WindowUsage } from "@/lib/usage";

function money(micros: number) {
  const dollars = micros / 1_000_000;
  if (dollars === 0) return "$0";
  if (Math.abs(dollars) < 1) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
}

export default function ConsumptionWindows({ windows }: { windows: WindowUsage[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Credit consumption</h2>
      <p className="mt-1 text-sm text-slate-600">
        Exact counts — every call is recorded in the same transaction as its charge,
        so this always agrees with your balance.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {windows.map((w) => (
          <div key={w.label} className="rounded-xl border border-slate-200 p-4">
            <div className="text-xs font-medium text-slate-500">{w.label}</div>
            <div className="mt-2 text-xl font-semibold tracking-tight">
              {w.calls.toLocaleString()}
              <span className="ml-1 text-sm font-normal text-slate-400">
                {w.calls === 1 ? "call" : "calls"}
              </span>
            </div>
            <div className="mt-1 text-sm text-slate-600">{money(w.creditsMicros)}</div>
            {w.throttled > 0 && (
              <div className="mt-1.5 text-xs font-medium text-amber-600">
                {w.throttled.toLocaleString()} throttled
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
