import { providerFetch, type ProviderCallResult } from "@/lib/providers/client";
import { toTweet, type Tweet, type UpstreamTweet } from "@/lib/providers/tweets";

/** A post from the live feed. `sequence` is the stream cursor it was produced at. */
export interface StreamPost extends Tweet {
  sequence: number;
}

export function toStreamPost(t: UpstreamTweet & { sequence: number }): StreamPost {
  return { ...toTweet(t), sequence: t.sequence };
}

export interface BackfillPage {
  tweets: StreamPost[];
  result_count: number;
  /** Pass back as ?cursor= to continue; equals the last post's sequence. */
  cursor: number;
  has_more: boolean;
}

/** Posts on a topic produced after `cursor`, oldest first. */
export async function streamBackfill(
  topic: string,
  cursor?: number,
): Promise<ProviderCallResult<BackfillPage>> {
  const { data, attempts } = await providerFetch<{
    data: (UpstreamTweet & { sequence: number })[];
    meta: { result_count: number; cursor: number; has_more: boolean };
  }>("/v1/stream/backfill", { topic, cursor, limit: 100 });
  return {
    data: {
      tweets: data.data.map(toStreamPost),
      result_count: data.meta.result_count,
      cursor: data.meta.cursor,
      has_more: data.meta.has_more,
    },
    attempts,
  };
}

/**
 * The upstream live feed for one topic, as a WebSocket URL plus the headers
 * to authenticate it. The stream server opens one of these per rule.
 */
export function upstreamStreamTarget(topic: string): { url: string; headers: Record<string, string> } {
  const baseUrl = process.env.PROVIDER_BASE_URL;
  const apiKey = process.env.PROVIDER_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("PROVIDER_BASE_URL and PROVIDER_API_KEY must be set");

  const url = new URL("/v1/stream", baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("topic", topic);
  return { url: url.toString(), headers: { "X-Provider-Key": apiKey } };
}
