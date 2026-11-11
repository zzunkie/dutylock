import "server-only";

// Per-instance memory. The source of truth for money is PayPal; the signed quote travels with the browser.
// This only keeps a short event feed (webhooks, settlement results) and the AI rate limit.

type Event = { at: string; orderId?: string; type: string; summary: string };

type State = { events: Event[]; calls: Map<string, number[]>; shipments: Map<string, { carrier: string; tracking: string }> };
const g = globalThis as unknown as { __dutylock?: State };
const state: State = (g.__dutylock ??= { events: [], calls: new Map(), shipments: new Map() });

export function logEvent(e: Omit<Event, "at">) {
  state.events.unshift({ ...e, at: new Date().toISOString() });
  state.events.length = Math.min(state.events.length, 200);
}

export const events = (orderId?: string) => (orderId ? state.events.filter((e) => e.orderId === orderId) : state.events);

export function rememberShipment(orderId: string, s: { carrier: string; tracking: string }) {
  state.shipments.set(orderId, s);
}
export const shipmentFor = (orderId: string) => state.shipments.get(orderId);

/** Sliding one-hour window per client key. Returns false when the caller is over the limit. */
export function allowAiCall(key: string): boolean {
  const limit = Number(process.env.AI_CALLS_PER_HOUR ?? 30);
  const now = Date.now();
  const recent = (state.calls.get(key) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= limit) {
    state.calls.set(key, recent);
    return false;
  }
  recent.push(now);
  state.calls.set(key, recent);
  return true;
}

export function clientKey(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}
