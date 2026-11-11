import { money } from "@/lib/format";

export type Segment = { label: string; amount: number; tone: "ink" | "ink-soft" | "hold" | "release" };

const fill: Record<Segment["tone"], string> = {
  ink: "bg-ink",
  "ink-soft": "bg-[#4a5468]",
  hold: "bg-[repeating-linear-gradient(135deg,var(--hold)_0_6px,#d58f2a_6px_12px)]",
  release: "bg-release",
};

const dot: Record<Segment["tone"], string> = {
  ink: "bg-ink",
  "ink-soft": "bg-[#4a5468]",
  hold: "bg-hold",
  release: "bg-release",
};

/** One horizontal bar for the whole authorization, split into what it pays for. */
export function MoneyBar({ segments, caption }: { segments: Segment[]; caption?: string }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.amount), 0) || 1;
  return (
    <figure>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface">
        {segments.map((s) =>
          s.amount > 0 ? (
            <div key={s.label} className={`${fill[s.tone]} h-full`} style={{ width: `${(s.amount / total) * 100}%` }} title={`${s.label}: ${money(s.amount)}`} />
          ) : null,
        )}
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${dot[s.tone]}`} />
            {s.label} <span className="tabular text-ink">{money(s.amount)}</span>
          </span>
        ))}
        {caption && <span className="basis-full">{caption}</span>}
      </figcaption>
    </figure>
  );
}
