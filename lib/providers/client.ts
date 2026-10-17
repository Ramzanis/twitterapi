/**
 * HTTP client for upstream data providers.
 *
 * Written against driftnet, the synthetic collector, which authenticates, paginates, rate
 * limits and fails like a real service — so pointing this at a paid provider
 * means changing PROVIDER_BASE_URL and PROVIDER_API_KEY, not the code.
 */

export type ProviderErrorKind = "timeout" | "http" | "parse" | "network" | "config";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderErrorKind,
    readonly status?: number,
    /** How many attempts were made before giving up. */
    readonly attempts = 1,
  ) {
    super(message);
    this.name = "ProviderError";
  }

  /** Maps upstream trouble onto the fetch_jobs status column. */
  get jobStatus(): "failed" | "timed_out" {
    return this.kind === "timeout" ? "timed_out" : "failed";
  }
}

const DEFAULT_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS ?? 5000);
const DEFAULT_MAX_ATTEMPTS = Number(process.env.PROVIDER_MAX_ATTEMPTS ?? 3);

/** 5xx, 429 and network trouble are worth retrying; 4xx will fail identically. */
function retryable(err: ProviderError): boolean {
  if (err.kind === "timeout" || err.kind === "network") return true;
  if (err.kind === "http") return err.status === 429 || (err.status ?? 0) >= 500;
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ProviderCallResult<T> {
  data: T;
  /** Attempts used, recorded on the fetch_jobs row. */
  attempts: number;
}

export async function providerFetch<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  options: { timeoutMs?: number; maxAttempts?: number } = {},
): Promise<ProviderCallResult<T>> {
  const baseUrl = process.env.PROVIDER_BASE_URL;
  const apiKey = process.env.PROVIDER_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new ProviderError(
      "PROVIDER_BASE_URL and PROVIDER_API_KEY must be set",
      "config",
    );
  }

  const url = new URL(path, baseUrl);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let lastError: ProviderError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "X-Provider-Key": apiKey, Accept: "application/json" },
        // Fires even if the upstream accepts the connection then goes quiet,
        // which a plain fetch would wait on indefinitely.
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new ProviderError(
          `Provider returned ${response.status}: ${body.slice(0, 200)}`,
          "http",
          response.status,
          attempt,
        );
      }

      try {
        return { data: (await response.json()) as T, attempts: attempt };
      } catch {
        // A truncated or non-JSON body. Retrying can help if it was a partial
        // read, so this is thrown as a retryable-looking parse failure.
        throw new ProviderError("Provider returned malformed JSON", "parse", 200, attempt);
      }
    } catch (err) {
      if (err instanceof ProviderError) {
        lastError = new ProviderError(err.message, err.kind, err.status, attempt);
      } else if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        lastError = new ProviderError(
          `Provider did not respond within ${timeoutMs}ms`,
          "timeout",
          undefined,
          attempt,
        );
      } else {
        lastError = new ProviderError(
          `Could not reach provider: ${err instanceof Error ? err.message : String(err)}`,
          "network",
          undefined,
          attempt,
        );
      }

      const isLast = attempt === maxAttempts;
      if (isLast || !retryable(lastError)) break;
      // Exponential backoff with jitter, so retries don't align across callers.
      await sleep(200 * 2 ** (attempt - 1) + Math.random() * 100);
    }
  }

  throw lastError ?? new ProviderError("Unknown provider failure", "network");
}
