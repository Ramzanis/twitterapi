import { required, serveMetered } from "@/lib/meteredEndpoint";
import { searchTweets } from "@/lib/providers/tweets";

export function GET(request: Request) {
  return serveMetered(request, {
    endpoint: "/tweet/search",
    parse: (searchParams) => {
      const query = required(searchParams, "query");
      // Matching is case-insensitive, so the cache key is too.
      return typeof query === "string" ? { query: query.toLowerCase() } : query;
    },
    fetch: ({ query }) => searchTweets(query),
  });
}
