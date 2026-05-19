import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useListPublicProducts, useGetPublicSiteContent } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Loader2, X } from "lucide-react";
import { Layout } from "@/components/layout";
import { Seo, breadcrumbLd } from "@/lib/seo";

type OccasionDef = { key: string; label: string; emoji?: string };

export default function Catalogue() {
  const [searchParams] = useLocation();
  const qs = new URLSearchParams(window.location.search);
  const initialCategory = qs.get("category") || "All";
  const initialOccasion = qs.get("occasion") || "";

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [occasion, setOccasion] = useState<string>(initialOccasion);
  const [page, setPage] = useState(1);

  const { data: siteResp } = useGetPublicSiteContent();
  const cmsOccasions = (((siteResp?.data ?? {}) as Record<string, unknown>)["occasions"] ?? []) as OccasionDef[];
  const occasionLabel = cmsOccasions.find((o) => o.key === occasion)?.label;

  const { data, isLoading } = useListPublicProducts({
    search: search || undefined,
    category: category === "All" ? undefined : category,
    occasion: occasion || undefined,
    page,
    limit: 12,
  });

  const products = data?.data || [];
  const totalPages = data?.meta?.pages || 1;

  const priceRange = (p: any): { min: number; max: number } => {
    const prices = (p?.variants ?? [])
      .map((v: any) => Number(v?.prices?.retailOnline))
      .filter((n: number) => Number.isFinite(n) && n > 0);
    if (prices.length === 0) return { min: 0, max: 0 };
    return { min: Math.min(...prices), max: Math.max(...prices) };
  };

  const categories = ["All", "Ground", "Aerial", "Sparkler", "Gift Box", "Bundle", "Novelty"];

  return (
    <Layout>
      <Seo
        title={occasionLabel ? `${occasionLabel} Crackers — Catalogue` : category && category !== "All" ? `${category} Crackers — Catalogue` : "Cracker Catalogue — Sparklers, Sky Shots, Gift Boxes"}
        description={`Shop ${occasionLabel ? `${occasionLabel.toLowerCase()} crackers` : category && category !== "All" ? category.toLowerCase() + " crackers" : "sparklers, ground chakkars, sky shots, aerial cakes, rockets and gift boxes"} from Sivakasi. PESO-licensed, GST invoices, pan-India shipping.`}
        path={`/catalogue${occasion ? `?occasion=${encodeURIComponent(occasion)}` : category && category !== "All" ? `?category=${encodeURIComponent(category)}` : ""}`}
        jsonLd={[breadcrumbLd([{ name: "Home", path: "/" }, { name: "Catalogue", path: "/catalogue" }])]}
      />
      <div className="bg-gray-50 min-h-screen pb-20">
        {/* Sticky Header */}
        <div className="sticky top-16 z-40 bg-white border-b border-gray-200 py-4 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="relative flex-grow max-w-xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input 
                  placeholder="Search products..." 
                  className="pl-10 h-11 bg-gray-50 border-gray-200 rounded-full"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              
              <Tabs value={category} onValueChange={(val) => {
                setCategory(val);
                setPage(1);
              }} className="w-full md:w-auto overflow-x-auto no-scrollbar">
                <TabsList className="bg-gray-100/50 p-1 h-11 rounded-full">
                  {categories.map(cat => (
                    <TabsTrigger 
                      key={cat} 
                      value={cat}
                      className="rounded-full px-6 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm"
                    >
                      {cat}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {/* Occasion filter chips — sourced from CMS so the merchant decides which occasions exist. */}
            {cmsOccasions.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="occasion-filter">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 mr-1">Occasion:</span>
                <button
                  type="button"
                  onClick={() => { setOccasion(""); setPage(1); }}
                  className={`text-xs font-semibold px-3 h-8 rounded-full border transition ${occasion === "" ? "bg-primary text-white border-primary" : "bg-white text-gray-700 border-gray-200 hover:border-primary/40"}`}
                >
                  All
                </button>
                {cmsOccasions.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    data-testid={`occasion-${o.key}`}
                    onClick={() => { setOccasion(o.key); setPage(1); }}
                    className={`text-xs font-semibold px-3 h-8 rounded-full border transition flex items-center gap-1 ${occasion === o.key ? "bg-primary text-white border-primary" : "bg-white text-gray-700 border-gray-200 hover:border-primary/40"}`}
                  >
                    {o.emoji && <span className="text-sm leading-none">{o.emoji}</span>}
                    {o.label}
                  </button>
                ))}
                {occasion && (
                  <button
                    type="button"
                    onClick={() => { setOccasion(""); setPage(1); }}
                    className="text-xs text-gray-500 hover:text-primary inline-flex items-center gap-1 ml-1"
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
              <p className="text-gray-500 font-medium">Loading our fireworks collection...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-gray-200">
              <span className="text-6xl mb-4 block">🏮</span>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No products found</h3>
              <p className="text-gray-500">Try adjusting your search or filters</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {products.map((product: any) => (
                  <Link
                    key={product.id}
                    href={`/product/${product.id}`}
                    className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 flex flex-col"
                  >
                    <div className="aspect-square bg-gradient-to-br from-primary/5 to-amber-50 flex items-center justify-center relative overflow-hidden">
                      <span className="text-7xl group-hover:scale-110 transition-transform duration-500">
                        {product.category === 'Aerial' ? '🚀' : product.category === 'Gift Box' ? '🎁' : '🎇'}
                      </span>
                      <div className="absolute top-3 left-3">
                        <span className="bg-white/90 backdrop-blur-sm text-primary text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider shadow-sm">
                          {product.category}
                        </span>
                      </div>
                    </div>
                    <div className="p-4 flex-grow flex flex-col">
                      <h3 className="font-bold text-gray-900 mb-1 line-clamp-2 group-hover:text-primary transition-colors">
                        {product.name}
                      </h3>
                      <p className="text-sm text-gray-500 mb-3">Code: {product.code}</p>
                      <div className="mt-auto flex items-center justify-between">
                        {(() => {
                          const r = priceRange(product);
                          return (
                            <span className="text-lg font-bold text-gray-900">
                              {r.min === 0 && r.max === 0
                                ? "Price on call"
                                : r.min === r.max
                                  ? `₹${r.min.toLocaleString("en-IN")}`
                                  : `₹${r.min.toLocaleString("en-IN")} – ₹${r.max.toLocaleString("en-IN")}`}
                            </span>
                          );
                        })()}
                        <Button size="sm" variant="outline" className="rounded-full border-primary/15 text-primary hover:bg-primary/10 group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all">
                          View
                        </Button>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-12 flex justify-center items-center space-x-4">
                  <Button 
                    variant="outline" 
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="rounded-full"
                  >
                    Previous
                  </Button>
                  <span className="text-sm font-medium text-gray-600">
                    Page {page} of {totalPages}
                  </span>
                  <Button 
                    variant="outline" 
                    disabled={page === totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="rounded-full"
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
