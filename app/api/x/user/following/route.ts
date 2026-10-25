import { cursorParam, serveMetered, usernameParam } from "@/lib/meteredEndpoint";
import { userFollowing } from "@/lib/providers/users";

export function GET(request: Request) {
  return serveMetered(request, {
    endpoint: "/user/following",
    parse: (searchParams) => {
      const username = usernameParam(searchParams);
      if (typeof username !== "string") return username;
      return { username, cursor: cursorParam(searchParams) };
    },
    fetch: ({ username, cursor }) => userFollowing(username, cursor),
    cacheTtlMs: 60 * 60 * 1000,
  });
}
