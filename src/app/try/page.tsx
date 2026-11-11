"use client";

import { useState } from "react";
import { QuotePanel } from "@/components/QuotePanel";
import { ORIGINS } from "@/lib/duty-rules";
import type { ListingInput } from "@/lib/classify";

const EXAMPLE: ListingInput = {
  title: "Hand-loomed linen and cotton apron",
  origin: "PT",
  value: 48,
  quantity: 1,
  weightKg: 0.4,
  materials: "Woven fabric, 55% linen / 45% cotton. Cross-back straps, one front pocket, leather neck adjuster.",
  description: "Woven on a wooden loom and sewn in our studio. A kitchen and workshop apron.",
};

export default function TryPage() {
  const [form, setForm] = useState<ListingInput>(EXAMPLE);
  const [submitted, setSubmitted] = useState<ListingInput | null>(null);
  const [runId, setRunId] = useState(0);

  const set = <K extends keyof ListingInput>(k: K, v: ListingInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-5 py-10 md:grid-cols-[1fr_1.15fr]">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted({ ...form });
          setRunId((n) => n + 1);
        }}
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Classify your own product</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Describe what you sell the way you would on your shop page. Claude classifies it live against the US tariff schedule (about a
            minute). The demo allows a limited number of live runs per hour.
          </p>
        </div>
        <Field label="Product title">
          <input className="input" value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={140} required />
        </Field>
        <Field label="Materials and construction" hint="Fiber content, outer surface, how it is made. This is what decides the code.">
          <textarea className="input min-h-28" value={form.materials} onChange={(e) => set("materials", e.target.value)} maxLength={1200} required />
        </Field>
        <Field label="Description">
          <textarea className="input min-h-20" value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={1200} />
        </Field>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Origin">
            <select className="input" value={form.origin} onChange={(e) => set("origin", e.target.value)}>
              {ORIGINS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Price (USD)">
            <input className="input" type="number" min={1} max={2500} step="0.01" value={form.value} onChange={(e) => set("value", Number(e.target.value))} />
          </Field>
          <Field label="Quantity">
            <input className="input" type="number" min={1} max={50} value={form.quantity} onChange={(e) => set("quantity", Number(e.target.value))} />
          </Field>
          <Field label="Weight (kg)">
            <input className="input" type="number" min={0.01} max={30} step="0.01" value={form.weightKg} onChange={(e) => set("weightKg", Number(e.target.value))} />
          </Field>
        </div>
        <button className="rounded-md bg-ink px-5 py-3 text-sm font-medium text-white">Estimate US duties</button>
      </form>
      <div className="md:pt-14">
        {submitted ? (
          <QuotePanel key={runId} listing={submitted} />
        ) : (
          <p className="text-sm text-muted">The estimate, the codes customs could apply and the PayPal checkout appear here.</p>
        )}
      </div>
      <style>{`.input{width:100%;border:1px solid var(--line);border-radius:6px;padding:8px 10px;font-size:14px;background:#fff}.input:focus{outline:2px solid var(--accent);outline-offset:-1px}`}</style>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
