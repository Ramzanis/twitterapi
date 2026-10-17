import { headers } from "next/headers";

/**
 * The origin customers should call.
 *
 * APP_URL wins where it is set, so what we print in the docs and the OpenAPI
 * document is the public origin rather than whatever internal host a proxy
 * forwarded the request to. Falls back to the request's own host, which is what
 * makes this correct in local development without configuration.
 */
export async function appBaseUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");

  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
