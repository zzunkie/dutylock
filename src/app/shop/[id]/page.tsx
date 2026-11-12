import { notFound } from "next/navigation";
import Link from "next/link";
import { getProduct } from "@/lib/catalog";
import { ProductArt } from "@/components/ProductArt";
import { QuotePanel } from "@/components/QuotePanel";
import { money } from "@/lib/format";

export default async function ProductPage(props: PageProps<"/shop/[id]">) {
  const { id } = await props.params;
  const p = getProduct(id);
  if (!p) notFound();
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-5 py-10 md:grid-cols-[1fr_1.15fr]">
      <div>
        <Link href="/shop" className="text-sm text-muted hover:text-ink">
          ← Demo shop
        </Link>
        <ProductArt id={p.id} accent={p.accent} className="mt-4 w-full rounded-lg" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">{p.listing.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {p.maker} · {p.place}, {p.originName} · ships to the US by express courier
        </p>
        <p className="tabular mt-4 text-2xl font-semibold">{money(p.listing.value)}</p>
        <dl className="mt-6 space-y-4 text-sm leading-relaxed">
          <div>
            <dt className="text-muted">Materials and construction</dt>
            <dd className="mt-1">{p.listing.materials}</dd>
          </div>
          <div>
            <dt className="text-muted">From the maker</dt>
            <dd className="mt-1">{p.listing.description}</dd>
          </div>
          <div>
            <dt className="text-muted">Shipping weight</dt>
            <dd className="mt-1">{p.listing.weightKg} kg</dd>
          </div>
        </dl>
      </div>
      <div className="md:pt-10">
        <h2 className="text-lg font-semibold">Checkout to the United States</h2>
        <p className="mt-1 mb-6 text-sm text-muted">Duties are paid by the seller at the border and passed on at cost.</p>
        <QuotePanel productId={p.id} />
      </div>
    </div>
  );
}
