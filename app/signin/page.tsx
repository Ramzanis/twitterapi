import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign in — Skylark",
  description: "Sign in to Skylark with your Google account.",
};

function GoogleLogo() {
  return (
    <svg className="size-5" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-sky-100/70 via-white to-white px-6 py-16">
      <Link
        href="/"
        className="flex items-center gap-2 text-xl font-semibold tracking-tight"
      >
        <span className="block size-2.5 rounded-full bg-blue-600"></span>
        skylark
      </Link>

      <div className="mt-8 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight">
          Sign in
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Use your Google account to continue to your dashboard and API keys.
        </p>

        {/* TODO: wire up to the OAuth flow (e.g. Auth.js signIn("google")) */}
        <button
          type="button"
          className="mt-6 flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 font-medium text-slate-900 shadow-sm hover:bg-slate-50"
        >
          <GoogleLogo />
          Continue with Google
        </button>

        <p className="mt-5 text-center text-xs text-slate-500">
          By continuing, you agree to our{" "}
          <a href="#" className="underline hover:text-slate-900">
            Terms
          </a>{" "}
          and{" "}
          <a href="#" className="underline hover:text-slate-900">
            Privacy Policy
          </a>
          .
        </p>
      </div>

      <p className="mt-8 max-w-sm text-center text-xs leading-relaxed text-slate-400">
        twitterapi.io is an independent third-party service. Not affiliated
        with X Corp. &quot;Twitter&quot; and &quot;X&quot; are trademarks of X
        Corp.
      </p>

      <Link
        href="/"
        className="mt-6 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        ← Back to home
      </Link>
    </main>
  );
}
