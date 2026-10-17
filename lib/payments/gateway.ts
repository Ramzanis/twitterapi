/**
 * Payment gateway seam.
 *
 * Nothing here talks to Stripe or Revolut yet — it defines the two things a
 * gateway has to answer so the webhook route and the reconciliation job can be
 * written, tested and reasoned about now. Implementing a provider means
 * filling in one object; no caller changes.
 */

export interface GatewayEvent {
  /** The provider's own event id (evt_…). Dedupe key for retried deliveries. */
  eventId: string;
  eventType: string;
  /** Our topup_requests.id, echoed back via metadata. */
  topupRequestId?: string;
  /** The provider's payment id (pi_…). */
  paymentId?: string;
  /** What was actually captured, in cents. Credit this, never the request. */
  amountReceivedCents?: number;
  currency?: string;
  /**
   * Terminal success only. Never true for `created` or `processing` — bank
   * transfers and SEPA debits sit in-flight for days and must not credit yet.
   */
  succeeded: boolean;
  /** True while money is moving but has not settled. */
  processing: boolean;
}

export interface PaymentStatus {
  status: "pending" | "processing" | "succeeded" | "failed" | "unknown";
  amountReceivedCents?: number;
  paymentId?: string;
}

export interface PaymentGateway {
  name: "stripe" | "revolut";
  /**
   * Verify the signature over the RAW request body and parse it. Must return
   * null when the signature does not check out — an unverified body is just a
   * string a stranger sent us.
   */
  verifyAndParse(rawBody: string, headers: Headers): Promise<GatewayEvent | null>;
  /** Ask the gateway what really happened, for the reconciliation sweep. */
  fetchPaymentStatus(topupRequestId: string, paymentId?: string): Promise<PaymentStatus>;
}

/**
 * No gateway is configured yet, so payments are settled by hand from the admin
 * console. Returning null here makes the webhook route reject everything, which
 * is the safe default: better to accept no payments than to credit unverified ones.
 */
export function getGateway(_provider: string): PaymentGateway | null {
  return null;
}

/*
 * Implementing Stripe, for reference:
 *
 *   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
 *
 *   verifyAndParse(rawBody, headers) {
 *     const event = stripe.webhooks.constructEvent(       // throws if forged
 *       rawBody,
 *       headers.get("stripe-signature")!,
 *       process.env.STRIPE_WEBHOOK_SECRET!,
 *     );
 *     const pi = event.data.object as Stripe.PaymentIntent;
 *     return {
 *       eventId: event.id,
 *       eventType: event.type,
 *       topupRequestId: pi.metadata?.topup_request_id,
 *       paymentId: pi.id,
 *       amountReceivedCents: pi.amount_received,
 *       currency: pi.currency,
 *       succeeded: event.type === "payment_intent.succeeded",
 *       processing: event.type === "payment_intent.processing",
 *     };
 *   }
 *
 * Set `metadata.topup_request_id` when creating the PaymentIntent — that is
 * what ties the gateway's payment back to our row.
 */
