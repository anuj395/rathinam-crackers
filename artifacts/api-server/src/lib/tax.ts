import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Tax configuration is stored inside the existing `pricing` settings row so
// admins manage GST in one place. The schema lives in routes/v1/settings.ts;
// this module is the read-side helper used by the POS checkout and invoice
// creation paths so they all compute tax the exact same way.
// ---------------------------------------------------------------------------

export type HsnSlab = { hsn: string; rate: number; label?: string; active?: boolean };

export type TaxConfig = {
  enabled: boolean;
  defaultRate: number; // percentage (0–28)
  hsnRates: HsnSlab[];
};

export async function getTaxConfig(): Promise<TaxConfig> {
  const row = (await db.select().from(settingsTable).where(eq(settingsTable.key, "pricing")).limit(1))[0];
  const v = (row?.value ?? {}) as Record<string, unknown>;
  const enabled = v["gstEnabled"] === undefined ? true : Boolean(v["gstEnabled"]);
  const defaultRate = Number(v["defaultGstRate"] ?? 18);
  const rawSlabs = Array.isArray(v["hsnRates"]) ? (v["hsnRates"] as HsnSlab[]) : [];
  const hsnRates = rawSlabs.filter((s) => s && typeof s.hsn === "string" && Number.isFinite(s.rate));
  return { enabled, defaultRate, hsnRates };
}

// Resolve the effective tax rate (in percent) for a single product line.
// Order of precedence:
//   1. Per-product override (`product.gstRate`) — admin-set on the product.
//   2. HSN-slab map — admin-managed table keyed by HSN code.
//   3. Global default GST rate.
// When GST is disabled at the master level, the rate is always 0.
export function effectiveRate(
  product: { gstRate?: number | null; hsnCode?: string | null },
  config: TaxConfig,
): number {
  if (!config.enabled) return 0;
  if (typeof product.gstRate === "number" && Number.isFinite(product.gstRate)) return product.gstRate;
  if (product.hsnCode) {
    const slab = config.hsnRates.find(
      (s) => (s.active ?? true) && s.hsn.trim().toLowerCase() === product.hsnCode!.trim().toLowerCase(),
    );
    if (slab) return slab.rate;
  }
  return config.defaultRate;
}

export type TaxLineInput = {
  amount: number; // line amount before tax (after item-level discounts)
  product: { gstRate?: number | null; hsnCode?: string | null };
};
export type TaxBreakdown = {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number; // taxable + cgst + sgst + igst
  perLine: Array<{ rate: number; taxable: number; tax: number }>;
};

// Compute per-line GST and aggregate to invoice level. `discount` is applied
// proportionally across lines (by amount) so each line keeps its own rate.
// `interstate=true` routes the full tax to IGST instead of splitting it
// equally between CGST and SGST.
export function computeTax(
  lines: TaxLineInput[],
  discount: number,
  config: TaxConfig,
  interstate = false,
): TaxBreakdown {
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const safeDiscount = Math.min(Math.max(0, discount), subtotal);
  const factor = subtotal > 0 ? (subtotal - safeDiscount) / subtotal : 1;
  let cgst = 0, sgst = 0, igst = 0, taxable = 0;
  const perLine: TaxBreakdown["perLine"] = [];
  for (const line of lines) {
    const lineTaxable = line.amount * factor;
    const rate = effectiveRate(line.product, config);
    const lineTax = lineTaxable * (rate / 100);
    taxable += lineTaxable;
    if (interstate) {
      igst += lineTax;
    } else {
      cgst += lineTax / 2;
      sgst += lineTax / 2;
    }
    perLine.push({ rate, taxable: lineTaxable, tax: lineTax });
  }
  const total = taxable + cgst + sgst + igst;
  return { taxable, cgst, sgst, igst, total, perLine };
}
