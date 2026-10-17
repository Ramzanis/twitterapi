import { timingSafeEqual } from "crypto";
import { db, tables } from "@/db";
import {
  findStaleTopups,
  fulfilTopupRequest,
  markTopupChecked,
} from "@/lib/billing";
import { getGateway } from "@/lib/payments/gateway";
import { activeBillingProvider } from "@/config/billing";

/** Requests older than this with no resolution get escalated to staff. */
const STUCK_HOURS = 24;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Safety net for the webhook that never arrived.
 *
 * Asks the gateway what actually happened to top-ups still unsettled, and
 * fulfils them through the same `fulfilTopupRequest` the webhook uses — so the
 * two can race and whichever wins, the customer is credited exactly once.
 *
 * Schedule every 10–15 minutes:
 *   curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/reconcile-topups
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stale = await findStaleTopups(15);
  const gateway = getGateway(activeBillingProvider);

  let reconciled = 0;
  let escalated = 0;

  for (const row of stale) {
    const ageHours = (Date.now() - new Date(row.createdAt).getTime()) / 3_600_000;

    if (gateway) {
      const status = await gateway.fetchPaymentStatus(row.id, row.providerPaymentId ?? undefined);
      if (status.status === "succeeded") {
        const result = await fulfilTopupRequest(row.id, null, {
          amountReceivedCents: status.amountReceivedCents,
          providerPaymentId: status.paymentId,
        });
        if (result) {
          reconciled++;
          await db.insert(tables.auditLogs).values({
            orgId: result.orgId,
            actorUserId: null,
            action: "topup.paid",
            metadata: {
              via: "reconciliation",
              reference: result.reference,
              credited_cents: result.creditedCents,
              note: "webhook never arrived",
            },
          });
        }
        await markTopupChecked(row.id);
        continue;
      }
      await markTopupChecked(row.id);
    }

    // Past the threshold with no resolution this is a broken integration, or
    // with manual billing simply a customer who never transferred. Either way
    // a human should look; the audit row is deduped by checking last_checked_at.
    if (ageHours > STUCK_HOURS && !row.lastCheckedAt) {
      escalated++;
      await db.insert(tables.auditLogs).values({
        orgId: row.orgId,
        actorUserId: null,
        action: "topup.stuck",
        metadata: {
          reference: row.reference,
          amount_cents: row.amountCents,
          age_hours: Math.round(ageHours),
          provider: row.provider,
        },
      });
      await markTopupChecked(row.id);
    }
  }

  return Response.json({
    checked: stale.length,
    reconciled,
    escalated,
    gateway: gateway?.name ?? "none (manual settlement)",
  });
}
