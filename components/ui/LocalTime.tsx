"use client";

import { useEffect, useState } from "react";

/**
 * Timestamps rendered in the *viewer's* timezone. Server components would
 * otherwise format in the server's zone (UTC in production), so a customer in
 * Oslo would see times that don't match their own clock. Server-renders as
 * UTC, then swaps to local after hydration.
 */
export default function LocalTime({
  iso,
  mode = "time",
}: {
  iso: string;
  mode?: "time" | "datetime";
}) {
  const [local, setLocal] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date(iso);
    setLocal(mode === "time" ? d.toLocaleTimeString() : d.toLocaleString());
  }, [iso, mode]);

  const utcFallback =
    mode === "time"
      ? `${new Date(iso).toISOString().slice(11, 19)} UTC`
      : `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;

  return <span suppressHydrationWarning>{local ?? utcFallback}</span>;
}

/** Names the timezone the times above are shown in. */
export function TimeZoneNote() {
  const [zone, setZone] = useState<string | null>(null);
  useEffect(() => setZone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  return <span suppressHydrationWarning>{zone ? `times in ${zone}` : "times in UTC"}</span>;
}
