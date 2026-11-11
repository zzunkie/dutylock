import { authorizeOrder, PayPalError } from "@/lib/paypal";
import { logEvent } from "@/lib/store";

export const runtime = "nodejs";

// After the buyer approves in the PayPal window: place the hold. Nothing is captured yet.
export async function POST(_req: Request, ctx: RouteContext<"/api/orders/[id]/authorize">) {
  const { id } = await ctx.params;
  try {
    const order = await authorizeOrder(id);
    const auth = order.purchase_units[0]?.payments?.authorizations?.[0];
    if (auth) {
      logEvent({ orderId: id, type: "authorization.created", summary: `Hold placed: $${auth.amount.value} (${auth.status})` });
    }
    return Response.json({ order });
  } catch (e) {
    const err = e as PayPalError;
    return Response.json({ error: err.message, debugId: err.debugId }, { status: err.status ?? 500 });
  }
}
