import { useEffect } from "react";

/**
 * SEO / AEO / GEO helper.
 *
 * Renders nothing visible — imperatively syncs <title>, meta tags, canonical
 * link, OpenGraph + Twitter cards, and a list of JSON-LD structured-data
 * blocks into <head>. Intended to be dropped near the top of every page.
 *
 * Notes
 * - Built for a SPA: well-known crawlers (Googlebot, Bingbot, GPTBot,
 *   PerplexityBot, ClaudeBot, OAI-SearchBot) all run JS, so client-side head
 *   mutations are picked up.
 * - Tags are tagged with `data-seo` so we can clean up the previous page's
 *   meta when navigating, instead of accumulating stale tags.
 */

export type SeoProps = {
  title: string;
  description: string;
  /** Path relative to the site root, e.g. "/catalogue". Defaults to current location. */
  path?: string;
  /** Absolute URL of an OG/Twitter image. Defaults to /og-default.jpg under base. */
  image?: string;
  /** "website" | "article" | "product" — defaults to "website". */
  type?: string;
  /** If true, instructs crawlers not to index. */
  noindex?: boolean;
  /** Optional list of JSON-LD structured-data blocks to attach. */
  jsonLd?: Array<Record<string, unknown>>;
  /** Optional canonical override; otherwise built from origin + path. */
  canonical?: string;
};

const SITE_NAME = "Rathinam Crackers";
const DEFAULT_OG = "/og-default.jpg";

function setMeta(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("data-seo", "1");
    document.head.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"][data-seo]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    el.setAttribute("data-seo", "1");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function clearJsonLd() {
  document.head
    .querySelectorAll('script[type="application/ld+json"][data-seo-jsonld]')
    .forEach((n) => n.remove());
}

function appendJsonLd(blocks: Array<Record<string, unknown>>) {
  for (const b of blocks) {
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.setAttribute("data-seo-jsonld", "1");
    s.text = JSON.stringify(b);
    document.head.appendChild(s);
  }
}

export function Seo(props: SeoProps): null {
  const { title, description, path, image, type = "website", noindex, jsonLd, canonical } = props;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const origin = window.location.origin;
    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    const cleanPath = path ?? window.location.pathname.replace(base, "") ?? "/";
    const url = canonical ?? `${origin}${base}${cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`}`;
    const ogImg = image ?? `${origin}${base}${DEFAULT_OG}`;
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;

    document.title = fullTitle;
    setMeta('meta[name="description"][data-seo]', { name: "description", content: description });
    setMeta('meta[name="robots"][data-seo]', {
      name: "robots",
      content: noindex ? "noindex,nofollow" : "index,follow,max-image-preview:large,max-snippet:-1",
    });
    setLink("canonical", url);

    setMeta('meta[property="og:title"][data-seo]', { property: "og:title", content: fullTitle });
    setMeta('meta[property="og:description"][data-seo]', { property: "og:description", content: description });
    setMeta('meta[property="og:type"][data-seo]', { property: "og:type", content: type });
    setMeta('meta[property="og:url"][data-seo]', { property: "og:url", content: url });
    setMeta('meta[property="og:image"][data-seo]', { property: "og:image", content: ogImg });
    setMeta('meta[property="og:site_name"][data-seo]', { property: "og:site_name", content: SITE_NAME });
    setMeta('meta[property="og:locale"][data-seo]', { property: "og:locale", content: "en_IN" });

    setMeta('meta[name="twitter:card"][data-seo]', { name: "twitter:card", content: "summary_large_image" });
    setMeta('meta[name="twitter:title"][data-seo]', { name: "twitter:title", content: fullTitle });
    setMeta('meta[name="twitter:description"][data-seo]', { name: "twitter:description", content: description });
    setMeta('meta[name="twitter:image"][data-seo]', { name: "twitter:image", content: ogImg });

    clearJsonLd();
    if (jsonLd && jsonLd.length) appendJsonLd(jsonLd);

    return () => {
      // Page-scoped JSON-LD shouldn't leak into the next route.
      clearJsonLd();
    };
  }, [title, description, path, image, type, noindex, jsonLd, canonical]);
  return null;
}

// --- Reusable JSON-LD builders --------------------------------------------

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: typeof window !== "undefined" ? window.location.origin : undefined,
    logo: typeof window !== "undefined" ? `${window.location.origin}/favicon.svg` : undefined,
    description:
      "Rathinam Crackers — PESO-licensed online cracker store from Sivakasi, India. Family fireworks, gift boxes and bulk orders shipped pan-India with GST invoices.",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Sivakasi",
      addressRegion: "Tamil Nadu",
      addressCountry: "IN",
    },
    sameAs: [],
  };
}

export function websiteLd() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: `${origin}${base}/`,
    potentialAction: {
      "@type": "SearchAction",
      target: `${origin}${base}/catalogue?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbLd(items: Array<{ name: string; path: string }>) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${origin}${base}${it.path}`,
    })),
  };
}

export function faqLd(faqs: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function productLd(p: {
  name: string;
  description: string;
  sku?: string;
  category?: string;
  brand?: string;
  image?: string;
  price: number;
  currency?: string;
  inStock?: boolean;
  url?: string;
  ratingValue?: number;
  ratingCount?: number;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const offer: Record<string, unknown> = {
    "@type": "Offer",
    price: p.price.toFixed(2),
    priceCurrency: p.currency ?? "INR",
    availability: `https://schema.org/${p.inStock === false ? "OutOfStock" : "InStock"}`,
    url: p.url ?? (typeof window !== "undefined" ? window.location.href : undefined),
    seller: { "@type": "Organization", name: SITE_NAME },
  };
  const out: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description,
    sku: p.sku,
    category: p.category,
    brand: p.brand ? { "@type": "Brand", name: p.brand } : { "@type": "Brand", name: SITE_NAME },
    image: p.image ? (p.image.startsWith("http") ? p.image : `${origin}${p.image}`) : undefined,
    offers: offer,
  };
  if (p.ratingValue && p.ratingCount && p.ratingCount > 0) {
    out["aggregateRating"] = {
      "@type": "AggregateRating",
      ratingValue: p.ratingValue.toFixed(1),
      reviewCount: p.ratingCount,
    };
  }
  return out;
}
