import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  apiErrors,
  curlFor,
  endpointBySlug,
  endpointDocs,
  endpointPriceMicros,
  formatPricePerThousand,
  responseMetaSchema,
} from "@/config/endpoints";
import { appBaseUrl } from "@/lib/appUrl";
import {
  Code,
  CodeWithCopy,
  EndpointLine,
  Inline,
  PageHeader,
  Section,
} from "@/components/docs/DocsUi";
import SchemaFields from "@/components/docs/SchemaFields";

/** One page per catalog entry — the routes exist because the endpoints do. */
export function generateStaticParams() {
  return endpointDocs.map((endpoint) => ({ slug: endpoint.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const endpoint = endpointBySlug((await params).slug);
  return { title: endpoint ? `${endpoint.summary} — Skylark docs` : "Not found — Skylark docs" };
}

export default async function EndpointReferencePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const endpoint = endpointBySlug((await params).slug);
  if (!endpoint) notFound();

  const baseUrl = await appBaseUrl();
  const priceMicros = endpointPriceMicros(endpoint);

  const exampleResponse = JSON.stringify(
    {
      data: endpoint.dataExample,
      meta: {
        endpoint: endpoint.id,
        cache_hit: false,
        credits_charged_micros: priceMicros,
        credits_from_bonus_micros: priceMicros,
        balance_micros: 100_000 - priceMicros,
        environment: "live",
        latency_ms: 412,
      },
    },
    null,
    2,
  );

  return (
    <>
      <PageHeader eyebrow={endpoint.group} title={endpoint.summary} lede={endpoint.description} />

      <div className="mb-8">
        <EndpointLine method={endpoint.method} url={`${baseUrl}${endpoint.path}`} />
        <p className="mt-2 text-sm text-slate-600">
          <span className="font-medium text-slate-900">
            {formatPricePerThousand(priceMicros)}
          </span>{" "}
          — {priceMicros} USD micros per call, charged on success whether or not the response came
          from cache. Rejections are free.
        </p>
      </div>

      <Section
        title="Authorizations"
        description="See Authentication for how keys are created and rolled."
      >
        <ul className="divide-y divide-slate-100 border-y border-slate-100">
          <li className="py-3">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <code className="font-mono text-sm font-medium text-slate-900">X-API-Key</code>
              <span className="font-mono text-xs text-slate-500">string</span>
              <span className="text-xs font-medium text-amber-600">required</span>
              <span className="text-xs text-slate-400">header</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              A live or test key for your organization. Test keys run this endpoint without being
              billed.
            </p>
          </li>
        </ul>
      </Section>

      <Section title="Query parameters">
        <ul className="divide-y divide-slate-100 border-y border-slate-100">
          {endpoint.params.map((param) => (
            <li key={param.name} className="py-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <code className="font-mono text-sm font-medium text-slate-900">{param.name}</code>
                <span className="font-mono text-xs text-slate-500">{param.type}</span>
                {param.required ? (
                  <span className="text-xs font-medium text-amber-600">required</span>
                ) : (
                  <span className="text-xs text-slate-400">optional</span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-600">{param.description}</p>
              <p className="mt-1 text-xs text-slate-500">
                Example: <Inline>{param.example}</Inline>
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Request">
        <CodeWithCopy>{curlFor(endpoint, baseUrl, "sk_live_your_key_here")}</CodeWithCopy>
      </Section>

      <Section
        title="Response"
        description="200 — an envelope carrying the data you asked for and what the call cost."
      >
        <h3 className="text-sm font-semibold text-slate-900">data</h3>
        <div className="mt-2">
          <SchemaFields schema={endpoint.dataSchema} />
        </div>

        <h3 className="mt-6 text-sm font-semibold text-slate-900">meta</h3>
        <p className="mt-1 text-sm text-slate-600">
          Identical on every endpoint. Explained in full under{" "}
          <Link href="/dashboard/docs/billing" className="font-medium text-blue-600 underline">
            Billing and limits
          </Link>
          .
        </p>
        <div className="mt-2">
          <SchemaFields schema={responseMetaSchema} />
        </div>

        <h3 className="mt-6 text-sm font-semibold text-slate-900">Example</h3>
        <div className="mt-2">
          <Code>{exampleResponse}</Code>
        </div>
      </Section>

      <Section
        title="Errors"
        description="Shared across every endpoint. Full detail on the Errors page."
      >
        <ul className="divide-y divide-slate-100 border-y border-slate-100">
          {apiErrors.map((err) => (
            <li key={err.status} className="flex flex-wrap items-baseline gap-x-3 py-2.5 text-sm">
              <code className="font-mono text-xs font-semibold text-slate-900">{err.status}</code>
              <span className="font-medium text-slate-900">{err.title}</span>
              <span className="text-slate-600">{err.meaning}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-slate-600">
          <Link href="/dashboard/docs/errors" className="font-medium text-blue-600 underline">
            Errors and retry guidance →
          </Link>
        </p>
      </Section>
    </>
  );
}
