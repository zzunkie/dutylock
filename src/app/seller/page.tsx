"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Quote } from "@/lib/quote";
import type { PayPalOrder } from "@/lib/paypal";
import type { Bill } from "@/lib/bill";
import { formatHts, money } from "@/lib/format";
import { loadOrders, type LocalOrder } from "@/lib/local-orders";
import { MoneyBar } from "@/components/MoneyBar";

type Check = { ok: boolean; level: "block" | "warn" | "info"; text: string };
type Proposal = { captureAmount: number; assessed: number; hold: number; released: number; sellerAbsorbs: number; tracking: string; carrier: string };
type ReadResult = { bill: Bill; checks: Check[]; blocked: boolean; proposal: Proposal; proposalToken: string | null };

function decodeQuote(token: string): Quote | null {
  try {
    const body = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0)))) as Quote;
  } catch {
    return null;
  }
}

// Orders live in this browser's storage, so the console renders on the client only.
const ClientConsole = dynamic(() => Promise.resolve(SellerConsole), { ssr: false });

export default function SellerPage() {
  return (
    <Suspense>
      <ClientConsole />
    </Suspense>
  );
}

function SellerConsole() {
  const params = useSearchParams();
  const [orders] = useState<LocalOrder[]>(() => loadOrders());
  const [selected, setSelected] = useState<string | null>(() => params.get("order") ?? orders[0]?.orderId ?? null);

  const current = orders.find((o) => o.orderId === selected) ?? null;

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 md:grid-cols-[240px_1fr]">
      <aside>
        <h1 className="text-lg font-semibold">Seller console</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted">Orders placed from this browser.</p>
        <ul className="mt-5 space-y-1 text-sm">
          {orders.map((o) => (
            <li key={o.orderId}>
              <button
                type="button"
                onClick={() => setSelected(o.orderId)}
                className={`w-full rounded-md px-3 py-2 text-left ${o.orderId === selected ? "bg-surface font-medium" : "hover:bg-surface"}`}
              >
                <span className="block truncate">{o.title}</span>
                <span className="block font-mono text-[11px] text-muted">{o.orderId}</span>
              </button>
            </li>
          ))}
          {orders.length === 0 && (
            <li className="text-muted">
              No orders yet. <Link href="/shop" className="underline">Buy something in the demo shop</Link> first.
            </li>
          )}
        </ul>
      </aside>
      <section>{current ? <OrderSettlement key={current.orderId} order={current} /> : null}</section>
    </div>
  );
}

function OrderSettlement({ order }: { order: LocalOrder }) {
  const quote = useMemo(() => decodeQuote(order.token), [order.token]);
  const [pp, setPp] = useState<PayPalOrder | null>(null);
  const [tracking, setTracking] = useState(() => `MX${Math.floor(100000000 + Math.random() * 899999999)}`);
  const [hts, setHts] = useState(() => quote?.lines.find((l) => l.role === "most_likely")?.hts ?? "");
  const [bill, setBill] = useState<{ blob: Blob; url: string; name: string } | null>(null);
  const [read, setRead] = useState<ReadResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<Array<{ at: string; type: string; summary: string }>>([]);

  const [tick, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);

  useEffect(() => {
    let alive = true;
    fetch(`/api/orders/${order.orderId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((j) => {
        if (!alive || !j) return;
        setPp(j.order);
        setEvents(j.events ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [order.orderId, tick]);

  if (!quote) return <p className="text-danger">This order’s quote could not be read.</p>;
  const auth = pp?.purchase_units[0].payments?.authorizations?.[0];
  const captures = pp?.purchase_units[0].payments?.captures ?? [];
  const captured = captures.reduce((s, c) => s + Number(c.amount.value), 0);
  const open = auth && (auth.status === "CREATED" || auth.status === "PENDING");

  const simulate = async () => {
    setBusy("customs");
    setError(null);
    setRead(null);
    const res = await fetch(`/api/orders/${order.orderId}/customs-bill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: order.token, hts, tracking, carrier: "Meridian Express" }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Could not simulate customs");
    } else {
      const blob = await res.blob();
      if (bill) URL.revokeObjectURL(bill.url);
      setBill({ blob, url: URL.createObjectURL(blob), name: `duties-invoice-${tracking}.pdf` });
    }
    setBusy(null);
    refresh();
  };

  const upload = (file: File | undefined) => {
    if (!file) return;
    if (bill) URL.revokeObjectURL(bill.url);
    setBill({ blob: file, url: URL.createObjectURL(file), name: file.name });
    setRead(null);
  };

  const readBill = async () => {
    if (!bill) return;
    setBusy("read");
    setError(null);
    const fd = new FormData();
    fd.set("token", order.token);
    fd.set("tracking", tracking);
    fd.set("file", new File([bill.blob], bill.name, { type: bill.blob.type || "application/pdf" }));
    const res = await fetch(`/api/orders/${order.orderId}/settle?step=read`, { method: "POST", body: fd });
    const j = await res.json();
    if (!res.ok) setError(j.error ?? "Could not read the bill");
    else setRead(j);
    setBusy(null);
    refresh();
  };

  const capture = async () => {
    if (!read?.proposalToken) return;
    setBusy("capture");
    setError(null);
    const res = await fetch(`/api/orders/${order.orderId}/settle?step=capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposal: read.proposalToken }),
    });
    const j = await res.json();
    if (!res.ok) setError(j.error ?? "Capture failed");
    setBusy(null);
    refresh();
  };

  return (
    <div className="space-y-10">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">{quote.listing.title}</h2>
        <p className="mt-1 text-sm text-muted">
          PayPal order <span className="font-mono">{order.orderId}</span> · authorization {auth ? `${auth.id} (${auth.status.toLowerCase()})` : "loading"} ·{" "}
          <Link href={`/orders/${order.orderId}`} className="underline">
            buyer’s view
          </Link>
        </p>
        <div className="mt-6">
          {captured > 0 ? (
            <MoneyBar
              segments={[
                { label: "Captured", amount: captured, tone: "ink" },
                { label: "Released to buyer", amount: Number(auth?.amount.value ?? 0) - captured, tone: "release" },
              ]}
            />
          ) : (
            <MoneyBar
              segments={[
                { label: "Item + shipping", amount: quote.goods + quote.shipping, tone: "ink" },
                { label: "Likely duties + fees", amount: quote.expectedDuty + quote.feesTotal, tone: "ink-soft" },
                { label: "Extra hold", amount: quote.maxDuty - quote.expectedDuty, tone: "hold" },
              ]}
            />
          )}
        </div>
      </header>

      <Stage n="1" title="Ship the parcel" done={Boolean(bill) || captured > 0}>
        <label className="block max-w-sm text-sm">
          <span className="text-muted">Air waybill (Meridian Express, demo carrier)</span>
          <input value={tracking} onChange={(e) => setTracking(e.target.value)} className="mt-1 w-full rounded-md border border-line px-3 py-2 font-mono text-sm" />
        </label>
      </Stage>

      <Stage n="2" title="Customs clears it and the carrier bills you" done={Boolean(bill)}>
        <p className="text-sm text-muted">
          In production the carrier’s duty invoice arrives by email. In this demo, choose the line US customs applies and generate that invoice, or upload a real one.
        </p>
        <fieldset className="mt-4 space-y-2 text-sm" disabled={!open || busy !== null}>
          {quote.lines.map((l) => (
            <label key={l.hts} className="flex cursor-pointer items-baseline gap-3">
              <input type="radio" name="hts" checked={hts === l.hts} onChange={() => setHts(l.hts)} />
              <span className="font-mono text-[13px]">{formatHts(l.hts)}</span>
              <span className="text-muted">{l.role === "most_likely" ? "most likely" : "alternative"}</span>
              <span className="tabular ml-auto">{money(l.duty + quote.feesTotal)}</span>
            </label>
          ))}
        </fieldset>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <button type="button" onClick={simulate} disabled={!open || busy !== null} className="rounded-md bg-ink px-4 py-2 font-medium text-white disabled:opacity-40">
            {busy === "customs" ? "Clearing customs…" : "Simulate customs clearance"}
          </button>
          <label className="cursor-pointer rounded-md border border-line px-4 py-2">
            Upload a bill
            <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          {bill && (
            <a href={bill.url} target="_blank" rel="noreferrer" className="underline">
              Open {bill.name}
            </a>
          )}
        </div>
      </Stage>

      <Stage n="3" title="Claude reads the bill, code checks it" done={Boolean(read)}>
        <button type="button" onClick={readBill} disabled={!bill || !open || busy !== null} className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
          {busy === "read" ? "Reading the bill…" : "Read and check the bill"}
        </button>
        {read && (
          <div className="rise mt-5 space-y-4 text-sm">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Read from the bill by Claude</h4>
            <table className="w-full">
              <tbody>
                <BillRow k="Carrier" v={read.bill.carrier} />
                <BillRow k="Air waybill" v={read.bill.tracking_number} mono />
                <BillRow k="CBP entry" v={read.bill.entry_number} mono />
                {read.bill.lines.map((l, i) => (
                  <BillRow key={i} k={`Duty on ${l.hts}`} v={money(l.duty)} />
                ))}
                {read.bill.additional_duties.map((a, i) => (
                  <BillRow key={`a${i}`} k={a.label} v={money(a.amount)} />
                ))}
                {read.bill.fees.map((f, i) => (
                  <BillRow key={`f${i}`} k={f.label} v={money(f.amount)} />
                ))}
                <BillRow k="Total due" v={money(read.bill.total_due)} strong />
              </tbody>
            </table>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Checked in code before anything is charged</h4>
              <ul className="mt-2 space-y-2">
                {read.checks.map((c, i) => (
                  <li key={i} className={`flex gap-2.5 ${c.level === "block" ? "text-danger" : c.level === "warn" ? "text-hold" : "text-ink"}`}>
                    <span
                      aria-hidden
                      className={`mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
                        c.level === "block" ? "bg-danger" : c.level === "warn" ? "bg-hold" : "bg-release"
                      }`}
                    >
                      {c.level === "block" ? "✕" : c.level === "warn" ? "!" : "✓"}
                    </span>
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            {read.bill.reader_notes && (
              <p className="text-[13px] leading-relaxed text-muted">
                <span className="font-medium">Note from the reader:</span> {read.bill.reader_notes}
              </p>
            )}
          </div>
        )}
      </Stage>

      <Stage n="4" title="Approve the capture" done={captured > 0}>
        {captured > 0 ? (
          <p className="text-sm">
            PayPal captured <span className="tabular font-medium">{money(captured)}</span> with final_capture; the rest of the authorization was released
            and the tracking number was attached to the capture.
          </p>
        ) : read && !read.blocked ? (
          <div className="space-y-3 text-sm">
            <p>
              Capture <span className="tabular font-semibold">{money(read.proposal.captureAmount)}</span> (item, shipping and{" "}
              {money(Math.min(read.proposal.assessed, read.proposal.hold))} assessed duties). Release{" "}
              <span className="tabular font-semibold text-release">{money(read.proposal.released)}</span> back to the buyer.
              {read.proposal.sellerAbsorbs > 0 && <> You cover {money(read.proposal.sellerAbsorbs)} above the hold.</>}
            </p>
            <button type="button" onClick={capture} disabled={busy !== null} className="rounded-md bg-release px-4 py-2 font-medium text-white disabled:opacity-40">
              {busy === "capture" ? "Capturing with PayPal…" : `Capture ${money(read.proposal.captureAmount)}`}
            </button>
          </div>
        ) : read?.blocked ? (
          <p className="text-sm text-danger">Resolve the blocked checks before capturing. Nothing has been charged.</p>
        ) : (
          <p className="text-sm text-muted">Available after the bill is read and checked.</p>
        )}
      </Stage>

      {error && <p className="text-sm text-danger">{error}</p>}

      {events.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Activity</h3>
          <ul className="mt-3 space-y-1 font-mono text-xs text-muted">
            {events.map((e, i) => (
              <li key={i}>
                {new Date(e.at).toISOString().slice(11, 19)} {e.summary}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stage({ title, done, children }: { n?: string; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[28px_1fr] gap-3">
      <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs ${done ? "bg-ink text-white" : "border border-line text-muted"}`}>
        {done ? "✓" : ""}
      </span>
      <div>
        <h3 className="font-medium">{title}</h3>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

function BillRow({ k, v, mono, strong }: { k: string; v: string; mono?: boolean; strong?: boolean }) {
  return (
    <tr className="border-b border-line">
      <td className="py-1.5 pr-4 text-muted">{k}</td>
      <td className={`py-1.5 text-right ${mono ? "font-mono text-[13px]" : ""} ${strong ? "font-semibold" : ""}`}>{v || "—"}</td>
    </tr>
  );
}
