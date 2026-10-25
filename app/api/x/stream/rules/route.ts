import { NextResponse } from "next/server";
import { guard } from "@/lib/apiGuard";
import { createRule, deleteRule, listRules, ruleJson } from "@/lib/streamRules";

// Stream rule management. Not metered — rules cost nothing to keep; the
// stream bills per post delivered.

export async function GET(request: Request) {
  const { ctx, response } = await guard(request);
  if (response) return response;

  const rules = await listRules(ctx.org.id);
  return NextResponse.json({
    data: rules.map(ruleJson),
    meta: { result_count: rules.length, max_rules: ctx.plan.maxStreamRules },
  });
}

export async function POST(request: Request) {
  const { ctx, response } = await guard(request);
  if (response) return response;

  const body = (await request.json().catch(() => null)) as { value?: unknown; tag?: unknown } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: 'Expected a JSON body like {"value": "AI agents"}' }, { status: 400 });
  }

  const result = await createRule(ctx.org.id, ctx.plan, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: ruleJson(result.rule) }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { ctx, response } = await guard(request);
  if (response) return response;

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Missing ?id= parameter" }, { status: 400 });

  if (!(await deleteRule(ctx.org.id, id))) {
    return NextResponse.json({ error: "No stream rule with that id" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
