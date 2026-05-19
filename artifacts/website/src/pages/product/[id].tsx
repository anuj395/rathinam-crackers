import { useState, useMemo, useEffect } from "react";
import { mediaUrl } from "../../lib/api";
import { useParams, Link } from "wouter";
import {
  useListPublicProducts,
  useListPublicProductReviews,
  useSubmitProductReview,
  useGetPublicSiteContent,
  useListShopWishlist,
  useAddShopWishlist,
  useRemoveShopWishlist,
} from "@workspace/api-client-react";
import { useShopAuth } from "@/context/auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/context/cart";
import { resolveBulkTier, BULK_TIER_LADDER } from "@/lib/bulk-tiers";
import { Seo, productLd, breadcrumbLd } from "@/lib/seo";
import {
  ChevronLeft,
  ShoppingCart,
  ShieldCheck,
  Info,
  Plus,
  Minus,
  CheckCircle2,
  AlertCircle,
  Truck,
  Package,
  Award,
  Sparkles,
  Phone,
  Star,
  Heart,
  Share2,
  Volume2,
  Timer,
  TrendingUp,
  Flame,
  MapPin,
  Users,
  Zap,
  Tag,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";

const categoryEmoji = (cat?: string) => {
  switch (cat) {
    case "Aerial": return "🚀";
    case "Gift Box": return "🎁";
    case "Sparkler": return "✨";
    case "Ground": return "🎆";
    case "Novelty": return "🎇";
    case "Bundle": return "📦";
    default: return "🎇";
  }
};

const formatPrice = (n: number) =>
  Number(n) > 0 ? `₹${Number(n).toLocaleString("en-IN")}` : "Price on call";

// ---- Fireworks-specific attributes per category ----------------------------
const categoryAttrs: Record<string, {
  effect: string;
  height: string;
  duration: string;
  soundLevel: number; // 0-100
  fuseTime: string;
  highlights: string[];
}> = {
  "Aerial": {
    effect: "Multi-shot burst with chrysanthemum & peony patterns",
    height: "30-50 metres",
    duration: "45-60 seconds",
    soundLevel: 78,
    fuseTime: "5-7 seconds",
    highlights: [
      "Up to 60 colour-changing shells per cake",
      "PESO-approved formulation, low residue",
      "Pre-fused — single light, multi-burst",
      "Tested for safe ground-launch on flat surface",
    ],
  },
  "Sparkler": {
    effect: "Continuous golden / silver shower",
    height: "0.5 metre",
    duration: "60-90 seconds",
    soundLevel: 12,
    fuseTime: "Instant",
    highlights: [
      "Smokeless, low residue",
      "Safe for kids under supervision",
      "Long burn time — 60+ seconds",
      "Made from premium aluminium powder",
    ],
  },
  "Ground": {
    effect: "Fountain spray with colour transitions",
    height: "2-4 metres",
    duration: "30-45 seconds",
    soundLevel: 38,
    fuseTime: "3-5 seconds",
    highlights: [
      "Stable on flat surface — no toppling",
      "Bright multi-colour transitions",
      "Low noise — celebration-friendly",
      "Compact pack, easy storage",
    ],
  },
  "Novelty": {
    effect: "Animated character / shape effect",
    height: "1-2 metres",
    duration: "20-40 seconds",
    soundLevel: 25,
    fuseTime: "3-5 seconds",
    highlights: [
      "Crowd-pleaser for kids' parties",
      "Animated effect with built-in motion",
      "Low-noise, family-safe",
      "Unique designs — stand out at celebrations",
    ],
  },
  "Gift Box": {
    effect: "Mixed assortment — sparklers, ground & aerial",
    height: "Varies (0.5-30m)",
    duration: "5-15 minutes total",
    soundLevel: 55,
    fuseTime: "Per-item fuses",
    highlights: [
      "Curated mix of best-sellers",
      "Premium presentation box",
      "Perfect for celebrations & gifting",
      "All categories covered — value pack",
    ],
  },
  "Bundle": {
    effect: "Starter mix — variety of effects",
    height: "Varies",
    duration: "10-20 minutes total",
    soundLevel: 50,
    fuseTime: "Per-item fuses",
    highlights: [
      "Best-selling combination",
      "Pre-tested mix — no duplicates",
      "Saves 15-20% vs individual purchase",
      "Includes safety lighting tools",
    ],
  },
};

const defaultAttrs = categoryAttrs["Ground"];

// ---- Brand metadata ---------------------------------------------------------
const brandInfo: Record<string, { tagline: string; description: string; rating: number; since: string; emoji: string }> = {
  "Standard": {
    tagline: "Trusted in-house brand",
    description: "Our flagship in-house line — value pricing, consistent quality, available across all categories.",
    rating: 4.3,
    since: "2010",
    emoji: "🏷️",
  },
  "Sri Kaliswari": {
    tagline: "Premium · Sivakasi heritage",
    description: "One of India's oldest and most respected fireworks brands. Hand-crafted in Sivakasi for over 80 years.",
    rating: 4.8,
    since: "1942",
    emoji: "👑",
  },
  "Cock Brand": {
    tagline: "Budget-friendly · Family favourite",
    description: "Affordable everyday fireworks loved by families across Tamil Nadu. Reliable performance at a great price.",
    rating: 4.1,
    since: "1965",
    emoji: "🐓",
  },
  "Coronation": {
    tagline: "Mid-tier · Aerial specialist",
    description: "Known for spectacular aerial shells and multi-shot cakes. A favourite for stage shows and weddings.",
    rating: 4.5,
    since: "1978",
    emoji: "🎆",
  },
};

const defaultBrandInfo = {
  tagline: "Sivakasi-made",
  description: "Hand-crafted by master artisans in the firework capital of India.",
  rating: 4.2,
  since: "—",
  emoji: "🎇",
};

const DEFAULT_PRODUCT_FAQS = [
  { q: "Is this product PESO/CCOE approved?", a: "Yes. All fireworks sold by Rathinam Crackers are PESO-approved with valid CCOE licences. Our SKUs and HSN codes are registered with the Tamil Nadu Pyrotechnics Board." },
  { q: "Can I get a tax invoice (GST)?", a: "Absolutely. Every order ships with a proper GST tax invoice. Add your GSTIN at checkout to claim input credit if you're a business buyer." },
  { q: "How is this product shipped?", a: "Fireworks ship by surface-only courier (legal requirement). Packaging is double-walled corrugated with anti-static lining. Delivery is 3-7 working days across Tamil Nadu and 5-10 days pan-India." },
  { q: "What is the shelf life?", a: "Fireworks are best used within 18 months from the manufacturing date stamped on the pack. Store in a cool, dry place away from heat and direct sunlight." },
  { q: "Do you offer bulk discounts?", a: "Yes — bulk pricing kicks in automatically at 10+ units. For wholesale (50+ units) please call our bulk desk for a custom quote." },
  { q: "What is the return / refund policy?", a: "Damaged-in-transit items can be returned within 48 hours of delivery with photos. Used or partially-used fireworks cannot be returned for safety reasons." },
];

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return "";
  const diff = Math.max(0, Date.now() - d);
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Today";
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) === 1 ? "" : "s"} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) === 1 ? "" : "s"} ago`;
  return `${Math.floor(days / 365)} year${Math.floor(days / 365) === 1 ? "" : "s"} ago`;
}

export default function ProductDetail() {
  const { id } = useParams();
  const { addItem } = useCart();
  const { toast } = useToast();

  const [qty, setQty] = useState(1);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const { isLoggedIn } = useShopAuth();
  const [, navigate] = useLocation();
  const { data: wishResp, refetch: refetchWish } = useListShopWishlist({ query: { enabled: isLoggedIn } as any });
  const addWish = useAddShopWishlist();
  const removeWish = useRemoveShopWishlist();
  const wishlistItems = ((wishResp as any)?.data ?? []) as Array<{ productId: string }>;
  const wishlisted = isLoggedIn && wishlistItems.some((w) => w.productId === id);

  const { data: publicProducts, isLoading } = useListPublicProducts({ limit: 500 });
  const { data: reviewsResp, refetch: refetchReviews } = useListPublicProductReviews(id ?? "");
  const { data: siteContent } = useGetPublicSiteContent();
  const submitReview = useSubmitProductReview();

  const reviews = ((reviewsResp as any)?.data ?? []) as Array<{
    id: string;
    authorName: string;
    city?: string;
    rating: number;
    title?: string;
    body: string;
    verified?: boolean;
    createdAt?: string;
  }>;
  const reviewSummary = ((reviewsResp as any)?.summary ?? null) as
    | { total: number; average: number; distribution: Array<{ stars: number; count: number; pct: number }> }
    | null;

  const productFaqs =
    ((siteContent?.data as any)?.productFaqs?.length
      ? (siteContent?.data as any).productFaqs
      : DEFAULT_PRODUCT_FAQS) as Array<{ q: string; a: string }>;

  const [reviewForm, setReviewForm] = useState({ name: "", city: "", rating: 5, title: "", body: "" });
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  const product = useMemo(() => {
    return publicProducts?.data?.find((p: any) => p.id === id);
  }, [publicProducts, id]);

  // Group variants by brand. brand is optional → fallback "Standard".
  const brandGroups = useMemo(() => {
    if (!product?.variants?.length) return [] as Array<{ brand: string; variants: any[] }>;
    const map = new Map<string, any[]>();
    for (const v of product.variants) {
      const b = v.brand || "Standard";
      if (!map.has(b)) map.set(b, []);
      map.get(b)!.push(v);
    }
    return Array.from(map.entries()).map(([brand, variants]) => ({ brand, variants }));
  }, [product]);

  const isMultiBrand = brandGroups.length > 1;

  // Reset transient UI state when product changes (image / qty only).
  useEffect(() => {
    setSelectedVariantId(null);
    setActiveImage(0);
    setQty(1);
  }, [id]);

  // Atomic brand init/validation: if current brand is invalid for the loaded
  // product (or null), snap to the first available brand. This avoids the
  // flicker between "null brand → first brand" on cross-product navigation.
  useEffect(() => {
    if (brandGroups.length === 0) {
      if (selectedBrand !== null) setSelectedBrand(null);
      return;
    }
    const exists = selectedBrand && brandGroups.some((g) => g.brand === selectedBrand);
    if (!exists) {
      setSelectedBrand(brandGroups[0].brand);
    }
  }, [brandGroups, selectedBrand]);

  const visibleVariants = useMemo(() => {
    if (!selectedBrand) return product?.variants ?? [];
    return brandGroups.find((g) => g.brand === selectedBrand)?.variants ?? [];
  }, [brandGroups, selectedBrand, product]);

  const selectedVariant: any = useMemo(() => {
    if (!visibleVariants?.length) return null;
    if (selectedVariantId) {
      const found = visibleVariants.find((v: any) => v.variantId === selectedVariantId);
      if (found) return found;
    }
    return visibleVariants[0];
  }, [visibleVariants, selectedVariantId]);

  // Related products — same category, exclude current.
  const related = useMemo(() => {
    if (!product || !publicProducts?.data) return [];
    return publicProducts.data
      .filter((p: any) => p.category === product.category && p.id !== product.id)
      .slice(0, 4);
  }, [publicProducts, product]);

  // Frequently bought together — different category, featured first.
  const frequentlyBought = useMemo(() => {
    if (!product || !publicProducts?.data) return [];
    return publicProducts.data
      .filter((p: any) => p.id !== product.id && p.category !== product.category)
      .sort((a: any, b: any) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))
      .slice(0, 3);
  }, [publicProducts, product]);

  const variantLabel = (v: any) => {
    const parts = [v?.brand, v?.size, v?.packContent].filter(Boolean);
    return parts.join(" · ") || "Standard";
  };

  const handleAddToCart = () => {
    if (!product || !selectedVariant) return;

    const retailOnlinePrice = Number(selectedVariant.prices?.retailOnline) || 0;
    const wholesaleBulkPrice = Number(selectedVariant.prices?.wholesaleBulk) || 0;
    if (retailOnlinePrice <= 0) {
      toast({
        title: "Price unavailable",
        description: "Please call us on +91 98765 43210 to confirm pricing.",
        variant: "destructive",
      });
      return;
    }

    const tier = resolveBulkTier(retailOnlinePrice, wholesaleBulkPrice, qty);

    addItem({
      productId: product.id ?? "",
      variantId: selectedVariant.variantId ?? "",
      productName: product.name ?? "Product",
      variantLabel: variantLabel(selectedVariant),
      qty,
      unitPrice: tier.unitPrice,
      retailOnline: retailOnlinePrice,
      wholesaleBulk: wholesaleBulkPrice,
      bulkTier: tier.label,
      savePerUnit: tier.savePerUnit,
    });

    toast({
      title: "Added to cart",
      description: `${qty} × ${product.name} (${variantLabel(selectedVariant)}) added.`,
    });
  };

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: product?.name, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied", description: "Product link copied to clipboard." });
      }
    } catch {
      /* user cancelled */
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-20 flex flex-col items-center">
          <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-500">Discovering product details...</p>
        </div>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-20 text-center">
          <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Product Not Found</h2>
          <p className="text-gray-500 mb-8">The product you're looking for doesn't exist or has been removed.</p>
          <Link href="/catalogue">
            <Button className="bg-primary">Back to Catalogue</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const emoji = categoryEmoji(product.category);
  // Real uploaded images take priority over the emoji fallback. We dedupe
  // because the cover image often appears as the first gallery entry too.
  const productAny = product as typeof product & { imageUrl?: string; gallery?: string[] };
  const realImages = [productAny.imageUrl, ...(productAny.gallery ?? [])].map((u) => mediaUrl(u as string | undefined))
    .filter((u): u is string => !!u && typeof u === "string" && u.length > 0)
    .filter((u, i, a) => a.indexOf(u) === i);
  const galleryFrames: string[] = realImages.length > 0 ? realImages : [emoji, "🎆", "✨", "🎇"];
  const usingRealImages = realImages.length > 0;
  const onlinePrice = Number(selectedVariant?.prices?.retailOnline) || 0;
  const estPrice = Number(selectedVariant?.prices?.retailEst) || 0;
  const wholesalePrice = Number(selectedVariant?.prices?.wholesaleBulk) || 0;
  const discount = estPrice > onlinePrice && onlinePrice > 0
    ? Math.round(((estPrice - onlinePrice) / estPrice) * 100)
    : 0;

  // Compute the "from" price for each brand chip (smallest size).
  const brandStartingPrice = (brand: string) => {
    const variants = brandGroups.find((g) => g.brand === brand)?.variants ?? [];
    const prices = variants
      .map((v: any) => Number(v.prices?.retailOnline) || 0)
      .filter((n) => n > 0);
    return prices.length ? Math.min(...prices) : 0;
  };

  const attrs = categoryAttrs[product.category as string] ?? defaultAttrs;
  const currentBrandInfo = (selectedBrand && brandInfo[selectedBrand]) || defaultBrandInfo;

  // Real review aggregate (zeros when no reviews yet).
  const avgRating = reviewSummary?.average ?? 0;
  const totalReviews = reviewSummary?.total ?? 0;
  const ratingDistribution =
    reviewSummary?.distribution ?? [5, 4, 3, 2, 1].map((stars) => ({ stars, count: 0, pct: 0 }));

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    try {
      await submitReview.mutateAsync({
        id: product.id ?? "",
        data: {
          authorName: reviewForm.name,
          city: reviewForm.city,
          rating: reviewForm.rating,
          title: reviewForm.title,
          body: reviewForm.body,
        } as any,
      });
      setReviewSubmitted(true);
      setReviewForm({ name: "", city: "", rating: 5, title: "", body: "" });
      toast({ title: "Thank you!", description: "Your review has been submitted for moderation." });
      refetchReviews();
    } catch {
      toast({ title: "Could not submit", description: "Please try again later.", variant: "destructive" });
    }
  };

  // Bulk pricing tiers — single source of truth shared with cart + server.
  const currentTier = resolveBulkTier(onlinePrice, wholesalePrice, qty);
  const bulkTiers = onlinePrice > 0 && wholesalePrice > 0 && wholesalePrice < onlinePrice
    ? BULK_TIER_LADDER.map((t) => {
        const tierResult = resolveBulkTier(onlinePrice, wholesalePrice, t.from);
        return { from: t.from, to: t.to, price: tierResult.unitPrice, save: t.discountPct, label: t.label };
      })
    : [];

  // Stock indicator (mocked from variant id hash → 5..50).
  const mockStock = selectedVariant?.variantId
    ? 5 + (selectedVariant.variantId.length * 7) % 45
    : 0;
  const stockState = mockStock > 20 ? "high" : mockStock > 8 ? "medium" : "low";

  const seoPrice = Number(selectedVariant?.prices?.retailOnline) || 0;
  const seoDescription = `${product.name} — ${product.category ?? "fireworks"} from Rathinam Crackers, Sivakasi. PESO-licensed, GST invoice, pan-India shipping.`;

  return (
    <Layout>
      <Seo
        title={`${product.name} — Buy Online`}
        description={seoDescription}
        path={`/product/${product.id}`}
        type="product"
        jsonLd={[
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Catalogue", path: "/catalogue" },
            ...(product.category ? [{ name: String(product.category), path: `/catalogue?category=${encodeURIComponent(String(product.category))}` }] : []),
            { name: String(product.name ?? "Product"), path: `/product/${product.id ?? ""}` },
          ]),
          productLd({
            name: String(product.name ?? "Product"),
            description: seoDescription,
            sku: product.code ? String(product.code) : undefined,
            category: product.category ? String(product.category) : undefined,
            brand: selectedBrand ?? undefined,
            price: seoPrice,
            inStock: mockStock > 0,
            ratingValue: avgRating > 0 ? avgRating : undefined,
            ratingCount: totalReviews > 0 ? totalReviews : undefined,
          }),
        ]}
      />
      <div className="bg-white pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Breadcrumb */}
          <nav className="flex items-center text-sm text-gray-500 mb-8" data-testid="breadcrumb">
            <Link href="/" className="hover:text-primary transition-colors">Home</Link>
            <span className="mx-2">/</span>
            <Link href="/catalogue" className="hover:text-primary transition-colors">Catalogue</Link>
            <span className="mx-2">/</span>
            <span className="hover:text-primary transition-colors">{product.category}</span>
            <span className="mx-2">/</span>
            <span className="text-gray-900 font-medium truncate">{product.name}</span>
          </nav>

          <Link href="/catalogue" className="inline-flex items-center text-sm text-gray-500 hover:text-primary mb-6 transition-colors">
            <ChevronLeft className="h-4 w-4 mr-1" /> Back to Catalogue
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
            {/* ---------- Gallery ---------- */}
            <div>
              <div className="aspect-square rounded-3xl bg-gradient-to-br from-primary/10 via-amber-500/10 to-yellow-300/10 flex items-center justify-center relative overflow-hidden group">
                {usingRealImages ? (
                  <img
                    key={activeImage}
                    src={galleryFrames[activeImage]}
                    alt={product.name}
                    className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700 animate-in fade-in zoom-in"
                    data-testid="product-hero-image"
                  />
                ) : (
                  <span
                    key={activeImage}
                    className="text-[12rem] transform group-hover:scale-110 transition-transform duration-700 animate-in fade-in zoom-in"
                    data-testid="product-hero-image"
                  >
                    {galleryFrames[activeImage]}
                  </span>
                )}
                <div className="absolute top-6 left-6 flex flex-col gap-2">
                  <Badge className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-1.5 rounded-full text-xs uppercase tracking-widest border-none">
                    {product.category}
                  </Badge>
                  {(product as any).featured && (
                    <Badge className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-1.5 rounded-full text-xs uppercase tracking-widest border-none">
                      <Sparkles className="h-3 w-3 mr-1" /> Featured
                    </Badge>
                  )}
                </div>
                <div className="absolute top-6 right-6 flex flex-col gap-2 items-end">
                  {discount > 0 && (
                    <Badge className="bg-green-600 text-white px-4 py-1.5 rounded-full text-xs uppercase tracking-widest border-none">
                      {discount}% OFF
                    </Badge>
                  )}
                  <button
                    onClick={async () => {
                      if (!isLoggedIn) {
                        navigate(`/login?next=${encodeURIComponent(`/product/${id}`)}`);
                        return;
                      }
                      try {
                        if (wishlisted) {
                          await removeWish.mutateAsync({ productId: id! });
                          toast({ title: "Removed from wishlist" });
                        } else {
                          await addWish.mutateAsync({ data: { productId: id! } });
                          toast({ title: "Added to wishlist" });
                        }
                        refetchWish();
                      } catch {
                        toast({ title: "Could not update wishlist", variant: "destructive" });
                      }
                    }}
                    className="bg-white/90 backdrop-blur p-2.5 rounded-full hover:bg-white shadow-sm transition-all"
                    data-testid="wishlist-btn"
                  >
                    <Heart className={`h-5 w-5 ${wishlisted ? "fill-red-600 text-primary" : "text-gray-700"}`} />
                  </button>
                  <button
                    onClick={handleShare}
                    className="bg-white/90 backdrop-blur p-2.5 rounded-full hover:bg-white shadow-sm transition-all"
                    data-testid="share-btn"
                  >
                    <Share2 className="h-5 w-5 text-gray-700" />
                  </button>
                </div>
              </div>
              {/* Thumbnails */}
              <div className="grid grid-cols-4 gap-3 mt-4">
                {galleryFrames.map((frame, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImage(idx)}
                    className={`aspect-square rounded-xl flex items-center justify-center text-3xl transition-all overflow-hidden ${
                      activeImage === idx
                        ? "bg-primary/10 border-2 border-primary"
                        : "bg-gray-50 border-2 border-transparent hover:border-gray-200"
                    }`}
                    data-testid={`thumbnail-${idx}`}
                  >
                    {frame}
                  </button>
                ))}
              </div>

              {/* Effect attributes — mini stat cards */}
              <div className="grid grid-cols-2 gap-3 mt-6">
                <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 p-4 border border-purple-100">
                  <div className="flex items-center text-purple-700 mb-2">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Height</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900">{attrs.height}</p>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 p-4 border border-amber-100">
                  <div className="flex items-center text-amber-700 mb-2">
                    <Timer className="h-4 w-4 mr-2" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Duration</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900">{attrs.duration}</p>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 p-4 border border-blue-100">
                  <div className="flex items-center text-blue-700 mb-2">
                    <Volume2 className="h-4 w-4 mr-2" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Sound Level</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900">{attrs.soundLevel} dB</p>
                  <Progress value={attrs.soundLevel} className="h-1.5 mt-2" />
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-primary/5 to-amber-50 p-4 border border-primary/15">
                  <div className="flex items-center text-primary mb-2">
                    <Flame className="h-4 w-4 mr-2" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Fuse Time</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900">{attrs.fuseTime}</p>
                </div>
              </div>
            </div>

            {/* ---------- Info ---------- */}
            <div className="flex flex-col">
              <div className="mb-6">
                <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-3" data-testid="product-name">{product.name}</h1>

                {/* Rating + meta */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <div className="flex items-center" data-testid="rating-stars">
                    {[1,2,3,4,5].map((s) => (
                      <Star
                        key={s}
                        className={`h-4 w-4 ${s <= Math.round(avgRating) ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
                      />
                    ))}
                    <span className="ml-2 font-bold text-gray-900">{avgRating > 0 ? avgRating.toFixed(1) : "—"}</span>
                    <a href="#reviews" className="ml-1 text-xs text-gray-500 hover:text-primary">({totalReviews} review{totalReviews === 1 ? "" : "s"})</a>
                  </div>
                  <Separator orientation="vertical" className="h-4" />
                  <span className="flex items-center text-xs text-gray-500">
                    <Users className="h-3.5 w-3.5 mr-1" />
                    1,200+ orders
                  </span>
                  <Separator orientation="vertical" className="h-4" />
                  <span className="flex items-center text-xs text-gray-500">
                    <MapPin className="h-3.5 w-3.5 mr-1" />
                    Sivakasi, TN
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
                  <span className="flex items-center">
                    <Info className="h-3.5 w-3.5 mr-1 text-amber-500" />
                    HSN: {product.hsnCode}
                  </span>
                  <span className="flex items-center">
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-green-500" />
                    SKU: {product.code}
                  </span>
                  {isMultiBrand && (
                    <span className="flex items-center">
                      <Award className="h-3.5 w-3.5 mr-1 text-primary" />
                      {brandGroups.length} brands available
                    </span>
                  )}
                </div>
              </div>

              {/* Effect highlight pill */}
              <div className="mb-6 rounded-2xl bg-gradient-to-r from-primary/5 via-amber-50 to-yellow-50 border border-amber-100 p-4 flex items-start">
                <Zap className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5 mr-3" />
                <div>
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-1">Effect</p>
                  <p className="text-sm text-gray-800 font-medium">{attrs.effect}</p>
                </div>
              </div>

              {/* ---------- Brand selector (only if multi-brand) ---------- */}
              {isMultiBrand && (
                <div className="mb-6" data-testid="brand-selector">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-3 flex items-center">
                    <Award className="h-4 w-4 mr-2 text-primary" /> Choose Brand
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {brandGroups.map(({ brand }) => {
                      const isActive = brand === selectedBrand;
                      const startPrice = brandStartingPrice(brand);
                      const info = brandInfo[brand] || defaultBrandInfo;
                      return (
                        <button
                          key={brand}
                          onClick={() => setSelectedBrand(brand)}
                          className={`relative px-4 py-3 rounded-2xl border-2 transition-all text-left overflow-hidden ${
                            isActive
                              ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                              : "border-gray-100 bg-gray-50 hover:border-gray-200"
                          }`}
                          data-testid={`brand-${brand.replace(/\s+/g, "-").toLowerCase()}`}
                        >
                          <div className="flex items-start justify-between mb-1.5">
                            <div className="flex items-center">
                              <span className="text-2xl mr-2">{info.emoji}</span>
                              <div>
                                <span className={`block text-sm font-bold ${isActive ? "text-primary" : "text-gray-900"}`}>
                                  {brand}
                                </span>
                                <span className="block text-[10px] text-gray-500 leading-tight">
                                  {info.tagline}
                                </span>
                              </div>
                            </div>
                            {isActive && <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />}
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="flex items-center text-amber-600">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400 mr-0.5" />
                              {info.rating}
                            </span>
                            <span className="font-bold text-gray-700">from {formatPrice(startPrice)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {/* Active brand info card */}
                  <div className="mt-3 p-3 rounded-xl bg-blue-50/40 border border-blue-100 text-xs text-gray-700">
                    <span className="font-bold text-blue-700">{selectedBrand}</span>
                    <span className="text-gray-500"> · Est. {currentBrandInfo.since}</span>
                    <p className="mt-1 leading-relaxed">{currentBrandInfo.description}</p>
                  </div>
                </div>
              )}

              {/* ---------- Variants ---------- */}
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-3">
                  {isMultiBrand ? `${selectedBrand} — Select Size` : "Select Variant"}
                </h3>
                <div className="flex flex-wrap gap-3" data-testid="variant-selector">
                  {visibleVariants.map((v: any, idx: number) => {
                    const isActive =
                      selectedVariantId === v.variantId ||
                      (!selectedVariantId && idx === 0);
                    return (
                      <button
                        key={v.variantId ?? idx}
                        onClick={() => setSelectedVariantId(v.variantId ?? null)}
                        className={`px-5 py-3 rounded-2xl border-2 transition-all text-sm font-bold text-left min-w-[120px] ${
                          isActive
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200"
                        }`}
                        data-testid={`variant-${v.variantId}`}
                      >
                        <span className="block">{v.size ?? "Standard"}</span>
                        {v.packContent && (
                          <span className="block text-[10px] font-semibold opacity-70 mt-0.5">
                            {v.packContent}
                          </span>
                        )}
                        <span className="block text-[11px] font-semibold mt-1">
                          {formatPrice(Number(v.prices?.retailOnline) || 0)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Stock indicator */}
              {selectedVariant && (
                <div className="mb-4 flex items-center text-sm" data-testid="stock-indicator">
                  <span className={`inline-block h-2 w-2 rounded-full mr-2 ${
                    stockState === "high" ? "bg-green-500" : stockState === "medium" ? "bg-amber-500" : "bg-primary/100"
                  }`} />
                  <span className="font-semibold text-gray-700">
                    {stockState === "high" ? "In Stock" : stockState === "medium" ? "Limited Stock" : "Hurry – Low Stock"}
                  </span>
                  <span className="ml-2 text-xs text-gray-500">
                    ({mockStock} units available · {stockState === "low" ? "Order now!" : "Ready to ship"})
                  </span>
                </div>
              )}

              {/* ---------- Price & Qty ---------- */}
              {selectedVariant && (
                <div className="bg-gradient-to-br from-gray-50 to-white rounded-3xl p-6 sm:p-8 mb-6 border border-gray-100 shadow-sm" data-testid="price-card">
                  <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
                    <div>
                      <p className="text-sm text-gray-500 font-medium mb-1">
                        Online price · per {selectedVariant.unit?.toLowerCase() ?? "unit"}
                      </p>
                      <div className="flex items-baseline gap-3">
                        <span className="text-4xl font-extrabold text-gray-900" data-testid="selected-price">
                          {formatPrice(onlinePrice)}
                        </span>
                        {estPrice > onlinePrice && (
                          <span className="text-lg text-gray-400 line-through">
                            {formatPrice(estPrice)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Inclusive of all taxes · Free shipping over ₹2,000</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 uppercase tracking-tighter">Contents</p>
                      <p className="font-bold text-gray-700">{selectedVariant.packContent ?? "1 Pack"}</p>
                      {selectedVariant.brand && (
                        <p className="text-xs text-primary font-semibold mt-1">{selectedVariant.brand}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center bg-white border border-gray-200 rounded-full p-1 shadow-sm">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Decrease quantity"
                        disabled={onlinePrice <= 0}
                        className="rounded-full h-10 w-10 hover:bg-gray-100 text-gray-600 disabled:opacity-40"
                        onClick={() => setQty(Math.max(1, qty - 1))}
                        data-testid="qty-decrement"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number"
                        value={qty}
                        disabled={onlinePrice <= 0}
                        aria-label="Quantity"
                        onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16 border-none text-center font-bold text-lg focus-visible:ring-0 disabled:opacity-40"
                        data-testid="qty-input"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Increase quantity"
                        disabled={onlinePrice <= 0}
                        className="rounded-full h-10 w-10 hover:bg-gray-100 text-gray-600 disabled:opacity-40"
                        onClick={() => setQty(qty + 1)}
                        data-testid="qty-increment"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    {onlinePrice > 0 ? (
                      <Button
                        className="flex-grow h-14 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full font-bold text-lg shadow-lg shadow-[hsl(197,65%,12%)]/10"
                        onClick={handleAddToCart}
                        data-testid="add-to-cart"
                      >
                        <ShoppingCart className="mr-2 h-5 w-5" /> Add to Cart
                      </Button>
                    ) : (
                      <a
                        href="tel:+919876543210"
                        className="flex-grow h-14 bg-amber-500 hover:bg-amber-600 text-white rounded-full font-bold text-lg shadow-lg shadow-amber-900/10 inline-flex items-center justify-center"
                        data-testid="contact-for-price"
                      >
                        <Phone className="mr-2 h-5 w-5" /> Contact for Price
                      </a>
                    )}
                  </div>

                  {onlinePrice > 0 && (
                    <div className="mt-5 pt-5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-gray-500">
                        Total: <span className="font-bold text-gray-900 text-lg">{formatPrice(currentTier.unitPrice * qty)}</span>
                        {qty > 1 && <span className="text-xs ml-1">({qty} × {formatPrice(currentTier.unitPrice)})</span>}
                        {currentTier.bulkRateApplied && (
                          <span className="text-xs ml-2 line-through text-gray-400">{formatPrice(onlinePrice * qty)}</span>
                        )}
                      </p>
                      {currentTier.bulkRateApplied && (
                        <p className="text-xs font-bold text-green-700 bg-green-50 px-3 py-1.5 rounded-full">
                          🎉 {currentTier.label} pricing applied — save {formatPrice(currentTier.savePerUnit * qty)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Bulk pricing tier table */}
              {bulkTiers.length > 0 && (
                <div className="mb-6 rounded-2xl border border-gray-100 overflow-hidden" data-testid="bulk-pricing">
                  <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-5 py-3 flex items-center justify-between">
                    <span className="text-sm font-bold flex items-center">
                      <Tag className="h-4 w-4 mr-2" /> Volume Discount
                    </span>
                    <span className="text-xs opacity-90">Auto-applied at checkout</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {bulkTiers.map((t, i) => {
                        const inTier = qty >= t.from && (t.to === undefined || qty <= t.to);
                        return (
                          <tr key={i} className={inTier ? "bg-green-50/60 font-semibold" : "border-t border-gray-50"}>
                            <td className="px-5 py-2.5 text-gray-600">
                              {t.label}
                              <span className="text-xs text-gray-400 ml-2">
                                ({t.from}{t.to ? `-${t.to}` : "+"} units)
                              </span>
                            </td>
                            <td className="px-5 py-2.5 text-right text-gray-900">{formatPrice(t.price)}</td>
                            <td className="px-5 py-2.5 text-right text-green-700 w-20">
                              {t.save > 0 ? `-${t.save}%` : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ---------- Trust strip ---------- */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-6 border-t border-gray-100">
                <div className="flex flex-col items-center text-center">
                  <ShieldCheck className="h-6 w-6 text-green-500 mb-2" />
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">PESO Approved</span>
                </div>
                <div className="flex flex-col items-center text-center">
                  <CheckCircle2 className="h-6 w-6 text-amber-500 mb-2" />
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">100% Original</span>
                </div>
                <div className="flex flex-col items-center text-center">
                  <Truck className="h-6 w-6 text-blue-500 mb-2" />
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Pan-India Delivery</span>
                </div>
                <div className="flex flex-col items-center text-center">
                  <Package className="h-6 w-6 text-primary mb-2" />
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Secure Packaging</span>
                </div>
              </div>
            </div>
          </div>

          {/* ---------- Tabs: Overview / Specs / Reviews / FAQs ---------- */}
          <div className="mt-16">
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 max-w-2xl mx-auto rounded-full bg-gray-100 p-1.5 h-auto">
                <TabsTrigger value="overview" className="rounded-full data-[state=active]:bg-white data-[state=active]:shadow-sm py-2 text-xs sm:text-sm" data-testid="tab-overview">Overview</TabsTrigger>
                <TabsTrigger value="specs" className="rounded-full data-[state=active]:bg-white data-[state=active]:shadow-sm py-2 text-xs sm:text-sm" data-testid="tab-specs">Specifications</TabsTrigger>
                <TabsTrigger value="reviews" className="rounded-full data-[state=active]:bg-white data-[state=active]:shadow-sm py-2 text-xs sm:text-sm" data-testid="tab-reviews">Reviews ({totalReviews})</TabsTrigger>
                <TabsTrigger value="faqs" className="rounded-full data-[state=active]:bg-white data-[state=active]:shadow-sm py-2 text-xs sm:text-sm" data-testid="tab-faqs">FAQs</TabsTrigger>
              </TabsList>

              {/* OVERVIEW */}
              <TabsContent value="overview" className="mt-8" data-testid="overview-content">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2">
                    <h3 className="text-xl font-extrabold text-gray-900 mb-4">About this product</h3>
                    <p className="text-gray-700 leading-relaxed mb-4">
                      The <strong>{product.name}</strong> is part of our {product.category?.toLowerCase()} collection,
                      hand-crafted in <strong>Sivakasi, Tamil Nadu</strong> — the firework capital of India. Every batch
                      is quality-tested for ignition reliability, colour vibrance, and burn duration before it leaves our
                      warehouse.
                    </p>
                    <p className="text-gray-700 leading-relaxed mb-6">
                      {currentBrandInfo.description}
                    </p>

                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-3">Highlights</h4>
                    <ul className="space-y-2">
                      {attrs.highlights.map((h, i) => (
                        <li key={i} className="flex items-start text-gray-700">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-6">
                    <h3 className="text-lg font-extrabold text-gray-900 mb-4 flex items-center">
                      <ShieldCheck className="h-5 w-5 mr-2 text-amber-600" /> Safety First
                    </h3>
                    <ul className="space-y-2.5 text-sm text-gray-700">
                      <li className="flex"><span className="text-amber-600 mr-2 font-bold">•</span>Adult supervision required</li>
                      <li className="flex"><span className="text-amber-600 mr-2 font-bold">•</span>Light only in open spaces</li>
                      <li className="flex"><span className="text-amber-600 mr-2 font-bold">•</span>Keep water/sand bucket nearby</li>
                      <li className="flex"><span className="text-amber-600 mr-2 font-bold">•</span>Don't relight a "dud" — soak in water</li>
                      <li className="flex"><span className="text-amber-600 mr-2 font-bold">•</span>Wear cotton clothing</li>
                      <li className="flex"><span className="text-amber-600 mr-2 font-bold">•</span>Store cool & dry, away from heat</li>
                    </ul>
                    <Separator className="my-4" />
                    <a href="tel:+919876543210" className="flex items-center text-xs text-gray-600 hover:text-primary">
                      <Phone className="h-4 w-4 mr-2" /> Help: <span className="font-bold ml-1">+91 98765 43210</span>
                    </a>
                  </div>
                </div>
              </TabsContent>

              {/* SPECS */}
              <TabsContent value="specs" className="mt-8" data-testid="specs-content">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-6">
                    <h3 className="text-lg font-extrabold text-gray-900 mb-4">Product Details</h3>
                    <dl className="space-y-3 text-sm">
                      {[
                        ["Product Code", product.code],
                        ["Category", product.category],
                        ["HSN Code", product.hsnCode],
                        ["Origin", "Sivakasi, Tamil Nadu, India"],
                        ["Manufacturer", currentBrandInfo.since !== "—" ? `Est. ${currentBrandInfo.since}` : "—"],
                        ["Total Variants", String(product.variants?.length ?? 0)],
                        ["Brands Available", String(brandGroups.length)],
                        ["Status", "Active · In Stock"],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between border-b border-gray-100 pb-2 last:border-0">
                          <dt className="text-gray-500">{k}</dt>
                          <dd className="font-semibold text-gray-900 text-right">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-6">
                    <h3 className="text-lg font-extrabold text-gray-900 mb-4">Performance</h3>
                    <dl className="space-y-3 text-sm">
                      {[
                        ["Effect Type", attrs.effect],
                        ["Burst Height", attrs.height],
                        ["Total Duration", attrs.duration],
                        ["Sound Level", `${attrs.soundLevel} dB`],
                        ["Fuse Time", attrs.fuseTime],
                        ["Selected Brand", selectedVariant?.brand ?? "—"],
                        ["Selected Size", selectedVariant?.size ?? "—"],
                        ["Pack Content", selectedVariant?.packContent ?? "—"],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between border-b border-gray-100 pb-2 last:border-0">
                          <dt className="text-gray-500">{k}</dt>
                          <dd className="font-semibold text-gray-900 text-right">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>

                {/* Variant matrix */}
                {product.variants && product.variants.length > 1 && (
                  <div className="mt-6 rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="bg-gray-50 px-5 py-3 border-b border-gray-100">
                      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">All Variants</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50/50">
                        <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                          <th className="px-5 py-2.5">Brand</th>
                          <th className="px-5 py-2.5">Size</th>
                          <th className="px-5 py-2.5">Pack</th>
                          <th className="px-5 py-2.5 text-right">Price</th>
                          <th className="px-5 py-2.5 text-right">Bulk (10+)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {product.variants.map((v: any, i: number) => (
                          <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                            <td className="px-5 py-2.5 font-semibold text-gray-900">{v.brand ?? "Standard"}</td>
                            <td className="px-5 py-2.5 text-gray-600">{v.size ?? "—"}</td>
                            <td className="px-5 py-2.5 text-gray-600">{v.packContent ?? "—"}</td>
                            <td className="px-5 py-2.5 text-right font-semibold text-gray-900">
                              {formatPrice(Number(v.prices?.retailOnline) || 0)}
                            </td>
                            <td className="px-5 py-2.5 text-right text-green-700">
                              {formatPrice(Number(v.prices?.wholesaleBulk) || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* REVIEWS */}
              <TabsContent value="reviews" className="mt-8" data-testid="reviews-content">
                <div id="reviews" className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 p-6 text-center">
                    <p className="text-5xl font-extrabold text-gray-900">{avgRating > 0 ? avgRating.toFixed(1) : "—"}</p>
                    <div className="flex justify-center my-2">
                      {[1,2,3,4,5].map((s) => (
                        <Star key={s} className={`h-5 w-5 ${s <= Math.round(avgRating) ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                      ))}
                    </div>
                    <p className="text-sm text-gray-600 font-medium">{totalReviews} review{totalReviews === 1 ? "" : "s"}</p>
                    <Separator className="my-4" />
                    <div className="space-y-1.5 text-left">
                      {ratingDistribution.map((r) => (
                        <div key={r.stars} className="flex items-center text-xs">
                          <span className="w-8 text-gray-600">{r.stars}★</span>
                          <Progress value={r.pct} className="h-1.5 flex-1 mx-2" />
                          <span className="w-8 text-right text-gray-500">{r.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-4">
                    {reviews.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center bg-gray-50">
                        <p className="text-sm text-gray-600">No reviews yet. Be the first to share your experience!</p>
                      </div>
                    ) : (
                      reviews.map((r, i) => (
                        <div key={r.id ?? i} className="rounded-2xl border border-gray-100 p-5 bg-white" data-testid={`review-${i}`}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center">
                              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-amber-500 text-white font-bold flex items-center justify-center mr-3">
                                {(r.authorName || "·").charAt(0)}
                              </div>
                              <div>
                                <p className="font-bold text-gray-900 text-sm flex items-center">
                                  {r.authorName}
                                  {r.verified && (
                                    <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold flex items-center">
                                      <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Verified
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {[r.city, timeAgo(r.createdAt)].filter(Boolean).join(" · ")}
                                </p>
                              </div>
                            </div>
                            <div className="flex">
                              {[1,2,3,4,5].map((s) => (
                                <Star key={s} className={`h-3.5 w-3.5 ${s <= r.rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                              ))}
                            </div>
                          </div>
                          {r.title ? <p className="font-semibold text-gray-900 text-sm mb-1">{r.title}</p> : null}
                          <p className="text-sm text-gray-600 leading-relaxed">{r.body}</p>
                        </div>
                      ))
                    )}

                    <div className="rounded-2xl border border-gray-100 p-5 bg-white" data-testid="review-form">
                      <h3 className="font-bold text-gray-900 mb-1">Write a review</h3>
                      <p className="text-xs text-gray-500 mb-3">Reviews are checked by our team before publishing.</p>
                      {reviewSubmitted ? (
                        <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded p-3">
                          Thanks! Your review will appear once approved.
                        </p>
                      ) : (
                        <form onSubmit={handleSubmitReview} className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Input
                              placeholder="Your name"
                              required
                              value={reviewForm.name}
                              onChange={(e) => setReviewForm({ ...reviewForm, name: e.target.value })}
                              data-testid="review-name"
                            />
                            <Input
                              placeholder="City (optional)"
                              value={reviewForm.city}
                              onChange={(e) => setReviewForm({ ...reviewForm, city: e.target.value })}
                              data-testid="review-city"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">Rating:</span>
                            {[1,2,3,4,5].map((s) => (
                              <button
                                type="button"
                                key={s}
                                onClick={() => setReviewForm({ ...reviewForm, rating: s })}
                                aria-label={`${s} star${s === 1 ? "" : "s"}`}
                                data-testid={`review-star-${s}`}
                              >
                                <Star className={`h-5 w-5 ${s <= reviewForm.rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                              </button>
                            ))}
                          </div>
                          <Input
                            placeholder="Review title (optional)"
                            value={reviewForm.title}
                            onChange={(e) => setReviewForm({ ...reviewForm, title: e.target.value })}
                            data-testid="review-title"
                          />
                          <textarea
                            className="w-full rounded-md border border-gray-200 p-3 text-sm min-h-[100px]"
                            placeholder="Tell us how it went…"
                            required
                            value={reviewForm.body}
                            onChange={(e) => setReviewForm({ ...reviewForm, body: e.target.value })}
                            data-testid="review-body"
                          />
                          <Button type="submit" disabled={submitReview.isPending} data-testid="review-submit">
                            {submitReview.isPending ? "Submitting…" : "Submit review"}
                          </Button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* FAQS */}
              <TabsContent value="faqs" className="mt-8" data-testid="faqs-content">
                <div className="max-w-3xl mx-auto">
                  <Accordion type="single" collapsible className="space-y-3">
                    {productFaqs.map((f, i) => (
                      <AccordionItem
                        key={i}
                        value={`faq-${i}`}
                        className="rounded-2xl border border-gray-100 bg-gray-50/50 px-5 data-[state=open]:bg-white data-[state=open]:shadow-sm"
                        data-testid={`faq-${i}`}
                      >
                        <AccordionTrigger className="text-left font-semibold text-gray-900 hover:no-underline">
                          {f.q}
                        </AccordionTrigger>
                        <AccordionContent className="text-gray-600 leading-relaxed pb-4">
                          {f.a}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* ---------- Frequently bought together ---------- */}
          {frequentlyBought.length > 0 && (
            <div className="mt-16" data-testid="frequently-bought">
              <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Frequently bought together</h2>
              <p className="text-sm text-gray-500 mb-6">Customers who bought this also picked up:</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {frequentlyBought.map((rp: any) => {
                  const startPrice = (rp.variants ?? [])
                    .map((v: any) => Number(v.prices?.retailOnline) || 0)
                    .filter((n: number) => n > 0)
                    .reduce((min: number, n: number) => (min === 0 || n < min ? n : min), 0);
                  return (
                    <Link
                      key={rp.id}
                      href={`/product/${rp.id}`}
                      className="group flex items-center rounded-2xl border border-gray-100 hover:border-primary/30 hover:shadow-md transition-all overflow-hidden bg-white p-4"
                    >
                      <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary/10 to-amber-500/10 flex items-center justify-center text-4xl mr-4 flex-shrink-0">
                        {categoryEmoji(rp.category)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase tracking-widest text-primary font-bold mb-1">{rp.category}</p>
                        <h3 className="font-bold text-gray-900 text-sm line-clamp-1 mb-1 group-hover:text-primary transition-colors">{rp.name}</h3>
                        <p className="text-sm font-extrabold text-gray-900">{formatPrice(startPrice)}</p>
                      </div>
                      <Plus className="h-5 w-5 text-gray-400 group-hover:text-primary transition-colors flex-shrink-0" />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* ---------- Related products ---------- */}
          {related.length > 0 && (
            <div className="mt-16" data-testid="related-products">
              <h2 className="text-2xl font-extrabold text-gray-900 mb-6">More from {product.category}</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {related.map((rp: any) => {
                  const startPrice = (rp.variants ?? [])
                    .map((v: any) => Number(v.prices?.retailOnline) || 0)
                    .filter((n: number) => n > 0)
                    .reduce((min: number, n: number) => (min === 0 || n < min ? n : min), 0);
                  const brands = new Set((rp.variants ?? []).map((v: any) => v.brand || "Standard"));
                  return (
                    <Link
                      key={rp.id}
                      href={`/product/${rp.id}`}
                      className="group rounded-2xl border border-gray-100 hover:border-primary/30 hover:shadow-md transition-all overflow-hidden bg-white"
                      data-testid={`related-${rp.id}`}
                    >
                      <div className="aspect-square bg-gradient-to-br from-primary/10 to-amber-500/10 flex items-center justify-center text-6xl group-hover:scale-105 transition-transform">
                        {categoryEmoji(rp.category)}
                      </div>
                      <div className="p-4">
                        <p className="text-[10px] uppercase tracking-widest text-primary font-bold mb-1">{rp.category}</p>
                        <h3 className="font-bold text-gray-900 text-sm line-clamp-2 mb-1">{rp.name}</h3>
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-extrabold text-gray-900">{formatPrice(startPrice)}</p>
                          {brands.size > 1 && (
                            <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-semibold">
                              {brands.size} brands
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
