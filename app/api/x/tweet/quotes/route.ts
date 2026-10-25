import { cursorParam, serveMetered, tweetIdParam } from "@/lib/meteredEndpoint";
import { tweetQuotes } from "@/lib/providers/tweets";

export function GET(request: Request) {
  return serveMetered(request, {
    endpoint: "/tweet/quotes",
    parse: (searchParams) => {
      const tweetId = tweetIdParam(searchParams);
      if (typeof tweetId !== "string") return tweetId;
      return { tweet_id: tweetId, cursor: cursorParam(searchParams) };
    },
    fetch: ({ tweet_id, cursor }) => tweetQuotes(tweet_id, cursor),
  });
}
