import { serveMetered, tweetIdParam } from "@/lib/meteredEndpoint";
import { tweetThread } from "@/lib/providers/tweets";

export function GET(request: Request) {
  return serveMetered(request, {
    endpoint: "/tweet/thread",
    parse: (searchParams) => {
      const tweetId = tweetIdParam(searchParams);
      return typeof tweetId === "string" ? { tweet_id: tweetId } : tweetId;
    },
    fetch: ({ tweet_id }) => tweetThread(tweet_id),
  });
}
