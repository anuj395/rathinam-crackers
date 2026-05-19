import { Link } from "wouter";
import { mediaUrl } from "../lib/api";
import { useEffect, useMemo, useState } from "react";
import { useListPublicProducts, useGetPublicSiteContent } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  ArrowRight, ShieldCheck, Truck, Award, Star, Sparkles, Phone,
  MessageCircle, Mail, BadgeCheck, Heart, Gift, Clock, Quote, ChevronRight,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { Seo, organizationLd, websiteLd, faqLd } from "@/lib/seo";

type ProductVariantLite = { prices?: { retailOnline?: number } };
type Product = {
  id: string;
  name?: string;
  category?: string;
  variants?: ProductVariantLite[];
};

const minPrice = (p: Product): number => {
  const prices = (p.variants ?? [])
    .map((v) => Number(v?.prices?.retailOnline))
    .filter((n) => Number.isFinite(n) && n > 0);
  return prices.length === 0 ? 0 : Math.min(...prices);
};

// CMS-driven countdown. `targetIso` is yyyy-mm-dd from siteContent.festival.targetDate;
// if missing/invalid we fall back to "next Nov 1" so the block never shows zeroes
// for legacy content. The caller decides whether to render at all.
function useFestivalCountdown(targetIso: string | undefined) {
  const target = useMemo(() => {
    const parsed = targetIso ? new Date(`${targetIso}T00:00:00`) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
    const now = new Date();
    const year = now.getMonth() >= 11 ? now.getFullYear() + 1 : now.getFullYear();
    return new Date(`${year}-11-01T00:00:00`);
  }, [targetIso]);
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, target.getTime() - now.getTime());
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { days, hours, minutes, seconds, target, expired: diff <= 0 };
}

const HOW_ICONS: Record<string, typeof Sparkles> = { Sparkles, Gift, Truck, Award, ShieldCheck, Heart, Clock, BadgeCheck };

const DEFAULT_OCCASIONS = [
  { key: "diwali",   label: "Diwali",        emoji: "🪔", tag: "Festival",  color: "from-amber-400 via-orange-500 to-red-600" },
  { key: "wedding",  label: "Weddings",      emoji: "💐", tag: "Bulk",      color: "from-pink-400 via-rose-500 to-red-500" },
  { key: "birthday", label: "Birthdays",     emoji: "🎂", tag: "Family",    color: "from-purple-400 via-fuchsia-500 to-pink-500" },
  { key: "karthigai",label: "Karthigai",     emoji: "🕯️", tag: "Tradition", color: "from-yellow-400 via-amber-500 to-orange-600" },
  { key: "newyear",  label: "New Year",      emoji: "🎉", tag: "Party",     color: "from-cyan-400 via-blue-500 to-indigo-600" },
  { key: "corporate",label: "Corporate",     emoji: "🏢", tag: "B2B",       color: "from-emerald-400 via-teal-500 to-cyan-600" },
];

const DEFAULT_CATEGORIES = [
  { name: "Ground",  emoji: "🎇", color: "from-orange-500 to-red-600" },
  { name: "Aerial",  emoji: "🚀", color: "from-blue-500 to-indigo-600" },
  { name: "Sparkler",emoji: "✨", color: "from-yellow-400 to-amber-600" },
  { name: "Gift Box",emoji: "🎁", color: "from-purple-500 to-pink-600" },
  { name: "Bundle",  emoji: "📦", color: "from-green-500 to-teal-600" },
  { name: "Novelty", emoji: "🎭", color: "from-cyan-500 to-blue-600" },
];

const DEFAULT_STATS = [
  { value: "40+",     label: "Years of trust",          sub: "Since 1985" },
  { value: "500+",    label: "Premium products",        sub: "Across 6 categories" },
  { value: "50,000+", label: "Happy families",          sub: "Across India" },
  { value: "120+",    label: "Cities served",           sub: "Pan-India network" },
];

const DEFAULT_TESTIMONIALS = [
  { name: "Priya Krishnan", city: "Chennai",   text: "Ordered the family bundle for Diwali and the kids could not stop smiling. Crackers were dry, fresh and beautifully packed.", rating: 5 },
  { name: "Arjun Mehta",    city: "Mumbai",    text: "Bulk order for our daughter's wedding — 200 boxes delivered on time with a clean GST invoice. Highly recommended for big events.", rating: 5 },
  { name: "Lakshmi Iyer",   city: "Bengaluru", text: "Their sparkler tin lasted twice as long as the local brand. You really feel the Sivakasi quality.", rating: 5 },
  { name: "Ravi Subramanian", city: "Hyderabad", text: "Customer support called within an hour of placing my order. Felt like dealing with a family business — because it is one.", rating: 5 },
];

const DEFAULT_PRESS = [
  "The Hindu", "Times of India", "Vikatan", "ET Now", "Dinamalar", "Mint",
];

const DEFAULT_HOW_IT_WORKS = [
  { step: "01", icon: "Sparkles", title: "Browse the catalogue", desc: "500+ items across aerial, ground, sparklers, gift boxes and family bundles. Filter by occasion or budget." },
  { step: "02", icon: "Gift",     title: "Place your order",     desc: "Add to cart, apply your coupon, request a GST invoice and check out as a guest. No account needed." },
  { step: "03", icon: "Truck",    title: "Celebrate at home",    desc: "Our team confirms by phone within 24 hours. Licensed logistics deliver safely to your doorstep." },
];

const DEFAULT_WHY_US = [
  { icon: "Award",       title: "Premium quality",       desc: "Every batch hand-checked at our Sivakasi unit. Fresh stock for every season — no leftover inventory.", iconBg: "bg-primary/10 text-primary" },
  { icon: "Truck",       title: "Pan-India delivery",     desc: "Specialised, licensed cracker logistics. Tracked, insured and delivered to 120+ cities across India.", iconBg: "bg-amber-50 text-amber-600" },
  { icon: "ShieldCheck", title: "GST & PESO compliant",   desc: "Every product PESO-licensed. Every invoice GST-compliant. 100% legal, 100% transparent.", iconBg: "bg-green-50 text-green-600" },
  { icon: "Heart",       title: "Family-run since 1985",  desc: "Three generations, one promise — to treat every customer's home like our own celebration.", iconBg: "bg-pink-50 text-pink-600" },
  { icon: "Clock",       title: "24-hour confirmation",   desc: "Real humans call you within 24 hours of every order. No bots, no chatbots — just our team.", iconBg: "bg-blue-50 text-blue-600" },
  { icon: "BadgeCheck",  title: "Fair pricing",            desc: "Direct-from-manufacturer rates. Wholesale prices auto-applied for 10+ unit orders. No hidden fees.", iconBg: "bg-purple-50 text-purple-600" },
];

const DEFAULT_FAQS = [
  { q: "Do I need to create an account to order?", a: "No. Checkout is guest-only — your phone number is the order reference. We will call within 24 hours to confirm." },
  { q: "Can I get a GST invoice?",                  a: "Yes. Tick 'I need GST invoice' at checkout and enter your GSTIN. We issue a fully GST-compliant invoice (CGST 9% + SGST 9% intra-state, IGST 18% inter-state)." },
  { q: "Do you ship across India?",                 a: "Yes. We ship pan-India through licensed cracker logistics partners only. Delivery times vary by state, generally 5-10 working days during peak season." },
  { q: "Is there a discount for bulk and weddings?",a: "Orders of 10+ units of the same item automatically get the wholesale rate. For very large or corporate orders, message us on WhatsApp for a custom quote." },
  { q: "Are the products safe and compliant?",      a: "Every product is PESO-licensed and conforms to Indian fireworks safety standards and Supreme Court guidelines on permissible noise and emissions." },
];

export default function Home() {
  const { data: featuredData, isLoading } = useListPublicProducts({ featured: true, limit: 8 });
  const { data: contentResp } = useGetPublicSiteContent();
  const c = (contentResp?.data ?? {}) as Record<string, any>;
  const OCCASIONS = (c.occasions?.length ? c.occasions : DEFAULT_OCCASIONS) as typeof DEFAULT_OCCASIONS;
  const CATEGORIES = (c.categories?.length ? c.categories : DEFAULT_CATEGORIES) as typeof DEFAULT_CATEGORIES;
  const STATS = (c.stats?.length ? c.stats : DEFAULT_STATS) as typeof DEFAULT_STATS;
  const TESTIMONIALS = (c.testimonials?.length ? c.testimonials : DEFAULT_TESTIMONIALS) as typeof DEFAULT_TESTIMONIALS;
  const PRESS = (c.press?.length ? c.press : DEFAULT_PRESS) as string[];
  const HOW_IT_WORKS = (c.howItWorks?.length ? c.howItWorks : DEFAULT_HOW_IT_WORKS) as Array<{ step: string; icon: string; title: string; desc: string }>;
  const WHY_US = (c.whyUs?.length ? c.whyUs : DEFAULT_WHY_US) as Array<{ icon: string; title: string; desc: string; iconBg?: string }>;
  const FAQS = (c.homeFaqs?.length ? c.homeFaqs : DEFAULT_FAQS) as Array<{ q: string; a: string }>;
  const products: Product[] = (featuredData?.data ?? []) as Product[];
  const festival = (c.festival ?? {}) as { name?: string; targetDate?: string; countdownLabel?: string; enabled?: boolean };
  const occasionSection = (c.occasionSection ?? {}) as { eyebrow?: string; title?: string; subtitle?: string };
  const newsletter = (c.newsletter ?? {}) as { heading?: string; body?: string };
  const bulkCta = (c.bulkCta ?? {}) as { eyebrow?: string; title?: string; body?: string; perks?: string };
  const { days, hours, minutes, seconds, expired } = useFestivalCountdown(festival.targetDate);
  const showCountdown = festival.enabled !== false && !expired && !!festival.targetDate;
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (TESTIMONIALS.length === 0) return;
    const t = setInterval(() => setActive((a) => (a + 1) % TESTIMONIALS.length), 6000);
    return () => clearInterval(t);
  }, [TESTIMONIALS.length]);
  const safeActive = TESTIMONIALS.length > 0 ? active % TESTIMONIALS.length : 0;
  const currentTestimonial = TESTIMONIALS[safeActive];

  return (
    <Layout>
      <Seo
        title="Rathinam Crackers — PESO-licensed Online Cracker Shop, Sivakasi"
        description="Buy crackers online from Sivakasi. PESO-licensed family fireworks, gift boxes, and bulk Diwali & wedding orders shipped pan-India with GST invoices."
        path="/"
        jsonLd={[
          organizationLd(),
          websiteLd(),
          faqLd([
            { q: "Are Rathinam Crackers PESO-licensed?", a: "Yes. Every product we ship complies with PESO (Petroleum and Explosives Safety Organisation) regulations and Indian fireworks safety standards." },
            { q: "Do you ship pan-India?", a: "Yes, via licensed cracker logistics partners to all states where fireworks delivery is legally permitted." },
            { q: "Do you provide GST invoices?", a: "Yes — tick 'I need GST invoice' at checkout and we email a fully GST-compliant invoice (CGST+SGST intra-state, IGST inter-state)." },
            { q: "Can I order in bulk for a wedding?", a: "Yes. 10+ units of the same item automatically get the wholesale rate. For very large orders, please call us first." },
          ]),
        ]}
      />
      {/* HERO */}
      <section className="relative h-[640px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#1a0a00_0%,#4a1000_50%,#8b2500_100%)]" />
        {/* Sparkles */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(40)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-amber-200 rounded-full animate-pulse"
              style={{
                top: `${(i * 53) % 100}%`,
                left: `${(i * 37) % 100}%`,
                opacity: 0.4 + ((i * 7) % 60) / 100,
                animationDelay: `${(i % 10) * 0.2}s`,
              }}
            />
          ))}
        </div>
        {/* Decorative glows */}
        <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full bg-[hsl(197,71%,45%)]/25 blur-3xl" />

        <div className="relative z-10 text-center px-4 max-w-5xl">
          <div className="inline-flex items-center gap-2 bg-amber-500/15 border border-amber-400/30 backdrop-blur px-4 py-1.5 rounded-full mb-6">
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            <span className="text-amber-200 text-xs font-semibold tracking-widest uppercase">{c.brand?.promoBarText ?? "Festive collection · Live now"}</span>
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold text-white mb-6 tracking-tight leading-[1.05]">
            Celebrate with <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 bg-clip-text text-transparent">{c.brand?.name ?? "Rathinam Crackers"}</span>
          </h1>
          <p className="text-lg md:text-2xl text-amber-100/90 mb-10 max-w-3xl mx-auto font-medium">
            {c.brand?.tagline ?? "Premium Sivakasi Fireworks since 1985."} Three generations of cracker craftsmanship — making every celebration extraordinary with safety and brilliance.
          </p>
          {(() => {
            const wa = (c.contact?.whatsapp ?? "").replace(/[^0-9]/g, "");
            const waMsg = encodeURIComponent(c.brand?.bulkWhatsAppMessage ?? "Hi, I'd like a bulk quote");
            const primary = c.cta?.heroPrimary ?? { label: "Shop the collection", href: "/catalogue" };
            const secondary = c.cta?.heroSecondary ?? { label: "Bulk & Weddings", href: "wa" };
            // Protocol whitelist (defense against `javascript:` injected via CMS).
            const safe = (h: string | undefined, fb: string) => {
              const s = String(h ?? "").trim();
              if (s.startsWith("/") || s.startsWith("#")) return s;
              if (/^(https?|tel|mailto):/i.test(s)) return s;
              return fb;
            };
            const primaryHref = safe(primary.href, "/catalogue");
            const rawSecondary = secondary.href === "wa" || !secondary.href
              ? (wa ? `https://wa.me/${wa}?text=${waMsg}` : "#")
              : secondary.href;
            const secondaryHref = safe(rawSecondary, "#");
            const isExternal = (h: string) => /^https?:|^tel:|^mailto:/.test(h);
            return (
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-10">
                {isExternal(primaryHref) ? (
                  <a href={primaryHref} target="_blank" rel="noreferrer">
                    <Button size="lg" className="bg-amber-500 hover:bg-amber-600 text-[hsl(197,65%,12%)] font-bold text-lg px-10 h-14 rounded-full shadow-xl shadow-amber-900/30">
                      {primary.label ?? "Shop"} <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </a>
                ) : (
                  <Link href={primaryHref}>
                    <Button size="lg" className="bg-amber-500 hover:bg-amber-600 text-[hsl(197,65%,12%)] font-bold text-lg px-10 h-14 rounded-full shadow-xl shadow-amber-900/30">
                      {primary.label ?? "Shop"} <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                )}
                <a href={secondaryHref} target="_blank" rel="noreferrer">
                  <Button size="lg" variant="outline" className="border-white/30 bg-white/10 backdrop-blur text-white hover:bg-white/20 hover:text-white font-bold text-lg px-8 h-14 rounded-full">
                    <MessageCircle className="mr-2 h-5 w-5 text-green-400" /> {secondary.label ?? "Bulk & Weddings"}
                  </Button>
                </a>
              </div>
            );
          })()}

          {/* Countdown — only renders if a festival.targetDate is set in CMS and not yet passed. */}
          {showCountdown && (
            <div className="inline-flex flex-col items-center gap-2 bg-black/30 backdrop-blur border border-white/10 rounded-2xl px-6 py-4">
              <span className="text-amber-200/80 text-xs uppercase tracking-[0.25em]">
                {festival.countdownLabel ?? `${festival.name ?? "Festive"} season starts in`}
              </span>
              <div className="flex items-center gap-2 sm:gap-4">
                {[
                  { v: days, l: "Days" },
                  { v: hours, l: "Hrs" },
                  { v: minutes, l: "Min" },
                  { v: seconds, l: "Sec" },
                ].map((b, i) => (
                  <div key={b.l} className="flex items-center">
                    <div className="text-center min-w-[52px]">
                      <div className="text-2xl sm:text-3xl font-bold text-white tabular-nums">{String(b.v).padStart(2, "0")}</div>
                      <div className="text-[10px] uppercase tracking-widest text-amber-300/80">{b.l}</div>
                    </div>
                    {i < 3 && <span className="text-amber-300/40 text-2xl mx-1">:</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* TRUST STATS STRIP */}
      <section className="bg-gradient-to-r from-[hsl(197,71%,96%)] via-amber-50 to-[hsl(197,71%,96%)] border-y border-amber-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-[hsl(197,71%,28%)] to-[hsl(41,89%,45%)] bg-clip-text text-transparent">{s.value}</div>
                <div className="text-sm font-semibold text-gray-800 mt-1">{s.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SHOP BY OCCASION */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-primary">{occasionSection.eyebrow ?? "Curated for every celebration"}</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-3">{occasionSection.title ?? "Shop by occasion"}</h2>
            <p className="text-gray-600 mt-3 max-w-2xl mx-auto">{occasionSection.subtitle ?? "From festivals to weddings — find the right pack for the moment you are celebrating."}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {OCCASIONS.map((o) => (
              <Link key={o.key} href={`/catalogue?occasion=${o.key}`}>
                <div className="group cursor-pointer">
                  <div className={`relative aspect-square rounded-3xl bg-gradient-to-br ${o.color} flex flex-col items-center justify-center p-5 text-white shadow-lg group-hover:shadow-2xl group-hover:-translate-y-1 transition-all duration-300 overflow-hidden`}>
                    <div className="absolute inset-0 opacity-30 mix-blend-overlay bg-[radial-gradient(circle_at_30%_20%,white,transparent_50%)]" />
                    <span className="text-5xl mb-2 relative z-10 transform group-hover:scale-110 transition-transform">{o.emoji}</span>
                    <span className="font-bold text-sm uppercase tracking-wider relative z-10">{o.label}</span>
                    <span className="absolute top-2 right-2 text-[9px] bg-white/25 backdrop-blur px-2 py-0.5 rounded-full font-bold tracking-widest uppercase">{o.tag}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED PRODUCTS */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-10">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-primary">Hand-picked</span>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2">This season's favourites</h2>
              <p className="text-gray-600 mt-3 max-w-xl">Crowd-pleasing crackers our customers come back for, every single year.</p>
            </div>
            <Link href="/catalogue">
              <Button variant="ghost" className="text-primary hover:text-primary/80 font-semibold">
                View all products <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="flex overflow-x-auto pb-8 gap-6 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory">
            {isLoading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="min-w-[280px] h-[380px] bg-gray-100 rounded-2xl animate-pulse" />
              ))
            ) : products.length === 0 ? (
              <div className="min-w-full text-center py-16 text-gray-500">No featured products yet — check the full <Link href="/catalogue" className="text-primary underline">catalogue</Link>.</div>
            ) : (
              products.map((product) => (
                <Link key={product.id} href={`/product/${product.id}`} className="snap-start">
                  <Card className="min-w-[280px] group cursor-pointer border-none shadow-sm hover:shadow-2xl transition-all duration-300 rounded-2xl overflow-hidden bg-white">
                    <CardContent className="p-0">
                      <div className="aspect-[4/5] bg-gradient-to-br from-primary/10 via-amber-50 to-amber-100 flex items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_50%_30%,rgba(251,191,36,0.4),transparent_60%)]" />
                        {(product as { imageUrl?: string }).imageUrl ? (
                          <img
                            src={mediaUrl((product as { imageUrl?: string }).imageUrl)}
                            alt={product.name ?? ""}
                            className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500 z-0"
                          />
                        ) : (
                          <span className="text-7xl transform group-hover:scale-110 transition-transform duration-500 relative z-10">🎆</span>
                        )}
                        <div className="absolute top-3 left-3">
                          <span className="bg-white/90 backdrop-blur-sm text-primary text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                            {product.category ?? "Cracker"}
                          </span>
                        </div>
                        <div className="absolute top-3 right-3">
                          <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                            <Star className="h-3 w-3 fill-current" /> Featured
                          </span>
                        </div>
                      </div>
                      <div className="p-5">
                        <h3 className="font-bold text-gray-900 mb-1 line-clamp-1">{product.name}</h3>
                        <div className="flex items-center justify-between mt-2">
                          {(() => {
                            const m = minPrice(product);
                            return (
                              <p className="text-primary font-bold text-lg">
                                {m > 0 ? (
                                  <>₹{m.toLocaleString("en-IN")}<span className="text-xs text-gray-500 font-medium">+</span></>
                                ) : (
                                  <span className="text-sm text-gray-500 font-semibold">Price on call</span>
                                )}
                              </p>
                            );
                          })()}
                          <span className="text-xs text-amber-600 font-semibold flex items-center gap-1"><BadgeCheck className="h-3.5 w-3.5" /> PESO</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      {/* SHOP BY CATEGORY */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-xs font-bold uppercase tracking-[0.25em] text-primary">Browse the lineup</span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-3 mb-12">Shop by category</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {CATEGORIES.map((cat) => (
              <Link key={cat.name} href={`/catalogue?category=${cat.name}`}>
                <div className="group cursor-pointer">
                  <div className={`aspect-square rounded-3xl bg-gradient-to-br ${cat.color} flex flex-col items-center justify-center p-6 text-white shadow-lg group-hover:shadow-2xl group-hover:-translate-y-1 transition-all duration-300`}>
                    <span className="text-5xl mb-3">{cat.emoji}</span>
                    <span className="font-bold text-sm uppercase tracking-widest">{cat.name}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* HERITAGE / STORY STRIP */}
      <section className="relative py-24 bg-gradient-to-br from-[#1a0a00] via-[#3a0c00] to-[#5a1500] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%3E%3Cpath%20fill%3D%22%23fbbf24%22%20d%3D%22M30%2010l3%2014%2014%203-14%203-3%2014-3-14-14-3%2014-3z%22%2F%3E%3C%2Fsvg%3E')]" />
        <div className="absolute -top-32 right-0 w-[500px] h-[500px] rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute -bottom-32 left-0 w-[500px] h-[500px] rounded-full bg-primary/100/10 blur-3xl" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-amber-300">From the soil of Sivakasi</span>
            <h2 className="text-3xl md:text-5xl font-extrabold mt-3 mb-6 leading-tight">
              Three generations of <span className="text-amber-400">cracker craftsmanship</span>
            </h2>
            <p className="text-amber-100/80 leading-relaxed mb-4">
              Founded in 1985 by Mr. R. Rathinasamy in the fireworks capital of India, Rathinam Crackers began as a single-room workshop with one belief — that every Indian home deserves brilliance, safely.
            </p>
            <p className="text-amber-100/80 leading-relaxed mb-8">
              Today, three generations later, we partner with 30+ family-run units across Sivakasi to bring you crackers that are tested, certified and packed with the same care your own family would.
            </p>
            <div className="grid grid-cols-3 gap-4 max-w-md">
              <div className="border-l-2 border-amber-400 pl-3">
                <div className="text-2xl font-bold text-amber-300">1985</div>
                <div className="text-xs uppercase tracking-wider text-amber-200/70">Founded</div>
              </div>
              <div className="border-l-2 border-amber-400 pl-3">
                <div className="text-2xl font-bold text-amber-300">30+</div>
                <div className="text-xs uppercase tracking-wider text-amber-200/70">Partner units</div>
              </div>
              <div className="border-l-2 border-amber-400 pl-3">
                <div className="text-2xl font-bold text-amber-300">3</div>
                <div className="text-xs uppercase tracking-wider text-amber-200/70">Generations</div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="aspect-[4/5] rounded-3xl bg-gradient-to-br from-amber-400/25 to-primary/25 border border-amber-400/30 backdrop-blur p-8 flex flex-col items-center justify-center text-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-50 bg-[radial-gradient(circle_at_50%_30%,rgba(251,191,36,0.3),transparent_60%)]" />
              <span className="text-9xl mb-6 relative z-10">🪔</span>
              <Quote className="h-8 w-8 text-amber-300 mb-4 relative z-10" />
              <p className="text-xl md:text-2xl font-medium text-amber-100 italic relative z-10 leading-relaxed">
                "We don't sell crackers. We sell the moment a child's eyes light up."
              </p>
              <div className="mt-6 relative z-10">
                <div className="font-bold text-amber-300">R. Senthil Rathinam</div>
                <div className="text-xs uppercase tracking-widest text-amber-200/60">Third generation, Owner</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-primary">Simple &amp; safe</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-3">How it works</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((s, i) => {
              const Icon = HOW_ICONS[s.icon] ?? Sparkles;
              return (
              <div key={s.step} className="relative bg-gradient-to-br from-primary/5 to-amber-50 border border-amber-100 rounded-3xl p-8 hover:shadow-xl transition-shadow">
                <div className="absolute -top-4 -left-4 text-7xl font-extrabold text-primary/10 select-none">{s.step}</div>
                <div className="relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center text-white shadow-lg mb-5">
                    <Icon className="h-7 w-7" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{s.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{s.desc}</p>
                </div>
                {i < HOW_IT_WORKS.length - 1 && (
                  <ChevronRight className="hidden md:block absolute top-1/2 -right-6 h-8 w-8 text-amber-400/60" />
                )}
              </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* WHY US */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-primary">The Rathinam promise</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-3">Why families choose us, year after year</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {WHY_US.map((f) => {
              const Icon = HOW_ICONS[f.icon] ?? Award;
              return (
              <div key={f.title} className="bg-white rounded-2xl p-7 border border-gray-100 hover:border-primary/30 hover:shadow-lg transition-all">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${f.iconBg ?? "bg-primary/10 text-primary"}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-lg text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
              </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-primary">Loved across India</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-3">From the families we serve</h2>
          </div>

          <div className="relative max-w-3xl mx-auto">
            <div className="bg-gradient-to-br from-primary/5 to-amber-50 border border-amber-200 rounded-3xl p-8 md:p-12 shadow-sm relative overflow-hidden">
              <Quote className="absolute top-6 right-6 h-16 w-16 text-primary/30" />
              <div className="flex items-center gap-1 mb-5">
                {[...Array(currentTestimonial?.rating ?? 5)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-amber-500 text-amber-500" />
                ))}
              </div>
              <p className="text-lg md:text-xl text-gray-800 leading-relaxed mb-6 font-medium">
                "{currentTestimonial?.text ?? ""}"
              </p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center text-white font-bold text-lg">
                  {(currentTestimonial?.name ?? "·").charAt(0)}
                </div>
                <div>
                  <div className="font-bold text-gray-900">{currentTestimonial?.name}</div>
                  <div className="text-sm text-gray-500">{currentTestimonial?.city}</div>
                </div>
              </div>
            </div>
            <div className="flex justify-center gap-2 mt-6">
              {TESTIMONIALS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  aria-label={`Show testimonial ${i + 1}`}
                  className={`h-2 rounded-full transition-all ${i === safeActive ? "w-8 bg-primary" : "w-2 bg-gray-300 hover:bg-gray-400"}`}
                />
              ))}
            </div>
          </div>

          {/* Press strip */}
          <div className="mt-16 pt-10 border-t border-gray-100">
            <p className="text-center text-xs font-bold uppercase tracking-[0.25em] text-gray-400 mb-6">As featured in</p>
            <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3">
              {PRESS.map((p) => (
                <span key={p} className="text-gray-400 font-serif italic text-lg hover:text-gray-600 transition-colors">{p}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* BULK / WEDDING / CORPORATE CTA */}
      <section className="py-16 bg-gradient-to-r from-[hsl(197,65%,18%)] via-[hsl(197,71%,28%)] to-[hsl(41,89%,45%)] relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_50%,white,transparent_40%)]" />
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_80%_50%,white,transparent_40%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-10 items-center text-white">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-amber-200">{bulkCta.eyebrow ?? "For weddings, events & corporates"}</span>
              <h2 className="text-3xl md:text-4xl font-extrabold mt-3 mb-4 leading-tight">{bulkCta.title ?? "Planning something big?"}</h2>
              <p className="text-white/90 text-lg leading-relaxed mb-2">
                {bulkCta.body ?? "Wedding sangeet, temple festival, corporate gifting or a society celebration — our bulk team will design a custom pack and price for you."}
              </p>
              <p className="text-amber-100 text-sm">{bulkCta.perks ?? "Wholesale rates auto-applied · GST B2B invoices · Doorstep delivery"}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 md:justify-end">
              {(() => {
                const wa = (c.contact?.whatsapp ?? "").replace(/[^0-9]/g, "");
                const waMsg = encodeURIComponent(c.brand?.bulkWhatsAppMessage ?? "Hi, I'd like a bulk quote");
                const phone = (c.contact?.phone ?? "").replace(/[^0-9+]/g, "");
                return (
                  <>
                    {wa && (
                      <a href={`https://wa.me/${wa}?text=${waMsg}`} target="_blank" rel="noreferrer">
                        <Button size="lg" className="bg-white text-primary hover:bg-amber-300 font-bold text-lg px-8 h-14 rounded-full w-full sm:w-auto">
                          <MessageCircle className="mr-2 h-5 w-5 text-green-600" /> {c.cta?.bulkWhatsAppLabel ?? "WhatsApp us"}
                        </Button>
                      </a>
                    )}
                    {phone && (
                      <a href={`tel:${phone}`}>
                        <Button size="lg" variant="outline" className="border-white/40 bg-white/10 backdrop-blur text-white hover:bg-white/20 hover:text-white font-bold text-lg px-8 h-14 rounded-full w-full sm:w-auto">
                          <Phone className="mr-2 h-5 w-5" /> {c.cta?.bulkCallLabel ?? "Call our team"}
                        </Button>
                      </a>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-primary">Quick answers</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-3">Frequently asked</h2>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <Accordion type="single" collapsible className="px-6">
              {FAQS.map((f, i) => (
                <AccordionItem key={f.q} value={`item-${i}`} className="border-b last:border-0">
                  <AccordionTrigger className="text-left font-semibold text-gray-900 hover:text-primary hover:no-underline py-5">
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-gray-600 leading-relaxed pb-5">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
          <div className="text-center mt-8">
            <Link href="/help">
              <Button variant="outline" className="rounded-full border-primary/30 text-primary hover:bg-primary/10 hover:text-primary">
                See full Help &amp; FAQ <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* NEWSLETTER / FINAL CTA */}
      <section className="py-16 bg-gradient-to-br from-[#1a0a00] via-[#3a0c00] to-[#5a1500] text-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <Mail className="h-10 w-10 text-amber-400 mx-auto mb-4" />
          <h2 className="text-3xl md:text-4xl font-extrabold mb-3">{newsletter.heading ?? "Get festive deals in your inbox"}</h2>
          <p className="text-amber-100/80 mb-8 max-w-xl mx-auto">{newsletter.body ?? "Early access, festival packs and special bundles — once a month, never spammy. Unsubscribe anytime."}</p>
          <form
            onSubmit={(e) => { e.preventDefault(); alert("Thanks! We'll keep you posted."); }}
            className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto"
          >
            <input
              type="email"
              required
              placeholder="you@example.com"
              className="flex-1 px-5 h-12 rounded-full bg-white/10 border border-white/20 backdrop-blur text-white placeholder-white/50 focus:outline-none focus:border-amber-400 focus:bg-white/20"
            />
            <Button type="submit" size="lg" className="bg-amber-500 hover:bg-amber-600 text-[hsl(197,65%,12%)] font-bold rounded-full h-12 px-8">
              Subscribe
            </Button>
          </form>
          <p className="text-xs text-amber-200/50 mt-4">Or message us on <a className="underline hover:text-amber-200" href="https://wa.me/919876543210">WhatsApp</a> for instant offers.</p>
        </div>
      </section>
    </Layout>
  );
}
