import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middleware/authenticate.js";
import { auditWrite } from "../../lib/audit.js";

const router = Router();

const SITE_CONTENT_KEY = "siteContent";

const DEFAULT_SITE_CONTENT = {
  // Occasions are CMS-driven. Each entry: { key, label, emoji, tag, color }.
  // `key` must be URL-safe (lowercase, no spaces) — it is used as the
  // ?occasion=KEY filter on the catalogue and as the tag stored on products.
  occasions: [
    { key: "diwali",    label: "Diwali",    emoji: "🪔",  tag: "Festival",  color: "from-amber-400 via-orange-500 to-red-600" },
    { key: "wedding",   label: "Weddings",  emoji: "💐",  tag: "Bulk",      color: "from-pink-400 via-rose-500 to-red-500" },
    { key: "birthday",  label: "Birthdays", emoji: "🎂",  tag: "Family",    color: "from-purple-400 via-fuchsia-500 to-pink-500" },
    { key: "karthigai", label: "Karthigai", emoji: "🕯️", tag: "Tradition", color: "from-yellow-400 via-amber-500 to-orange-600" },
    { key: "newyear",   label: "New Year",  emoji: "🎉",  tag: "Party",     color: "from-cyan-400 via-blue-500 to-indigo-600" },
    { key: "corporate", label: "Corporate", emoji: "🏢",  tag: "B2B",       color: "from-emerald-400 via-teal-500 to-cyan-600" },
  ],
  categories: [
    { name: "Ground",   emoji: "🎇", color: "from-orange-500 to-red-600" },
    { name: "Aerial",   emoji: "🚀", color: "from-blue-500 to-indigo-600" },
    { name: "Sparkler", emoji: "✨", color: "from-yellow-400 to-amber-600" },
    { name: "Gift Box", emoji: "🎁", color: "from-purple-500 to-pink-600" },
    { name: "Bundle",   emoji: "📦", color: "from-green-500 to-teal-600" },
    { name: "Novelty",  emoji: "🎭", color: "from-cyan-500 to-blue-600" },
  ],
  stats: [
    { value: "40+",     label: "Years of trust",   sub: "Since 1985" },
    { value: "500+",    label: "Premium products", sub: "Across 6 categories" },
    { value: "50,000+", label: "Happy families",   sub: "Across India" },
    { value: "120+",    label: "Cities served",    sub: "Pan-India network" },
  ],
  testimonials: [
    { name: "Priya Krishnan",   city: "Chennai",   text: "Ordered the family bundle for Diwali and the kids could not stop smiling. Crackers were dry, fresh and beautifully packed.", rating: 5 },
    { name: "Arjun Mehta",      city: "Mumbai",    text: "Bulk order for our daughter's wedding — 200 boxes delivered on time with a clean GST invoice. Highly recommended for big events.", rating: 5 },
    { name: "Lakshmi Iyer",     city: "Bengaluru", text: "Their sparkler tin lasted twice as long as the local brand. You really feel the Sivakasi quality.", rating: 5 },
    { name: "Ravi Subramanian", city: "Hyderabad", text: "Customer support called within an hour of placing my order. Felt like dealing with a family business — because it is one.", rating: 5 },
  ],
  press: ["The Hindu", "Times of India", "Vikatan", "ET Now", "Dinamalar", "Mint"],
  howItWorks: [
    { step: "01", icon: "Sparkles", title: "Browse the catalogue", desc: "500+ items across aerial, ground, sparklers, gift boxes and family bundles. Filter by occasion or budget." },
    { step: "02", icon: "Gift",     title: "Place your order",     desc: "Add to cart, apply your coupon, request a GST invoice and check out as a guest. No account needed." },
    { step: "03", icon: "Truck",    title: "Celebrate at home",    desc: "Our team confirms by phone within 24 hours. Licensed logistics deliver safely to your doorstep." },
  ],
  whyUs: [
    { icon: "Award",       title: "Premium quality",        desc: "Every batch hand-checked at our Sivakasi unit. Fresh stock for every season — no leftover inventory." },
    { icon: "Truck",       title: "Pan-India delivery",     desc: "Specialised, licensed cracker logistics. Tracked, insured and delivered to 120+ cities across India." },
    { icon: "ShieldCheck", title: "GST & PESO compliant",   desc: "Every product PESO-licensed. Every invoice GST-compliant. 100% legal, 100% transparent." },
    { icon: "Heart",       title: "Family-run since 1985",  desc: "Three generations, one promise — to treat every customer's home like our own celebration." },
    { icon: "Clock",       title: "24-hour confirmation",   desc: "Real humans call you within 24 hours of every order. No bots, no chatbots — just our team." },
    { icon: "BadgeCheck",  title: "Fair pricing",           desc: "Direct-from-manufacturer rates. Wholesale prices auto-applied for 10+ unit orders. No hidden fees." },
  ],
  homeFaqs: [
    { q: "Do I need to create an account to order?", a: "No. Checkout is guest-only — your phone number is the order reference. We will call within 24 hours to confirm." },
    { q: "Can I get a GST invoice?",                 a: "Yes. Tick 'I need GST invoice' at checkout and enter your GSTIN. We issue a fully GST-compliant invoice (CGST 9% + SGST 9% intra-state, IGST 18% inter-state)." },
    { q: "Do you ship across India?",                a: "Yes. We ship pan-India through licensed cracker logistics partners only. Delivery times vary by state, generally 5-10 working days during peak season." },
    { q: "Is there a discount for bulk and weddings?", a: "Orders of 10+ units of the same item automatically get the wholesale rate. For very large or corporate orders, message us on WhatsApp for a custom quote." },
    { q: "Are the products safe and compliant?",     a: "Every product is PESO-licensed and conforms to Indian fireworks safety standards and Supreme Court guidelines on permissible noise and emissions." },
  ],
  helpSections: [
    { icon: "ShoppingBag", title: "How to order", items: [
      "Browse the Catalogue or pick a category from the home page.",
      "Tap a product to see variants. Choose size and quantity.",
      "Tap Add to Cart. Repeat for any other items.",
      "Open the Cart, apply a coupon if you have one, then proceed to Checkout.",
      "Fill your name, phone, address and place the order.",
    ]},
    { icon: "FileText", title: "GST invoice", items: [
      "Tick 'I need GST invoice' at checkout.",
      "Enter your GSTIN and registered company name.",
      "We email a fully GST-compliant invoice (CGST 9% + SGST 9% intra-state, IGST 18% inter-state).",
    ]},
    { icon: "Truck", title: "Delivery", items: [
      "We ship pan-India via licensed cracker logistics partners only.",
      "Order confirmation comes within 24 hours by phone.",
      "Bulk orders may take 5–10 working days during peak season.",
    ]},
    { icon: "Shield", title: "Safety & compliance", items: [
      "All products are PESO-licensed and conform to Indian fireworks safety standards.",
      "We do not ship banned items in any state.",
      "Always read the safety instructions printed on each box.",
    ]},
  ],
  helpFaqs: [
    { q: "Do I need to create an account?", a: "No. Checkout is guest-only — phone number is the order reference." },
    { q: "Can I order in bulk for a wedding/event?", a: "Yes. Orders of 10+ units of the same item automatically get the wholesale rate. For very large orders, call us directly." },
    { q: "How do I pay?", a: "Cash on delivery or bank transfer. Our team will call within 24 hours to confirm and arrange payment." },
    { q: "Can I cancel my order?", a: "Yes — call us before dispatch. After dispatch, cancellations follow our return policy." },
    { q: "What if a product arrives damaged?", a: "Take a photo and call us within 48 hours. We'll arrange a replacement or refund." },
  ],
  productFaqs: [
    { q: "Is this product PESO/CCOE approved?", a: "Yes. All fireworks sold by Rathinam Crackers are PESO-approved with valid CCOE licences. Our SKUs and HSN codes are registered with the Tamil Nadu Pyrotechnics Board." },
    { q: "Can I get a tax invoice (GST)?", a: "Absolutely. Every order ships with a proper GST tax invoice. Add your GSTIN at checkout to claim input credit if you're a business buyer." },
    { q: "How is this product shipped?", a: "Fireworks ship by surface-only courier (legal requirement). Packaging is double-walled corrugated with anti-static lining. Delivery is 3-7 working days across Tamil Nadu and 5-10 days pan-India." },
    { q: "What is the shelf life?", a: "Fireworks are best used within 18 months from the manufacturing date stamped on the pack. Store in a cool, dry place away from heat and direct sunlight." },
    { q: "Do you offer bulk discounts?", a: "Yes — bulk pricing kicks in automatically at 10+ units. For wholesale (50+ units) please call our bulk desk." },
    { q: "What is the return / refund policy?", a: "Damaged-in-transit items can be returned within 48 hours of delivery with photos. Used or partially-used fireworks cannot be returned for safety reasons." },
  ],
  contact: {
    phone: "+91 99999 99999",
    whatsapp: "919876543210",
    email: "support@rathinamcracker.com",
    address: "Sivakasi, Tamil Nadu, India",
    addressLine1: "123 Fireworks Street",
    addressLine2: "Sivakasi, Tamil Nadu 626 123",
    gstin: "33AAAAA0000A1Z5",
    mapUrl: "",
  },
  socials: {
    whatsapp:  "https://wa.me/919876543210",
    instagram: "",
    facebook:  "",
    youtube:   "",
    twitter:   "",
  },
  brand: {
    name: "Rathinam Crackers",
    tagline: "Premium Sivakasi Fireworks since 1985",
    establishedYear: 1985,
    promoBarText: "Festive Offers Live · Free GST Invoice · Pan-India Delivery",
    bulkWhatsAppMessage: "Hi, I'd like a bulk quote",
  },
  // Festival countdown shown on the homepage hero. Fully editable from CMS.
  // targetDate is ISO yyyy-mm-dd; if blank the countdown block is hidden.
  festival: {
    name: "Diwali",
    targetDate: "",
    countdownLabel: "Festive season starts in",
    enabled: true,
  },
  // Newsletter band (final CTA section).
  newsletter: {
    heading: "Get festive deals in your inbox",
    body: "Early access, festival packs and special bundles — once a month, never spammy. Unsubscribe anytime.",
  },
  // Bulk / weddings / corporate band.
  bulkCta: {
    eyebrow: "For weddings, events & corporates",
    title: "Planning something big?",
    body: "Wedding sangeet, temple festival, corporate gifting or a society celebration — our bulk team will design a custom pack and price for you.",
    perks: "Wholesale rates auto-applied · GST B2B invoices · Doorstep delivery",
  },
  // Copy shown above the "Shop by occasion" grid on the homepage.
  occasionSection: {
    eyebrow: "Curated for every celebration",
    title: "Shop by occasion",
    subtitle: "From festivals to weddings — find the right pack for the moment you are celebrating.",
  },
  cta: {
    heroPrimary:   { label: "Shop the collection",   href: "/catalogue" },
    heroSecondary: { label: "Bulk & Weddings",       href: "wa" },
    bulkWhatsAppLabel: "WhatsApp us",
    bulkCallLabel:     "Call our team",
    floatingWhatsApp:  { enabled: true, label: "Chat on WhatsApp" },
  },
  policies: {
    deliveryDays: "5–10 working days",
    returnPolicyDays: 2,
    minOrderValue: 0,
    freeDeliveryThreshold: 0,
    bulkThreshold: 10,
    confirmationWindowHours: 24,
  },
  pos: {
    quickCash: [100, 200, 500, 1000, 2000],
    paymentMethods: { cash: true, upi: true, card: true, credit: true },
    showCustomerPicker: true,
    showCouponBox: true,
  },
};

async function loadContent() {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, SITE_CONTENT_KEY)).limit(1);
  const stored = rows[0]?.value as Record<string, unknown> | undefined;
  return { ...DEFAULT_SITE_CONTENT, ...(stored ?? {}) };
}

router.get("/site-content/public", async (_req, res) => {
  const data = await loadContent();
  res.json({ success: true, data });
});

router.get("/site-content", authenticate, async (_req, res) => {
  const data = await loadContent();
  res.json({ success: true, data });
});

router.put("/site-content", authenticate, requireRole("SUPER_ADMIN", "ADMIN"), async (req: AuthRequest, res) => {
  const value = req.body ?? {};
  const before =
    (await db.select().from(settingsTable).where(eq(settingsTable.key, SITE_CONTENT_KEY)).limit(1))[0]?.value ?? null;
  await db
    .insert(settingsTable)
    .values({ key: SITE_CONTENT_KEY, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
  await auditWrite(req, {
    action: "UPDATE",
    entityType: "site-content",
    entityId: SITE_CONTENT_KEY,
    before,
    after: value,
  });
  const data = await loadContent();
  res.json({ success: true, data });
});

export default router;
