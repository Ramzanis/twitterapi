"use client";

import { useState } from "react";

const samples = [
  {
    label: "cURL",
    code: 'curl "https://api.skylark.dev/x/tweet/search?query=AI+agents" \\\n  -H "X-API-Key: $SKYLARK_KEY"',
  },
  {
    label: "Python",
    code: 'import skylark\n\nclient = skylark.Client(api_key=os.environ["SKYLARK_KEY"])\n\nfor tweet in client.search("AI agents lang:en", limit=200):\n    print(tweet.author.username, tweet.text)',
  },
  {
    label: "Node",
    code: 'import { Skylark } from "@skylark/sdk";\n\nconst sky = new Skylark(process.env.SKYLARK_KEY);\n\nconst { data } = await sky.tweets.search({\n  query: "AI agents lang:en",\n  limit: 200,\n});',
  },
  {
    label: "Go",
    code: 'client := skylark.New(os.Getenv("SKYLARK_KEY"))\n\nres, err := client.Tweets.Search(ctx, &skylark.SearchOpts{\n\tQuery: "AI agents lang:en",\n\tLimit: 200,\n})',
  },
  {
    label: "MCP",
    code: '{\n  "mcpServers": {\n    "skylark": {\n      "command": "npx",\n      "args": ["-y", "@skylark/mcp"],\n      "env": { "SKYLARK_KEY": "sk_live_..." }\n    }\n  }\n}',
  },
];

export default function CodeCard() {
  const [active, setActive] = useState(0);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl shadow-slate-900/10">
      <div
        className="flex gap-1 border-b border-slate-800 px-3 pt-2"
        role="tablist"
        aria-label="Code samples"
      >
        {samples.map((sample, i) => (
          <button
            key={sample.label}
            type="button"
            role="tab"
            aria-selected={i === active}
            className={`cursor-pointer border-b-2 px-3 pt-2 pb-2.5 font-mono text-xs ${
              i === active
                ? "border-blue-400 text-white"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
            onClick={() => setActive(i)}
          >
            {sample.label}
          </button>
        ))}
      </div>
      <pre className="overflow-x-auto p-6 font-mono text-[13px] leading-7 whitespace-pre text-slate-200" tabIndex={0}>
        {samples[active].code}
      </pre>
    </div>
  );
}
