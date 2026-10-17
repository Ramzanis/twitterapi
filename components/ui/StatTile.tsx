export function usd(micros: number, digits = 4) {
  return `$${(micros / 1_000_000).toFixed(digits)}`;
}

/**
 * Money whose magnitude varies by orders of magnitude. Per-call amounts are
 * fractions of a cent, so a fixed 2 decimals would render early revenue as a
 * flat "$0.00"; anything a dollar or over gets normal currency formatting.
 */
export function usdAuto(micros: number) {
  const dollars = micros / 1_000_000;
  if (Math.abs(dollars) < 1) return `$${dollars.toFixed(4)}`;
  // Pinned to en-US: these are USD figures rendered on a server whose locale
  // is incidental, and a Norwegian server would otherwise print "$4,00".
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative";
}) {
  const valueColor =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
        ? "text-red-600"
        : "text-slate-900";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tracking-tight ${valueColor}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}
