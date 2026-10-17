// Provider catalog — config as code, keyed by provider_code (referenced from
// fetch_jobs). Credentials never live here or in the DB; they come from env.

export interface ProviderConfig {
  kind: "scraper" | "third_party_api";
  /** What this provider charges us per call, in USD micros. */
  costPerCallMicros: number;
  priority: number;
}

export const providers: Record<string, ProviderConfig> = {
  mock: {
    kind: 'scraper',
    // driftnet, run separately on :4000 (or a deployed Cloudflare Worker)
    costPerCallMicros: 30,
    priority: 1,
  },
};

/** Pick the active provider for an endpoint (highest priority wins). */
export function pickProvider(): string {
  return Object.entries(providers).sort((a, b) => a[1].priority - b[1].priority)[0][0];
}
