import { verifyWebhookSignature } from "@/lib/paypal";
import { logEvent } from "@/lib/store";

export const runtime = "nodejs";

// PayPal webhooks (PAYMENT.AUTHORIZATION.*, PAYMENT.CAPTURE.*). Signature verified with PayPal before use.
export async function POST(req: Request) {
  const event = (await req.json().catch(() => null)) as {
    event_type?: string;
    summary?: string;
    resource?: { id?: string; status?: string; amount?: { value?: string }; supplementary_data?: { related_ids?: { order_id?: string } } };
  } | null;
  if (!event?.event_type) return Response.json({ ok: false }, { status: 400 });
  if (!process.env.PAYPAL_WEBHOOK_ID) return Response.json({ ok: false, error: "Webhook id not configured" }, { status: 503 });
  try {
    const v = await verifyWebhookSignature(req.headers, event);
    if (v.verification_status !== "SUCCESS") return Response.json({ ok: false }, { status: 401 });
  } catch {
    return Response.json({ ok: false }, { status: 401 });
  }
  const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
  logEvent({
    orderId,
    type: `webhook:${event.event_type}`,
    summary: event.summary ?? `${event.event_type} ${event.resource?.amount?.value ? `$${event.resource.amount.value}` : ""}`.trim(),
  });
  return Response.json({ ok: true });
}
