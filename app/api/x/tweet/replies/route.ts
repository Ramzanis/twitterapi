import { cursorParam, serveMetered, tweetIdParam } from "@/lib/meteredEndpoint";
import { tweetReplies } from "@/lib/providers/tweets";

export function GET(request: Request) {
  return serveMetered(request, {
    endpoint: "/tweet/replies",
    parse: (searchParams) => {
      const tweetId = tweetIdParam(searchParams);
      if (typeof tweetId !== "string") return tweetId;
      return { tweet_id: tweetId, cursor: cursorParam(searchParams) };
    },
    fetch: ({ tweet_id, cursor }) => tweetReplies(tweet_id, cursor),
  });
}
