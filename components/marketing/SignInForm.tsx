"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

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

export default function SignInForm({
  googleEnabled,
  devLoginEnabled,
}: {
  googleEnabled: boolean;
  devLoginEnabled: boolean;
}) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <>
      {googleEnabled && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setPending(true);
            signIn("google", { redirectTo: "/dashboard" });
          }}
          className="mt-6 flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 font-medium text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-60"
        >
          <GoogleLogo />
          Continue with Google
        </button>
      )}

      {googleEnabled && devLoginEnabled && (
        <div className="mt-6 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          or
          <span className="h-px flex-1 bg-slate-200" />
        </div>
      )}

      {devLoginEnabled && (
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            setPending(true);
            signIn("dev-login", { email, redirectTo: "/dashboard" });
          }}
        >
          {!googleEnabled && (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              Google credentials aren&apos;t configured, so this is the local
              developer login. Set <code>AUTH_GOOGLE_ID</code> and{" "}
              <code>AUTH_GOOGLE_SECRET</code> in <code>.env</code> to enable
              Google sign-in.
            </p>
          )}
          <label htmlFor="dev-email" className="text-sm font-medium text-slate-700">
            Developer login
          </label>
          <input
            id="dev-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={pending}
            className="mt-3 w-full cursor-pointer rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Continue"}
          </button>
        </form>
      )}
    </>
  );
}
