import type { Metadata } from "next";
import Link from "next/link";
import { endpointDocs } from "@/config/endpoints";
import { appBaseUrl } from "@/lib/appUrl";
import { Code, CodeWithCopy, Inline, PageHeader, Section } from "@/components/docs/DocsUi";

export const metadata: Metadata = { title: "Authentication — Skylark docs" };

export default async function DocsAuthenticationPage() {
  const baseUrl = await appBaseUrl();
  const path = endpointDocs[0]?.path ?? "/api/x/tweet/search";

  return (
    <>
      <PageHeader
        eyebrow="Get started"
        title="Authentication"
        lede="One header on every request. There are no other credentials, no tokens to refresh and no OAuth dance."
      />

      <Section title="The header" description="Send your key as X-API-Key.">
        <CodeWithCopy>
          {`curl "${baseUrl}${path}?query=AI+agents" \\\n  -H "X-API-Key: sk_live_your_key_here"`}
        </CodeWithCopy>
      </Section>

      <Section
        title="Getting a key"
        description="Keys are created per organization on the dashboard."
      >
        <p className="text-sm text-slate-600">
          We store only the SHA-256 hash of a key plus a short display prefix, so the full value is
          shown <span className="font-medium text-slate-900">once</span>, at creation. There is no
          way for us to recover it afterwards — if you lose it, roll the key and update your client.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          Create, roll and revoke keys on the{" "}
          <Link href="/dashboard" className="font-medium text-blue-600 underline">
            dashboard
          </Link>
          . Revocation takes effect on the next request.
        </p>
      </Section>

      <Section
        title="Live and test keys"
        description="Both run the identical path — auth, rate limit, cache, upstream provider."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="font-mono text-sm font-semibold text-emerald-700">sk_live_…</div>
            <p className="mt-2 text-sm text-slate-600">
              Debited from your credit balance and counted in usage. Returns your remaining balance
              in <Inline>meta.balance_micros</Inline>.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="font-mono text-sm font-semibold text-slate-600">sk_test_…</div>
            <p className="mt-2 text-sm text-slate-600">
              Never billed. <Inline>meta.credits_charged_micros</Inline> is 0 and{" "}
              <Inline>meta.balance_micros</Inline> is null, so a test client can tell which
              environment it is in without being told.
            </p>
          </div>
        </div>
      </Section>

      <Section title="What can go wrong" description="Authentication failures, specifically.">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Cause</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-2.5 pr-4 font-mono text-xs font-semibold">401</td>
                <td className="py-2.5 text-slate-600">
                  No <Inline>X-API-Key</Inline> header, or the key is unknown or revoked.
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-mono text-xs font-semibold">403</td>
                <td className="py-2.5 text-slate-600">
                  The key is valid but its organization is suspended or closed.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <Code>{`{\n  "error": "Invalid or revoked API key"\n}`}</Code>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Every rejection is documented on the{" "}
          <Link href="/dashboard/docs/errors" className="font-medium text-blue-600 underline">
            Errors
          </Link>{" "}
          page.
        </p>
      </Section>
    </>
  );
}
