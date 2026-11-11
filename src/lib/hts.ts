import "server-only";
import fs from "node:fs";
import path from "node:path";

// Local copy of the USITC Harmonized Tariff Schedule (chapters relevant to handmade and small-batch goods).
// The model never invents a duty rate: it proposes codes, and every rate shown or held is read from here.

type RawRow = { c: string; i: number; d: string; g: string; s: string; u: string[]; f: string[] };

export type HtsLine = {
  code: string; // e.g. "4202.92.15.00"
  indent: number;
  description: string;
  path: string[]; // ancestor descriptions, heading first
  general: string; // the rate text on this line, or inherited from the nearest ancestor that has one
  generalSource: string; // code of the line the rate came from
  units: string[];
  footnotes: string[];
  isLeaf: boolean;
};

let cache: { lines: HtsLine[]; byCode: Map<string, HtsLine>; meta: { source: string; downloaded: string; chapters: string[] } } | null = null;

function load() {
  if (cache) return cache;
  const file = path.join(process.cwd(), "data", "hts.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
    source: string;
    downloaded: string;
    chapters: string[];
    rows: RawRow[];
  };
  const lines: HtsLine[] = [];
  // stack of open ancestors by indent level
  // Headings sit at indent 0, so popping by indent also resets the ancestors at each new heading.
  const stack: Array<{ indent: number; description: string; code: string; general: string }> = [];
  for (const r of raw.rows) {
    while (stack.length && stack[stack.length - 1].indent >= r.i) stack.pop();
    let general = r.g;
    let generalSource = r.c;
    if (!general) {
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].general) {
          general = stack[k].general;
          generalSource = stack[k].code;
          break;
        }
      }
    }
    lines.push({
      code: r.c,
      indent: r.i,
      description: r.d,
      path: stack.map((s) => s.description),
      general,
      generalSource,
      units: r.u,
      footnotes: r.f,
      isLeaf: false,
    });
    stack.push({ indent: r.i, description: r.d, code: r.c, general: r.g });
  }
  for (let k = 0; k < lines.length; k++) {
    const next = lines[k + 1];
    lines[k].isLeaf = !next || next.indent <= lines[k].indent;
  }
  const byCode = new Map<string, HtsLine>();
  for (const l of lines) if (l.code) byCode.set(normalize(l.code), l);
  cache = { lines, byCode, meta: { source: raw.source, downloaded: raw.downloaded, chapters: raw.chapters } };
  return cache;
}

export function normalize(code: string) {
  return code.replace(/[^\d]/g, "");
}

export function htsMeta() {
  return load().meta;
}

/** Exact lookup; accepts "4202.92.15.00", "4202921500" or an 8-digit subheading. */
export function getLine(code: string): HtsLine | undefined {
  const { byCode } = load();
  const n = normalize(code);
  return byCode.get(n) ?? byCode.get(n.slice(0, 8)) ?? byCode.get(n + "00");
}

export function fullDescription(line: HtsLine) {
  return [...line.path, line.description].join(" › ");
}

/** All lines under a heading or subheading prefix, e.g. "6911" or "4202.92". */
export function subtree(prefix: string, limit = 80): HtsLine[] {
  const { lines } = load();
  const n = normalize(prefix);
  return lines.filter((l) => l.code && normalize(l.code).startsWith(n)).slice(0, limit);
}

const STOP = new Set(["of", "and", "or", "the", "a", "an", "for", "with", "other", "in", "to", "by", "not", "on", "its"]);

function tokens(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => t.replace(/(ies)$/, "y").replace(/(es|s)$/, ""));
}

/** Keyword search across the description and its ancestors. Returns the most specific matches first. */
export function search(query: string, limit = 25): HtsLine[] {
  const { lines } = load();
  const q = tokens(query);
  if (!q.length) return [];
  const scored: Array<{ line: HtsLine; score: number }> = [];
  for (const l of lines) {
    if (!l.code) continue;
    const own = new Set(tokens(l.description));
    const anc = new Set(tokens(l.path.join(" ")));
    let score = 0;
    for (const t of q) {
      if (own.has(t)) score += 3;
      else if (anc.has(t)) score += 1;
    }
    if (score > 0) scored.push({ line: l, score: score + (l.isLeaf ? 0.5 : 0) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.line);
}

export type ParsedRate = {
  text: string;
  adValorem: number; // fraction, e.g. 0.063
  perKg: number; // USD per kg
  perEach: number; // USD per item
  perPair: number;
  perDozen: number;
  parsed: boolean; // false when the text is a reference we can't compute (e.g. "See note")
};

export function parseRate(text: string): ParsedRate {
  const r: ParsedRate = { text, adValorem: 0, perKg: 0, perEach: 0, perPair: 0, perDozen: 0, parsed: true };
  const t = text.trim();
  if (!t || /^free$/i.test(t)) return r;
  const parts = t.split("+").map((p) => p.trim());
  for (const p of parts) {
    let m: RegExpMatchArray | null;
    if ((m = p.match(/^([\d.]+)%$/))) r.adValorem += Number(m[1]) / 100;
    else if ((m = p.match(/^([\d.]+)¢\/kg$/))) r.perKg += Number(m[1]) / 100;
    else if ((m = p.match(/^\$([\d.]+)\/kg$/))) r.perKg += Number(m[1]);
    else if ((m = p.match(/^([\d.]+)¢ each$/))) r.perEach += Number(m[1]) / 100;
    else if ((m = p.match(/^\$([\d.]+) each$/))) r.perEach += Number(m[1]);
    else if ((m = p.match(/^([\d.]+)¢\/pr\.?$/))) r.perPair += Number(m[1]) / 100;
    else if ((m = p.match(/^([\d.]+)¢\/doz\.?$/))) r.perDozen += Number(m[1]) / 100;
    else r.parsed = false;
  }
  return r;
}

export function mfnDuty(rate: ParsedRate, goods: { value: number; weightKg: number; quantity: number }) {
  return (
    rate.adValorem * goods.value +
    rate.perKg * goods.weightKg +
    rate.perEach * goods.quantity +
    rate.perPair * goods.quantity +
    (rate.perDozen * goods.quantity) / 12
  );
}
