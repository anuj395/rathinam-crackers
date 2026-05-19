// Single source of truth for "how should we label a product variant in a UI?"
//
// The schema lets each variant carry size + packContent + brand + unit, but
// many older lists only rendered `size`. That meant a product with 3 brands
// × 3 sizes showed up as "Small / Medium / Large" three times in the
// dropdown — looks like a bug to the cashier even though the data is fine.
//
// Rule: always include any field that's set, in a stable order, joined by
// a thin separator. The result is always self-describing.
//
//   formatVariantLabel({ size: "Small" })                              → "Small"
//   formatVariantLabel({ size: "Small", packContent: "60 Shells" })    → "Small · 60 Shells"
//   formatVariantLabel({ size: "Small", packContent: "60 Shells", brand: "Sky" })
//                                                                     → "Small · 60 Shells · Sky"
//
// `siblings` is optional. If passed, we also append the brand for variants
// where multiple brands coexist even if a particular variant's brand is
// blank (we substitute "Standard" so every row in the dropdown is
// distinguishable).

export type VariantLike = {
  size?: string | null;
  packContent?: string | null;
  brand?: string | null;
  unit?: string | null;
  label?: string | null;
};

export function formatVariantLabel(v: VariantLike, siblings?: VariantLike[]): string {
  if (!v) return "Standard";
  if (v.label && !v.size) return v.label;
  const parts: string[] = [];
  parts.push(v.size?.trim() || "Standard");
  if (v.packContent?.trim()) parts.push(v.packContent.trim());
  const brandSet = siblings ? new Set(siblings.map((s) => (s?.brand ?? "").trim()).filter(Boolean)) : null;
  const brandsDiffer = brandSet ? brandSet.size > 1 : false;
  if (v.brand?.trim()) {
    parts.push(v.brand.trim());
  } else if (brandsDiffer) {
    parts.push("Standard");
  }
  if (v.unit?.trim() && !v.packContent?.trim()) parts.push(v.unit.trim());
  return parts.join(" · ");
}
