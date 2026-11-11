"use client";

// Orders placed from this browser. The demo has no accounts or database: the signed quote stays here,
// and PayPal is the record of every amount.

export type LocalOrder = { orderId: string; token: string; title: string; createdAt: string };

const KEY = "dutylock.orders.v1";

export function loadOrders(): LocalOrder[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as LocalOrder[];
  } catch {
    return [];
  }
}

export function saveOrder(o: LocalOrder) {
  try {
    const all = loadOrders().filter((x) => x.orderId !== o.orderId);
    localStorage.setItem(KEY, JSON.stringify([o, ...all].slice(0, 30)));
  } catch {
    // storage unavailable (private mode); the order page still works from the URL
  }
}

export const findOrder = (orderId: string) => loadOrders().find((o) => o.orderId === orderId);
