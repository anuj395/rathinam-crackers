import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

export type SiteContact = {
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  addressLine1?: string;
  addressLine2?: string;
  gstin?: string;
  mapUrl?: string;
};

export type SiteSocials = {
  whatsapp?: string;
  instagram?: string;
  facebook?: string;
  youtube?: string;
  twitter?: string;
};

export type SiteBrand = {
  name?: string;
  tagline?: string;
  establishedYear?: number;
  promoBarText?: string;
  bulkWhatsAppMessage?: string;
};

export type SiteCTA = {
  heroPrimary?: { label?: string; href?: string };
  heroSecondary?: { label?: string; href?: string };
  bulkWhatsAppLabel?: string;
  bulkCallLabel?: string;
  floatingWhatsApp?: { enabled?: boolean; label?: string };
};

export type SitePolicies = {
  deliveryDays?: string;
  returnPolicyDays?: number;
  minOrderValue?: number;
  freeDeliveryThreshold?: number;
  bulkThreshold?: number;
  confirmationWindowHours?: number;
};

export type SiteContent = {
  contact?: SiteContact;
  socials?: SiteSocials;
  brand?: SiteBrand;
  cta?: SiteCTA;
  policies?: SitePolicies;
  [k: string]: unknown;
};

const FALLBACK: SiteContent = {
  contact: {
    phone: "+91 99999 99999",
    whatsapp: "919876543210",
    email: "support@rathinamcracker.com",
    addressLine1: "123 Fireworks Street",
    addressLine2: "Sivakasi, Tamil Nadu 626 123",
    gstin: "33AAAAA0000A1Z5",
  },
  socials: { whatsapp: "https://wa.me/919876543210" },
  brand: {
    name: "Rathinam Crackers",
    tagline: "Premium Sivakasi Fireworks since 1985",
    establishedYear: 1985,
    promoBarText: "Festive Offers Live · Free GST Invoice · Pan-India Delivery",
    bulkWhatsAppMessage: "Hi, I'd like a bulk quote",
  },
  cta: {
    heroPrimary:   { label: "Shop the collection", href: "/catalogue" },
    heroSecondary: { label: "Bulk & Weddings",     href: "wa" },
    bulkWhatsAppLabel: "WhatsApp us",
    bulkCallLabel:     "Call our team",
    floatingWhatsApp:  { enabled: true, label: "Chat on WhatsApp" },
  },
  policies: {
    deliveryDays: "5–10 working days",
    returnPolicyDays: 2,
    bulkThreshold: 10,
    confirmationWindowHours: 24,
  },
};

function deepMerge<T>(base: T, over: Partial<T> | undefined): T {
  if (!over) return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const k of Object.keys(over)) {
    const v: any = (over as any)[k];
    if (v && typeof v === "object" && !Array.isArray(v)) out[k] = deepMerge((base as any)?.[k] ?? {}, v);
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

export function useSiteContent(): SiteContent {
  const { data } = useQuery({
    queryKey: ["site-content-public"],
    queryFn: async () => {
      const res = await apiFetch("/api/v1/site-content/public");
      if (!res.ok) throw new Error("Failed to load site content");
      const json = await res.json();
      return (json?.data ?? {}) as SiteContent;
    },
    staleTime: 5 * 60 * 1000,
  });
  return deepMerge(FALLBACK, data);
}

export function whatsAppHref(c: SiteContent, message?: string): string {
  const wa = c.contact?.whatsapp ?? "";
  const num = wa.replace(/[^0-9]/g, "");
  const msg = message ?? c.brand?.bulkWhatsAppMessage ?? "";
  if (!num) return safeHref(c.socials?.whatsapp);
  return `https://wa.me/${num}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`;
}

export function telHref(c: SiteContent): string {
  const p = (c.contact?.phone ?? "").replace(/[^0-9+]/g, "");
  return p ? `tel:${p}` : "#";
}

// Whitelist link protocols so a malicious CMS value like `javascript:alert(1)`
// can't slip into an <a href> rendered on the public website.
export function safeHref(raw: string | undefined | null): string {
  if (!raw) return "#";
  const s = String(raw).trim();
  if (s.startsWith("/") || s.startsWith("#")) return s;
  if (/^(https?|mailto|tel):/i.test(s)) return s;
  return "#";
}
