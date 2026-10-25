// Plan catalog — config as code. The org stores only plan_code; entitlements
// resolve here, merged with organizations.plan_overrides for custom deals.

export type PlanCode = "free" | "payg" | "teams" | "scale";

export interface Plan {
  name: string;
  rateLimitRps: number;
  maxApiKeys: number;
  maxSeats: number;
  /** Filter rules an organization can keep for the stream. */
  maxStreamRules: number;
  /** Concurrent stream WebSocket connections per organization. */
  maxStreamConnections: number;
  /** Credits granted on signup, in USD micros ($0.10 = 100_000). */
  signupBonusMicros: number;
}

export const plans: Record<PlanCode, Plan> = {
  free: {
    name: "Free",
    rateLimitRps: 2,
    maxApiKeys: 1,
    maxSeats: 1,
    maxStreamRules: 1,
    maxStreamConnections: 1,
    signupBonusMicros: 100_000, // $0.10, matching the landing page
  },
  payg: {
    name: "Pay as you go",
    rateLimitRps: 1000,
    maxApiKeys: 10,
    maxSeats: 1,
    maxStreamRules: 25,
    maxStreamConnections: 5,
    signupBonusMicros: 0,
  },
  teams: {
    name: "Teams",
    rateLimitRps: 1000,
    maxApiKeys: 25,
    maxSeats: 10,
    maxStreamRules: 100,
    maxStreamConnections: 10,
    signupBonusMicros: 0,
  },
  scale: {
    name: "Scale",
    rateLimitRps: 5000,
    maxApiKeys: 100,
    maxSeats: 100,
    maxStreamRules: 1000,
    maxStreamConnections: 50,
    signupBonusMicros: 0,
  },
};

export function resolvePlan(code: PlanCode, overrides?: unknown): Plan {
  const base = plans[code];
  if (overrides && typeof overrides === "object") {
    return { ...base, ...(overrides as Partial<Plan>) };
  }
  return base;
}
