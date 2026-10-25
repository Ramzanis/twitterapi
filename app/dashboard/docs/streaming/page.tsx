import type { Metadata } from "next";
import Link from "next/link";
import { formatPricePerThousand } from "@/config/endpoints";
import { priceFor } from "@/config/pricing";
import { plans } from "@/config/plans";
import { appBaseUrl } from "@/lib/appUrl";
import { Code, CodeWithCopy, EndpointLine, Inline, PageHeader, Section } from "@/components/docs/DocsUi";

export const metadata: Metadata = { title: "Streaming — Skylark docs" };

function streamUrl(): string {
  return (process.env.STREAM_URL || `ws://localhost:${process.env.STREAM_PORT ?? 3001}/stream`).replace(/\/+$/, "");
}

export default async function DocsStreamingPage() {
  const baseUrl = await appBaseUrl();
  const wsUrl = streamUrl();
  const priceMicros = priceFor("/stream");

  return (
    <>
      <PageHeader
        eyebrow="Streams"
        title="Streaming over WebSocket"
        lede="Write filter rules once, hold one connection, and receive matching posts as they are published."
      />

      <Section
        title="1. Create a rule"
        description="A rule is a topic to match. Rules belong to your organization, not to a key, so rotating a key keeps them."
      >
        <EndpointLine method="POST" url={`${baseUrl}/api/x/stream/rules`} />
        <div className="mt-4">
          <CodeWithCopy>{`curl -X POST "${baseUrl}/api/x/stream/rules" \\
  -H "X-API-Key: sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"value": "AI agents", "tag": "research"}'`}</CodeWithCopy>
        </div>
        <p className="mt-4 text-sm text-slate-600">
          <Inline>value</Inline> is matched case-insensitively, up to 128 characters.{" "}
          <Inline>tag</Inline> is optional and echoed on every matching post, so one connection can
          feed several consumers. List rules with <Inline>GET /api/x/stream/rules</Inline> and
          remove one with <Inline>DELETE /api/x/stream/rules?id=…</Inline>. Managing rules is free.
        </p>
      </Section>

      <Section
        title="2. Connect"
        description="Send your key in the X-API-Key header. Browsers cannot set WebSocket headers, so ?api_key= also works — prefer the header from servers, since query strings end up in logs."
      >
        <EndpointLine method="WS" url={wsUrl} />
        <div className="mt-4">
          <CodeWithCopy>{`npx wscat -c "${wsUrl}" -H "X-API-Key: sk_live_..."`}</CodeWithCopy>
        </div>
        <p className="mt-4 text-sm text-slate-600">
          Rule changes reach an open connection within 15 seconds; you do not need to reconnect. An
          upgrade that is refused gets a normal HTTP status — 401, 402, 403 or 429 — with the same
          JSON body as the REST API.
        </p>
      </Section>

      <Section title="Messages" description="Every message is JSON with a type field.">
        <Code>{`{"type":"connected","connection_id":"…","environment":"live","price_per_post_micros":${priceMicros},"rules":[…]}

{"type":"post",
 "rule":{"id":"7f3c…","value":"ai agents","tag":"research"},
 "cursor":179236341,
 "data":{"id":"…","text":"…","created_at":"…","author":{…},"metrics":{…},"sequence":179236341},
 "meta":{"credits_charged_micros":${priceMicros},"balance_micros":99850}}

{"type":"rules_updated","rules":[…]}
{"type":"warning","code":"upstream_reconnecting","rule_id":"…","message":"…"}
{"type":"error","code":"insufficient_credits","message":"…"}`}</Code>
        <p className="mt-4 text-sm text-slate-600">
          Send <Inline>{`{"type":"ping"}`}</Inline> to get a <Inline>pong</Inline>; the server
          also sends WebSocket pings every 30 seconds and drops a client that misses one.
        </p>
      </Section>

      <Section
        title="Billing"
        description="Streams bill per post delivered, not per connection or per minute."
      >
        <ul className="space-y-3 text-sm text-slate-600">
          <li>
            Each delivered post costs {formatPricePerThousand(priceMicros).replace("calls", "posts")}
            , debited before it is sent. Test keys receive posts free.
          </li>
          <li>
            When your balance cannot cover the next post, you get an{" "}
            <Inline>insufficient_credits</Inline> error and the connection closes with code{" "}
            <Inline>4402</Inline>. Top up, reconnect, and backfill from your last cursor.
          </li>
          <li>
            Plans limit rules and concurrent connections: the {plans.free.name} plan allows{" "}
            {plans.free.maxStreamRules} rule and {plans.free.maxStreamConnections} connection; Pay
            as you go allows {plans.payg.maxStreamRules} and {plans.payg.maxStreamConnections}.
          </li>
        </ul>
      </Section>

      <Section
        title="Recovering from a dropped connection"
        description="Keep the cursor of the last post you processed for each rule."
      >
        <p className="text-sm text-slate-600">
          After reconnecting, call{" "}
          <Link
            href="/dashboard/docs/api-reference/backfill_stream"
            className="font-medium text-blue-600 hover:text-blue-700"
          >
            stream backfill
          </Link>{" "}
          with that cursor to fetch what you missed, then carry on with the live connection. Backfill
          reaches back nearly three hours; an older cursor returns posts from the start of that
          window.
        </p>
      </Section>
    </>
  );
}
