import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    /** The signed-in user's personal organization — usage and billing hang off this. */
    orgId: string;
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    orgId?: string;
  }
}
