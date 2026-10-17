import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { resolvePlan } from "@/config/plans";
import { responseMetaSchema } from "@/config/endpoints";
import { requireUser } from "@/lib/authz";
import { Inline, PageHeader, Section } from "@/components/docs/DocsUi";
import SchemaFields from "@/components/docs/SchemaFields";

export const metadata: Metadata = { title: "Billing and limits — Skylark docs" };

export default async function DocsBillingPage() {
  const user = await requireUser();

  const [org] = await db
    .select({
      planCode: tables.organizations.planCode,
      planOverrides: tables.organizations.planOverrides,
    })
    .from(tables.organizations)
    .where(eq(tables.organizations.id, user.orgId))
    .limit(1);
  if (!org) return null;

  const plan = resolvePlan(org.planCode, org.planOverrides);

  return (
    <>
      <PageHeader
        eyebrow="Get started"
        title="Billing and limits"
        lede="What a call costs, when we stop serving them, and how to read the metering block we return with every response."
      />

      <Section title="Your plan" description="Resolved for the organization you are signed in to.">
        <dl className="divide-y divide-slate-100 border-y border-slate-100 text-sm">
          <div className="flex justify-between py-3">
            <dt className="text-slate-500">Plan</dt>
            <dd className="font-medium">{plan.name}</dd>
          </div>
          <div className="flex justify-between py-3">
            <dt className="text-slate-500">Rate limit</dt>
            <dd className="font-medium">{plan.rateLimitRps} requests / second</dd>
          </div>
          <div className="flex justify-between py-3">
            <dt className="text-slate-500">Active API keys</dt>
            <dd className="font-medium">up to {plan.maxApiKeys}</dd>
          </div>
          <div className="flex justify-between py-3">
            <dt className="text-slate-500">Billing unit</dt>
            <dd className="font-medium">USD micros — 1,000,000 = $1</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-slate-600">
          Exceeding the rate limit returns 429 with a <Inline>Retry-After</Inline> header. Manage
          credits on{" "}
          <Link href="/dashboard/billing" className="font-medium text-blue-600 underline">
            billing
          </Link>
          .
        </p>
      </Section>

      <Section
        title="Credit buckets"
        description="Two chains, spent in a fixed order."
      >
        <p className="text-sm text-slate-600">
          Bonus credits — signup grants and goodwill — are always consumed{" "}
          <span className="font-medium text-slate-900">before</span> credits you paid for. A charge
          that straddles both is split across them, and{" "}
          <Inline>meta.credits_from_bonus_micros</Inline> tells you how much of the call came out of
          the bonus side.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          When the balance drops below the price of a call, the next request returns 402 rather than
          running up a debt.
        </p>
      </Section>

      <Section
        title="The meta block"
        description="Returned on every successful response, alongside the data you asked for."
      >
        <SchemaFields schema={responseMetaSchema} />
      </Section>

      <Section title="Caching" description="Why a fast response still costs you money.">
        <p className="text-sm text-slate-600">
          A repeated query inside the cache window is served from our cache without a call upstream.
          It is billed at the normal price — you are paying for the data, not for our cost of getting
          it — and <Inline>meta.cache_hit</Inline> is true so you can tell.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          The cache is keyed by query alone and shared across all customers, which means your cache
          hit rate is a property of total platform traffic. Do not treat it as a measure of your own
          request patterns.
        </p>
      </Section>
    </>
  );
}
