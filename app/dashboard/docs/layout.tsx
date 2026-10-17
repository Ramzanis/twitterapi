import Link from "next/link";
import { groupedEndpoints } from "@/config/endpoints";
import DocsSidebar, { type DocsNavSection } from "@/components/docs/DocsSidebar";

/**
 * Two-column reference shell: a persistent contents rail on the left, the page
 * on the right. The endpoint sections are built from the catalog, so a new
 * entry in config/endpoints.ts appears here and gets its own page without any
 * navigation edit.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const sections: DocsNavSection[] = [
    {
      title: "Get started",
      items: [
        { href: "/dashboard/docs", label: "Introduction" },
        { href: "/dashboard/docs/authentication", label: "Authentication" },
        { href: "/dashboard/docs/billing", label: "Billing and limits" },
        { href: "/dashboard/docs/errors", label: "Errors" },
      ],
    },
    ...groupedEndpoints().map((group) => ({
      title: group.group,
      items: group.endpoints.map((endpoint) => ({
        href: `/dashboard/docs/api-reference/${endpoint.slug}`,
        label: endpoint.summary,
        method: endpoint.method,
      })),
    })),
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="lg:border-r lg:border-slate-200 lg:pr-4">
        <DocsSidebar sections={sections} />
        <div className="mt-6 px-3">
          <Link
            href="/api/openapi"
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            OpenAPI specification →
          </Link>
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
