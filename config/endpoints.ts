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
