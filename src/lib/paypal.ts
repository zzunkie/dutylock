import "server-only";

// Thin PayPal REST client (sandbox). Every money movement in DutyLock goes through here:
// create an AUTHORIZE order with the duty ceiling, authorize it after buyer approval,
// capture only the amount customs actually assessed (final_capture releases the rest),
// and attach the shipment tracking number to the capture.

const BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

export type Money = { currency_code: string; value: string };

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: unknown,
    readonly debugId?: string,
  ) {
    super(message);
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new PayPalError("PayPal credentials are not configured", 500, null);
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new PayPalError("PayPal authentication failed", res.status, await res.text());
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function call<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const token = await accessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (idempotencyKey) headers["PayPal-Request-Id"] = idempotencyKey;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = json?.details?.[0]?.description ?? json?.message ?? `PayPal ${method} ${path} failed`;
    throw new PayPalError(msg, res.status, json, res.headers.get("paypal-debug-id") ?? undefined);
  }
  return json as T;
}

export const usd = (n: number): Money => ({ currency_code: "USD", value: n.toFixed(2) });

export type OrderItem = {
  name: string;
  unit_amount: Money;
  quantity: string;
  sku?: string;
  description?: string;
  category?: "PHYSICAL_GOODS" | "DIGITAL_GOODS";
};

export type PayPalOrder = {
  id: string;
  status: string;
  create_time?: string;
  purchase_units: Array<{
    reference_id?: string;
    custom_id?: string;
    invoice_id?: string;
    description?: string;
    amount: Money & { breakdown?: Record<string, Money> };
    items?: OrderItem[];
    shipping?: { name?: { full_name?: string }; address?: Record<string, string> };
    payments?: {
      authorizations?: Authorization[];
      captures?: Capture[];
    };
  }>;
  payer?: { name?: { given_name?: string; surname?: string }; email_address?: string };
};

export type Authorization = {
  id: string;
  status: string; // CREATED | CAPTURED | PARTIALLY_CAPTURED | VOIDED | EXPIRED | DENIED | PENDING
  amount: Money;
  expiration_time?: string;
  create_time?: string;
  update_time?: string;
};

export type Capture = {
  id: string;
  status: string;
  amount: Money;
  final_capture?: boolean;
  create_time?: string;
  seller_receivable_breakdown?: Record<string, Money>;
};

export function createAuthorizeOrder(input: {
  referenceId: string;
  customId: string;
  description: string;
  items: OrderItem[];
  itemTotal: number;
  shipping: number;
  brandName: string;
}) {
  const total = input.itemTotal + input.shipping;
  return call<PayPalOrder>(
    "POST",
    "/v2/checkout/orders",
    {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          custom_id: input.customId,
          description: input.description,
          amount: {
            ...usd(total),
            breakdown: { item_total: usd(input.itemTotal), shipping: usd(input.shipping) },
          },
          items: input.items,
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: input.brandName,
            shipping_preference: "GET_FROM_FILE",
            user_action: "CONTINUE",
          },
        },
      },
    },
    `create-${input.referenceId}`,
  );
}

export const getOrder = (id: string) => call<PayPalOrder>("GET", `/v2/checkout/orders/${encodeURIComponent(id)}`);

export const authorizeOrder = (id: string) =>
  call<PayPalOrder>("POST", `/v2/checkout/orders/${encodeURIComponent(id)}/authorize`, {}, `authorize-${id}`);

export const getAuthorization = (id: string) =>
  call<Authorization>("GET", `/v2/payments/authorizations/${encodeURIComponent(id)}`);

export function captureAuthorization(
  authorizationId: string,
  input: { amount: number; invoiceId: string; noteToPayer: string },
) {
  return call<Capture>(
    "POST",
    `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`,
    {
      amount: usd(input.amount),
      final_capture: true,
      invoice_id: input.invoiceId,
      note_to_payer: input.noteToPayer.slice(0, 255),
    },
    `capture-${authorizationId}`,
  );
}

export const voidAuthorization = (id: string) =>
  call<Authorization>("POST", `/v2/payments/authorizations/${encodeURIComponent(id)}/void`, {}, `void-${id}`);

export function addTracking(orderId: string, input: { captureId: string; trackingNumber: string; carrier: string }) {
  const known = ["DHL", "FEDEX", "UPS", "USPS"];
  const carrier = known.includes(input.carrier.toUpperCase()) ? input.carrier.toUpperCase() : "OTHER";
  return call<PayPalOrder>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/track`, {
    capture_id: input.captureId,
    tracking_number: input.trackingNumber,
    carrier,
    ...(carrier === "OTHER" ? { carrier_name_other: input.carrier } : {}),
    notify_payer: false,
  });
}

export function verifyWebhookSignature(headers: Headers, event: unknown) {
  return call<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: process.env.PAYPAL_WEBHOOK_ID,
    webhook_event: event,
  });
}
