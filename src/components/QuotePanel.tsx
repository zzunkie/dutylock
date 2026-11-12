"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Quote } from "@/lib/quote";
import type { ListingInput } from "@/lib/classify";
import { formatHts, money } from "@/lib/format";
import { saveOrder } from "@/lib/local-orders";
import { MoneyBar } from "./MoneyBar";
import { PayPalButton } from "./PayPalButton";

type Props = { productId?: string; listing?: ListingInput; autoStart?: boolean };

export function QuotePanel({ productId, listing, autoStart = true }: Props) {
  const router = useRouter();
  const [steps, setSteps] = useState<string[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [replayed, setReplayed] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const started = useRef(false);

  const run = useCallback(
    async (live = false) => {
      setRunning(true);
      setError(null);
      setSteps([]);
      setQuote(null);
      setToken(null);
      try {
        const res = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            listing,
            live,
            pace: typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("pace") ?? undefined : undefined,
          }),
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "Could not start the classification.");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const ev = JSON.parse(line);
            if (ev.type === "step") setSteps((s) => [...s, ev.label]);
            if (ev.type === "error") setError(ev.message);
            if (ev.type === "quote") {
              setQuote(ev.quote);
              setToken(ev.token);
              setReplayed(Boolean(ev.replayed));
            }
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setRunning(false);
      }
    },
    [productId, listing],
  );

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void run(false);
    }
  }, [autoStart, run]);

  const createOrder = async () => {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Could not create the PayPal order");
    return j.id as string;
  };

  const onApprove = async (orderId: string) => {
    setPlacing(true);
    const res = await fetch(`/api/orders/${orderId}/authorize`, { method: "POST" });
    const j = await res.json();
    if (!res.ok) {
      setPlacing(false);
      setError(j.error ?? "PayPal could not place the hold.");
      return;
    }
    if (token && quote) saveOrder({ orderId, token, title: quote.listing.title, createdAt: new Date().toISOString() });
    router.push(`/orders/${orderId}`);
  };

  return (
    <section aria-label="US duties at checkout" className="space-y-6">
      {(running || steps.length > 0) && !quote && (
        <div>
          <p className="text-sm font-medium">
            {running ? "Claude is reading the US tariff schedule for this product…" : "Classification stopped."}
          </p>
          <ol className="mt-3 space-y-1.5 text-sm text-muted">
            {steps.map((s, i) => (
              <li key={i} className="rise flex gap-2">
                <span className="tabular w-5 text-right text-xs leading-5 text-line">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
            {running && <li className="ml-7 animate-pulse text-xs">working</li>}
          </ol>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {quote && token && (
        <div className="rise space-y-6">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">What customs could charge</h3>
            <p className="mt-2 text-base leading-relaxed">{quote.classification.summary}</p>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-medium">Tariff line customs could apply</th>
                <th className="py-2 pr-3 font-medium">Rate</th>
                <th className="py-2 text-right font-medium">Duty</th>
              </tr>
            </thead>
            <tbody>
              {[...quote.lines]
                .sort((a, b) => (a.role === "most_likely" ? -1 : b.role === "most_likely" ? 1 : b.duty - a.duty))
                .map((l) => {
                  const cand = quote.classification.candidates.find((c) => formatHts(c.hts) === formatHts(l.hts));
                  const isMax = l.duty === quote.maxDuty && quote.maxDuty > quote.expectedDuty;
                  const likely = l.role === "most_likely";
                  return (
                    <tr key={l.hts} className="border-b border-line align-top">
                      <td className={`py-4 pr-3 pl-3 ${likely ? "border-l-[3px] border-release" : "border-l-[3px] border-transparent"}`}>
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-mono text-[15px] font-medium">{formatHts(l.hts)}</span>
                          <span className={`text-xs font-medium ${likely ? "text-release" : "text-muted"}`}>
                            {likely ? "Most likely" : `Alternative · ${l.likelihood} likelihood`}
                          </span>
                        </div>
                        <div className="mt-1 text-[13px] leading-relaxed text-muted">{shortDescription(l.description)}</div>
                        {cand && (
                          <details className="mt-1.5 text-[13px] text-muted">
                            <summary className="cursor-pointer select-none font-medium text-ink">Why customs could pick this</summary>
                            <p className="mt-1 leading-relaxed">{cand.reasoning}</p>
                            <p className="mt-1 leading-relaxed">
                              <span className="font-medium text-ink">Deciding fact:</span> {cand.decidingFact}
                            </p>
                          </details>
                        )}
                      </td>
                      <td className="py-4 pr-3 text-[13px] leading-relaxed">
                        <div className="tabular text-[15px] font-semibold text-ink">{percent(l.duty, quote.goods)}</div>
                        <div className="text-muted">{l.rateText || "Free"} general</div>
                        {l.additional.map((a) => (
                          <div key={a.label} className="text-muted">
                            {a.label.replace(/\s*\([^)]*\)$/, "")}
                          </div>
                        ))}
                      </td>
                      <td className={`tabular py-4 text-right text-[15px] font-semibold ${isMax ? "text-hold" : ""}`}>{money(l.duty)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>

          <dl className="space-y-1.5 text-sm">
            <Row label={`${quote.listing.title} ×${quote.listing.quantity}`} value={quote.goods} />
            <Row label="Express shipping to the US" value={quote.shipping} />
            {quote.fees.map((f) => (
              <Row key={f.label} label={f.label} value={f.amount} muted />
            ))}
            <Row label="US duties, most likely" value={quote.expectedDuty} />
            <Row label="US duties, highest plausible" value={quote.maxDuty} tone="hold" />
            <div className="mt-1 border-t border-ink pt-3 text-lg">
              <Row label="Held on your PayPal today" value={quote.holdTotal} strong />
            </div>
          </dl>

          <MoneyBar
            segments={[
              { label: "Item + shipping", amount: quote.goods + quote.shipping, tone: "ink" },
              { label: "Likely duties + fees", amount: quote.expectedDuty + quote.feesTotal, tone: "ink-soft" },
              { label: "Held, released if customs charges less", amount: quote.maxDuty - quote.expectedDuty, tone: "hold" },
            ]}
            caption={`You are charged only what US customs assesses: between ${money(quote.goods + quote.shipping + quote.feesTotal + Math.min(...quote.lines.map((x) => x.duty)))} and ${money(quote.holdTotal)}. The rest of the hold is released when the parcel clears.`}
          />

          {(quote.classification.keyFacts.some((f) => f.source === "assumption") || quote.classification.questionsForSeller.length > 0) && (
            <details className="text-sm">
              <summary className="cursor-pointer select-none">Assumptions and open questions</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                {quote.classification.keyFacts
                  .filter((f) => f.source === "assumption")
                  .map((f) => (
                    <li key={f.fact}>Assumed: {f.fact}</li>
                  ))}
                {quote.classification.questionsForSeller.map((q) => (
                  <li key={q}>Seller could confirm: {q}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="pt-2">
            {placing ? (
              <p className="text-sm">Placing the hold with PayPal…</p>
            ) : (
              <PayPalButton createOrder={createOrder} onApprove={onApprove} />
            )}
          </div>

          <p className="text-xs leading-relaxed text-muted">
            Classified by {quote.classification.model} on {new Date(quote.classification.classifiedAt).toUTCString().slice(5, 22)} UTC
            {replayed ? " (saved run)" : ""}. Rates from the HTSUS and the duty table as of {quote.dutyTableAsOf}.{" "}
            <button type="button" className="underline hover:text-ink" onClick={() => void run(true)} disabled={running}>
              Run the classification live
            </button>
          </p>
        </div>
      )}

      {!autoStart && !running && !quote && (
        <button type="button" onClick={() => void run(false)} className="rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white">
          Estimate US duties
        </button>
      )}
    </section>
  );
}

/** Effective rate of a line: all duties on it as a share of the goods value. */
function percent(duty: number, goods: number) {
  if (!goods) return "";
  const p = (duty / goods) * 100;
  return `${p >= 10 ? p.toFixed(p % 1 < 0.05 || p % 1 > 0.95 ? 0 : 1) : p.toFixed(1)}%`;
}

function shortDescription(path: string) {
  const parts = path.split(" › ");
  const head = parts[0].split(/[:;,]/)[0];
  const tail = parts.slice(1).filter((p) => p !== "Other:" && p !== "Other").slice(-2);
  return [head, ...tail].join(" › ").replace(/:$/, "");
}

function Row({ label, value, strong, muted, tone }: { label: string; value: number; strong?: boolean; muted?: boolean; tone?: "hold" }) {
  return (
    <div className={`flex justify-between gap-4 ${muted ? "text-muted" : ""} ${strong ? "font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd className={`tabular ${tone === "hold" ? "text-hold" : ""}`}>{money(value)}</dd>
    </div>
  );
}
