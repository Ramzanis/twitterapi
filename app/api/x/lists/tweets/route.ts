import { cursorParam, required, serveMetered } from "@/lib/meteredEndpoint";
import { listTweets } from "@/lib/providers/discovery";

export function GET(request: Request) {
  return serveMetered(request, {
    endpoint: "/lists/tweets",
    parse: (searchParams) => {
      const listId = required(searchParams, "list_id");
      if (typeof listId !== "string") return listId;
      return { list_id: listId, cursor: cursorParam(searchParams) };
    },
    fetch: ({ list_id, cursor }) => listTweets(list_id, cursor),
  });
}
