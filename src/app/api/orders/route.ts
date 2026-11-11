import { createAuthorizeOrder, PayPalError, usd } from "@/lib/paypal";
import { verifyQuote } from "@/lib/quote";
import { getProduct } from "@/lib/catalog";
import { logEvent } from "@/lib/store";

export const runtime = "nodejs";

// Creates the PayPal order with intent AUTHORIZE. The duty line is the ceiling, not the charge.
export async function POST(req: Request) {
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  const quote = token ? verifyQuote(token) : null;
  if (!quote) return Response.json({ error: "Quote is missing or was changed." }, { status: 400 });

  const product = quote.productId ? getProduct(quote.productId) : undefined;
  const likely = quote.lines.find((l) => l.role === "most_likely");
  const expected = quote.expectedDuty + quote.feesTotal;
  try {
    const order = await createAuthorizeOrder({
      referenceId: `q-${quote.id}`,
      customId: `q-${quote.id}`,
      description: `${quote.listing.title} with US duties held at most $${quote.holdDuties.toFixed(2)}`.slice(0, 127),
      brandName: product?.maker ?? "DutyLock demo shop",
      items: [
        {
          name: quote.listing.title.slice(0, 127),
          unit_amount: usd(quote.listing.value),
          quantity: String(quote.listing.quantity),
          sku: likely ? `HTS ${likely.hts}` : undefined,
          category: "PHYSICAL_GOODS",
        },
        {
          name: "US import duties (hold, final amount set by customs)",
          unit_amount: usd(quote.holdDuties),
          quantity: "1",
          sku: `DUTY-HOLD-${quote.id}`,
          description: `Likely $${expected.toFixed(2)}. You are charged only what US customs assesses; the rest is released.`.slice(0, 127),
          category: "PHYSICAL_GOODS",
        },
      ],
      itemTotal: quote.goods + quote.holdDuties,
      shipping: quote.shipping,
    });
    logEvent({ orderId: order.id, type: "order.created", summary: `Order created: hold $${quote.holdTotal.toFixed(2)}` });
    return Response.json({ id: order.id });
  } catch (e) {
    const err = e as PayPalError;
    return Response.json({ error: err.message, debugId: err.debugId }, { status: err.status ?? 500 });
  }
}
