import { getOrder, PayPalError } from "@/lib/paypal";
import { events, shipmentFor } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  try {
    const order = await getOrder(id);
    return Response.json({ order, shipment: shipmentFor(id) ?? null, events: events(id) });
  } catch (e) {
    const err = e as PayPalError;
    return Response.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
