/**
 * OpenAPI 3.1 document, generated from the endpoint catalog.
 *
 * This is the machine-readable half of our documentation: customers point
 * client generators, Postman and editor tooling at it. It is derived rather
 * than hand-maintained so that adding an endpoint to config/endpoints.ts is
 * the only step — a spec that drifts from the implementation is worse than
 * no spec at all.
 */

import {
  apiErrors,
  endpointDocs,
  endpointPriceMicros,
  errorSchema,
  formatPricePerThousand,
  responseMetaSchema,
  type EndpointDoc,
  type JsonSchema,
} from "@/config/endpoints";

/** OpenAPI 3.1 has no `nullable` keyword — a null-able type is a type union. */
function toOpenApiSchema(schema: JsonSchema): Record<string, unknown> {
  const { nullable, properties, items, ...rest } = schema;
  const out: Record<string, unknown> = {
    ...rest,
    type: nullable ? [schema.type, "null"] : schema.type,
  };
  if (properties) {
    out.properties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [key, toOpenApiSchema(value)]),
    );
  }
  if (items) out.items = toOpenApiSchema(items);
  return out;
}

function operationFor(endpoint: EndpointDoc): Record<string, unknown> {
  const priceMicros = endpointPriceMicros(endpoint);

  const responses: Record<string, unknown> = {
    "200": {
      description: `Success. Billed at ${formatPricePerThousand(priceMicros)} (${priceMicros} USD micros per call) on a live key, whether or not the response came from cache.`,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["data", "meta"],
            properties: {
              data: toOpenApiSchema(endpoint.dataSchema),
              meta: { $ref: "#/components/schemas/ResponseMeta" },
            },
          },
          example: { data: endpoint.dataExample },
        },
      },
    },
  };

  for (const err of apiErrors) {
    responses[String(err.status)] = {
      description: `${err.title} — ${err.meaning}`,
      content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
    };
  }

  return {
    operationId: endpoint.path.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, ""),
    summary: endpoint.summary,
    description: endpoint.description,
    tags: [endpoint.group],
    parameters: endpoint.params.map((param) => ({
      name: param.name,
      in: "query",
      required: param.required,
      description: param.description,
      schema: { type: param.type },
      example: param.example,
    })),
    responses,
  };
}

export function buildOpenApiDocument(baseUrl: string): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  for (const endpoint of endpointDocs) {
    paths[endpoint.path] = { get: operationFor(endpoint) };
  }

  const tags = [...new Set(endpointDocs.map((e) => e.group))].map((name) => ({ name }));

  return {
    openapi: "3.1.0",
    info: {
      title: "Skylark API",
      version: "2026-08-30",
      summary: "Metered access to X data, billed per call against a credit balance.",
      description:
        "Authenticate with an API key created on the dashboard. Every call is metered and " +
        "billed from your credit balance; rejected calls are recorded at zero cost so your " +
        "usage view matches what your client saw. Test keys exercise the full path without " +
        "being billed.",
      contact: { name: "Skylark support", email: "support@skylark.dev" },
    },
    servers: [{ url: baseUrl }],
    tags,
    security: [{ ApiKeyAuth: [] }],
    paths,
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description:
            "Create keys on the dashboard. The full key is shown once at creation — we store " +
            "only its SHA-256 hash and cannot recover it.",
        },
      },
      schemas: {
        ResponseMeta: toOpenApiSchema(responseMetaSchema),
        Error: toOpenApiSchema(errorSchema),
      },
    },
  };
}
