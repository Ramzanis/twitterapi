import { providerFetch, type ProviderCallResult } from "@/lib/providers/client";
import {
  toTweet,
  type TweetPage,
  type UpstreamPage,
  type UpstreamTweet,
} from "@/lib/providers/tweets";

export interface Trend {
  rank: number;
  name: string;
  /** Pass to /tweet/search to read the posts behind the trend. */
  query: string;
  /** Null when the trend is too small for a volume to be reported. */
  tweet_volume: number | null;
}

export interface Space {
  id: string;
  title: string;
  state: "live" | "scheduled";
  host: { username: string; name: string; verified: boolean };
  participant_count: number;
  started_at: string | null;
  scheduled_start: string | null;
}

export interface Media {
  id: string;
  type: "photo" | "video" | "animated_gif";
  url: string;
  width: number;
  height: number;
  duration_ms: number | null;
  alt_text: string | null;
}

export async function trends(
  location: string,
): Promise<ProviderCallResult<{ trends: Trend[]; location: string; as_of: string }>> {
  const { data, attempts } = await providerFetch<{
    data: Trend[];
    meta: { location: string; as_of: string };
  }>("/v1/trends", { location });
  return {
    data: {
      trends: data.data.map(({ rank, name, query, tweet_volume }) => ({ rank, name, query, tweet_volume })),
      location: data.meta.location,
      as_of: data.meta.as_of,
    },
    attempts,
  };
}

export interface ListTweetPage extends TweetPage {
  list: { id: string; name: string; member_count: number };
}

export async function listTweets(
  listId: string,
  cursor?: string,
): Promise<ProviderCallResult<ListTweetPage>> {
  // The list's own metadata rides on the page meta, so this is one upstream call.
  const { data, attempts } = await providerFetch<
    UpstreamPage<UpstreamTweet> & { meta: { list: ListTweetPage["list"] } }
  >(`/v1/lists/${encodeURIComponent(listId)}/tweets`, { limit: 20, cursor });
  return {
    data: {
      tweets: data.data.map(toTweet),
      result_count: data.meta.result_count,
      next_cursor: data.meta.next_cursor ?? null,
      list: data.meta.list,
    },
    attempts,
  };
}

export async function spaces(
  query: string,
): Promise<ProviderCallResult<{ spaces: Space[]; result_count: number }>> {
  const { data, attempts } = await providerFetch<{
    data: (Space & { host: Space["host"] & { id: string; followers_count: number } })[];
    meta: { result_count: number };
  }>("/v1/spaces", { query });
  return {
    data: {
      spaces: data.data.map((s) => ({
        id: s.id,
        title: s.title,
        state: s.state,
        host: { username: s.host.username, name: s.host.name, verified: s.host.verified },
        participant_count: s.participant_count,
        started_at: s.started_at,
        scheduled_start: s.scheduled_start,
      })),
      result_count: data.meta.result_count,
    },
    attempts,
  };
}

export async function mediaLookup(mediaId: string): Promise<ProviderCallResult<{ media: Media }>> {
  const { data, attempts } = await providerFetch<{ data: Media }>(
    `/v1/media/${encodeURIComponent(mediaId)}`,
  );
  const m = data.data;
  return {
    data: {
      media: {
        id: m.id,
        type: m.type,
        url: m.url,
        width: m.width,
        height: m.height,
        duration_ms: m.duration_ms,
        alt_text: m.alt_text,
      },
    },
    attempts,
  };
}
