import "server-only";
import crypto from "node:crypto";
import { getLine, fullDescription, mfnDuty, parseRate } from "./hts";
import { additionalDutiesFor, clearanceFees, DUTY_TABLE_AS_OF } from "./duty-rules";
import type { Classification, ListingInput } from "./classify";

// Turns a classification into money: duty per candidate code (computed from the schedule, never by the model),
// the expected duty, and the hold = the highest duty customs could plausibly assess.

export type DutyLine = {
  hts: string;
  role: "most_likely" | "plausible_alternative";
  likelihood: string;
  description: string;
  rateText: string;
  mfn: number;
  additional: Array<{ label: string; rate: number; amount: number; source: string }>;
  duty: number;
  computable: boolean;
};

export type Quote = {
  id: string;
  productId: string | null;
  listing: ListingInput;
  classification: Classification;
  lines: DutyLine[];
  goods: number;
  shipping: number;
  fees: Array<{ label: string; amount: number; source: string }>;
  feesTotal: number;
  expectedDuty: number; // most likely code, before fees
  maxDuty: number; // highest candidate, before fees
  holdDuties: number; // maxDuty + fees: what the buyer authorizes on top of goods and shipping
  holdTotal: number; // goods + shipping + holdDuties
  expectedTotal: number;
  dutyTableAsOf: string;
  createdAt: string;
};

const round = (n: number) => Math.round(n * 100) / 100;

export function buildQuote(input: {
  productId: string | null;
  listing: ListingInput;
  classification: Classification;
  shipping: number;
}): Quote {
  const { listing, classification } = input;
  const goods = round(listing.value * listing.quantity);
  const lines: DutyLine[] = classification.candidates.map((c) => {
    const line = getLine(c.hts)!;
    const rate = parseRate(line.general);
    const mfn = round(mfnDuty(rate, { value: goods, weightKg: listing.weightKg, quantity: listing.quantity }));
    const additional = additionalDutiesFor(listing.origin, line.code, goods > 0 ? mfn / goods : 0).map((a) => ({
      ...a,
      amount: round(a.rate * goods),
    }));
    const duty = round(mfn + additional.reduce((s, a) => s + a.amount, 0));
    return {
      hts: line.code,
      role: c.role,
      likelihood: c.likelihood,
      description: fullDescription(line),
      rateText: line.general,
      mfn,
      additional,
      duty,
      computable: rate.parsed,
    };
  });
  const fees = clearanceFees(goods).map((f) => ({ ...f, amount: round(f.amount) }));
  const feesTotal = round(fees.reduce((s, f) => s + f.amount, 0));
  const expectedDuty = lines.find((l) => l.role === "most_likely")?.duty ?? 0;
  const maxDuty = Math.max(...lines.map((l) => l.duty));
  const holdDuties = round(maxDuty + feesTotal);
  return {
    id: crypto.randomUUID().slice(0, 8),
    productId: input.productId,
    listing,
    classification,
    lines,
    goods,
    shipping: round(input.shipping),
    fees,
    feesTotal,
    expectedDuty,
    maxDuty,
    holdDuties,
    holdTotal: round(goods + input.shipping + holdDuties),
    expectedTotal: round(goods + input.shipping + expectedDuty + feesTotal),
    dutyTableAsOf: DUTY_TABLE_AS_OF,
    createdAt: new Date().toISOString(),
  };
}

// Quotes travel with the browser (no database). They are signed so the browser cannot lower a hold
// or change the codes the settlement step will accept.

function secret() {
  const s = process.env.QUOTE_SIGNING_SECRET;
  if (!s) throw new Error("QUOTE_SIGNING_SECRET is not set");
  return s;
}

export function sign(kind: string, payload: unknown): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret()).update(`${kind}.${body}`).digest("base64url");
  return `${body}.${mac}`;
}

export function verify<T>(kind: string, token: string): T | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", secret()).update(`${kind}.${body}`).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
}

export const signQuote = (q: Quote) => sign("quote", q);
export const verifyQuote = (token: string) => verify<Quote>("quote", token);
