import type { DailyUsage } from "@/lib/usage";

/**
 * Daily request volume. One series, so no legend — the title names it.
 * CSS-only hover tooltips keep this a server component.
 */
export default function UsageChart({ data, days = 14 }: { data: DailyUsage[]; days?: number }) {
  // Fill missing days so gaps read as zero rather than being collapsed.
  const byDay = new Map(data.map((d) => [d.day, d]));
  const series = Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    const row = byDay.get(key);
    return {
      day: key,
      label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      requests: row?.requests ?? 0,
      creditsSpentMicros: row?.creditsSpentMicros ?? 0,
    };
  });

  const max = Math.max(...series.map((d) => d.requests), 1);
  const total = series.reduce((sum, d) => sum + d.requests, 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Requests per day</h2>
        <span className="text-sm text-slate-500">last {days} days</span>
      </div>

      {total === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          No requests yet. Create a key below and make your first call.
        </p>
      ) : (
        <div className="mt-6 flex h-40 items-end gap-0.5">
          {series.map((d) => (
            <div key={d.day} className="group relative flex flex-1 flex-col justify-end">
              <div
                className="rounded-t bg-blue-600 transition-colors group-hover:bg-blue-700"
                style={{ height: `${Math.max((d.requests / max) * 100, d.requests > 0 ? 3 : 0)}%` }}
              />
              {/* hover layer */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg group-hover:block">
                <div className="font-medium">{d.label}</div>
                <div className="text-slate-300">
                  {d.requests} {d.requests === 1 ? "request" : "requests"}
                </div>
                <div className="text-slate-400">
                  ${(d.creditsSpentMicros / 1_000_000).toFixed(4)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > 0 && (
        <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-xs text-slate-400">
          <span>{series[0].label}</span>
          <span>{series[series.length - 1].label}</span>
        </div>
      )}
    </section>
  );
}
