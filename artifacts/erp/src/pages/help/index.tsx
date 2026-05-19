import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search, BookOpen, ShoppingCart, Package, Users, FileText,
  Tags, Truck, BarChart3, Settings, KeyRound, Zap, Box,
  ArrowRight, HelpCircle, Workflow, Lightbulb, Globe, RotateCcw,
  Upload, ShieldCheck, Rocket,
} from "lucide-react";

const guides = [
  {
    icon: Zap,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    title: "Quick Start",
    href: "/help/quick-start",
    description: "Get running in 5 minutes — login, dashboard tour, first sale",
    tags: ["beginner", "essential"],
  },
  {
    icon: Box,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    title: "Products & 5-Tier Pricing",
    href: "/help/pricing",
    description: "Understand the 5 price tiers, qty wholesale trigger, custom overrides",
    tags: ["pricing", "core"],
  },
  {
    icon: Package,
    color: "text-green-500",
    bg: "bg-green-500/10",
    title: "Stock & Inventory",
    href: "/help/stock",
    description: "Receive stock, adjust, transfer between locations, immutable ledger",
    tags: ["inventory"],
  },
  {
    icon: FileText,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    title: "Estimates → Invoices",
    href: "/help/sales",
    description: "Create estimates, convert to invoices, brochure Excel upload",
    tags: ["sales", "billing"],
  },
  {
    icon: Users,
    color: "text-pink-500",
    bg: "bg-pink-500/10",
    title: "Customers, Suppliers, Agents",
    href: "/help/crm",
    description: "Manage contacts, credit ledger, loyalty points, agent commission",
    tags: ["crm"],
  },
  {
    icon: Tags,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    title: "Coupons & Loyalty",
    href: "/help/coupons",
    description: "Create discount coupons, percent/flat, channel restrictions",
    tags: ["promotions"],
  },
  {
    icon: ShoppingCart,
    color: "text-red-500",
    bg: "bg-red-500/10",
    title: "POS & Warehouse",
    href: "/help/pos-warehouse",
    description: "Cashier flow, hold bills, stock receive/dispatch from warehouse",
    tags: ["operations"],
  },
  {
    icon: BarChart3,
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
    title: "Reports & GST",
    href: "/help/reports",
    description: "Sales, outstanding, commission, GSTR-1 ready reports",
    tags: ["reports", "gst"],
  },
  {
    icon: Settings,
    color: "text-slate-500",
    bg: "bg-slate-500/10",
    title: "Settings & Users",
    href: "/help/settings",
    description: "Company info, user roles, locations, system preferences",
    tags: ["admin"],
  },
  {
    icon: Truck,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    title: "Online Orders Lifecycle",
    href: "/help/online-orders",
    description: "End-to-end: customer places → confirm → pack → dispatch → deliver, plus cancellations",
    tags: ["online", "operations"],
  },
  {
    icon: RotateCcw,
    color: "text-rose-500",
    bg: "bg-rose-500/10",
    title: "Returns & Refunds",
    href: "/help/returns",
    description: "When returns are allowed, ledger reversal, refund flow, online order guards",
    tags: ["returns", "operations"],
  },
  {
    icon: Globe,
    color: "text-teal-500",
    bg: "bg-teal-500/10",
    title: "Website & Customer Portal",
    href: "/help/website",
    description: "Storefront, account portal, order tracking, customer-side cancel & return",
    tags: ["website", "customer"],
  },
  {
    icon: Upload,
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    title: "Bulk CSV Import / Export",
    href: "/help/bulk-csv",
    description: "Template, Export, Import for products, customers, brands, agents and more",
    tags: ["data", "ops"],
  },
  {
    icon: ShieldCheck,
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    title: "Self-Check Verifier",
    href: "/help/verifier",
    description: "Built-in end-to-end health check page — what every section validates",
    tags: ["qa", "monitoring"],
  },
  {
    icon: Rocket,
    color: "text-fuchsia-500",
    bg: "bg-fuchsia-500/10",
    title: "Production Go-Live Checklist",
    href: "/help/production",
    description: "Secrets to rotate, defaults to change, post-deploy smoke tests, backup plan",
    tags: ["deploy", "production"],
  },
  {
    icon: Workflow,
    color: "text-indigo-500",
    bg: "bg-indigo-500/10",
    title: "Architecture & API",
    href: "/help/architecture",
    description: "How the system is structured, API contract, data model",
    tags: ["technical"],
  },
];

const faqs = [
  {
    q: "Why does my customer see a different price than the printed brochure?",
    a: "When a customer's line quantity hits the wholesale threshold (default 10), the system automatically switches to the wholesale rate. You can change this threshold in Settings → Pricing.",
  },
  {
    q: "Can I delete a stock entry I made by mistake?",
    a: "No — the stock ledger is immutable by design (audit-grade). Use Stock Adjustment with a clear reason instead. The original entry stays in the audit trail.",
  },
  {
    q: "How do I make an estimate from a filled brochure Excel?",
    a: "Go to Estimates → New, then look for 'Upload Brochure'. The system reads Column A (Code) and Column F (Qty) and auto-creates the estimate. Unmatched codes are flagged for review.",
  },
  {
    q: "Where can a cashier change a price during a POS sale?",
    a: "Cashiers cannot change prices. Only admins can override prices via Custom Pricing on the product detail page (with a reason for audit).",
  },
  {
    q: "How do I run a GSTR-1 report?",
    a: "Reports → GST → choose period (month/year). The report is HSN-wise, ready to file.",
  },
];

export default function HelpIndex() {
  const [search, setSearch] = useState("");
  const filtered = guides.filter(
    (g) =>
      g.title.toLowerCase().includes(search.toLowerCase()) ||
      g.description.toLowerCase().includes(search.toLowerCase()) ||
      g.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2.5">
          <HelpCircle className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Help & Documentation</h1>
          <p className="text-sm text-muted-foreground">
            Learn how to use every part of the Rathinam ERP — guides, FAQs, and architecture notes.
          </p>
        </div>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search guides... (e.g. 'pricing', 'gst', 'stock')"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="help-search"
        />
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Topic Guides</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((g) => (
            <Link key={g.href} href={g.href}>
              <Card className="h-full hover-elevate active-elevate-2 cursor-pointer transition-all" data-testid={`help-card-${g.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <CardHeader>
                  <div className={`rounded-md ${g.bg} p-2 w-fit mb-2`}>
                    <g.icon className={`h-5 w-5 ${g.color}`} />
                  </div>
                  <CardTitle className="text-base flex items-center justify-between">
                    {g.title}
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </CardTitle>
                  <CardDescription className="text-xs">{g.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-1">
                    {g.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No guides match "{search}"
          </p>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Frequently Asked Questions</h2>
        </div>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <p className="font-medium text-sm mb-1">{f.q}</p>
                <p className="text-sm text-muted-foreground">{f.a}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" />
            Default Login Credentials
          </CardTitle>
          <CardDescription>Demo accounts seeded with the system</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border p-3"><strong>ERP Admin</strong><br /><code className="text-xs">admin / Admin@12345</code> (PIN 1234)</div>
            <div className="rounded-md border p-3"><strong>ERP Manager</strong><br /><code className="text-xs">manager / Manager@12345</code> (PIN 2345)</div>
            <div className="rounded-md border p-3"><strong>POS Cashier</strong><br /><code className="text-xs">cashier / admin123</code> (PIN 3456)</div>
            <div className="rounded-md border p-3"><strong>Warehouse</strong><br /><code className="text-xs">warehouse / Warehouse@12345</code> (PIN 4567)</div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            <strong>Important:</strong> Rotate every default password before going live (Settings → Users → Edit). The
            verifier auto-detects the latest admin password from your live login session, so you can change passwords
            freely without breaking it. See the <Link href="/help/production" className="text-primary underline">Production Go-Live Checklist</Link>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
