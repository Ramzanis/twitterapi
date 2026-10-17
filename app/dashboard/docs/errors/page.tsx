import type { Metadata } from "next";
import { apiErrors, errorSchema } from "@/config/endpoints";
import { Code, Inline, PageHeader, Section } from "@/components/docs/DocsUi";
import SchemaFields from "@/components/docs/SchemaFields";

export const metadata: Metadata = { title: "Errors — Skylark docs" };

export default function DocsErrorsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Get started"
        title="Errors"
        lede="Every rejection is JSON with the same shape, and the same statuses apply to every endpoint."
      />

      <Section title="Response body">
        <Code>{`{\n  "error": "Rate limit exceeded — your plan allows 2 req/sec"\n}`}</Code>
        <div className="mt-4">
          <SchemaFields schema={errorSchema} />
        </div>
      </Section>

      <Section
        title="Status codes"
        description="Whether a rejection costs you credits, and whether it shows in your usage."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Meaning</th>
                <th className="pb-2 text-right font-medium">Billed</th>
                <th className="pb-2 text-right font-medium">In usage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {apiErrors.map((err) => (
                <tr key={err.status}>
                  <td className="py-3 pr-4 align-top font-mono text-xs font-semibold text-slate-900">
                    {err.status}
                  </td>
                  <td className="py-3 pr-4 text-slate-600">
                    <span className="font-medium text-slate-900">{err.title}</span> — {err.meaning}
                  </td>
                  <td className="py-3 text-right text-slate-500">{err.billed ? "yes" : "no"}</td>
                  <td className="py-3 text-right text-slate-500">{err.logged ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Retrying" description="What is worth trying again, and what is not.">
        <ul className="space-y-3 text-sm text-slate-600">
          <li>
            <span className="font-medium text-slate-900">429</span> — back off and retry. The{" "}
            <Inline>Retry-After</Inline> header tells you how long to wait. These are recorded in
            your usage at zero cost, so a throttled client is visible on your dashboard rather than
            silently failing.
          </li>
          <li>
            <span className="font-medium text-slate-900">502</span> — safe to retry, though we have
            already retried upstream several times before returning it. You are never charged for
            our provider&apos;s bad day.
          </li>
          <li>
            <span className="font-medium text-slate-900">400, 401, 403</span> — do not retry. These
            fail identically until you change the request, the key or the account.
          </li>
          <li>
            <span className="font-medium text-slate-900">402</span> — do not retry until you top up.
            The balance is below the price of the call.
          </li>
        </ul>
      </Section>
    </>
  );
}
