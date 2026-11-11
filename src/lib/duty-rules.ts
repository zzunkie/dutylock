// Duties on top of the HTS general (MFN) rate, and clearance fees, for an express (Entry Type 11) shipment.
// Read from HTSUS Revision 23 (2026), chapter 99, and the Federal Register, checked 2026-11-11.
// US tariff measures have changed often since 2025: this table is the one place to update when they change.

export const DUTY_TABLE_AS_OF = "2026-11-11";

export type AdditionalDuty = { label: string; rate: number; source: string };

const SRC_301 = "Section 301 (forced labor), HTSUS 9903.05.20–.84, US note 52 to ch. 99 subch. III; effective 2026-07-24";
const SRC_232 = "Section 232 (copper), HTSUS 9903.82.02, US note 16(c)(v) to ch. 99 subch. III";

// Articles of copper listed in US note 16(c)(v): +50% on the full value (9903.82.02). Articles under Section 232
// are excluded from the Section 301 note 52 duty (9903.05.90).
const COPPER_232 = new Set(
  (
    "7406.10.00 7406.20.00 7407.10.15 7407.10.30 7407.10.50 7407.21.15 7407.21.30 7407.21.50 7407.21.70 7407.21.90 " +
    "7407.29.16 7407.29.34 7407.29.38 7407.29.40 7407.29.50 7408.11.30 7408.11.60 7408.19.00 7408.21.00 7408.22.10 " +
    "7408.22.50 7408.29.10 7408.29.50 7409.11.10 7409.11.50 7409.19.10 7409.19.50 7409.19.90 7409.21.00 7409.29.00 " +
    "7409.31.10 7409.31.50 7409.31.90 7409.39.10 7409.39.50 7409.39.90 7409.40.00 7409.90.10 7409.90.50 7409.90.90 " +
    "7410.11.00 7410.12.00 7410.21.30 7410.21.60 7410.22.00 7411.10.10 7411.10.50 7411.21.10 7411.21.50 7411.22.00 " +
    "7411.29.10 7411.29.50 7412.10.00 7412.20.00 7413.00.10 7413.00.50 7413.00.90 7415.10.00 7415.21.00 7415.29.00 " +
    "7415.33.05 7415.33.10 7415.33.80 7415.39.00 7418.10.00 7418.20.10 7418.20.50 7419.20.00 7419.80.03 7419.80.06 " +
    "7419.80.09 7419.80.15 7419.80.16 7419.80.17 7419.80.30 7419.80.50"
  )
    .split(" ")
    .map((c) => c.replace(/\D/g, "")),
);

const EU = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];

// "add": MFN + rate. "floor": total is max(MFN, rate), so the additional duty tops MFN up to the floor.
type Rule301 = { heading: string; kind: "add" | "floor"; rate: number };
const NOTE52: Record<string, Rule301> = {
  GB: { heading: "9903.05.81", kind: "add", rate: 0.1 },
  JP: { heading: "9903.05.48/.49", kind: "floor", rate: 0.125 },
  KR: { heading: "9903.05.70/.71", kind: "floor", rate: 0.125 },
  CH: { heading: "9903.05.73/.74", kind: "floor", rate: 0.125 },
  TW: { heading: "9903.05.75/.76", kind: "floor", rate: 0.1 },
  CN: { heading: "9903.05.31", kind: "add", rate: 0.125 },
  IN: { heading: "9903.05.44", kind: "add", rate: 0.1 },
  VN: { heading: "9903.05.84", kind: "add", rate: 0.125 },
  ID: { heading: "9903.05.45", kind: "add", rate: 0.1 },
  TH: { heading: "9903.05.77", kind: "add", rate: 0.125 },
  AU: { heading: "9903.05.23", kind: "add", rate: 0.125 },
  NZ: { heading: "9903.05.57", kind: "add", rate: 0.125 },
  NO: { heading: "9903.05.60", kind: "add", rate: 0.125 },
  TR: { heading: "9903.05.79", kind: "add", rate: 0.125 },
  MX: { heading: "9903.05.55", kind: "add", rate: 0.1 },
  ...Object.fromEntries(EU.map((c) => [c, { heading: "9903.05.38/.39", kind: "floor" as const, rate: 0.1 }])),
};

export const ORIGINS: Array<{ code: string; name: string }> = [
  { code: "GB", name: "United Kingdom" },
  { code: "PT", name: "Portugal" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "TW", name: "Taiwan" },
  { code: "IN", name: "India" },
  { code: "VN", name: "Vietnam" },
  { code: "ID", name: "Indonesia" },
  { code: "TH", name: "Thailand" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "MX", name: "Mexico" },
  { code: "CH", name: "Switzerland" },
];

/**
 * @param mfnAve the MFN duty as an ad valorem equivalent (MFN amount / customs value), used by floor rules.
 */
export function additionalDutiesFor(origin: string, hts: string, mfnAve: number): AdditionalDuty[] {
  const code = hts.replace(/\D/g, "");
  if (COPPER_232.has(code.slice(0, 8))) {
    return [{ label: "Section 232 copper duty +50% (9903.82.02)", rate: 0.5, source: SRC_232 }];
  }
  const r = NOTE52[origin];
  if (!r) return [];
  if (r.kind === "add") {
    return [{ label: `Section 301 duty +${pct(r.rate)} (${r.heading})`, rate: r.rate, source: SRC_301 }];
  }
  const topUp = Math.max(0, r.rate - mfnAve);
  if (topUp <= 0) return [];
  return [{ label: `Section 301 top-up to the ${pct(r.rate)} minimum, +${pct(topUp)} (${r.heading})`, rate: topUp, source: SRC_301 }];
}

/** Merchandise processing fee for an automated informal entry (Entry Type 11), FY2027, from 2026-10-01. */
export function clearanceFees(goodsValue: number): Array<{ label: string; amount: number; source: string }> {
  void goodsValue;
  return [{ label: "CBP merchandise processing fee (informal entry)", amount: 2.77, source: "19 CFR 24.23; FY2027 fee notice, Federal Register 2026-15530" }];
}

function pct(r: number) {
  return `${Math.round(r * 1000) / 10}%`;
}
