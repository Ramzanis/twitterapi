import { serveMetered, usernameParam } from "@/lib/meteredEndpoint";
import { userProfile } from "@/lib/providers/users";

export function GET(request: Request) {
  return serveMetered(request, {
    endpoint: "/user/profile",
    parse: (searchParams) => {
      const username = usernameParam(searchParams);
      return typeof username === "string" ? { username } : username;
    },
    fetch: ({ username }) => userProfile(username),
    // Profiles change slowly; an hour of staleness is what real vendors serve too.
    cacheTtlMs: 60 * 60 * 1000,
  });
}
