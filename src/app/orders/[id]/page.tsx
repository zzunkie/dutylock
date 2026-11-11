"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { PayPalOrder } from "@/lib/paypal";
import { money } from "@/lib/format";
import { MoneyBar } from "@/components/MoneyBar";

type Data = { order: PayPalOrder; shipment: { carrier: string; tracking: string } | null; events: Array<{ at: string; type: string; summary: string }> };

export default function OrderPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      const res = await fetch(`/api/orders/${id}`);
      const j = await res.json();
      if (stop) return;
      if (!res.ok) setError(j.error ?? "Order not found");
      else setData(j);
    };
    void load();
    const t = setInterval(load, 6000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [id]);

  if (error) return <Shell id={id}><p className="text-danger">{error}</p></Shell>;
  if (!data) return <Shell id={id}><p className="text-muted">Loading the order from PayPal…</p></Shell>;

  const unit = data.order.purchase_units[0];
  const auth = unit.payments?.authorizations?.[0];
  const captures = unit.payments?.captures ?? [];
  const captured = captures.reduce((s, c) => s + Number(c.amount.value), 0);
  const authorized = Number(auth?.amount.value ?? unit.amount.value);
  const items = unit.items ?? [];
  const goods = items.filter((i) => !i.sku?.startsWith("DUTY-HOLD")).reduce((s, i) => s + Number(i.unit_amount.value) * Number(i.quantity), 0);
  const dutyHold = items.filter((i) => i.sku?.startsWith("DUTY-HOLD")).reduce((s, i) => s + Number(i.unit_amount.value), 0);
  const shipping = Number(unit.amount.breakdown?.shipping?.value ?? 0);
  const settled = captured > 0;
  const released = settled ? authorized - captured : 0;
  const assessedDuties = settled ? captured - goods - shipping : null;

  return (
    <Shell id={id}>
      <h1 className="text-2xl font-semibold tracking-tight">{items[0]?.name ?? "Order"}</h1>
      <p className="mt-1 text-sm text-muted">
        PayPal order {id} · {data.order.status.toLowerCase()} · authorization {auth?.status.toLowerCase() ?? "not placed"}
      </p>

      <div className="mt-8">
        {settled ? (
          <MoneyBar
            segments={[
              { label: "Item + shipping", amount: goods + shipping, tone: "ink" },
              { label: "US duties + fees as assessed", amount: assessedDuties ?? 0, tone: "ink-soft" },
              { label: "Released back to you", amount: released, tone: "release" },
            ]}
          />
        ) : (
          <MoneyBar
            segments={[
              { label: "Item + shipping", amount: goods + shipping, tone: "ink" },
              { label: "US duties held (final amount set by customs)", amount: dutyHold, tone: "hold" },
            ]}
          />
        )}
      </div>

      <ol className="mt-10 space-y-6 border-l border-line pl-6">
        <Step done title={`Hold placed on your PayPal: ${money(authorized)}`}>
          {auth?.expiration_time && <>The authorization is valid until {new Date(auth.expiration_time).toUTCString().slice(5, 16)}. Nothing beyond the final amount will be charged.</>}
        </Step>
        <Step done={Boolean(data.shipment) || settled} title={data.shipment ? `Shipped with ${data.shipment.carrier}, ${data.shipment.tracking}` : "Waiting for the seller to ship"} />
        <Step done={settled} title={settled ? `US customs assessed ${money(assessedDuties ?? 0)} in duties and fees` : "Waiting for US customs"} />
        <Step done={settled} title={settled ? `Charged ${money(captured)} · ${money(released)} released` : "Final charge after clearance"}>
          {settled && released > 0 && <>The released amount drops off your PayPal balance or card statement; nothing else is owed.</>}
        </Step>
      </ol>

      <p className="mt-12 text-sm text-muted">
        Demo: you are also the seller.{" "}
        <Link href={`/seller?order=${id}`} className="text-ink underline">
          Open this order in the seller console
        </Link>{" "}
        to ship it, simulate customs and capture.
      </p>
    </Shell>
  );
}

function Shell({ id, children }: { id: string; children: React.ReactNode }) {
  void id;
  return <div className="mx-auto max-w-3xl px-5 py-12">{children}</div>;
}

function Step({ done, title, children }: { done?: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className="relative">
      <span className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 ${done ? "border-ink bg-ink" : "border-line bg-white"}`} />
      <p className={done ? "font-medium" : "text-muted"}>{title}</p>
      {children && <p className="mt-1 text-sm leading-relaxed text-muted">{children}</p>}
    </li>
  );
}
