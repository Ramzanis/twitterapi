"use client";

import { useState } from "react";

const items = [
  {
    question: "Do I need an X developer account?",
    answer:
      "No. Skylark handles platform access, so there is no application, no approval wait and no project quota to manage.",
  },
  {
    question: "How does billing work?",
    answer:
      "Per call, to the cent: $0.15 per 1,000 tweet reads and $0.18 per 1,000 profile reads. No monthly floor, and you set your own spend cap.",
  },
  {
    question: "How fresh is the data?",
    answer:
      "Search reflects posts within seconds of publication. Stream events arrive in under 500 ms at the median.",
  },
  {
    question: "Is this affiliated with X Corp?",
    answer:
      "No. Skylark is an independent third-party service, not affiliated with, endorsed by or sponsored by X Corp.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-6 shadow-sm">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.question}>
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-4 py-5 text-left font-medium text-slate-900"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
            >
              <span className="flex-1">{item.question}</span>
              <span className="text-lg leading-none text-blue-600" aria-hidden="true">
                {isOpen ? "–" : "+"}
              </span>
            </button>
            <div className="pb-5 text-[15px] leading-relaxed text-slate-600" hidden={!isOpen}>
              {item.answer}
            </div>
          </div>
        );
      })}
    </div>
  );
}
