import { providerFetch } from "@/lib/providers/client";

/** The upstream's response shape, kept separate from what we return. */
interface UpstreamSearchResponse {
  data: {
    id: string;
    text: string;
    lang: string;
    created_at: string;
    author: { id: string; username: string; name: string; verified: boolean; followers_count: number };
    metrics: { like_count: number; repost_count: number; reply_count: number; quote_count: number };
  }[];
  meta: { result_count: number; total_available: number; next_cursor: string | null; query: string };
}

/** What we serve to customers — decoupled from the provider so swapping one
 *  upstream for another doesn't change our public contract. */
export interface Tweet {
  id: string;
  text: string;
  created_at: string;
  author: { username: string; name: string; verified: boolean };
  metrics: { likes: number; reposts: number; replies: number };
}

export interface SearchResult {
  tweets: Tweet[];
  result_count: number;
  next_cursor: string | null;
  attempts: number;
}

export async function searchTweets(
  query: string,
  options: { limit?: number; cursor?: string } = {},
): Promise<SearchResult> {
  const { data, attempts } = await providerFetch<UpstreamSearchResponse>(
    "/v1/tweets/search",
    { query, limit: options.limit ?? 20, cursor: options.cursor },
  );

  return {
    tweets: data.data.map((t) => ({
      id: t.id,
      text: t.text,
      created_at: t.created_at,
      author: {
        username: t.author.username,
        name: t.author.name,
        verified: t.author.verified,
      },
      metrics: {
        likes: t.metrics.like_count,
        reposts: t.metrics.repost_count,
        replies: t.metrics.reply_count,
      },
    })),
    result_count: data.meta.result_count,
    next_cursor: data.meta.next_cursor,
    attempts,
  };
}
