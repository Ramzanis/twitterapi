"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The staff console sits on a dark header, so the active state has to invert. */
const tones = {
  light: {
    active: "border-blue-600 text-slate-900",
    idle: "border-transparent text-slate-500 hover:text-slate-900",
  },
  dark: {
    active: "border-amber-400 text-white",
    idle: "border-transparent text-slate-400 hover:text-white",
  },
};

export default function NavTabs({
  tabs,
  tone = "light",
}: {
  tabs: { href: string; label: string }[];
  tone?: keyof typeof tones;
}) {
  const pathname = usePathname();
  const styles = tones[tone];

  return (
    <nav className="flex gap-6">
      {tabs.map((tab) => {
        const active =
          tab.href === pathname ||
          (tab.href !== "/dashboard" && tab.href !== "/admin" && pathname.startsWith(tab.href));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium ${
              active ? styles.active : styles.idle
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
