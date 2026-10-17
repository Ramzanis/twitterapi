// Phase 0 rate limiter: in-process sliding window per API key.
// Good enough for a single local/PaaS instance; swap for Redis token
// buckets when limit checks show up in latency or you run multiple instances.

const windows = new Map<string, number[]>();

export function checkRateLimit(apiKeyId: string, limitRps: number): boolean {
  const now = Date.now();
  const windowStart = now - 1000;
  const hits = (windows.get(apiKeyId) ?? []).filter((t) => t > windowStart);
  if (hits.length >= limitRps) {
    windows.set(apiKeyId, hits);
    return false;
  }
  hits.push(now);
  windows.set(apiKeyId, hits);
  return true;
}
