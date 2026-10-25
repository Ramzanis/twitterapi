import { cursorParam, serveMetered, usernameParam } from "@/lib/meteredEndpoint";
import { userTweets } from "@/lib/providers/users";

export function GET(request: Request) {
  return serveMetered(request, {
    endpoint: "/user/tweets",
    parse: (searchParams) => {
      const username = usernameParam(searchParams);
      if (typeof username !== "string") return username;
      return { username, cursor: cursorParam(searchParams) };
    },
    fetch: ({ username, cursor }) => userTweets(username, cursor),
  });
}
