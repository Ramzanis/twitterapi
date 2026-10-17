import Link from "next/link";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-4">
        <a href="#top" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="block size-2.5 rounded-full bg-blue-600"></span>
          skylark
        </a>
        <div className="hidden gap-6 text-sm font-medium text-slate-600 sm:flex">
          <a href="#features" className="hover:text-slate-900">Features</a>
          <a href="#docs" className="hover:text-slate-900">Docs</a>
          <a href="#pricing" className="hover:text-slate-900">Pricing</a>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <Link
            href="/signin"
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Sign in
          </Link>
          <a
            href="#"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Get API key
          </a>
        </div>
      </nav>
    </header>
  );
}
