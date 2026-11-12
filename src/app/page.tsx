import Link from "next/link";
import { MoneyBar } from "@/components/MoneyBar";
import { ProductArt } from "@/components/ProductArt";
import { getProduct } from "@/lib/catalog";

const candle = getProduct("brass-candle-holder")!;

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-5">
      <section className="py-14 md:py-20">
        <p className="text-sm font-medium text-hold">Since August 2025, every parcel into the US pays duty</p>
        <h1 className="mt-4 text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl">
          Charge US import duties exactly.
          <span className="block text-muted">Not a cent more, not a cent less.</span>
        </h1>
        <div className="mt-10 grid gap-12 md:grid-cols-[1.05fr_1fr] md:gap-16">
          <div>
            <p className="max-w-xl text-lg leading-relaxed text-muted">
              A small seller in Leeds or Arita can’t know the final duty at checkout, because US customs picks the tariff code after the
              parcel lands, and the rate can swing from 10% to more than 50%. DutyLock uses AI to find every code customs could apply, holds the
              highest duty on the buyer’s PayPal, and captures only what customs actually charges.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/shop" className="rounded-md bg-ink px-5 py-3 text-sm font-medium text-white">
                Try the demo shop
              </Link>
              <Link href="/try" className="rounded-md border border-line px-5 py-3 text-sm font-medium">
                Classify your own product
              </Link>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-4">
              <ProductArt id="brass-candle-holder" accent={candle.accent} className="h-16 w-24 shrink-0 rounded-md" />
              <div>
                <p className="font-medium">Brass candle holder from Porto, $64</p>
                <p className="text-sm text-muted">10% as a lighting fitting, 53% as copper household ware</p>
              </div>
            </div>
            <div className="mt-7 space-y-7">
              <div>
                <p className="mb-3 text-sm">
                  <span className="font-semibold">At checkout</span> <span className="text-muted">PayPal holds the highest plausible duty</span>
                </p>
                <MoneyBar
                  segments={[
                    { label: "Item + shipping", amount: 92, tone: "ink" },
                    { label: "Likely duty + fee", amount: 9.17, tone: "ink-soft" },
                    { label: "Held in case customs reads it as copper", amount: 27.52, tone: "hold" },
                  ]}
                />
              </div>
              <div>
                <p className="mb-3 text-sm">
                  <span className="font-semibold">After customs</span> <span className="text-muted">the seller captures only what was assessed</span>
                </p>
                <MoneyBar
                  segments={[
                    { label: "Captured", amount: 101.17, tone: "ink" },
                    { label: "Released to the buyer", amount: 27.52, tone: "release" },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-line py-14">
        <h2 className="text-2xl font-semibold tracking-tight">Why the duty is unknowable at checkout</h2>
        <div className="mt-8 grid gap-10 md:grid-cols-3">
          <Fact
            title="The code decides the rate"
            body="Espadrilles from Spain pay 10% if the rubber tread is under 10% of the shoe’s weight, and 37.5% if it is more. A brass candle holder pays 10% as a lighting fitting, and 53% as copper household ware under the Section 232 copper duty."
          />
          <Fact
            title="Customs decides the code"
            body="The seller declares a code, but CBP assesses the entry. Under Delivered Duty Paid the carrier advances the duty and bills the seller weeks later."
          />
          <Fact
            title="Guessing costs someone"
            body="Charge the low rate and the seller eats the difference. Charge a flat high rate and the buyer overpays or abandons the cart. Ship duties-unpaid and many buyers refuse the parcel."
          />
        </div>
      </section>

      <section className="border-t border-line py-14">
        <h2 className="text-2xl font-semibold tracking-tight">How DutyLock settles it</h2>
        <ol className="mt-8 grid gap-10 md:grid-cols-4">
          <Step
            actor="Claude"
            title="Classify"
            body="Claude reads the listing and searches the real HTSUS (USITC data), returning every line customs could plausibly apply, with the deciding fact for each."
          />
          <Step
            actor="Code"
            title="Price in code"
            body="Rates are never generated by the model. Code reads them from the schedule and adds Section 301 and 232 duties for the origin, plus the CBP processing fee."
          />
          <Step
            actor="PayPal"
            title="Hold with PayPal"
            body="The buyer approves a PayPal order with intent AUTHORIZE for goods, shipping and the highest plausible duty. Nothing extra is charged yet."
          />
          <Step
            actor="Claude, code, then PayPal"
            title="Capture the real number"
            body="When the carrier’s duty bill arrives, Claude reads it, code checks it against the order, the seller approves, and PayPal captures that amount with final_capture. The rest is released."
          />
        </ol>
      </section>
    </div>
  );
}

function Fact({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function Step({ actor, title, body }: { actor: string; title: string; body: string }) {
  return (
    <li className="border-t-2 border-ink pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{actor}</p>
      <h3 className="mt-1 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </li>
  );
}
