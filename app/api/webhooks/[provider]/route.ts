import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { fulfilTopupRequest } from "@/lib/billing";
import { getGateway } from "@/lib/payments/gateway";

/**
 * Payment gateway webhook — the only signal trusted to move money.
 *
 * Order matters:
 *   1. Read the RAW body (a parsed body cannot be signature-checked).
 *   2. Verify the signature. Unverified bodies are logged and rejected.
 *   3. Record the event id FIRST. A unique (provider, event_id) means a
 *      retried delivery conflicts here and stops, before touching the ledger.
 *   4. Only then act, and only on a terminal success.
 *
 * Always answer 2xx once we have durably recorded the event — a non-2xx makes
 * the gateway retry harder, turning one duplicate into twenty.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const gateway = getGateway(provider);
  if (!gateway) {
    // No provider configured: settlement is manual, so nothing may credit here.
    return Response.json({ error: "No payment gateway configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const event = await gateway.verifyAndParse(rawBody, request.headers);

  if (!event) {
    await db.insert(tables.webhookEvents).values({
      provider: gateway.name,
      eventId: `unverified-${Date.now()}`,
      eventType: "unknown",
      signatureValid: false,
      error: "Signature verification failed",
    });
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Dedupe on the gateway's event id before doing anything with consequences.
  const recorded = await db
    .insert(tables.webhookEvents)
    .values({
      provider: gateway.name,
      eventId: event.eventId,
      eventType: event.eventType,
      signatureValid: true,
      payload: JSON.parse(rawBody) as unknown,
    })
    .onConflictDoNothing({
      target: [tables.webhookEvents.provider, tables.webhookEvents.eventId],
    })
    .returning({ id: tables.webhookEvents.id });

  if (recorded.length === 0) {
    // Seen before. Succeed loudly so the gateway stops retrying.
    return Response.json({ status: "duplicate_ignored" });
  }
  const eventRowId = recorded[0].id;

  try {
    if (event.succeeded && event.topupRequestId) {
      const result = await fulfilTopupRequest(event.topupRequestId, null, {
        amountReceivedCents: event.amountReceivedCents,
        providerPaymentId: event.paymentId,
      });

      if (result) {
        await db.insert(tables.auditLogs).values({
          orgId: result.orgId,
          actorUserId: null,
          action: "topup.paid",
          metadata: {
            via: "webhook",
            provider: gateway.name,
            reference: result.reference,
            requested_cents: result.amountCents,
            credited_cents: result.creditedCents,
            payment_id: event.paymentId,
          },
        });
      }
    } else if (event.processing && event.topupRequestId) {
      // Money is moving but has not settled — show it, do not credit it.
      await db
        .update(tables.topupRequests)
        .set({ status: "processing", providerPaymentId: event.paymentId })
        .where(eq(tables.topupRequests.id, event.topupRequestId));
    }

    await db
      .update(tables.webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(tables.webhookEvents.id, eventRowId));

    return Response.json({ status: "ok" });
  } catch (err) {
    // Leave processed_at null and report failure so the gateway retries; the
    // event-id guard makes that retry safe.
    await db
      .update(tables.webhookEvents)
      .set({ error: String(err) })
      .where(eq(tables.webhookEvents.id, eventRowId));
    return Response.json({ error: "Handler failed" }, { status: 500 });
  }
}
