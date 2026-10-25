import { cursorParam, serveMetered, usernameParam } from "@/lib/meteredEndpoint";
import { userFollowers } from "@/lib/providers/users";

export function GET(request: Request) {
  return serveMetered(request, {
    endpoint: "/user/followers",
    parse: (searchParams) => {
      const username = usernameParam(searchParams);
      if (typeof username !== "string") return username;
      return { username, cursor: cursorParam(searchParams) };
    },
    fetch: ({ username, cursor }) => userFollowers(username, cursor),
    cacheTtlMs: 60 * 60 * 1000,
  });
}
