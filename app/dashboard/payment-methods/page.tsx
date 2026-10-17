import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { requireUser } from "@/lib/authz";
import {
  activeBillingProvider,
  bankDetailsConfigured,
  bankTransfer,
  billingContactEmail,
} from "@/config/billing";
import CopyButton from "@/components/ui/CopyButton";

export const metadata: Metadata = { title: "Payment methods — Skylark" };

function Card({
  title,
  children,
  description,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function PaymentMethodsPage() {
  const user = await requireUser();

  const [org] = await db
    .select()
    .from(tables.organizations)
    .where(eq(tables.organizations.id, user.orgId))
    .limit(1);
  if (!org) return null;

  const providerConnected = org.billingProvider !== "manual" && Boolean(org.billingCustomerId);

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payment methods</h1>
        <p className="mt-1 text-sm text-slate-600">
          How you pay for credits. Your balance always comes from our ledger, not from
          the payment provider — so changing method never affects credits you already hold.
        </p>
      </div>

      <Card
        title="Bank transfer"
        description="How accounts are funded today. No card fees, and the normal way we bill business customers."
      >
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            Active
          </span>
          <span className="text-sm text-slate-600">
            Request a top-up on the billing page, then transfer quoting the reference.
          </span>
        </div>

        {bankDetailsConfigured ? (
          <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-slate-500">Account name</dt>
              <dd className="mt-1 text-sm font-medium">{bankTransfer.accountName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Bank</dt>
              <dd className="mt-1 text-sm font-medium">{bankTransfer.bankName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">IBAN</dt>
              <dd className="mt-1 flex items-center gap-2">
                <span className="font-mono text-sm font-medium">{bankTransfer.iban}</span>
                <CopyButton text={bankTransfer.iban} />
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">BIC / SWIFT</dt>
              <dd className="mt-1 font-mono text-sm font-medium">{bankTransfer.bic}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-900">
            Bank details haven&apos;t been published yet. Request a top-up on the{" "}
            <Link href="/dashboard/billing" className="font-medium underline">
              billing page
            </Link>{" "}
            and we&apos;ll email payment instructions with your reference.
          </p>
        )}

        <p className="mt-4 text-xs text-slate-500">
          Always include your top-up reference so the payment is matched automatically.
          Transfers usually clear within one business day.
        </p>
      </Card>

      <Card
        title="Card and automatic payments"
        description="Saved cards, auto-recharge and self-serve invoices arrive with our payment provider."
      >
        {providerConnected ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              Connected
            </span>
            <span className="text-sm text-slate-600">
              Billing provider:{" "}
              <span className="font-medium capitalize">{org.billingProvider}</span>
            </span>
            <span className="font-mono text-xs text-slate-400">{org.billingCustomerId}</span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                Not connected
              </span>
              <span className="text-sm text-slate-600">No card on file.</span>
            </div>
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-600">
              We haven&apos;t enabled card payments yet, so there is nothing to store or
              remove here. When it&apos;s ready you&apos;ll be able to save a card, turn on
              auto-recharge, and download invoices yourself — your existing credits carry
              over untouched.
            </p>
          </>
        )}
        <p className="mt-4 text-xs text-slate-500">
          Card details are never stored on our servers — they live with the payment
          provider, and we keep only a customer reference.
        </p>
      </Card>

      <Card title="Billing contact" description="Where invoices and payment reminders are sent.">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-slate-500">Billed to</dt>
            <dd className="mt-1 text-sm font-medium">{org.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Contact</dt>
            <dd className="mt-1 text-sm font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Current method</dt>
            <dd className="mt-1 text-sm font-medium">
              {activeBillingProvider === "manual" ? "Bank transfer" : activeBillingProvider}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Questions</dt>
            <dd className="mt-1 text-sm">
              <a href={`mailto:${billingContactEmail}`} className="font-medium underline">
                {billingContactEmail}
              </a>
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-slate-500">
          Change the organization name on the{" "}
          <Link href="/dashboard/account" className="underline">
            account page
          </Link>
          .
        </p>
      </Card>
    </>
  );
}
