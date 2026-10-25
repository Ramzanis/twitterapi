import { required, serveMetered } from "@/lib/meteredEndpoint";
import { spaces } from "@/lib/providers/discovery";

export function GET(request: Request) {
  return serveMetered(request, {
    endpoint: "/spaces",
    parse: (searchParams) => {
      const query = required(searchParams, "query");
      return typeof query === "string" ? { query: query.toLowerCase() } : query;
    },
    fetch: ({ query }) => spaces(query),
    // A space going live is the whole point of looking; keep this short.
    cacheTtlMs: 60 * 1000,
  });
}
