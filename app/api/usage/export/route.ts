import { requireUser } from "@/lib/authz";
import { getRequestsForExport } from "@/lib/usage";

/** CSV of this organization's API calls — what finance teams always ask for. */
export async function GET(request: Request) {
  const user = await requireUser();
  const days = Number(new URL(request.url).searchParams.get("days") ?? 30);

  const rows = await getRequestsForExport(user.orgId, Number.isFinite(days) ? days : 30);

  const escape = (value: string) =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  const header = "timestamp_utc,endpoint,status,key,credits_usd,latency_ms,source";
  const body = rows.map((r) =>
    [
      new Date(r.createdAt).toISOString(),
      escape(r.endpoint),
      String(r.statusCode),
      escape(r.keyName ?? ""),
      (r.creditsCostMicros / 1_000_000).toFixed(6),
      String(r.latencyMs ?? ""),
      r.cacheHit ? "cache" : "upstream",
    ].join(","),
  );

  const filename = `skylark-usage-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response([header, ...body].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
