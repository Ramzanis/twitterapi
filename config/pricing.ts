// Endpoint pricing — config as code, in USD micros per call.
// $0.15 per 1,000 reads = 150 micros per read. What was actually charged is
// recorded on every api_requests row, so history survives config changes.

export const endpointPricingMicros: Record<string, number> = {
  "/tweet/search": 150,
  "/user/profile": 180,
};

export function priceFor(endpoint: string): number {
  const price = endpointPricingMicros[endpoint];
  if (price === undefined) throw new Error(`No price configured for ${endpoint}`);
  return price;
}
