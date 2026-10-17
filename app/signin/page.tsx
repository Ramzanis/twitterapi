import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, authProviders } from "@/auth";
import SignInForm from "@/components/marketing/SignInForm";

export const metadata: Metadata = {
  title: "Sign in — Skylark",
  description: "Sign in to Skylark with your Google account.",
};

export default async function SignInPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

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

        <SignInForm
          googleEnabled={authProviders.google}
          devLoginEnabled={authProviders.devLogin}
        />

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
