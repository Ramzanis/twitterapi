import CopyButton from "@/components/ui/CopyButton";

export function PageHeader({
  eyebrow,
  title,
  lede,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
}) {
  return (
    <header className="mb-8">
      {eyebrow && (
        <div className="text-xs font-semibold tracking-wide text-blue-600 uppercase">{eyebrow}</div>
      )}
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
      {lede && <p className="mt-2 max-w-2xl text-slate-600">{lede}</p>}
    </header>
  );
}

export function Section({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-10 scroll-mt-8">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-200">
      {children}
    </pre>
  );
}

export function CodeWithCopy({ children }: { children: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <Code>{children}</Code>
      </div>
      <CopyButton text={children} />
    </div>
  );
}

export function Inline({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">
      {children}
    </code>
  );
}

/** Method chip + path, the line that identifies an endpoint. */
export function EndpointLine({ method, url }: { method: string; url: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="rounded-md bg-emerald-600 px-2 py-1 font-mono text-xs font-semibold text-white">
        {method}
      </span>
      <code className="min-w-0 flex-1 truncate font-mono text-sm text-slate-900">{url}</code>
      <CopyButton text={url} label="Copy URL" />
    </div>
  );
}
