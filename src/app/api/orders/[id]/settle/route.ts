import { readBill, type Bill } from "@/lib/bill";
import { addTracking, captureAuthorization, getOrder, PayPalError } from "@/lib/paypal";
import { sign, verify, verifyQuote, type Quote } from "@/lib/quote";
import { getLine, normalize } from "@/lib/hts";
import { allowAiCall, clientKey, logEvent, shipmentFor } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 120;

// Settlement in two steps so a person approves before money moves:
//   read:    Claude transcribes the carrier's duty bill; code checks it against the quote and the hold.
//   capture: PayPal captures goods + shipping + the assessed duties (never more than the hold) with
//            final_capture, which releases the rest of the authorization. Tracking is then attached.

type Check = { ok: boolean; level: "block" | "warn" | "info"; text: string };

type Proposal = {
  orderId: string;
  authorizationId: string;
  quoteId: string;
  captureAmount: number;
  assessed: number;
  hold: number;
  released: number;
  sellerAbsorbs: number;
  tracking: string;
  carrier: string;
  appliedHts: string[];
};

const round = (n: number) => Math.round(n * 100) / 100;

function check(bill: Bill, quote: Quote, tracking: string | undefined): Check[] {
  const checks: Check[] = [];
  checks.push(
    bill.is_customs_duty_bill
      ? { ok: true, level: "info", text: "Document is an import duties bill." }
      : { ok: false, level: "block", text: "This does not look like an import duties bill." },
  );
  const sum = round(
    bill.lines.reduce((s, l) => s + l.duty, 0) +
      bill.additional_duties.reduce((s, a) => s + a.amount, 0) +
      bill.fees.reduce((s, f) => s + f.amount, 0),
  );
  checks.push(
    Math.abs(sum - bill.total_due) <= 0.02
      ? { ok: true, level: "info", text: `Line items add up to the total ($${bill.total_due.toFixed(2)}).` }
      : { ok: false, level: "block", text: `Line items add up to $${sum.toFixed(2)} but the bill says $${bill.total_due.toFixed(2)}.` },
  );
  if (tracking) {
    const same = normalize(bill.tracking_number) !== "" && bill.tracking_number.replace(/\s/g, "").toUpperCase() === tracking.replace(/\s/g, "").toUpperCase();
    checks.push(
      same
        ? { ok: true, level: "info", text: `Air waybill ${bill.tracking_number} matches this order's shipment.` }
        : { ok: false, level: "block", text: `Air waybill on the bill (${bill.tracking_number || "none"}) is not this order's shipment (${tracking}).` },
    );
  }
  const candidates = new Set(quote.lines.map((l) => normalize(l.hts).slice(0, 8)));
  for (const l of bill.lines) {
    const known = getLine(l.hts);
    const anticipated = candidates.has(normalize(l.hts).slice(0, 8));
    checks.push(
      anticipated
        ? { ok: true, level: "info", text: `Customs used ${l.hts}, one of the lines we held for.` }
        : {
            ok: true,
            level: "warn",
            text: known
              ? `Customs used ${l.hts}, which we did not anticipate. Worth a protest review if the rate is higher.`
              : `Customs used ${l.hts}, which is outside the chapters this demo loads.`,
          },
    );
  }
  const value = bill.lines.reduce((s, l) => s + l.customs_value, 0);
  if (Math.abs(value - quote.goods) > 1) {
    checks.push({ ok: true, level: "warn", text: `Customs value $${value.toFixed(2)} differs from the order value $${quote.goods.toFixed(2)}.` });
  }
  if (bill.total_due > quote.holdDuties + 0.005) {
    checks.push({
      ok: true,
      level: "warn",
      text: `Assessed $${bill.total_due.toFixed(2)} is above the $${quote.holdDuties.toFixed(2)} hold. We capture the hold; the seller covers $${(bill.total_due - quote.holdDuties).toFixed(2)}.`,
    });
  }
  if (bill.reader_notes) checks.push({ ok: true, level: "warn", text: `Reader note: ${bill.reader_notes}` });
  return checks;
}

export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/settle">) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const step = url.searchParams.get("step");

  if (step === "capture") {
    const { proposal: token } = (await req.json().catch(() => ({}))) as { proposal?: string };
    const p = token ? verify<Proposal>("proposal", token) : null;
    if (!p || p.orderId !== id) return Response.json({ error: "Settlement proposal is missing or was changed." }, { status: 400 });
    try {
      const capture = await captureAuthorization(p.authorizationId, {
        amount: p.captureAmount,
        invoiceId: `DL-${p.quoteId}-${id.slice(-6)}`,
        noteToPayer: `US customs assessed $${p.assessed.toFixed(2)} in duties and fees. Your hold for duties was $${p.hold.toFixed(2)}; $${p.released.toFixed(2)} has been released.`,
      });
      logEvent({ orderId: id, type: "capture.completed", summary: `Captured $${capture.amount.value}; released $${p.released.toFixed(2)}` });
      let tracked = false;
      try {
        await addTracking(id, { captureId: capture.id, trackingNumber: p.tracking, carrier: p.carrier });
        tracked = true;
        logEvent({ orderId: id, type: "tracking.added", summary: `Tracking ${p.tracking} attached in PayPal` });
      } catch (e) {
        logEvent({ orderId: id, type: "tracking.failed", summary: `Tracking not attached: ${(e as Error).message}` });
      }
      const order = await getOrder(id);
      return Response.json({ capture, tracked, order });
    } catch (e) {
      const err = e as PayPalError;
      return Response.json({ error: err.message, debugId: err.debugId }, { status: err.status ?? 500 });
    }
  }

  // step=read
  const form = await req.formData().catch(() => null);
  const quote = verifyQuote(String(form?.get("token") ?? ""));
  const file = form?.get("file");
  const declaredTracking = String(form?.get("tracking") ?? "").trim();
  if (!quote || !(file instanceof File)) return Response.json({ error: "Quote and bill file are required." }, { status: 400 });
  if (file.size > 8_000_000) return Response.json({ error: "File is larger than 8 MB." }, { status: 400 });
  const mediaType = file.type || "application/pdf";
  if (!["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(mediaType)) {
    return Response.json({ error: "Upload a PDF, PNG, JPEG or WebP." }, { status: 400 });
  }
  if (!allowAiCall(clientKey(req))) return Response.json({ error: "AI call limit reached for this hour." }, { status: 429 });

  try {
    const order = await getOrder(id);
    const unit = order.purchase_units[0];
    if (unit.custom_id !== `q-${quote.id}`) return Response.json({ error: "This quote belongs to a different order." }, { status: 400 });
    const auth = unit.payments?.authorizations?.find((a) => a.status === "CREATED" || a.status === "PENDING");
    if (!auth) return Response.json({ error: "No open authorization on this order (already captured, voided or expired)." }, { status: 409 });

    const bill = await readBill({ bytes: Buffer.from(await file.arrayBuffer()), mediaType });
    const shipment = shipmentFor(id) ?? (declaredTracking ? { carrier: "", tracking: declaredTracking } : undefined);
    const checks = check(bill, quote, shipment?.tracking);
    const blocked = checks.some((c) => !c.ok && c.level === "block");

    const assessed = round(bill.total_due);
    const dutiesCharged = Math.min(assessed, quote.holdDuties);
    const captureAmount = round(quote.goods + quote.shipping + dutiesCharged);
    const proposal: Proposal = {
      orderId: id,
      authorizationId: auth.id,
      quoteId: quote.id,
      captureAmount,
      assessed,
      hold: quote.holdDuties,
      released: round(Number(auth.amount.value) - captureAmount),
      sellerAbsorbs: round(Math.max(0, assessed - quote.holdDuties)),
      tracking: bill.tracking_number || shipment?.tracking || "",
      carrier: bill.carrier || shipment?.carrier || "OTHER",
      appliedHts: bill.lines.map((l) => l.hts),
    };
    logEvent({ orderId: id, type: "bill.read", summary: `Bill read: $${assessed.toFixed(2)} assessed${blocked ? " (needs review)" : ""}` });
    return Response.json({ bill, checks, blocked, proposal, proposalToken: blocked ? null : sign("proposal", proposal) });
  } catch (e) {
    const err = e as PayPalError;
    return Response.json({ error: err.message ?? "Could not read the bill" }, { status: err.status ?? 500 });
  }
}
