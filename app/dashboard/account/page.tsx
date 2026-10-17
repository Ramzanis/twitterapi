import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { plans, resolvePlan } from "@/config/plans";
import { requireUser } from "@/lib/authz";
import { OrganizationForm, ProfileForm } from "@/components/dashboard/AccountForms";

export const metadata: Metadata = { title: "Account — Skylark" };

function Card({
  title,
  description,
  children,
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

export default async function AccountPage() {
  const user = await requireUser();

  const [org] = await db
    .select()
    .from(tables.organizations)
    .where(eq(tables.organizations.id, user.orgId))
    .limit(1);
  if (!org) return null;

  const plan = resolvePlan(org.planCode, org.planOverrides);
  const members = await db
    .select({
      email: tables.users.email,
      name: tables.users.name,
      role: tables.organizationMembers.role,
    })
    .from(tables.organizationMembers)
    .innerJoin(tables.users, eq(tables.users.id, tables.organizationMembers.userId))
    .where(eq(tables.organizationMembers.orgId, org.id));

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-slate-600">
          Profile, organization and plan. Credits and invoices live on{" "}
          <Link href="/dashboard/billing" className="font-medium underline">
            billing
          </Link>
          .
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profile" description="How you appear in this workspace.">
          <div className="mb-5 flex items-center gap-3">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt=""
                className="size-10 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex size-10 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                {(user.name ?? user.email).slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div className="text-sm font-medium">{user.name ?? "—"}</div>
              <div className="text-xs text-slate-500">{user.email}</div>
            </div>
          </div>
          <ProfileForm name={user.name ?? ""} />
        </Card>

        <Card title="Organization" description="Usage and billing belong to this organization.">
          <OrganizationForm name={org.name} />
          <dl className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Slug</dt>
              <dd className="font-mono text-xs">{org.slug}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Organization ID</dt>
              <dd className="font-mono text-xs">{org.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Created</dt>
              <dd>{new Date(org.createdAt).toLocaleDateString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Members</dt>
              <dd>
                {members.length} ({members.map((m) => m.role).join(", ")})
              </dd>
            </div>
          </dl>
        </Card>

        <Card title="Plan" description="What your organization is entitled to today.">
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-semibold tracking-tight">{plan.name}</span>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
              {org.planCode}
            </span>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Rate limit</dt>
              <dd>{plan.rateLimitRps} req/sec</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Active API keys</dt>
              <dd>up to {plan.maxApiKeys}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Seats</dt>
              <dd>up to {plan.maxSeats}</dd>
            </div>
            {org.planOverrides != null && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Custom terms</dt>
                <dd className="text-emerald-600">applied</dd>
              </div>
            )}
          </dl>
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            Plans are changed by our team while billing is handled manually.{" "}
            <a href="mailto:billing@skylark.dev" className="font-medium underline">
              Email us
            </a>{" "}
            to move between{" "}
            {Object.values(plans)
              .map((p) => p.name)
              .join(", ")}
            .
          </p>
        </Card>


      </div>


    </>
  );
}
