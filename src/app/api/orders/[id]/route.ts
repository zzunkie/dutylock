import { getOrder, PayPalError } from "@/lib/paypal";
import { events, shipmentFor } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  try {
    const order = await getOrder(id);
    // Server memory is per instance; fall back to the tracker PayPal stores on the order (id is "<captureId>-<tracking>").
    const tracker = order.purchase_units[0]?.shipping?.trackers?.[0];
    const fromPayPal = tracker ? { carrier: "", tracking: tracker.id.slice(tracker.id.indexOf("-") + 1) } : null;
    return Response.json({ order, shipment: shipmentFor(id) ?? fromPayPal, events: events(id) });
  } catch (e) {
    const err = e as PayPalError;
    return Response.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
