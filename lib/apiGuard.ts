import { NextResponse } from "next/server";
import { authenticate, type AuthContext } from "@/lib/apiAuth";
import { checkRateLimit } from "@/lib/rateLimit";

/**
 * Authenticate and rate-limit an unmetered management call, such as stream
 * rule changes. These cost nothing, but they are still made with a key
 * and count against the plan's requests per second.
 */
export async function guard(
  request: Request,
): Promise<{ ctx: AuthContext; response?: never } | { ctx?: never; response: NextResponse }> {
  const auth = await authenticate(request);
  if (!auth.ok) {
    return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }
  if (!checkRateLimit(auth.ctx.apiKey.id, auth.ctx.plan.rateLimitRps)) {
    return {
      response: NextResponse.json(
        { error: `Rate limit exceeded — your plan allows ${auth.ctx.plan.rateLimitRps} req/sec` },
        { status: 429, headers: { "Retry-After": "1" } },
      ),
    };
  }
  return { ctx: auth.ctx };
}
