export interface BulkTierResult {
  unitPrice: number;
  label: "Retail" | "Bulk" | "Bulk+" | "Wholesale";
  discountPct: number;
  savePerUnit: number;
  bulkRateApplied: boolean;
}

export const BULK_TIER_LADDER = [
  { from: 1, to: 9, mul: 1, label: "Retail" as const, discountPct: 0 },
  { from: 10, to: 24, mul: 0.95, label: "Bulk" as const, discountPct: 5 },
  { from: 25, to: 49, mul: 0.9, label: "Bulk+" as const, discountPct: 10 },
  { from: 50, to: undefined as number | undefined, mul: 0.85, label: "Wholesale" as const, discountPct: 15 },
];

export function resolveBulkTier(
  retailOnline: number,
  wholesaleBulk: number,
  qty: number
): BulkTierResult {
  const r = Number(retailOnline) || 0;
  const w = Number(wholesaleBulk) || 0;
  if (r <= 0) return { unitPrice: 0, label: "Retail", discountPct: 0, savePerUnit: 0, bulkRateApplied: false };

  if (w <= 0 || w >= r) {
    return { unitPrice: r, label: "Retail", discountPct: 0, savePerUnit: 0, bulkRateApplied: false };
  }

  let chosen = BULK_TIER_LADDER[0];
  for (const t of BULK_TIER_LADDER) {
    if (qty >= t.from && (t.to === undefined || qty <= t.to)) {
      chosen = t;
      break;
    }
  }

  const tieredPrice = chosen.label === "Wholesale" ? w : Math.max(w, Math.round(r * chosen.mul * 100) / 100);
  return {
    unitPrice: tieredPrice,
    label: chosen.label,
    discountPct: chosen.discountPct,
    savePerUnit: Math.max(0, r - tieredPrice),
    bulkRateApplied: chosen.label !== "Retail",
  };
}
