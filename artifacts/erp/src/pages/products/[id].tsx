import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useGetProduct, useUpdateProduct, useCreateProduct, useListBrands, useGetSiteContent, type ProductVariant, type CreateProductBody, type Brand } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { MediaPicker } from "@/components/media-picker";
import { apiFetch, mediaUrl } from "../../lib/api";

type CategoryLite = { id: string; name: string; emoji: string | null; isActive: boolean };

// Extra product fields not yet in the generated client. We pass them through
// as part of the form payload — the API accepts permissive bodies.
type ExtraProductFields = {
  featured: boolean;
  shortDescription: string;
  safetyInfo: string;
  imageUrl: string;
  gallery: string[];
  specs: Array<{ key: string; value: string }>;
  seoTitle: string;
  seoDescription: string;
};

export default function ProductDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const isNew = !id || id === "new";
  
  const { data: product, isLoading } = useGetProduct(id || "", {
    query: { enabled: !isNew, queryKey: ["product", id] }
  });
  
  const updateMutation = useUpdateProduct();
  const createMutation = useCreateProduct();
  
  const [formData, setFormData] = useState<CreateProductBody & { status: string; occasions: string[]; gstRate: number | null } & ExtraProductFields>({
    code: "",
    name: "",
    category: "",
    description: "",
    shortDescription: "",
    safetyInfo: "",
    hsnCode: "",
    gstRate: null,
    onlineDisplay: true,
    featured: false,
    imageUrl: "",
    gallery: [],
    specs: [],
    seoTitle: "",
    seoDescription: "",
    status: "Active",
    variants: [] as ProductVariant[],
    occasions: [],
  });
  const [defaultBrand, setDefaultBrand] = useState<string>("Standard");

  const { data: brandsResp } = useListBrands();
  const brands: Brand[] = (brandsResp?.data ?? []) as Brand[];

  // Dynamic categories — single source of truth lives in the `categories` table
  // and is managed from the ERP /categories page.
  const { data: categoriesResp } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const token = localStorage.getItem("erp_token") || "";
      const r = await apiFetch("/api/v1/categories", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      return r.json();
    },
  });
  const categories: CategoryLite[] = ((categoriesResp?.data ?? []) as CategoryLite[]).filter((c) => c.isActive !== false);
  // Always show whatever value is currently set, even if the category was
  // later disabled / renamed, so the user can see and re-pick it.
  const categoryNames = categories.map((c) => c.name);
  const categoryOptions = formData.category && !categoryNames.includes(formData.category)
    ? [formData.category, ...categoryNames]
    : categoryNames;

  // Occasion catalogue is CMS-driven (Site Content → Occasions).
  const { data: siteContentResp } = useGetSiteContent();
  const cmsOccasions = (((siteContentResp?.data ?? {}) as Record<string, unknown>)["occasions"] ?? []) as Array<{ key: string; label: string; emoji?: string }>;
  const toggleOccasion = (key: string) => {
    setFormData((p) => {
      const set = new Set(p.occasions ?? []);
      if (set.has(key)) set.delete(key); else set.add(key);
      return { ...p, occasions: Array.from(set) };
    });
  };
  const activeBrands = brands.filter((b) => b.isActive !== false);
  const brandNames = activeBrands.map((b) => b.name ?? "").filter(Boolean) as string[];
  // Always include the currently-selected brand even if inactive/missing.
  const ensureName = (n: string) => (n && !brandNames.includes(n) ? [n, ...brandNames] : brandNames);

  useEffect(() => {
    if (product) {
      const p = product as typeof product & Partial<ExtraProductFields> & { gstRate?: number | null; specs?: Record<string, string> };
      setFormData({
        code: product.code || "",
        name: product.name || "",
        category: (product.category as string) || "",
        description: product.description || "",
        shortDescription: p.shortDescription || "",
        safetyInfo: p.safetyInfo || "",
        hsnCode: product.hsnCode || "",
        gstRate: p.gstRate ?? null,
        onlineDisplay: product.onlineDisplay ?? true,
        featured: p.featured ?? false,
        imageUrl: p.imageUrl || "",
        gallery: Array.isArray(p.gallery) ? p.gallery : [],
        specs: p.specs && typeof p.specs === "object"
          ? Object.entries(p.specs).map(([key, value]) => ({ key, value: String(value) }))
          : [],
        seoTitle: p.seoTitle || "",
        seoDescription: p.seoDescription || "",
        status: (product.status as string) || "Active",
        variants: product.variants || [],
        occasions: ((product as { occasions?: string[] }).occasions ?? []),
      });
      const firstBrand = product.variants?.find(v => v.brand)?.brand;
      if (firstBrand) setDefaultBrand(firstBrand);
    }
  }, [product]);

  // Default the category to the first active option once categories load and
  // the form hasn't been seeded yet (i.e. on the "new product" screen).
  useEffect(() => {
    if (!formData.category && categories.length > 0 && isNew) {
      setFormData((p) => ({ ...p, category: categories[0]!.name }));
    }
  }, [categories, formData.category, isNew]);

  const buildPayload = () => {
    // Convert specs rows to a plain object, dropping blank keys.
    const specsObj: Record<string, string> = {};
    for (const row of formData.specs) {
      const k = row.key.trim();
      if (k) specsObj[k] = row.value;
    }
    const gallery = formData.gallery.map((u) => u.trim()).filter(Boolean);
    return { ...formData, specs: specsObj, gallery };
  };

  const handleSave = () => {
    if (!formData.category.trim()) {
      toast({ title: "Pick a category before saving", variant: "destructive" });
      return;
    }
    const payload = buildPayload();
    if (isNew) {
      const { status: _status, ...createData } = payload;
      createMutation.mutate({
        // The generated CreateProductBody type doesn't yet know about the new
        // optional fields (shortDescription, gallery, specs, etc.); the API
        // accepts them, so cast through unknown.
        data: createData as unknown as CreateProductBody,
      }, {
        onSuccess: (res) => {
          toast({ title: "Product created successfully" });
          setLocation(`/products/${res?.id ?? ""}`);
        },
        onError: () => toast({ title: "Error creating product", variant: "destructive" })
      });
    } else {
      updateMutation.mutate({
        id: id!,
        data: payload as unknown as CreateProductBody,
      }, {
        onSuccess: () => toast({ title: "Product updated successfully" }),
        onError: () => toast({ title: "Error updating product", variant: "destructive" })
      });
    }
  };

  const addSpec = () => setFormData((p) => ({ ...p, specs: [...p.specs, { key: "", value: "" }] }));
  const removeSpec = (i: number) => setFormData((p) => ({ ...p, specs: p.specs.filter((_, idx) => idx !== i) }));
  const updateSpec = (i: number, field: "key" | "value", v: string) =>
    setFormData((p) => ({ ...p, specs: p.specs.map((row, idx) => idx === i ? { ...row, [field]: v } : row) }));

  const addGalleryUrl = () => setFormData((p) => ({ ...p, gallery: [...p.gallery, ""] }));
  const updateGalleryUrl = (i: number, v: string) =>
    setFormData((p) => ({ ...p, gallery: p.gallery.map((u, idx) => idx === i ? v : u) }));
  const removeGalleryUrl = (i: number) =>
    setFormData((p) => ({ ...p, gallery: p.gallery.filter((_, idx) => idx !== i) }));

  const addVariant = () => {
    setFormData(prev => ({
      ...prev,
      variants: [...prev.variants, {
        size: "",
        packContent: "",
        unit: "box",
        brand: defaultBrand || undefined,
        prices: {
          purchase: 0,
          wholesaleBulk: 0,
          retailOnline: 0,
          retailEst: 0,
          agent: 0
        }
      }]
    }));
  };

  const removeVariant = (index: number) => {
    setFormData(prev => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index)
    }));
  };

  const updateVariant = (index: number, field: string, value: unknown) => {
    setFormData(prev => {
      const newVariants = [...prev.variants];
      const keys = field.split('.');
      const variant = { ...newVariants[index] } as Record<string, unknown>;
      if (keys.length === 2) {
        const nested = { ...((variant[keys[0]] as Record<string, unknown>) ?? {}) };
        nested[keys[1]] = value;
        variant[keys[0]] = nested;
      } else {
        variant[field] = value;
      }
      newVariants[index] = variant as ProductVariant;
      return { ...prev, variants: newVariants };
    });
  };

  if (isLoading) return <Skeleton className="w-full h-96" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => setLocation("/products")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <h2 className="text-3xl font-bold">{isNew ? "New Product" : "Edit Product"}</h2>
        <div className="ml-auto">
          <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
            {isNew ? "Create Product" : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Code</Label>
                <Input 
                  value={formData.code} 
                  onChange={e => setFormData(p => ({...p, code: e.target.value}))} 
                  disabled={!isNew}
                />
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input 
                  value={formData.name} 
                  onChange={e => setFormData(p => ({...p, name: e.target.value}))} 
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={formData.category} onValueChange={v => setFormData(p => ({...p, category: v}))}>
                  <SelectTrigger data-testid="product-category"><SelectValue placeholder={categoryOptions.length === 0 ? "Add a category first" : "Pick a category"} /></SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((name) => {
                      const cat = categories.find((c) => c.name === name);
                      return (
                        <SelectItem key={name} value={name}>
                          <span className="flex items-center gap-2">
                            {cat?.emoji && <span>{cat.emoji}</span>}
                            {name}
                          </span>
                        </SelectItem>
                      );
                    })}
                    {categoryOptions.length === 0 && (
                      <div className="px-2 py-3 text-xs text-muted-foreground">
                        No categories defined yet. Add some on the <strong>Categories</strong> page.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>HSN Code</Label>
                <Input 
                  value={formData.hsnCode} 
                  onChange={e => setFormData(p => ({...p, hsnCode: e.target.value}))} 
                />
              </div>
              <div className="space-y-2">
                <Label>GST Rate Override (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={28}
                  value={formData.gstRate ?? ""}
                  placeholder="Use HSN slab / default"
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormData((p) => ({ ...p, gstRate: v === "" ? null : Math.max(0, Math.min(28, Number(v))) }));
                  }}
                  data-testid="product-gst-rate"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to use the HSN slab from Settings → Pricing, or the default rate if no slab matches.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Default Brand</Label>
                <Select value={defaultBrand} onValueChange={setDefaultBrand}>
                  <SelectTrigger><SelectValue placeholder="Select a brand" /></SelectTrigger>
                  <SelectContent>
                    {ensureName(defaultBrand).map(b => (
                      <SelectItem key={b} value={b}>
                        <span className="flex items-center gap-2">
                          {(() => {
                            const found = brands.find(x => x.name === b);
                            return found?.logoUrl ? (
                              <img src={mediaUrl(found.logoUrl)} alt="" className="h-4 w-4 object-contain bg-white rounded-sm" />
                            ) : null;
                          })()}
                          {b}
                        </span>
                      </SelectItem>
                    ))}
                    {brandNames.length === 0 && (
                      <div className="px-2 py-3 text-xs text-muted-foreground">
                        No brands defined yet. Add brands under "Brands" in the sidebar.
                      </div>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Pre-fills brand for new variants. Each variant can override.
                </p>
                {formData.variants.length > 0 && (() => {
                  const trimmed = defaultBrand.trim();
                  const blankCount = formData.variants.filter(v => !v.brand?.trim()).length;
                  const totalCount = formData.variants.length;
                  return (
                    <div className="space-y-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled={!trimmed || blankCount === 0}
                        onClick={() => setFormData(p => ({
                          ...p,
                          variants: p.variants.map(v => v.brand?.trim() ? v : { ...v, brand: trimmed })
                        }))}
                        title={!trimmed ? "Pick a default brand first" : blankCount === 0 ? "All variants already have a brand" : ""}
                      >
                        {blankCount === 0
                          ? "All variants have a brand"
                          : `Fill ${blankCount} variant${blankCount === 1 ? '' : 's'} without a brand`}
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="w-full"
                        disabled={!trimmed}
                        onClick={() => {
                          if (!confirm(`Overwrite the brand on all ${totalCount} variant${totalCount === 1 ? '' : 's'} with "${trimmed}"?`)) return;
                          setFormData(p => ({
                            ...p,
                            variants: p.variants.map(v => ({ ...v, brand: trimmed }))
                          }));
                        }}
                        data-testid="btn-apply-brand-all"
                      >
                        Apply "{trimmed || '…'}" to ALL variants
                      </Button>
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center justify-between">
                <Label>Online Display</Label>
                <Switch
                  checked={formData.onlineDisplay}
                  onCheckedChange={v => setFormData(p => ({...p, onlineDisplay: v}))}
                  data-testid="switch-online-display"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Featured on home page</Label>
                <Switch
                  checked={formData.featured}
                  onCheckedChange={v => setFormData(p => ({...p, featured: v}))}
                  data-testid="switch-featured"
                />
              </div>

              <div className="space-y-2" data-testid="product-occasions">
                <Label>Occasions</Label>
                <p className="text-xs text-muted-foreground">
                  Tag this product with the celebrations it suits — customers can filter by these on the website.
                  Manage the list under <strong>Website Content → Occasions</strong>.
                </p>
                {cmsOccasions.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No occasions defined yet. Add some in Website Content first.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {cmsOccasions.map((o) => {
                      const selected = (formData.occasions ?? []).includes(o.key);
                      return (
                        <button
                          key={o.key}
                          type="button"
                          data-testid={`occasion-toggle-${o.key}`}
                          onClick={() => toggleOccasion(o.key)}
                          className={`inline-flex items-center gap-1 px-3 h-8 rounded-full border text-xs font-medium transition ${
                            selected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background hover:bg-accent border-input"
                          }`}
                        >
                          {o.emoji && <span>{o.emoji}</span>}
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Variants & Pricing</CardTitle>
              <Button size="sm" onClick={addVariant}><Plus className="h-4 w-4 mr-2" /> Add Variant</Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {formData.variants.map((variant, i) => (
                <div key={i} className="p-4 border rounded-md relative bg-card/50">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute top-2 right-2 text-destructive hover:bg-destructive/10" 
                    onClick={() => removeVariant(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 pr-8">
                    <div className="space-y-2">
                      <Label>Size/Detail</Label>
                      <Input value={variant.size || ''} onChange={e => updateVariant(i, 'size', e.target.value)} placeholder="e.g. 5cm, 1000 wala" />
                    </div>
                    <div className="space-y-2">
                      <Label>Pack Content</Label>
                      <Input value={variant.packContent || ''} onChange={e => updateVariant(i, 'packContent', e.target.value)} placeholder="e.g. 10 pcs/box" />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit</Label>
                      <Input value={variant.unit || ''} onChange={e => updateVariant(i, 'unit', e.target.value)} placeholder="box, pkt" />
                    </div>
                    <div className="space-y-2">
                      <Label>Brand</Label>
                      <Select
                        value={variant.brand || ''}
                        onValueChange={(v) => updateVariant(i, 'brand', v || undefined)}
                      >
                        <SelectTrigger><SelectValue placeholder={defaultBrand || 'Select brand'} /></SelectTrigger>
                        <SelectContent>
                          {ensureName(variant.brand || '').filter(Boolean).map(b => (
                            <SelectItem key={b} value={b}>
                              <span className="flex items-center gap-2">
                                {(() => {
                                  const found = brands.find(x => x.name === b);
                                  return found?.logoUrl ? (
                                    <img src={mediaUrl(found.logoUrl)} alt="" className="h-4 w-4 object-contain bg-white rounded-sm" />
                                  ) : null;
                                })()}
                                {b}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Purchase Price</Label>
                      <Input type="number" value={variant.prices?.purchase || 0} onChange={e => updateVariant(i, 'prices.purchase', Number(e.target.value))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Wholesale (Bulk)</Label>
                      <Input type="number" value={variant.prices?.wholesaleBulk || 0} onChange={e => updateVariant(i, 'prices.wholesaleBulk', Number(e.target.value))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Retail Online</Label>
                      <Input type="number" value={variant.prices?.retailOnline || 0} onChange={e => updateVariant(i, 'prices.retailOnline', Number(e.target.value))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Retail Est.</Label>
                      <Input type="number" value={variant.prices?.retailEst || 0} onChange={e => updateVariant(i, 'prices.retailEst', Number(e.target.value))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Agent Price</Label>
                      <Input type="number" value={variant.prices?.agent || 0} onChange={e => updateVariant(i, 'prices.agent', Number(e.target.value))} />
                    </div>
                  </div>
                </div>
              ))}
              {formData.variants.length === 0 && (
                <div className="text-center p-8 border border-dashed rounded-md text-muted-foreground">
                  No variants added. Add at least one variant for pricing.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Website content — drives the public catalogue & product page. */}
          <Card>
            <CardHeader>
              <CardTitle>Website content</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Short description</Label>
                <Input
                  value={formData.shortDescription}
                  onChange={e => setFormData(p => ({ ...p, shortDescription: e.target.value }))}
                  placeholder="One-liner shown on product cards (e.g. '60-shot multi-colour aerial')"
                  maxLength={160}
                  data-testid="product-short-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Full description</Label>
                <Textarea
                  rows={5}
                  value={formData.description ?? ""}
                  onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                  placeholder="Long-form product description shown on the website's product page."
                  data-testid="product-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Safety & usage notes</Label>
                <Textarea
                  rows={3}
                  value={formData.safetyInfo}
                  onChange={e => setFormData(p => ({ ...p, safetyInfo: e.target.value }))}
                  placeholder="One per line — e.g. 'Light fuse and stand back at least 10 metres.'"
                  data-testid="product-safety"
                />
              </div>
              <div className="space-y-2">
                <Label>Cover image</Label>
                <MediaPicker
                  value={formData.imageUrl}
                  onChange={(url) => setFormData((p) => ({ ...p, imageUrl: url }))}
                  folder="products"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Gallery images</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addGalleryUrl}>
                    <Plus className="h-3 w-3 mr-1" /> Add image slot
                  </Button>
                </div>
                {formData.gallery.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No additional images. Customers will only see the cover image.</p>
                )}
                <div className="space-y-2">
                  {formData.gallery.map((url, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <div className="flex-1">
                        <MediaPicker
                          value={url}
                          onChange={(v) => updateGalleryUrl(i, v)}
                          folder="products"
                          compact
                          buttonLabel={url ? "Change" : "Pick image"}
                        />
                      </div>
                      <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => removeGalleryUrl(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Specifications — shown as a small spec table on the product page. */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Specifications</CardTitle>
              <Button type="button" size="sm" onClick={addSpec}>
                <Plus className="h-4 w-4 mr-2" /> Add spec
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {formData.specs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  Add facts like Shots, Duration, Sound level, Pack size — they render as a tidy spec table on the website.
                </p>
              ) : (
                formData.specs.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2 items-center">
                    <Input
                      value={row.key}
                      onChange={(e) => updateSpec(i, "key", e.target.value)}
                      placeholder="Label (e.g. Shots)"
                    />
                    <Input
                      value={row.value}
                      onChange={(e) => updateSpec(i, "value", e.target.value)}
                      placeholder="Value (e.g. 60)"
                    />
                    <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => removeSpec(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* SEO metadata — used by website's <Seo> helper. */}
          <Card>
            <CardHeader>
              <CardTitle>SEO</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>SEO title</Label>
                <Input
                  value={formData.seoTitle}
                  onChange={e => setFormData(p => ({ ...p, seoTitle: e.target.value }))}
                  placeholder="Falls back to the product name if blank"
                  maxLength={70}
                />
              </div>
              <div className="space-y-2">
                <Label>SEO description</Label>
                <Textarea
                  rows={3}
                  value={formData.seoDescription}
                  onChange={e => setFormData(p => ({ ...p, seoDescription: e.target.value }))}
                  placeholder="Meta description shown in search results (≤ 160 chars recommended)"
                  maxLength={200}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
