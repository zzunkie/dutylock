import { verifyQuote } from "@/lib/quote";
import { customsBillPdf } from "@/lib/customs-sim";
import { getProduct } from "@/lib/catalog";
import { logEvent, rememberShipment } from "@/lib/store";

export const runtime = "nodejs";

// Demo only: simulates US customs assessing the parcel under a chosen line and the carrier billing the seller.
export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/customs-bill">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { token?: string; hts?: string; tracking?: string; carrier?: string };
  const quote = body.token ? verifyQuote(body.token) : null;
  if (!quote || !body.hts) return Response.json({ error: "Quote and HTS line are required." }, { status: 400 });
  const tracking = (body.tracking || "").trim() || `MX${Date.now().toString().slice(-9)}`;
  rememberShipment(id, { carrier: body.carrier || "Meridian Express", tracking });
  const product = quote.productId ? getProduct(quote.productId) : undefined;
  try {
    const { bytes, assessment } = await customsBillPdf({
      quote,
      hts: body.hts,
      orderId: id,
      tracking,
      sellerName: product?.maker ?? "Demo seller",
      sellerPlace: product ? `${product.place}, ${product.originName}` : quote.listing.origin,
    });
    logEvent({ orderId: id, type: "customs.assessed", summary: `Customs assessed ${assessment.line.code}: $${assessment.total.toFixed(2)}` });
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="duties-invoice-${tracking}.pdf"`,
        "X-Tracking": tracking,
      },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not create the bill" }, { status: 400 });
  }
}
