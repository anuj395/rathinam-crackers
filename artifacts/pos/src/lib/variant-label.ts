// Single source of truth for "how should we label a product variant in a UI?"
// See the warehouse copy for the full rationale — duplicated here to keep
// each artifact self-contained (no extra workspace lib needed).

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
