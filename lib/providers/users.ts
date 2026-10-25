import { providerFetch, type ProviderCallResult } from "@/lib/providers/client";
import { fetchTweetPage, type UpstreamPage } from "@/lib/providers/tweets";

interface UpstreamUser {
  id: string;
  username: string;
  name: string;
  verified: boolean;
  description: string;
  location: string;
  created_at: string;
  metrics: { followers_count: number; following_count: number; tweet_count: number };
}

export interface User {
  id: string;
  username: string;
  name: string;
  verified: boolean;
  description: string;
  location: string;
  created_at: string;
  metrics: { followers: number; following: number; tweets: number };
}

export interface UserPage {
  users: User[];
  result_count: number;
  next_cursor: string | null;
}

function toUser(u: UpstreamUser): User {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    verified: u.verified,
    description: u.description,
    location: u.location,
    created_at: u.created_at,
    metrics: {
      followers: u.metrics.followers_count,
      following: u.metrics.following_count,
      tweets: u.metrics.tweet_count,
    },
  };
}

const userPath = (username: string, rest: string) =>
  `/v1/users/${encodeURIComponent(username)}/${rest}`;

export async function userProfile(username: string): Promise<ProviderCallResult<{ user: User }>> {
  const { data, attempts } = await providerFetch<{ data: UpstreamUser }>(userPath(username, "profile"));
  return { data: { user: toUser(data.data) }, attempts };
}

export function userTweets(username: string, cursor?: string) {
  return fetchTweetPage(userPath(username, "tweets"), { limit: 20, cursor });
}

async function follows(
  username: string,
  kind: "followers" | "following",
  cursor?: string,
): Promise<ProviderCallResult<UserPage>> {
  const { data, attempts } = await providerFetch<UpstreamPage<UpstreamUser>>(
    userPath(username, kind),
    { limit: 20, cursor },
  );
  return {
    data: {
      users: data.data.map(toUser),
      result_count: data.meta.result_count,
      next_cursor: data.meta.next_cursor ?? null,
    },
    attempts,
  };
}

export const userFollowers = (username: string, cursor?: string) =>
  follows(username, "followers", cursor);
export const userFollowing = (username: string, cursor?: string) =>
  follows(username, "following", cursor);
