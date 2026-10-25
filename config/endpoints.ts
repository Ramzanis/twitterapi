// Public API catalog — config as code, and the single source of truth for what
// we tell customers an endpoint does.
//
// Both the in-product reference (/dashboard/docs) and the OpenAPI document
// (/api/openapi) render from this file, so the two can never disagree. Prices
// are not repeated here: they resolve through config/pricing.ts, which is what
// the route actually charges. Document an endpoint only once it ships — this
// catalog is a contract, not a roadmap.

import { endpointPricingMicros, priceFor } from "@/config/pricing";

/** A trimmed JSON Schema — enough to describe our responses and emit OpenAPI. */
export interface JsonSchema {
  type: "object" | "array" | "string" | "integer" | "number" | "boolean";
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  format?: string;
  enum?: string[];
  /** Rendered as a type union in OpenAPI 3.1, which has no `nullable` keyword. */
  nullable?: boolean;
}

export interface EndpointParam {
  name: string;
  type: "string" | "integer" | "boolean";
  required: boolean;
  description: string;
  example: string;
}

export interface EndpointDoc {
  /** Metering key. Matches api_requests.endpoint and config/pricing.ts. */
  id: string;
  /** URL segment for this endpoint's reference page. Stable — it gets linked to. */
  slug: string;
  /** The path customers call, relative to the API base URL. */
  path: string;
  method: "GET";
  /** Sidebar section. Endpoints sharing a group are listed together, in order. */
  group: string;
  summary: string;
  description: string;
  params: EndpointParam[];
  /** Schema of the `data` object inside the response envelope. */
  dataSchema: JsonSchema;
  dataExample: unknown;
}

const tweetSchema: JsonSchema = {
  type: "object",
  required: ["id", "text", "created_at", "author", "metrics"],
  properties: {
    id: { type: "string", description: "Stable identifier for the post." },
    text: { type: "string", description: "Post body as published." },
    created_at: { type: "string", format: "date-time", description: "Publication time, UTC." },
    author: {
      type: "object",
      required: ["username", "name", "verified"],
      properties: {
        username: { type: "string" },
        name: { type: "string" },
        verified: { type: "boolean" },
      },
    },
    metrics: {
      type: "object",
      required: ["likes", "reposts", "replies"],
      properties: {
        likes: { type: "integer" },
        reposts: { type: "integer" },
        replies: { type: "integer" },
      },
    },
  },
};

/** A post that belongs to a conversation: a reply, a quote, or part of a thread. */
const conversationTweetSchema: JsonSchema = {
  ...tweetSchema,
  properties: {
    ...tweetSchema.properties,
    conversation_id: {
      type: "string",
      description: "Id of the post that started the conversation. Present on replies and threads.",
    },
    in_reply_to_id: {
      type: "string",
      nullable: true,
      description: "Id of the post this one answers. Null on the first post of a thread.",
    },
    quoted_id: { type: "string", description: "Id of the quoted post. Present on quote posts." },
  },
};

const userSchema: JsonSchema = {
  type: "object",
  required: ["id", "username", "name", "verified", "description", "location", "created_at", "metrics"],
  properties: {
    id: { type: "string", description: "Stable identifier for the account." },
    username: { type: "string", description: "Handle, without the @." },
    name: { type: "string", description: "Display name." },
    verified: { type: "boolean" },
    description: { type: "string", description: "Profile bio." },
    location: { type: "string", description: "Free-text location from the profile." },
    created_at: { type: "string", format: "date-time", description: "Account creation time, UTC." },
    metrics: {
      type: "object",
      required: ["followers", "following", "tweets"],
      properties: {
        followers: { type: "integer" },
        following: { type: "integer" },
        tweets: { type: "integer" },
      },
    },
  },
};

const streamPostSchema: JsonSchema = {
  ...tweetSchema,
  required: [...(tweetSchema.required ?? []), "sequence"],
  properties: {
    ...tweetSchema.properties,
    sequence: {
      type: "integer",
      description: "Stream cursor this post was produced at. Pass it to backfill to resume after it.",
    },
  },
};

/** A paginated list: the items, how many came back, and the cursor for the next page. */
function pageSchema(key: string, item: JsonSchema, extra: Record<string, JsonSchema> = {}): JsonSchema {
  return {
    type: "object",
    required: [key, "result_count", "next_cursor", ...Object.keys(extra)],
    properties: {
      [key]: { type: "array", items: item },
      result_count: { type: "integer", description: "Number of items in this response." },
      next_cursor: {
        type: "string",
        nullable: true,
        description: "Pass as ?cursor= to fetch the next page. Null on the last page.",
      },
      ...extra,
    },
  };
}

const cursorParamDoc: EndpointParam = {
  name: "cursor",
  type: "string",
  required: false,
  description: "next_cursor from the previous page. Omit for the first page. Pages hold up to 20 items.",
  example: "MjA",
};

const tweetIdParamDoc: EndpointParam = {
  name: "tweet_id",
  type: "string",
  required: true,
  description: "Numeric id of the post.",
  example: "1893000000000000123",
};

const usernameParamDoc: EndpointParam = {
  name: "username",
  type: "string",
  required: true,
  description: "Account handle, with or without the leading @. Case-insensitive.",
  example: "devrel_dana",
};

const exampleTweet = {
  id: "1801234567890123456",
  text: "Shipped the agent runtime today. It plans, calls tools, and stops when it is done.",
  created_at: "2026-08-29T09:14:02.000Z",
  author: { username: "hbergstrom", name: "Hanne Bergstrom", verified: true },
  metrics: { likes: 412, reposts: 87, replies: 23 },
};

const exampleUser = {
  id: "700000412",
  username: "devrel_dana",
  name: "Dana Okonkwo",
  verified: true,
  description: "Building things. Occasionally writing about devrel.",
  location: "Berlin",
  created_at: "2019-04-12T08:00:00.000Z",
  metrics: { followers: 48200, following: 812, tweets: 15230 },
};

const NOT_FOUND_NOTE = " An unknown id returns 404, which is never billed.";

export const endpointDocs: EndpointDoc[] = [
  {
    id: "/tweet/search",
    slug: "search_recent_posts",
    path: "/api/x/tweet/search",
    method: "GET",
    group: "Tweets",
    summary: "Search recent posts",
    description:
      "Full-text search across recent posts. Results are served from a shared cache when the " +
      "same query was fetched in the last 5 minutes; a cached response is billed at the same " +
      "price as a fresh one, and meta.cache_hit tells you which you got.",
    params: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "Search terms. Matched case-insensitively.",
        example: "AI agents",
      },
    ],
    dataSchema: {
      type: "object",
      required: ["tweets", "result_count"],
      properties: {
        tweets: { type: "array", items: tweetSchema },
        result_count: {
          type: "integer",
          description: "Number of posts returned in this response.",
        },
      },
    },
    dataExample: {
      tweets: [
        {
          id: "1801234567890123456",
          text: "Shipped the agent runtime today. It plans, calls tools, and stops when it is done.",
          created_at: "2026-08-29T09:14:02.000Z",
          author: { username: "hbergstrom", name: "Hanne Bergstrom", verified: true },
          metrics: { likes: 412, reposts: 87, replies: 23 },
        },
      ],
      result_count: 1,
    },
  },
  {
    id: "/tweet/replies",
    slug: "get_post_replies",
    path: "/api/x/tweet/replies",
    method: "GET",
    group: "Tweets",
    summary: "Get replies to a post",
    description: "Replies to a post, newest first, 20 per page." + NOT_FOUND_NOTE,
    params: [tweetIdParamDoc, cursorParamDoc],
    dataSchema: pageSchema("tweets", conversationTweetSchema),
    dataExample: {
      tweets: [
        {
          ...exampleTweet,
          text: "Did you measure that before and after, or is this a feeling?",
          conversation_id: "1893000000000000123",
          in_reply_to_id: "1893000000000000123",
        },
      ],
      result_count: 1,
      next_cursor: "MjA",
    },
  },
  {
    id: "/tweet/quotes",
    slug: "get_post_quotes",
    path: "/api/x/tweet/quotes",
    method: "GET",
    group: "Tweets",
    summary: "Get quotes of a post",
    description: "Posts that quote a post, newest first, 20 per page." + NOT_FOUND_NOTE,
    params: [tweetIdParamDoc, cursorParamDoc],
    dataSchema: pageSchema("tweets", conversationTweetSchema),
    dataExample: {
      tweets: [
        {
          ...exampleTweet,
          text: "Worth reading if you're about to make the same decision:",
          quoted_id: "1893000000000000123",
        },
      ],
      result_count: 1,
      next_cursor: null,
    },
  },
  {
    id: "/tweet/thread",
    slug: "get_post_thread",
    path: "/api/x/tweet/thread",
    method: "GET",
    group: "Tweets",
    summary: "Get a thread",
    description:
      "The author's thread that starts at a post, in reading order. Each post's in_reply_to_id " +
      "points at the one before it." + NOT_FOUND_NOTE,
    params: [tweetIdParamDoc],
    dataSchema: {
      type: "object",
      required: ["tweets", "result_count"],
      properties: {
        tweets: { type: "array", items: conversationTweetSchema },
        result_count: { type: "integer", description: "Number of posts in the thread." },
      },
    },
    dataExample: {
      tweets: [
        { ...exampleTweet, id: "1893000000000000123", text: "1/2 A short thread on agent runtimes.", conversation_id: "1893000000000000123", in_reply_to_id: null },
        { ...exampleTweet, id: "1893000000000000124", text: "2/2 The stopping condition is the hard part.", conversation_id: "1893000000000000123", in_reply_to_id: "1893000000000000123" },
      ],
      result_count: 2,
    },
  },
  {
    id: "/user/profile",
    slug: "get_user_profile",
    path: "/api/x/user/profile",
    method: "GET",
    group: "Users",
    summary: "Get a user profile",
    description:
      "An account's public profile and counts. Cached for an hour, so follower counts can trail " +
      "the live figure slightly." + NOT_FOUND_NOTE,
    params: [usernameParamDoc],
    dataSchema: {
      type: "object",
      required: ["user"],
      properties: { user: userSchema },
    },
    dataExample: { user: exampleUser },
  },
  {
    id: "/user/tweets",
    slug: "get_user_posts",
    path: "/api/x/user/tweets",
    method: "GET",
    group: "Users",
    summary: "Get a user's posts",
    description: "An account's recent posts, newest first, 20 per page." + NOT_FOUND_NOTE,
    params: [usernameParamDoc, cursorParamDoc],
    dataSchema: pageSchema("tweets", tweetSchema),
    dataExample: { tweets: [exampleTweet], result_count: 1, next_cursor: "MjA" },
  },
  {
    id: "/user/followers",
    slug: "get_user_followers",
    path: "/api/x/user/followers",
    method: "GET",
    group: "Users",
    summary: "Get a user's followers",
    description: "Accounts that follow a user, 20 per page. Cached for an hour." + NOT_FOUND_NOTE,
    params: [usernameParamDoc, cursorParamDoc],
    dataSchema: pageSchema("users", userSchema),
    dataExample: { users: [exampleUser], result_count: 1, next_cursor: "MjA" },
  },
  {
    id: "/user/following",
    slug: "get_user_following",
    path: "/api/x/user/following",
    method: "GET",
    group: "Users",
    summary: "Get accounts a user follows",
    description: "Accounts a user follows, 20 per page. Cached for an hour." + NOT_FOUND_NOTE,
    params: [usernameParamDoc, cursorParamDoc],
    dataSchema: pageSchema("users", userSchema),
    dataExample: { users: [exampleUser], result_count: 1, next_cursor: null },
  },
  {
    id: "/stream/backfill",
    slug: "backfill_stream",
    path: "/api/x/stream/backfill",
    method: "GET",
    group: "Streams",
    summary: "Backfill a stream rule",
    description:
      "Posts a stream rule matched after a cursor, oldest first, up to 100 per call — the same " +
      "posts a connection that never dropped would have received. Without a cursor, returns " +
      "the last five minutes. Keep calling with the returned cursor while has_more is true. " +
      "Billed per call, not per post. An unknown rule_id returns 404.",
    params: [
      {
        name: "rule_id",
        type: "string",
        required: true,
        description: "Id of one of your stream rules.",
        example: "7f3c2a1e-0b8d-4c55-9a61-2f1e8d4b6c90",
      },
      {
        name: "cursor",
        type: "integer",
        required: false,
        description: "The cursor of the last post you received. Posts after it are returned.",
        example: "179236340",
      },
    ],
    dataSchema: {
      type: "object",
      required: ["rule", "tweets", "result_count", "cursor", "has_more"],
      properties: {
        rule: {
          type: "object",
          required: ["id", "value", "tag"],
          properties: {
            id: { type: "string" },
            value: { type: "string", description: "The topic the rule matches." },
            tag: { type: "string", nullable: true, description: "Your label for the rule." },
          },
        },
        tweets: { type: "array", items: streamPostSchema },
        result_count: { type: "integer" },
        cursor: { type: "integer", description: "Pass back as ?cursor= to continue." },
        has_more: { type: "boolean", description: "Whether more posts are waiting after this page." },
      },
    },
    dataExample: {
      rule: { id: "7f3c2a1e-0b8d-4c55-9a61-2f1e8d4b6c90", value: "ai agents", tag: "research" },
      tweets: [{ ...exampleTweet, sequence: 179236341 }],
      result_count: 1,
      cursor: 179236341,
      has_more: false,
    },
  },
  {
    id: "/trends",
    slug: "get_trends",
    path: "/api/x/trends",
    method: "GET",
    group: "Discovery",
    summary: "Get trends",
    description:
      "The top ten trends for a location. Each trend's query can be passed straight to post " +
      "search. Cached for 15 minutes.",
    params: [
      {
        name: "location",
        type: "string",
        required: false,
        description: "City or country name. Defaults to worldwide.",
        example: "Oslo",
      },
    ],
    dataSchema: {
      type: "object",
      required: ["trends", "location", "as_of"],
      properties: {
        trends: {
          type: "array",
          items: {
            type: "object",
            required: ["rank", "name", "query", "tweet_volume"],
            properties: {
              rank: { type: "integer" },
              name: { type: "string" },
              query: { type: "string", description: "Pass to /tweet/search to read the posts." },
              tweet_volume: {
                type: "integer",
                nullable: true,
                description: "Recent post count. Null when too small to report.",
              },
            },
          },
        },
        location: { type: "string" },
        as_of: { type: "string", format: "date-time", description: "When this ranking was computed." },
      },
    },
    dataExample: {
      trends: [{ rank: 1, name: "open source", query: "open source", tweet_volume: 54660 }],
      location: "oslo",
      as_of: "2026-10-19T09:00:00.000Z",
    },
  },
  {
    id: "/lists/tweets",
    slug: "get_list_posts",
    path: "/api/x/lists/tweets",
    method: "GET",
    group: "Discovery",
    summary: "Get a list's posts",
    description: "Recent posts from a list's members, newest first, 20 per page." + NOT_FOUND_NOTE,
    params: [
      {
        name: "list_id",
        type: "string",
        required: true,
        description: "Id of the list.",
        example: "42",
      },
      cursorParamDoc,
    ],
    dataSchema: pageSchema("tweets", tweetSchema, {
      list: {
        type: "object",
        required: ["id", "name", "member_count"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          member_count: { type: "integer" },
        },
      },
    }),
    dataExample: {
      tweets: [exampleTweet],
      result_count: 1,
      next_cursor: "MjA",
      list: { id: "42", name: "Infra people", member_count: 5 },
    },
  },
  {
    id: "/spaces",
    slug: "search_spaces",
    path: "/api/x/spaces",
    method: "GET",
    group: "Discovery",
    summary: "Search spaces",
    description: "Live and scheduled audio spaces matching a query. Cached for one minute.",
    params: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "Search terms, matched against space titles.",
        example: "rust",
      },
    ],
    dataSchema: {
      type: "object",
      required: ["spaces", "result_count"],
      properties: {
        spaces: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "title", "state", "host", "participant_count", "started_at", "scheduled_start"],
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              state: { type: "string", enum: ["live", "scheduled"] },
              host: tweetSchema.properties!.author,
              participant_count: { type: "integer", description: "0 until the space starts." },
              started_at: { type: "string", format: "date-time", nullable: true },
              scheduled_start: { type: "string", format: "date-time", nullable: true },
            },
          },
        },
        result_count: { type: "integer" },
      },
    },
    dataExample: {
      spaces: [
        {
          id: "100jbouoq",
          title: "Shipping with rust: war stories",
          state: "live",
          host: { username: "indie_ida", name: "Ida Lindqvist", verified: false },
          participant_count: 144,
          started_at: "2026-10-19T08:41:00.000Z",
          scheduled_start: null,
        },
      ],
      result_count: 1,
    },
  },
  {
    id: "/media/lookup",
    slug: "lookup_media",
    path: "/api/x/media/lookup",
    method: "GET",
    group: "Discovery",
    summary: "Look up media",
    description: "Metadata for a photo, video or GIF attached to a post. Cached for a day." + NOT_FOUND_NOTE,
    params: [
      {
        name: "media_id",
        type: "string",
        required: true,
        description: "Id of the media item.",
        example: "3_1893000000000000123",
      },
    ],
    dataSchema: {
      type: "object",
      required: ["media"],
      properties: {
        media: {
          type: "object",
          required: ["id", "type", "url", "width", "height", "duration_ms", "alt_text"],
          properties: {
            id: { type: "string" },
            type: { type: "string", enum: ["photo", "video", "animated_gif"] },
            url: { type: "string", description: "Direct URL of the original file." },
            width: { type: "integer" },
            height: { type: "integer" },
            duration_ms: { type: "integer", nullable: true, description: "Null for photos." },
            alt_text: { type: "string", nullable: true },
          },
        },
      },
    },
    dataExample: {
      media: {
        id: "3_1893000000000000123",
        type: "photo",
        url: "https://media.example/3_1893000000000000123.jpg",
        width: 1200,
        height: 675,
        duration_ms: null,
        alt_text: "A screenshot of a latency dashboard.",
      },
    },
  },
];

/** The metering block returned on every successful call. */
export const responseMetaSchema: JsonSchema = {
  type: "object",
  required: [
    "endpoint",
    "cache_hit",
    "credits_charged_micros",
    "credits_from_bonus_micros",
    "balance_micros",
    "environment",
    "latency_ms",
  ],
  properties: {
    endpoint: { type: "string", description: "Metering key this call was billed under." },
    cache_hit: {
      type: "boolean",
      description: "Whether the response came from the shared cache rather than the upstream.",
    },
    credits_charged_micros: {
      type: "integer",
      description: "USD micros debited for this call. Always 0 on a test key.",
    },
    credits_from_bonus_micros: {
      type: "integer",
      description: "Portion taken from bonus credits, which are always spent before paid credits.",
    },
    balance_micros: {
      type: "integer",
      nullable: true,
      description: "Remaining balance after this call, in USD micros. Null on a test key.",
    },
    environment: {
      type: "string",
      enum: ["live", "test"],
      description: "Environment of the key used. Test keys are never billed.",
    },
    latency_ms: { type: "integer", description: "Server-side time to produce this response." },
  },
};

export const errorSchema: JsonSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: { type: "string", description: "Human-readable reason the call was rejected." },
    detail: { type: "string", description: "Extra context, present on some upstream failures." },
  },
};

export interface ApiErrorDoc {
  status: number;
  title: string;
  meaning: string;
  /** Whether the call is debited from the credit balance. */
  billed: boolean;
  /** Whether it appears in dashboard usage — rejections are logged at zero cost. */
  logged: boolean;
}

/** Rejections are identical across endpoints, so they are documented once. */
export const apiErrors: ApiErrorDoc[] = [
  {
    status: 400,
    title: "Bad request",
    meaning: "A required parameter is missing or empty.",
    billed: false,
    logged: false,
  },
  {
    status: 401,
    title: "Unauthenticated",
    meaning: "No X-API-Key header, or the key is unknown or revoked.",
    billed: false,
    logged: false,
  },
  {
    status: 402,
    title: "Out of credits",
    meaning: "The balance is below the price of the call. Top up to continue.",
    billed: false,
    logged: true,
  },
  {
    status: 403,
    title: "Organization inactive",
    meaning: "The organization is suspended or closed.",
    billed: false,
    logged: false,
  },
  {
    status: 404,
    title: "Not found",
    meaning: "The post, user, list, media item or stream rule does not exist.",
    billed: false,
    logged: true,
  },
  {
    status: 429,
    title: "Rate limited",
    meaning: "Above the plan's requests per second. A Retry-After header is returned.",
    billed: false,
    logged: true,
  },
  {
    status: 502,
    title: "Upstream failed",
    meaning: "The data provider failed or timed out after our retries. Never billed to you.",
    billed: false,
    logged: true,
  },
];

export function endpointBySlug(slug: string): EndpointDoc | undefined {
  return endpointDocs.find((endpoint) => endpoint.slug === slug);
}

/**
 * Endpoints bucketed by sidebar section, in catalog order. Adding an entry to
 * endpointDocs is all it takes for its reference page and sidebar link to
 * appear — there is no second list to keep in step.
 */
export function groupedEndpoints(): { group: string; endpoints: EndpointDoc[] }[] {
  const groups: { group: string; endpoints: EndpointDoc[] }[] = [];
  for (const endpoint of endpointDocs) {
    const existing = groups.find((entry) => entry.group === endpoint.group);
    if (existing) existing.endpoints.push(endpoint);
    else groups.push({ group: endpoint.group, endpoints: [endpoint] });
  }
  return groups;
}

/** Price of an endpoint in USD micros, from the same config the route charges from. */
export function endpointPriceMicros(endpoint: EndpointDoc): number {
  return priceFor(endpoint.id);
}

/** Human-readable price, quoted per thousand calls the way the pricing page does. */
export function formatPricePerThousand(micros: number): string {
  return `$${((micros * 1000) / 1_000_000).toFixed(2)} per 1,000 calls`;
}

/**
 * Guard against documenting an endpoint we cannot price — priceFor() throws at
 * request time, and a reference page is a poor place to discover that.
 */
export function assertCatalogIsPriced(): void {
  const unpriced = endpointDocs.filter((e) => endpointPricingMicros[e.id] === undefined);
  if (unpriced.length > 0) {
    throw new Error(
      `Documented endpoints have no price in config/pricing.ts: ${unpriced
        .map((e) => e.id)
        .join(", ")}`,
    );
  }
}

/** A copy-pasteable call, used by the reference page and the dashboard empty state. */
export function curlFor(endpoint: EndpointDoc, baseUrl: string, apiKey: string): string {
  const query = endpoint.params
    .filter((p) => p.required)
    .map((p) => `${p.name}=${encodeURIComponent(p.example)}`)
    .join("&");
  const url = `${baseUrl}${endpoint.path}${query ? `?${query}` : ""}`;
  return `curl "${url}" \\\n  -H "X-API-Key: ${apiKey}"`;
}
