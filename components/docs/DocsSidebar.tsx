"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface DocsNavSection {
  title: string;
  items: { href: string; label: string; method?: string }[];
}

/**
 * Persistent reference navigation. Sections are passed in from the server so
 * the endpoint list stays derived from the catalog rather than hand-written
 * here; this component only knows how to highlight the current page.
 */
export default function DocsSidebar({ sections }: { sections: DocsNavSection[] }) {
  const pathname = usePathname();

  return (
    <nav className="lg:sticky lg:top-8">
      {sections.map((section) => (
        <div key={section.title} className="mb-6">
          <div className="px-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {section.title}
          </div>
          <ul className="mt-2 space-y-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${
                      active
                        ? "bg-blue-50 font-medium text-blue-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {item.method && (
                      <span className="font-mono text-[10px] font-semibold text-emerald-600">
                        {item.method}
                      </span>
                    )}
                    <span className="min-w-0 truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
