// Endpoint pricing — config as code, in USD micros per call.
// $0.15 per 1,000 reads = 150 micros per read. What was actually charged is
// recorded on every api_requests row, so history survives config changes.

export const endpointPricingMicros: Record<string, number> = {
  "/tweet/search": 150,
  "/tweet/replies": 150,
  "/tweet/quotes": 150,
  "/tweet/thread": 150,
  "/user/profile": 180,
  "/user/tweets": 150,
  "/user/followers": 150,
  "/user/following": 150,
  "/trends": 100,
  "/lists/tweets": 150,
  "/spaces": 150,
  "/media/lookup": 100,
  "/stream/backfill": 150,
  // Per post delivered over the stream WebSocket, not per connection.
  "/stream": 150,
};

export function priceFor(endpoint: string): number {
  const price = endpointPricingMicros[endpoint];
  if (price === undefined) throw new Error(`No price configured for ${endpoint}`);
  return price;
}
