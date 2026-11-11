import Link from "next/link";
import { PRODUCTS } from "@/lib/catalog";
import { ProductArt } from "@/components/ProductArt";
import { money } from "@/lib/format";

export const metadata = { title: "Demo shop · DutyLock" };

export default function Shop() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Three makers, three classification fault lines</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Each product ships from outside the US to a US buyer. Open one to watch the duty estimate, then pay with a PayPal sandbox
        buyer account.
      </p>
      <ul className="mt-10 grid gap-10 md:grid-cols-3">
        {PRODUCTS.map((p) => (
          <li key={p.id}>
            <Link href={`/shop/${p.id}`} className="group block">
              <ProductArt id={p.id} accent={p.accent} className="w-full rounded-lg" />
              <div className="mt-4 flex items-baseline justify-between gap-3">
                <h2 className="font-medium group-hover:underline">{p.listing.title}</h2>
                <span className="tabular text-sm">{money(p.listing.value)}</span>
              </div>
              <p className="mt-1 text-sm text-muted">
                {p.maker} · {p.place}, {p.originName}
              </p>
              <p className="mt-3 text-sm leading-relaxed">{p.tagline}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
