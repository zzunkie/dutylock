export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const pct = (n: number) => `${(Math.round(n * 1000) / 10).toString()}%`;

export const formatHts = (code: string) => {
  const d = code.replace(/\D/g, "");
  return [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean).join(".");
};
