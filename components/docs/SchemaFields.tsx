import type { JsonSchema } from "@/config/endpoints";

function typeLabel(schema: JsonSchema): string {
  if (schema.type === "array" && schema.items) return `${schema.items.type}[]`;
  if (schema.enum) return schema.enum.join(" | ");
  return schema.nullable ? `${schema.type} | null` : schema.type;
}

/**
 * Renders a JSON Schema as an indented field list, the way an API reference
 * shows a response body. Nested objects and array items recurse, so the shape
 * on the page is the shape in the catalog — there is no prose copy of it to
 * fall out of date.
 */
export default function SchemaFields({
  schema,
  depth = 0,
}: {
  schema: JsonSchema;
  depth?: number;
}) {
  const object = schema.type === "array" && schema.items ? schema.items : schema;
  const properties = object.properties;
  if (!properties) return null;

  const required = new Set(object.required ?? []);

  return (
    <ul
      className={
        depth === 0
          ? "divide-y divide-slate-100 border-y border-slate-100"
          : "mt-2 space-y-3 border-l border-slate-200 pl-4"
      }
    >
      {Object.entries(properties).map(([name, field]) => (
        <li key={name} className={depth === 0 ? "py-3" : ""}>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <code className="font-mono text-sm font-medium text-slate-900">{name}</code>
            <span className="font-mono text-xs text-slate-500">{typeLabel(field)}</span>
            {required.has(name) && (
              <span className="text-xs font-medium text-amber-600">required</span>
            )}
          </div>
          {field.description && (
            <p className="mt-1 text-sm text-slate-600">{field.description}</p>
          )}
          {(field.properties || field.items?.properties) && (
            <SchemaFields schema={field} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  );
}
