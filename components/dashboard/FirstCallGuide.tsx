import Link from "next/link";
import { curlFor, endpointDocs } from "@/config/endpoints";
import { appBaseUrl } from "@/lib/appUrl";
import CopyButton from "@/components/ui/CopyButton";

/**
 * Empty state for an account with no traffic. The first successful call is the
 * activation moment, so this hands over a runnable command rather than saying
 * "no data yet". The command comes from the endpoint catalog, so it stays in
 * step with the reference instead of being a second copy of the truth.
 */
export default async function FirstCallGuide({ keyPrefix }: { keyPrefix: string | null }) {
  const endpoint = endpointDocs[0];
  if (!endpoint) return null;

  const key = keyPrefix ?? "sk_live_your_key_here";
  const command = curlFor(endpoint, await appBaseUrl(), key);

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-6">
      <h2 className="text-lg font-semibold">Make your first call</h2>
      <p className="mt-1 text-sm text-slate-600">
        {keyPrefix
          ? "Paste your full key in place of the prefix below — we only store its hash, so it is shown once at creation."
          : "Create an API key below, then run this."}
      </p>
      <div className="mt-4 flex items-start gap-2">
        <pre className="flex-1 overflow-x-auto rounded-xl bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-200">
          {command}
        </pre>
        <CopyButton text={command} />
      </div>
      <p className="mt-3 text-sm text-slate-600">
        Parameters, response shape and error codes are in the{" "}
        <Link href="/dashboard/docs" className="font-medium underline">
          API reference
        </Link>
        .
      </p>
    </section>
  );
}
