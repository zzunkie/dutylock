"use client";

import { useEffect, useRef, useState } from "react";

type PayPalNamespace = {
  Buttons: (opts: {
    style?: Record<string, string | number>;
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onError?: (err: unknown) => void;
    onCancel?: () => void;
  }) => { render: (el: HTMLElement) => Promise<void>; close?: () => void };
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

let loader: Promise<void> | null = null;

function loadSdk(clientId: string) {
  if (window.paypal) return Promise.resolve();
  loader ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=authorize&components=buttons&disable-funding=paylater,venmo&locale=en_US`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("PayPal SDK failed to load"));
    document.head.appendChild(s);
  });
  return loader;
}

export function PayPalButton(props: {
  createOrder: () => Promise<string>;
  onApprove: (orderId: string) => Promise<void>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const handlers = useRef(props);
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

  useEffect(() => {
    handlers.current = props;
  });

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    let instance: { close?: () => void } | null = null;
    loadSdk(clientId)
      .then(() => {
        if (cancelled || !ref.current || !window.paypal) return;
        ref.current.innerHTML = "";
        const b = window.paypal.Buttons({
          style: { layout: "vertical", shape: "rect", label: "pay", height: 44 },
          createOrder: () => handlers.current.createOrder(),
          onApprove: async (data) => {
            await handlers.current.onApprove(data.orderID);
          },
          onError: (err) => setError(err instanceof Error ? err.message : "PayPal could not complete the payment."),
        });
        instance = b;
        return b.render(ref.current);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
      instance?.close?.();
    };
  }, [clientId]);

  if (!clientId) return <p className="text-sm text-danger">PayPal client id is not configured.</p>;

  return (
    <div>
      <div ref={ref} className="min-h-12" />
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
