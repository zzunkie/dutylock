import { events } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const orderId = new URL(req.url).searchParams.get("orderId") ?? undefined;
  return Response.json({ events: events(orderId).slice(0, 50) });
}
