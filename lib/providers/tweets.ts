import { providerFetch, type ProviderCallResult } from "@/lib/providers/client";

/** The upstream's post shape, kept separate from what we return. */
export interface UpstreamTweet {
  id: string;
  text: string;
  lang: string;
  created_at: string;
  author: { id: string; username: string; name: string; verified: boolean; followers_count: number };
  metrics: { like_count: number; repost_count: number; reply_count: number; quote_count: number };
  conversation_id?: string;
  in_reply_to_id?: string | null;
  quoted_id?: string;
}

export interface UpstreamPage<T> {
  data: T[];
  meta: { result_count: number; next_cursor?: string | null };
}

/** What we serve to customers — decoupled from the provider so swapping one
 *  upstream for another doesn't change our public contract. */
export interface Tweet {
  id: string;
  text: string;
  created_at: string;
  author: { username: string; name: string; verified: boolean };
  metrics: { likes: number; reposts: number; replies: number };
  /** Present on replies and threads. */
  conversation_id?: string;
  /** Present on replies and threads; null on the post that starts a thread. */
  in_reply_to_id?: string | null;
  /** Present on quote posts. */
  quoted_id?: string;
}

/** A page of posts. `next_cursor` is passed back as ?cursor= for the next page. */
export interface TweetPage {
  tweets: Tweet[];
  result_count: number;
  next_cursor: string | null;
}

export function toTweet(t: UpstreamTweet): Tweet {
  const tweet: Tweet = {
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
  };
  if (t.conversation_id !== undefined) tweet.conversation_id = t.conversation_id;
  if (t.in_reply_to_id !== undefined) tweet.in_reply_to_id = t.in_reply_to_id;
  if (t.quoted_id !== undefined) tweet.quoted_id = t.quoted_id;
  return tweet;
}

/** Fetch a paginated list of posts and map it. */
export async function fetchTweetPage(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<ProviderCallResult<TweetPage>> {
  const { data, attempts } = await providerFetch<UpstreamPage<UpstreamTweet>>(path, params);
  return {
    data: {
      tweets: data.data.map(toTweet),
      result_count: data.meta.result_count,
      next_cursor: data.meta.next_cursor ?? null,
    },
    attempts,
  };
}

export async function searchTweets(
  query: string,
): Promise<ProviderCallResult<{ tweets: Tweet[]; result_count: number }>> {
  const { data, attempts } = await fetchTweetPage("/v1/tweets/search", { query, limit: 20 });
  return { data: { tweets: data.tweets, result_count: data.result_count }, attempts };
}

export function tweetReplies(tweetId: string, cursor?: string) {
  return fetchTweetPage(`/v1/tweets/${encodeURIComponent(tweetId)}/replies`, { limit: 20, cursor });
}

export function tweetQuotes(tweetId: string, cursor?: string) {
  return fetchTweetPage(`/v1/tweets/${encodeURIComponent(tweetId)}/quotes`, { limit: 20, cursor });
}

export async function tweetThread(
  tweetId: string,
): Promise<ProviderCallResult<{ tweets: Tweet[]; result_count: number }>> {
  const { data, attempts } = await providerFetch<UpstreamPage<UpstreamTweet>>(
    `/v1/tweets/${encodeURIComponent(tweetId)}/thread`,
  );
  return {
    data: { tweets: data.data.map(toTweet), result_count: data.meta.result_count },
    attempts,
  };
}
