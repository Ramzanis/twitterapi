import { required, serveMetered } from "@/lib/meteredEndpoint";
import { mediaLookup } from "@/lib/providers/discovery";

export function GET(request: Request) {
  return serveMetered(request, {
    endpoint: "/media/lookup",
    parse: (searchParams) => {
      const mediaId = required(searchParams, "media_id");
      return typeof mediaId === "string" ? { media_id: mediaId } : mediaId;
    },
    fetch: ({ media_id }) => mediaLookup(media_id),
    // Media metadata never changes once published.
    cacheTtlMs: 24 * 60 * 60 * 1000,
  });
}
