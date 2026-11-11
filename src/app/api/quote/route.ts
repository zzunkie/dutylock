import fs from "node:fs";
import path from "node:path";
import { classify, type AgentEvent, type Classification, type ListingInput } from "@/lib/classify";
import { getProduct, SHIPPING_EXPRESS } from "@/lib/catalog";
import { buildQuote, signQuote } from "@/lib/quote";
import { allowAiCall, clientKey } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

type Saved = { steps: string[]; classification: Classification };

const savedPath = (id: string) => path.join(process.cwd(), "data", "precomputed", `${id}.json`);

function readSaved(id: string): Saved | null {
  try {
    return JSON.parse(fs.readFileSync(savedPath(id), "utf8")) as Saved;
  } catch {
    return null;
  }
}

function cleanListing(raw: Partial<ListingInput>): ListingInput | string {
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v));
  const listing: ListingInput = {
    title: str(raw.title, 140),
    description: str(raw.description, 1200),
    materials: str(raw.materials, 1200),
    origin: str(raw.origin, 2).toUpperCase(),
    value: num(raw.value),
    quantity: Math.max(1, Math.round(num(raw.quantity) || 1)),
    weightKg: num(raw.weightKg),
  };
  if (!listing.title || !listing.materials) return "Add a title and the materials.";
  if (!/^[A-Z]{2}$/.test(listing.origin)) return "Choose a country of origin.";
  if (!(listing.value > 0 && listing.value <= 2500)) return "Value must be between $1 and $2,500 (an informal entry).";
  if (!(listing.weightKg > 0 && listing.weightKg <= 30)) return "Weight must be between 0.01 and 30 kg.";
  return listing;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { productId?: string; listing?: Partial<ListingInput>; live?: boolean };
  const product = body.productId ? getProduct(body.productId) : undefined;
  const listingOrError = product ? product.listing : cleanListing(body.listing ?? {});
  if (typeof listingOrError === "string") return Response.json({ error: listingOrError }, { status: 400 });
  const listing = listingOrError;
  const shipping = product?.shipping ?? SHIPPING_EXPRESS;

  const saved = product && !body.live ? readSaved(product.id) : null;
  if (!saved && !allowAiCall(clientKey(req))) {
    return Response.json({ error: "This demo allows a limited number of live AI runs per hour. Try again later." }, { status: 429 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const finish = (classification: Classification, replayed: boolean) => {
        const quote = buildQuote({ productId: product?.id ?? null, listing, classification, shipping });
        send({ type: "quote", quote, token: signQuote(quote), replayed });
      };
      try {
        if (saved) {
          for (const label of saved.steps) {
            send({ type: "step", label } satisfies AgentEvent);
            await new Promise((r) => setTimeout(r, 180));
          }
          finish(saved.classification, true);
        } else {
          const steps: string[] = [];
          for await (const ev of classify(listing)) {
            if (ev.type === "step") {
              steps.push(ev.label);
              send(ev);
            } else if (ev.type === "error") {
              send(ev);
            } else {
              if (product && process.env.SAVE_PRECOMPUTED === "1") {
                fs.writeFileSync(savedPath(product.id), JSON.stringify({ steps, classification: ev.classification }, null, 2));
              }
              finish(ev.classification, false);
            }
          }
        }
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "Something went wrong" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
