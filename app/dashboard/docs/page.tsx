import type { Metadata } from "next";
import Link from "next/link";
import {
  curlFor,
  endpointDocs,
  endpointPriceMicros,
  formatPricePerThousand,
  groupedEndpoints,
} from "@/config/endpoints";
import { appBaseUrl } from "@/lib/appUrl";
import { CodeWithCopy, Inline, PageHeader, Section } from "@/components/docs/DocsUi";

export const metadata: Metadata = { title: "Introduction — Skylark docs" };

export default async function DocsIntroductionPage() {
  const baseUrl = await appBaseUrl();
  const first = endpointDocs[0];

  return (
    <>
      <PageHeader
        eyebrow="Get started"
        title="Skylark API"
        lede="Metered access to X data over plain HTTP. One API key, one request, billed per call against a credit balance."
      />

      <Section title="Base URL" description="Every endpoint hangs off this origin.">
        <CodeWithCopy>{baseUrl}</CodeWithCopy>
      </Section>

      {first && (
        <Section
          title="Make your first call"
          description="Create a key on the dashboard, then run this. Replace the placeholder with your full key."
        >
          <CodeWithCopy>{curlFor(first, baseUrl, "sk_live_your_key_here")}</CodeWithCopy>
        </Section>
      )}

      <Section
        title="How a call is billed"
        description="Worth understanding before you build against it."
      >
        <ul className="space-y-3 text-sm text-slate-600">
          <li>
            <span className="font-medium text-slate-900">You are charged per request</span>, at the
            price shown on each endpoint page. What you were actually charged is recorded on the
            request, so a later price change never rewrites your history.
          </li>
          <li>
            <span className="font-medium text-slate-900">Cached responses cost the same.</span> The
            cache is shared across all customers, so <Inline>meta.cache_hit</Inline> reflects total
            traffic rather than only yours.
          </li>
          <li>
            <span className="font-medium text-slate-900">Rejections are free.</span> A rate limit, an
            empty balance or an upstream failure is never billed — though 429 and 402 still show in
            your usage at zero cost, so a throttled client is visible rather than silent.
          </li>
          <li>
            <span className="font-medium text-slate-900">Test keys are never billed</span> and run
            the identical path. See <Link href="/dashboard/docs/authentication" className="font-medium text-blue-600 underline">Authentication</Link>.
          </li>
        </ul>
      </Section>

      <Section title="Endpoints" description="What you can call today.">
        <div className="space-y-6">
          {groupedEndpoints().map((group) => (
            <div key={group.group}>
              <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                {group.group}
              </div>
              <ul className="mt-2 divide-y divide-slate-100 border-y border-slate-100">
                {group.endpoints.map((endpoint) => (
                  <li key={endpoint.slug} className="flex flex-wrap items-baseline gap-x-3 py-3">
                    <Link
                      href={`/dashboard/docs/api-reference/${endpoint.slug}`}
                      className="font-medium text-blue-600 hover:text-blue-700"
                    >
                      {endpoint.summary}
                    </Link>
                    <code className="font-mono text-xs text-slate-500">
                      {endpoint.method} {endpoint.path}
                    </code>
                    <span className="ml-auto text-xs whitespace-nowrap text-slate-500">
                      {formatPricePerThousand(endpointPriceMicros(endpoint))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="OpenAPI"
        description="The machine-readable contract, generated from the same catalog as these pages."
      >
        <CodeWithCopy>{`${baseUrl}/api/openapi`}</CodeWithCopy>
        <p className="mt-3 text-sm text-slate-600">
          Import it into Postman or Insomnia, or generate a client with{" "}
          <Inline>openapi-generator</Inline>. It is public and needs no key.
        </p>
      </Section>
    </>
  );
}
