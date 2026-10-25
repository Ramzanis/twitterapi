import { required, serveMetered } from "@/lib/meteredEndpoint";
import { streamBackfill } from "@/lib/providers/stream";
import { getRule } from "@/lib/streamRules";

/**
 * Catch-up after a dropped stream connection: the posts a rule matched after
 * a cursor, the same ones a connection that never dropped would have received.
 */
export function GET(request: Request) {
  return serveMetered(request, {
    endpoint: "/stream/backfill",
    parse: async (searchParams, ctx) => {
      const ruleId = required(searchParams, "rule_id");
      if (typeof ruleId !== "string") return ruleId;
      const rule = await getRule(ctx.org.id, ruleId);
      if (!rule) return { error: "No stream rule with that id", status: 404 };

      const rawCursor = searchParams.get("cursor")?.trim();
      const cursor = rawCursor ? Number(rawCursor) : undefined;
      if (cursor !== undefined && !Number.isSafeInteger(cursor)) {
        return { error: "cursor must be the integer sequence from a stream message" };
      }
      return { rule_id: rule.id, topic: rule.value, tag: rule.tag ?? undefined, cursor };
    },
    fetch: async ({ rule_id, topic, tag, cursor }) => {
      const result = await streamBackfill(topic, cursor);
      return {
        data: { rule: { id: rule_id, value: topic, tag: tag ?? null }, ...result.data },
        attempts: result.attempts,
      };
    },
    // Recent cursors move every few seconds, so a cached page would be stale.
    cacheTtlMs: 0,
  });
}
