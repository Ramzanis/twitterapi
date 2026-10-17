import Link from "next/link";
import CodeCard from "@/components/marketing/CodeCard";
import Faq from "@/components/marketing/Faq";
import Header from "@/components/marketing/Header";

const features = [
  {
    num: "01",
    tile: "GET /tweet/search",
    title: "No approval process",
    text: "Create a key and call the API. No developer account, no project review, no quota negotiation.",
  },
  {
    num: "02",
    tile: "$0.15 / 1,000 reads",
    title: "Priced per call",
    text: "$0.15 per thousand reads, billed to the cent. No monthly floor, no seats, and a spend cap you set.",
  },
  {
    num: "03",
    tile: '"mcpServers": { "skylark": … }',
    title: "Agent-ready",
    text: "An MCP server ships with every account, so your model gets search and profiles as native tools.",
  },
];

const streamSteps = [
  {
    title: "Write filter rules once",
    text: "Keywords, authors, languages — one rule set for everything you track.",
  },
  {
    title: "Matches arrive as they happen",
    text: "Take the stream over websockets or webhooks, whichever fits your stack.",
  },
  {
    title: "Under half a second at the median",
    text: "Events land while the post is still fresh, with backfill if your consumer drops.",
  },
];

const endpointGroups = [
  { name: "Tweets", endpoints: ["/tweet/search", "/tweet/replies", "/tweet/quotes", "/tweet/thread"] },
  { name: "Users", endpoints: ["/user/profile", "/user/tweets", "/user/followers", "/user/following"] },
  { name: "Streams", endpoints: ["/stream", "/stream/rules", "/webhooks", "/stream/backfill"] },
  { name: "Discovery", endpoints: ["/trends", "/lists/tweets", "/spaces", "/media/lookup"] },
];

const stats = [
  { value: "1,000+", label: "requests per second" },
  { value: "248 ms", label: "median latency" },
  { value: "99.99%", label: "uptime" },
  { value: "75+", label: "endpoints" },
];

export default function Home() {
  return (
    <>
      <Header />

      {/* Hero */}
      <section id="top" className="bg-gradient-to-b from-sky-100/70 via-white to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-20 pb-16 lg:grid-cols-2 lg:pt-28 lg:pb-24">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-pretty sm:text-5xl">
              The X API, without the waiting list.
            </h1>
            <p className="mt-5 text-2xl font-medium leading-snug text-slate-400">
              Search posts.
              <br />
              Stream events.
              <br />
              <span className="text-blue-600">Ship agents.</span>
            </p>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-slate-600">
              Search, stream and enrich public posts through one endpoint set.
              Pay per call, start in minutes.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href="#"
                className="rounded-xl bg-blue-600 px-6 py-3.5 font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Get your API key
              </a>
              <a
                href="#docs"
                className="rounded-xl border border-slate-300 bg-white px-6 py-3.5 font-semibold text-slate-900 hover:border-slate-400"
              >
                Read the docs
              </a>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              $0.10 in free credits · no card
            </p>
          </div>
          <CodeCard />
        </div>
      </section>

      {/* Feature cards */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight">
          Three reasons teams move off the official API.
        </h2>
        <p className="mt-3 max-w-xl text-slate-600">
          Same data, a fraction of the cost, and none of the gatekeeping.
        </p>
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.num}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-center justify-between rounded-xl bg-gradient-to-br from-sky-100 to-blue-50 px-5 py-6">
                <span className="font-mono text-sm text-blue-900/80">{feature.tile}</span>
                <span className="font-mono text-xs text-blue-600">{feature.num}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 leading-relaxed text-slate-600">{feature.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Streaming: numbered steps + live card */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-20 lg:grid-cols-2">
          <div>
            <h2 className="max-w-lg text-3xl font-semibold tracking-tight">
              Ten thousand posts a minute, delivered as they happen.
            </h2>
            <ol className="mt-8 space-y-6">
              {streamSteps.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <div className="font-semibold">{step.title}</div>
                    <p className="mt-1 text-slate-600">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <a href="#docs" className="mt-8 inline-block font-semibold text-blue-600 hover:text-blue-700">
              Streaming reference →
            </a>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex justify-between border-b border-slate-100 px-5 py-3.5 font-mono text-xs text-slate-500">
              <span>wss://stream.skylark.dev/v1</span>
              <span className="text-emerald-600">● live</span>
            </div>
            <div className="flex flex-col gap-2.5 px-5 py-4 font-mono text-xs text-slate-600">
              <div className="flex gap-3">
                <span className="text-blue-600">12:04:31</span>
                <span>tweet.created</span>
                <span className="ml-auto">184 ms</span>
              </div>
              <div className="flex gap-3">
                <span className="text-blue-600">12:04:31</span>
                <span>tweet.created</span>
                <span className="ml-auto">201 ms</span>
              </div>
              <div className="flex gap-3">
                <span className="text-blue-600">12:04:32</span>
                <span>user.followed</span>
                <span className="ml-auto">173 ms</span>
              </div>
              <div className="flex gap-3 opacity-60">
                <span className="text-blue-600">12:04:32</span>
                <span>tweet.repost</span>
                <span className="ml-auto">192 ms</span>
              </div>
              <div className="flex gap-3 opacity-30">
                <span className="text-blue-600">12:04:33</span>
                <span>tweet.created</span>
                <span className="ml-auto">166 ms</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Endpoints */}
      <section id="docs" className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-baseline lg:justify-between">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-pretty">
            Everything you&apos;d build with the official API, and the parts it
            never shipped.
          </h2>
          <span className="text-sm whitespace-nowrap text-slate-500">
            Reads, writes, streams
          </span>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {endpointGroups.map((group) => (
            <div
              key={group.name}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="text-sm font-semibold">{group.name}</div>
              <div className="mt-3 flex flex-col gap-2 font-mono text-[13px] text-slate-600">
                {group.endpoints.map((endpoint) => (
                  <span key={endpoint}>{endpoint}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Link
          href="/dashboard/docs"
          className="mt-8 inline-block font-semibold text-blue-600 hover:text-blue-700"
        >
          Read the API reference →
        </Link>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-slate-200 bg-gradient-to-b from-white to-sky-50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">Pricing</h2>
          <p className="mt-3 max-w-xl text-slate-600">
            No monthly minimum and no seats. You pay for the calls you make,
            billed to the cent.
          </p>
          <div className="mt-10 grid items-start gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
              <div className="font-semibold">Free</div>
              <div className="mt-3 text-4xl font-semibold tracking-tight">$0</div>
              <div className="mt-1 text-sm text-slate-500">$0.10 in credits, no card</div>
              <ul className="mt-6 space-y-2 text-[15px] text-slate-700">
                <li>All read endpoints</li>
                <li>2 req / sec</li>
              </ul>
              <a
                href="#"
                className="mt-7 block rounded-xl border border-slate-300 py-2.5 text-center text-sm font-semibold hover:border-slate-400"
              >
                Create a key
              </a>
            </div>
            <div className="relative rounded-2xl border border-blue-600 bg-white p-7 shadow-md ring-1 ring-blue-600">
              <span className="absolute -top-3 left-6 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                Most popular
              </span>
              <div className="font-semibold">Pay as you go</div>
              <div className="mt-3 text-4xl font-semibold tracking-tight">$0.15</div>
              <div className="mt-1 text-sm text-slate-500">per 1,000 reads</div>
              <ul className="mt-6 space-y-2 text-[15px] text-slate-700">
                <li>All 75+ endpoints</li>
                <li>1,000+ req / sec</li>
                <li>MCP server included</li>
                <li>24/7 support</li>
              </ul>
              <a
                href="#"
                className="mt-7 block rounded-xl bg-blue-600 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Get your API key
              </a>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
              <div className="font-semibold">Scale</div>
              <div className="mt-3 text-4xl font-semibold tracking-tight">Custom</div>
              <div className="mt-1 text-sm text-slate-500">Volume rates and an SLA</div>
              <ul className="mt-6 space-y-2 text-[15px] text-slate-700">
                <li>Committed-use discounts</li>
                <li>Dedicated stream capacity</li>
              </ul>
              <a
                href="#"
                className="mt-7 block rounded-xl border border-slate-300 py-2.5 text-center text-sm font-semibold hover:border-slate-400"
              >
                Talk to us
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-sky-500 px-8 py-12 text-white shadow-lg sm:px-12">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  {stat.value}
                </div>
                <div className="mt-1 text-sm text-blue-100">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 pb-20">
        <h2 className="text-center text-3xl font-semibold tracking-tight">Questions</h2>
        <div className="mt-8">
          <Faq />
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-slate-200 bg-gradient-to-b from-white to-sky-100/70">
        <div className="mx-auto max-w-6xl px-6 py-24 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Your first call is five minutes away.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-slate-600">
            $0.10 in free credits, no card, no approval queue. Cancel by simply
            not calling us.
          </p>
          <a
            href="#"
            className="mt-8 inline-block rounded-xl bg-blue-600 px-8 py-4 text-lg font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Get your API key
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <span className="flex items-center gap-2 font-semibold">
                <span className="block size-2 rounded-full bg-blue-600"></span>
                skylark
              </span>
              <p className="mt-3 text-sm text-slate-500">search · stream · ship</p>
            </div>
            <div>
              <div className="text-sm font-semibold">Product</div>
              <div className="mt-3 flex flex-col gap-2 text-sm text-slate-500">
                <a href="#docs" className="hover:text-slate-900">Docs</a>
                <a href="#pricing" className="hover:text-slate-900">Pricing</a>
                <a href="#" className="hover:text-slate-900">Status</a>
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold">Developers</div>
              <div className="mt-3 flex flex-col gap-2 text-sm text-slate-500">
                <a href="#docs" className="hover:text-slate-900">API reference</a>
                <a href="#" className="hover:text-slate-900">MCP server</a>
                <a href="#" className="hover:text-slate-900">SDKs</a>
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold">Legal</div>
              <div className="mt-3 flex flex-col gap-2 text-sm text-slate-500">
                <a href="#" className="hover:text-slate-900">Terms</a>
                <a href="#" className="hover:text-slate-900">Privacy</a>
              </div>
            </div>
          </div>
          <p className="mt-12 border-t border-slate-100 pt-6 text-sm text-slate-400">
            © 2026 Skylark. Independent third-party service. Not affiliated
            with, endorsed by or sponsored by X Corp.
          </p>
        </div>
      </footer>
    </>
  );
}
