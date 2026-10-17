import { BALANCE_ALERT_DOLLARS, type Balances } from "@/lib/ledger";

// USD is always formatted en-US regardless of server locale.
function money(micros: number) {
  const dollars = micros / 1_000_000;
  if (Math.abs(dollars) < 1 && dollars !== 0) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** 1 credit = $0.000001 (one micro-dollar), so credits are integers. */
function credits(micros: number) {
  return micros.toLocaleString("en-US");
}

export default function CreditBalance({
  balances,
  spendCapCents,
  hardStop,
}: {
  balances: Balances;
  spendCapCents: number | null;
  hardStop: boolean;
}) {
  const low = balances.totalMicros <= 1_000_000;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Credit balance</h2>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`text-3xl font-semibold tracking-tight ${
                low ? "text-red-600" : "text-slate-900"
              }`}
            >
              {money(balances.totalMicros)}
            </span>
            <span className="text-sm text-slate-500">
              {credits(balances.totalMicros)} credits
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <span className="text-slate-600">
              {money(balances.paidMicros)}{" "}
              <span className="text-slate-400">recharge</span>
            </span>
            <span className="text-slate-600">
              +{money(balances.bonusMicros)}{" "}
              <span className="text-slate-400">bonus</span>
            </span>
          </div>
        </div>
        <a
          href="mailto:billing@skylark.dev?subject=Credit%20top-up"
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          Top up credits
        </a>
      </div>

      <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
        We&apos;ll email you at{" "}
        {BALANCE_ALERT_DOLLARS.map((d) => `$${d}`).join(", ")} balance — you&apos;ll
        always get a heads-up before you hit zero. Bonus credits are spent first.
        {spendCapCents !== null && (
          <>
            {" "}
            Your monthly spend cap is ${(spendCapCents / 100).toFixed(2)}
            {hardStop ? " and requests stop when it is reached." : " (alerts only)."}
          </>
        )}
      </p>
    </section>
  );
}
