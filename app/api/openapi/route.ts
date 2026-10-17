import { assertCatalogIsPriced } from "@/config/endpoints";
import { appBaseUrl } from "@/lib/appUrl";
import { buildOpenApiDocument } from "@/lib/openapi";

/**
 * The OpenAPI document for the public API.
 *
 * Deliberately unauthenticated: it describes the contract, carries no customer
 * data, and is what client generators and Postman are pointed at before anyone
 * has a key.
 */
export async function GET() {
  assertCatalogIsPriced();

  return Response.json(buildOpenApiDocument(await appBaseUrl()), {
    headers: {
      // The spec changes only on deploy, but a stale client contract is worse
      // than an extra request — so cache briefly rather than aggressively.
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
