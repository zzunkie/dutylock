import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getLine, mfnDuty, parseRate } from "./hts";
import { additionalDutiesFor, clearanceFees } from "./duty-rules";
import type { Quote } from "./quote";

// Demo stand-in for the carrier: after "customs" assesses the parcel under a chosen HTS line,
// it issues the duties & taxes invoice the seller would receive under Delivered Duty Paid terms.
// The carrier ("Meridian Express") is fictional.

const round = (n: number) => Math.round(n * 100) / 100;

export function assess(quote: Quote, hts: string) {
  const line = getLine(hts);
  if (!line) throw new Error(`Unknown HTS line ${hts}`);
  const goods = quote.goods;
  const mfn = round(mfnDuty(parseRate(line.general), { value: goods, weightKg: quote.listing.weightKg, quantity: quote.listing.quantity }));
  const additional = additionalDutiesFor(quote.listing.origin, line.code, goods > 0 ? mfn / goods : 0).map((a) => ({ label: a.label, amount: round(a.rate * goods) }));
  const fees = clearanceFees(goods).map((f) => ({ label: f.label, amount: round(f.amount) }));
  const total = round(mfn + additional.reduce((s, a) => s + a.amount, 0) + fees.reduce((s, f) => s + f.amount, 0));
  return { line, mfn, additional, fees, total };
}

export async function customsBillPdf(input: {
  quote: Quote;
  hts: string;
  orderId: string;
  tracking: string;
  sellerName: string;
  sellerPlace: string;
}) {
  const { quote } = input;
  const a = assess(quote, input.hts);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.16);
  const grey = rgb(0.42, 0.45, 0.5);
  let y = 790;
  const text = (s: string, x: number, size = 10, f = font, color = ink) => page.drawText(s, { x, y, size, font: f, color });
  const money = (n: number) => `$${n.toFixed(2)}`;

  text("MERIDIAN EXPRESS", 48, 18, bold);
  text("Duties & Taxes Invoice", 400, 12, bold);
  y -= 18;
  text("Import clearance on your behalf (Delivered Duty Paid)", 48, 9, font, grey);
  y -= 34;

  const today = new Date().toISOString().slice(0, 10);
  const entry = `M7X-${String(Math.abs(hash(input.orderId)) % 10_000_000).padStart(7, "0")}-${Math.abs(hash(input.tracking)) % 10}`;
  const meta: Array<[string, string]> = [
    ["Invoice date", today],
    ["Air waybill", input.tracking],
    ["CBP entry no.", entry],
    ["Entry type", "11 (informal)"],
    ["Bill to (shipper)", `${input.sellerName}, ${input.sellerPlace}`],
    ["Country of origin", quote.listing.origin],
    ["Shipper reference", input.orderId],
  ];
  for (const [k, v] of meta) {
    text(k, 48, 9, font, grey);
    text(v, 170, 10);
    y -= 16;
  }
  y -= 18;
  page.drawLine({ start: { x: 48, y: y + 8 }, end: { x: 547, y: y + 8 }, thickness: 0.6, color: grey });
  text("Description", 48, 9, bold);
  text("HTS", 250, 9, bold);
  text("Value", 360, 9, bold);
  text("Rate", 420, 9, bold);
  text("Duty", 500, 9, bold);
  y -= 16;
  const titleLines = wrap(quote.listing.title, 36);
  text(titleLines[0], 48);
  text(a.line.code, 250);
  text(money(quote.goods), 360);
  text(a.line.general || "Free", 420);
  text(money(a.mfn), 500);
  for (const extra of titleLines.slice(1)) {
    y -= 12;
    text(extra, 48);
  }
  y -= 18;
  for (const ad of a.additional) {
    for (const [i, part] of wrap(`Additional duty: ${ad.label}`, 78).entries()) {
      text(part, 48, 9, font, grey);
      if (i === 0) text(money(ad.amount), 500);
      y -= 13;
    }
  }
  for (const f of a.fees) {
    text(f.label, 48, 9, font, grey);
    text(money(f.amount), 500);
    y -= 14;
  }
  y -= 8;
  page.drawLine({ start: { x: 48, y: y + 8 }, end: { x: 547, y: y + 8 }, thickness: 0.6, color: grey });
  y -= 8;
  text("TOTAL DUE (USD)", 360, 11, bold);
  text(money(a.total), 500, 11, bold);
  y -= 40;
  text("Duties assessed by U.S. Customs and Border Protection on the entry above and advanced by Meridian Express.", 48, 8, font, grey);
  y -= 12;
  text("Payable by the shipper under DDP terms. This invoice is a demonstration document for DutyLock.", 48, 8, font, grey);

  return { bytes: Buffer.from(await pdf.save()), assessment: a, entry };
}

function wrap(s: string, width: number) {
  const out: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    if ((line + " " + word).trim().length > width && line) {
      out.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) out.push(line);
  return out;
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
