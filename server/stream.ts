// Stream gateway: customers hold one WebSocket here; we hold one upstream
// socket per stream rule, and forward each matching post — billed per post
// delivered, through the same ledger path as every REST call.
//
// A separate process because Next.js route handlers cannot hold a socket open:
// they close on timeout or once the response is sent. Run it next to `pnpm dev`:
//
//   pnpm stream                       # ws://localhost:3001/stream
//
// Skeleton status — see README "Streams": no horizontal scaling (connection
// counts live in this process), and upstream stream cost is not yet recorded
// in fetch_jobs.

import "dotenv/config";
import { randomUUID } from "crypto";
import { createServer, type IncomingMessage } from "http";
import type { Duplex } from "stream";
import { eq } from "drizzle-orm";
import { WebSocket, WebSocketServer } from "ws";
import { db, tables } from "@/db";
import { authenticateKey, type AuthContext } from "@/lib/apiAuth";
import { debitCredits, getBalanceMicros, recordBalanceAlert } from "@/lib/ledger";
import { listRules, ruleJson, type StreamRule } from "@/lib/streamRules";
import { toStreamPost, upstreamStreamTarget } from "@/lib/providers/stream";
import type { UpstreamTweet } from "@/lib/providers/tweets";
import { priceFor } from "@/config/pricing";

const PORT = Number(process.env.STREAM_PORT ?? 3001);
const ENDPOINT = "/stream";
/** How often a connection re-reads its org's rules, so edits apply without reconnecting. */
const RULE_REFRESH_MS = 15_000;
/** Ping interval; a client that misses one round is dropped. */
const HEARTBEAT_MS = 30_000;
const MAX_UPSTREAM_BACKOFF_MS = 30_000;

/** Application close codes, mirroring the REST statuses they stand for. */
const CLOSE = {
  insufficientCredits: 4402,
  internalError: 1011,
  shuttingDown: 1001,
} as const;

/** Open connections per organization, for the plan's connection limit. */
const connectionsByOrg = new Map<string, Set<StreamConnection>>();

interface RuleSubscription {
  rule: StreamRule;
  upstream: WebSocket | null;
  /** Sequence of the last post delivered, so a reconnect resumes rather than skips. */
  lastSequence: number | null;
  backoffMs: number;
  retryTimer: NodeJS.Timeout | null;
}

class StreamConnection {
  readonly id = randomUUID();
  private readonly subs = new Map<string, RuleSubscription>();
  private readonly isBillable: boolean;
  private readonly priceMicros = priceFor(ENDPOINT);
  private balanceMicros: number;
  private alive = true;
  private closed = false;
  private ruleTimer: NodeJS.Timeout;
  private heartbeat: NodeJS.Timeout;
  /** Deliveries run one at a time, so posts arrive in order and each sees the previous debit. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly socket: WebSocket,
    private readonly ctx: AuthContext,
    startingBalanceMicros: number,
  ) {
    this.isBillable = ctx.apiKey.environment === "live";
    this.balanceMicros = startingBalanceMicros;

    socket.on("pong", () => (this.alive = true));
    socket.on("message", (raw) => this.onClientMessage(String(raw)));
    socket.on("close", () => this.shutdown());
    socket.on("error", () => this.shutdown());

    this.heartbeat = setInterval(() => {
      if (!this.alive) return socket.terminate();
      this.alive = false;
      socket.ping();
    }, HEARTBEAT_MS);
    this.ruleTimer = setInterval(() => void this.syncRules(true), RULE_REFRESH_MS);
  }

  async start() {
    // The first sync is reported by the "connected" message itself.
    const rules = await this.syncRules(false);
    this.send({
      type: "connected",
      connection_id: this.id,
      environment: this.ctx.apiKey.environment,
      price_per_post_micros: this.isBillable ? this.priceMicros : 0,
      rules: rules.map(ruleJson),
    });
    if (rules.length === 0) {
      this.send({
        type: "info",
        message: "No stream rules yet. Add one with POST /api/x/stream/rules; it is picked up within 15 seconds.",
      });
    }
  }

  private send(message: unknown) {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private onClientMessage(raw: string) {
    let message: { type?: unknown };
    try {
      message = JSON.parse(raw);
    } catch {
      return this.send({ type: "error", code: "bad_message", message: "Expected JSON" });
    }
    if (message.type === "ping") return this.send({ type: "pong" });
    this.send({
      type: "error",
      code: "bad_message",
      message: 'The only client message is {"type":"ping"}. Manage rules over REST.',
    });
  }

  /** Reconcile upstream subscriptions with the org's current rules. */
  private async syncRules(notify: boolean): Promise<StreamRule[]> {
    if (this.closed) return [];
    let rules: StreamRule[];
    try {
      rules = await listRules(this.ctx.org.id);
    } catch (err) {
      console.error(`[stream] ${this.id} could not load rules:`, err);
      return [...this.subs.values()].map((s) => s.rule);
    }

    const current = new Set(rules.map((r) => r.id));
    let changed = false;

    for (const [id, sub] of this.subs) {
      if (!current.has(id)) {
        this.closeUpstream(sub);
        this.subs.delete(id);
        changed = true;
      }
    }
    for (const rule of rules) {
      if (!this.subs.has(rule.id)) {
        const sub: RuleSubscription = { rule, upstream: null, lastSequence: null, backoffMs: 1000, retryTimer: null };
        this.subs.set(rule.id, sub);
        this.openUpstream(sub);
        changed = true;
      }
    }

    if (changed && notify) this.send({ type: "rules_updated", rules: rules.map(ruleJson) });
    return rules;
  }

  private openUpstream(sub: RuleSubscription) {
    if (this.closed) return;
    const { url, headers } = upstreamStreamTarget(sub.rule.value);
    const upstream = new WebSocket(url, { headers });
    sub.upstream = upstream;

    upstream.on("open", () => {
      sub.backoffMs = 1000;
      // Resume where the last connection left off rather than at "now".
      if (sub.lastSequence !== null) {
        upstream.send(JSON.stringify({ type: "seek", cursor: sub.lastSequence }));
      }
    });

    upstream.on("message", (raw) => {
      let message: { type?: string; data?: UpstreamTweet & { sequence: number } };
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (message.type === "post" && message.data) {
        const post = message.data;
        this.queue = this.queue.then(() => this.deliver(sub, post)).catch((err) => {
          console.error(`[stream] ${this.id} delivery failed:`, err);
          this.fail(CLOSE.internalError, "internal_error", "Delivery failed");
        });
      }
    });

    upstream.on("error", (err) => {
      console.warn(`[stream] upstream error for rule ${sub.rule.id}: ${err.message}`);
    });

    upstream.on("close", () => {
      if (sub.upstream !== upstream) return; // replaced or deliberately closed
      sub.upstream = null;
      if (this.closed || !this.subs.has(sub.rule.id)) return;

      this.send({
        type: "warning",
        code: "upstream_reconnecting",
        rule_id: sub.rule.id,
        message: `Reconnecting to the data provider in ${Math.round(sub.backoffMs / 1000)}s; no posts will be skipped.`,
      });
      sub.retryTimer = setTimeout(() => {
        sub.retryTimer = null;
        this.openUpstream(sub);
      }, sub.backoffMs);
      sub.backoffMs = Math.min(sub.backoffMs * 2, MAX_UPSTREAM_BACKOFF_MS);
    });
  }

  private closeUpstream(sub: RuleSubscription) {
    if (sub.retryTimer) clearTimeout(sub.retryTimer);
    const upstream = sub.upstream;
    sub.upstream = null;
    upstream?.close();
  }

  /** Bill one post, then send it. Never sends a post it could not bill. */
  private async deliver(sub: RuleSubscription, raw: UpstreamTweet & { sequence: number }) {
    if (this.closed || !this.subs.has(sub.rule.id)) return;

    if (this.isBillable && this.balanceMicros < this.priceMicros) {
      return this.fail(
        CLOSE.insufficientCredits,
        "insufficient_credits",
        "Insufficient credits. Top up your balance, then reconnect and backfill from your last cursor.",
      );
    }

    const chargedMicros = this.isBillable ? this.priceMicros : 0;
    let balanceAfter: number | null = null;

    // Same invariant as REST: the request log and the debit commit together.
    await db.transaction(async (tx) => {
      const [req] = await tx
        .insert(tables.apiRequests)
        .values({
          orgId: this.ctx.org.id,
          apiKeyId: this.ctx.apiKey.id,
          endpoint: ENDPOINT,
          statusCode: 200,
          creditsCostMicros: chargedMicros,
          cacheHit: false,
        })
        .returning({ id: tables.apiRequests.id });

      if (this.isBillable) {
        const res = await debitCredits(tx, {
          orgId: this.ctx.org.id,
          amountMicros: this.priceMicros,
          reference: req.id,
        });
        balanceAfter = res.totalMicros;
      }
    });

    if (balanceAfter !== null) {
      this.balanceMicros = balanceAfter;
      recordBalanceAlert(this.ctx.org.id, balanceAfter).catch(() => {});
    }
    sub.lastSequence = raw.sequence;

    this.send({
      type: "post",
      rule: { id: sub.rule.id, value: sub.rule.value, tag: sub.rule.tag },
      cursor: raw.sequence,
      data: toStreamPost(raw),
      meta: { credits_charged_micros: chargedMicros, balance_micros: balanceAfter },
    });
  }

  private fail(code: number, errorCode: string, message: string) {
    this.send({ type: "error", code: errorCode, message });
    this.socket.close(code, errorCode);
    this.shutdown();
  }

  shutdown() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeat);
    clearInterval(this.ruleTimer);
    for (const sub of this.subs.values()) this.closeUpstream(sub);
    this.subs.clear();

    const set = connectionsByOrg.get(this.ctx.org.id);
    set?.delete(this);
    if (set?.size === 0) connectionsByOrg.delete(this.ctx.org.id);
  }

  close(code: number, reason: string) {
    this.socket.close(code, reason);
    this.shutdown();
  }
}

// ── handshake ────────────────────────────────────────────────────────────

/** Refuse an upgrade with a plain HTTP response, so clients see a real status. */
function reject(socket: Duplex, status: number, error: string, headers: Record<string, string> = {}) {
  const body = JSON.stringify({ error });
  const extra = Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join("");
  socket.end(
    `HTTP/1.1 ${status} ${httpStatusText(status)}\r\n` +
      "Content-Type: application/json\r\n" +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      extra +
      "Connection: close\r\n\r\n" +
      body,
  );
}

function httpStatusText(status: number): string {
  return (
    { 400: "Bad Request", 401: "Unauthorized", 402: "Payment Required", 403: "Forbidden", 404: "Not Found", 429: "Too Many Requests", 500: "Internal Server Error" }[status] ??
    "Error"
  );
}

/**
 * Browsers cannot set headers on a WebSocket, so the key may also come as
 * ?api_key=. Prefer the header from servers: query strings end up in logs.
 */
function apiKeyFrom(request: IncomingMessage, url: URL): string | null {
  const header = request.headers["x-api-key"];
  if (typeof header === "string" && header) return header;
  return url.searchParams.get("api_key");
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });

const server = createServer((request, response) => {
  if (request.url === "/health") {
    let connections = 0;
    for (const set of connectionsByOrg.values()) connections += set.size;
    response.writeHead(200, { "Content-Type": "application/json" });
    return response.end(JSON.stringify({ status: "ok", connections }));
  }
  response.writeHead(426, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "Connect with a WebSocket to /stream" }));
});

server.on("upgrade", async (request, socket, head) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/stream") return reject(socket, 404, "Connect to /stream");

    const rawKey = apiKeyFrom(request, url);
    if (!rawKey) return reject(socket, 401, "Missing X-API-Key header");

    const auth = await authenticateKey(rawKey);
    if (!auth.ok) return reject(socket, auth.status, auth.error);
    const { ctx } = auth;

    const open = connectionsByOrg.get(ctx.org.id)?.size ?? 0;
    if (open >= ctx.plan.maxStreamConnections) {
      return reject(
        socket,
        429,
        `Your ${ctx.plan.name} plan allows ${ctx.plan.maxStreamConnections} concurrent stream connection${ctx.plan.maxStreamConnections === 1 ? "" : "s"}`,
      );
    }

    const balance = ctx.apiKey.environment === "live" ? await getBalanceMicros(ctx.org.id) : 0;
    if (ctx.apiKey.environment === "live" && balance < priceFor(ENDPOINT)) {
      return reject(socket, 402, "Insufficient credits. Top up your balance to continue.");
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      const connection = new StreamConnection(ws, ctx, balance);
      if (!connectionsByOrg.has(ctx.org.id)) connectionsByOrg.set(ctx.org.id, new Set());
      connectionsByOrg.get(ctx.org.id)!.add(connection);

      db.update(tables.apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(tables.apiKeys.id, ctx.apiKey.id))
        .then(() => {}, () => {});

      connection.start().catch((err) => {
        console.error(`[stream] ${connection.id} failed to start:`, err);
        connection.close(CLOSE.internalError, "internal_error");
      });
    });
  } catch (err) {
    console.error("[stream] upgrade failed:", err);
    reject(socket, 500, "Internal error");
  }
});

server.listen(PORT, () => {
  console.log(`[stream] listening on ws://localhost:${PORT}/stream`);
});

function stop() {
  for (const set of connectionsByOrg.values()) {
    for (const connection of set) connection.close(CLOSE.shuttingDown, "shutting_down");
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
