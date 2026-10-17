import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { provisionIdentity } from "@/lib/provisioning";

const isDev = process.env.NODE_ENV !== "production";
const hasGoogleCreds = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

/**
 * Local dev login. Lets the whole signed-in experience (provisioning,
 * dashboard, API keys) run without Google Cloud credentials — the same
 * mock-first approach used for the data provider and billing. Never
 * registered in production.
 */
const devLogin = Credentials({
  id: "dev-login",
  name: "Developer login",
  credentials: { email: { label: "Email", type: "email" } },
  async authorize(credentials) {
    const email = String(credentials?.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) return null;
    return {
      id: `dev|${email}`,
      email,
      name: email.split("@")[0],
    };
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [...(hasGoogleCreds ? [Google] : []), ...(isDev ? [devLogin] : [])],
  session: { strategy: "jwt" }, // no session/account tables needed
  pages: { signIn: "/signin" },
  callbacks: {
    async jwt({ token, user, account, profile }) {
      // Runs with `user` set only on first sign-in of a session.
      if (user) {
        const googleSub =
          account?.provider === "google" && profile?.sub
            ? profile.sub
            : `dev|${user.email}`;

        const identity = await provisionIdentity({
          googleSub,
          email: user.email!,
          name: user.name ?? null,
          avatarUrl: user.image ?? null,
        });

        token.userId = identity.userId;
        token.orgId = identity.orgId;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId as string;
      session.orgId = token.orgId as string;
      return session;
    },
  },
});

export const authProviders = { google: hasGoogleCreds, devLogin: isDev };
