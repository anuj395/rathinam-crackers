import { Link } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import {
  Sparkles, ShoppingBag, FileText, Truck, Shield, Phone, Award, Heart, Clock, BadgeCheck,
  type LucideIcon,
} from "lucide-react";
import { useGetPublicSiteContent } from "@workspace/api-client-react";
import { Seo, breadcrumbLd, faqLd } from "@/lib/seo";

const ICONS: Record<string, LucideIcon> = {
  ShoppingBag, FileText, Truck, Shield, Sparkles, Award, Heart, Clock, BadgeCheck,
};

const DEFAULT_SECTIONS = [
  {
    icon: "ShoppingBag",
    title: "How to order",
    items: [
      "Browse the Catalogue or pick a category from the home page.",
      "Tap a product to see variants. Choose size and quantity.",
      "Tap Add to Cart. Repeat for any other items.",
      "Open the Cart, apply a coupon if you have one, then proceed to Checkout.",
      "Fill your name, phone, address and place the order.",
    ],
  },
  {
    icon: "FileText",
    title: "GST invoice",
    items: [
      "Tick 'I need GST invoice' at checkout.",
      "Enter your GSTIN and registered company name.",
      "We email a fully GST-compliant invoice (CGST 9% + SGST 9% intra-state, IGST 18% inter-state).",
    ],
  },
  {
    icon: "Truck",
    title: "Delivery",
    items: [
      "We ship pan-India via licensed cracker logistics partners only.",
      "Order confirmation comes within 24 hours by phone.",
      "Bulk orders may take 5–10 working days during peak season.",
    ],
  },
  {
    icon: "Shield",
    title: "Safety & compliance",
    items: [
      "All products are PESO-licensed and conform to Indian fireworks safety standards.",
      "We do not ship banned items in any state.",
      "Always read the safety instructions printed on each box.",
    ],
  },
];

const DEFAULT_FAQS = [
  { q: "Do I need to create an account?", a: "No. Checkout is guest-only — phone number is the order reference." },
  { q: "Can I order in bulk for a wedding/event?", a: "Yes. Orders of 10+ units of the same item automatically get the wholesale rate. For very large orders, call us directly." },
  { q: "How do I pay?", a: "Cash on delivery or bank transfer. Our team will call within 24 hours to confirm and arrange payment." },
  { q: "Can I cancel my order?", a: "Yes — call us before dispatch. After dispatch, cancellations follow our return policy." },
  { q: "What if a product arrives damaged?", a: "Take a photo and call us within 48 hours. We'll arrange a replacement or refund." },
];

export default function WebsiteHelp() {
  const { data: contentResp } = useGetPublicSiteContent();
  const c = (contentResp?.data ?? {}) as Record<string, any>;
  const SECTIONS = (c.helpSections?.length ? c.helpSections : DEFAULT_SECTIONS) as Array<{ icon: string; title: string; items: string[] }>;
  const FAQS = (c.helpFaqs?.length ? c.helpFaqs : DEFAULT_FAQS) as Array<{ q: string; a: string }>;
  const contact = (c.contact ?? {}) as { phone?: string; email?: string };
  const phone = contact.phone ?? "+91 99999 99999";
  const email = contact.email ?? "support@rathinamcracker.com";

  return (
    <div className="min-h-screen bg-cream flex flex-col" style={{ background: "#fff8ed" }}>
      <Seo
        title="Help & FAQ — Ordering, Delivery, GST & Safety"
        description="How to order crackers from Rathinam, GST invoice rules, pan-India delivery timelines, and PESO safety compliance — answered."
        path="/help"
        jsonLd={[
          breadcrumbLd([{ name: "Home", path: "/" }, { name: "Help", path: "/help" }]),
          faqLd(FAQS.map((f) => ({ q: f.q, a: f.a }))),
        ]}
      />
      <Navbar />
      <main className="flex-1">
        <section className="bg-gradient-to-br from-[#1a0a00] via-[#4a1000] to-[#8b2500] text-white py-14">
          <div className="max-w-4xl mx-auto px-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-full bg-amber-400/20 p-2">
                <Sparkles className="h-6 w-6 text-amber-300" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold">Help & FAQ</h1>
            </div>
            <p className="text-white/80 max-w-2xl">
              Everything about ordering crackers from Rathinam — from picking products to delivery and GST invoices.
            </p>
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-4 py-10 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {SECTIONS.map((s) => {
              const Icon = ICONS[s.icon] ?? Sparkles;
              return (
                <div key={s.title} className="rounded-lg bg-white shadow-sm border border-amber-100 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="rounded-md bg-[#9b2335]/10 p-1.5">
                      <Icon className="h-5 w-5 text-[#9b2335]" />
                    </div>
                    <h3 className="font-bold text-[#9b2335]">{s.title}</h3>
                  </div>
                  <ul className="space-y-1.5 text-sm text-slate-700">
                    {s.items.map((it) => <li key={it}>• {it}</li>)}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg bg-white shadow-sm border border-amber-100 p-5">
            <h3 className="font-bold text-[#9b2335] mb-3">Frequently Asked Questions</h3>
            <div className="space-y-3">
              {FAQS.map((f) => (
                <div key={f.q} className="border-b border-amber-100 pb-3 last:border-0 last:pb-0">
                  <p className="font-medium text-sm text-slate-800">{f.q}</p>
                  <p className="text-sm text-slate-600 mt-0.5">{f.a}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Phone className="h-5 w-5 text-[#9b2335]" />
              <h3 className="font-bold text-[#9b2335]">Need more help?</h3>
            </div>
            <p className="text-sm text-slate-700">
              Call us on <strong>{phone}</strong> · Email <strong>{email}</strong> · We respond within 24 hours.
            </p>
            <Link href="/catalogue" className="inline-block mt-3 text-sm font-semibold text-[#9b2335] underline">
              ← Back to shopping
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
