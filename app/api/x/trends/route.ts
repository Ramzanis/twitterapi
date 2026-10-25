import { serveMetered } from "@/lib/meteredEndpoint";
import { trends } from "@/lib/providers/discovery";

export function GET(request: Request) {
  return serveMetered(request, {
    endpoint: "/trends",
    parse: (searchParams) => ({
      location: searchParams.get("location")?.trim().toLowerCase() || "worldwide",
    }),
    fetch: ({ location }) => trends(location),
    cacheTtlMs: 15 * 60 * 1000,
  });
}
