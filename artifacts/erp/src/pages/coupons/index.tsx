import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Tags, Pencil, Loader2, Globe, Store, Briefcase, Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { BulkIO } from "@/components/bulk-io";

// All channels a coupon can be restricted to. Empty array = available
// everywhere (the most common case for a generic offer).
const CHANNELS = [
  { value: "online", label: "Online — Website", icon: Globe },
  { value: "pos", label: "POS — In-store", icon: Store },
  { value: "agent", label: "Agent / Field sales", icon: Briefcase },
  { value: "b2b", label: "B2B / Wholesale", icon: Building2 },
] as const;

const CUSTOMER_TYPES = [
  { value: "retail", label: "Retail" },
  { value: "wholesale", label: "Wholesale" },
  { value: "agent", label: "Agent" },
  { value: "vip", label: "VIP" },
] as const;

const COUPON_TYPES = [
  { value: "percent", label: "Percentage off (%)" },
  { value: "flat", label: "Flat ₹ off" },
  { value: "minorder", label: "Discount above min-order" },
  { value: "bxgy", label: "Buy X get Y" },
  { value: "bundle", label: "Bundle" },
  { value: "firstorder", label: "First-order only" },
  { value: "agentpromo", label: "Agent promo" },
] as const;

type CouponType = typeof COUPON_TYPES[number]["value"];

type Coupon = {
  id: string;
  code: string;
  type: CouponType;
  discountValue: string;
  maxDiscountCap: string | null;
  minOrderValue: string | null;
  usageLimit: number | null;
  usedCount: number;
  perCustomerLimit: number | null;
  applicableChannels: string[] | null;
  applicableCustomerTypes: string[] | null;
  status: "active" | "paused" | "expired";
  autoApply: boolean;
  validFrom: string;
  validUntil: string;
  description: string | null;
};

type CouponForm = {
  id?: string;
  code: string;
  type: CouponType;
  discountValue: string;
  maxDiscountCap: string;
  minOrderValue: string;
  usageLimit: string;
  perCustomerLimit: string;
  applicableChannels: string[];
  applicableCustomerTypes: string[];
  autoApply: boolean;
  validFrom: string;
  validUntil: string;
  description: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const inOneYear = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const emptyForm: CouponForm = {
  code: "",
  type: "percent",
  discountValue: "",
  maxDiscountCap: "",
  minOrderValue: "0",
  usageLimit: "",
  perCustomerLimit: "1",
  applicableChannels: [],
  applicableCustomerTypes: [],
  autoApply: false,
  validFrom: today(),
  validUntil: inOneYear(),
  description: "",
};

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$|\/$/, "");

const apiFetch = async (url: string, init?: RequestInit) => {
  const token = localStorage.getItem("erp_token") || "";
  const r = await fetch(`${API_BASE}${url}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || json?.success === false) {
    throw new Error(json?.error?.message || `Request failed (${r.status})`);
  }
  return json;
};

const channelLabel = (v: string) => CHANNELS.find((c) => c.value === v)?.label.replace(/^[^—]+— /, "") ?? v;

export default function CouponsList() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CouponForm>(emptyForm);

  const { data: resp, isLoading } = useQuery<{ data: Coupon[] }>({
    queryKey: ["coupons"],
    queryFn: () => apiFetch("/api/v1/coupons?limit=100"),
  });
  const coupons = resp?.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return coupons;
    return coupons.filter((c) => c.code.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q));
  }, [coupons, search]);

  // Build server payload from the form. Empty values are coerced to nulls
  // so existing coupons keep round-tripping cleanly.
  const buildPayload = (f: CouponForm) => ({
    code: f.code.trim().toUpperCase(),
    type: f.type,
    discountValue: f.discountValue || "0",
    maxDiscountCap: f.maxDiscountCap ? f.maxDiscountCap : null,
    minOrderValue: f.minOrderValue || "0",
    usageLimit: f.usageLimit ? Number(f.usageLimit) : null,
    perCustomerLimit: f.perCustomerLimit ? Number(f.perCustomerLimit) : null,
    applicableChannels: f.applicableChannels,
    applicableCustomerTypes: f.applicableCustomerTypes,
    autoApply: f.autoApply,
    validFrom: f.validFrom || today(),
    validUntil: f.validUntil || inOneYear(),
    description: f.description.trim() || null,
  });

  const createMut = useMutation({
    mutationFn: (f: CouponForm) =>
      apiFetch("/api/v1/coupons", { method: "POST", body: JSON.stringify(buildPayload(f)) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coupons"] });
      toast({ title: "Coupon created" });
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Coupon> | ReturnType<typeof buildPayload> }) =>
      apiFetch(`/api/v1/coupons/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coupons"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim()) { toast({ title: "Coupon code is required", variant: "destructive" }); return; }
    if (!form.discountValue || Number(form.discountValue) <= 0) {
      toast({ title: "Discount value must be greater than zero", variant: "destructive" });
      return;
    }
    if (form.type === "percent" && Number(form.discountValue) > 100) {
      toast({ title: "Percentage cannot exceed 100", variant: "destructive" });
      return;
    }
    if (form.id) {
      updateMut.mutate({ id: form.id, body: buildPayload(form) }, {
        onSuccess: () => {
          toast({ title: "Coupon updated" });
          setDialogOpen(false);
          setForm(emptyForm);
        },
      });
    } else {
      createMut.mutate(form);
    }
  };

  const openNew = () => { setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (c: Coupon) => {
    setForm({
      id: c.id,
      code: c.code,
      type: c.type,
      discountValue: String(c.discountValue ?? ""),
      maxDiscountCap: c.maxDiscountCap ? String(c.maxDiscountCap) : "",
      minOrderValue: c.minOrderValue ? String(c.minOrderValue) : "0",
      usageLimit: c.usageLimit ? String(c.usageLimit) : "",
      perCustomerLimit: c.perCustomerLimit ? String(c.perCustomerLimit) : "1",
      applicableChannels: c.applicableChannels ?? [],
      applicableCustomerTypes: c.applicableCustomerTypes ?? [],
      autoApply: c.autoApply,
      validFrom: c.validFrom,
      validUntil: c.validUntil,
      description: c.description ?? "",
    });
    setDialogOpen(true);
  };

  const toggleActive = (c: Coupon) => {
    const next = c.status === "active" ? "paused" : "active";
    updateMut.mutate({ id: c.id, body: { status: next } }, {
      onSuccess: () => toast({ title: `Coupon ${next === "active" ? "activated" : "paused"}` }),
    });
  };

  const toggleInArray = (key: "applicableChannels" | "applicableCustomerTypes", value: string) => {
    setForm((p) => ({
      ...p,
      [key]: p[key].includes(value) ? p[key].filter((v) => v !== value) : [...p[key], value],
    }));
  };

  const isPercent = form.type === "percent";
  const discountSuffix = isPercent ? "%" : "₹";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Coupons & Offers</h2>
          <p className="text-muted-foreground">Manage discounts and decide which channels can use each one.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BulkIO resource="coupons" label="Coupons" onImported={() => qc.invalidateQueries({ queryKey: ["coupons"] })} />
          <Button onClick={openNew} data-testid="btn-new-coupon">
            <Plus className="mr-2 h-4 w-4" /> New Coupon
          </Button>
        </div>
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search code or description…"
          className="pl-9 w-full bg-background"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Min order</TableHead>
              <TableHead>Channels</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Validity</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center h-32 text-muted-foreground">
                  {search ? "No coupons match that search." : "No coupons yet — create one to get started."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((coupon) => {
                const channels = coupon.applicableChannels ?? [];
                return (
                  <TableRow key={coupon.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Tags className="h-3 w-3 text-primary" />
                        <span className="font-bold font-mono">{coupon.code}</span>
                        {coupon.autoApply && <Badge variant="secondary" className="text-xs">Auto</Badge>}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{coupon.type}</Badge></TableCell>
                    <TableCell className="font-medium">
                      {coupon.type === "percent" ? `${coupon.discountValue}%` : `₹${coupon.discountValue}`}
                    </TableCell>
                    <TableCell>₹{Number(coupon.minOrderValue ?? 0).toLocaleString("en-IN")}</TableCell>
                    <TableCell>
                      {channels.length === 0 ? (
                        <Badge variant="outline" className="text-xs">All</Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {channels.map((ch) => (
                            <Badge key={ch} variant="secondary" className="text-xs">{channelLabel(ch)}</Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">{coupon.usedCount} / {coupon.usageLimit ?? "∞"}</span>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(coupon.validFrom).toLocaleDateString("en-IN")}
                      <br />
                      {new Date(coupon.validUntil).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={coupon.status === "active"}
                        onCheckedChange={() => toggleActive(coupon)}
                        disabled={updateMut.isPending}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(coupon)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{form.id ? "Edit coupon" : "Create coupon"}</DialogTitle>
              <DialogDescription>
                Pick the channels where this coupon should work. Leaving channels empty means the coupon works everywhere.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Coupon code *</Label>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                    placeholder="DIWALI25"
                    className="font-mono"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Discount type *</Label>
                  <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v as CouponType }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUPON_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Discount value *</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.discountValue}
                      onChange={(e) => setForm((p) => ({ ...p, discountValue: e.target.value }))}
                      required
                    />
                    <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">{discountSuffix}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Max cap (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={isPercent ? "Cap on % discount" : "—"}
                    value={form.maxDiscountCap}
                    onChange={(e) => setForm((p) => ({ ...p, maxDiscountCap: e.target.value }))}
                    disabled={!isPercent}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Min order (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.minOrderValue}
                    onChange={(e) => setForm((p) => ({ ...p, minOrderValue: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Available on channels</Label>
                <p className="text-xs text-muted-foreground">
                  Tick the channels that can redeem this coupon. Leave all unticked to allow it everywhere.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {CHANNELS.map(({ value, label, icon: Icon }) => {
                    const checked = form.applicableChannels.includes(value);
                    return (
                      <button
                        type="button"
                        key={value}
                        onClick={() => toggleInArray("applicableChannels", value)}
                        className={`flex items-center gap-2 rounded-md border p-3 text-left text-sm transition ${
                          checked ? "border-primary bg-primary/5" : "hover:bg-accent"
                        }`}
                        data-testid={`channel-${value}`}
                      >
                        <Icon className={`h-4 w-4 ${checked ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="flex-1">{label}</span>
                        <Switch checked={checked} onCheckedChange={() => toggleInArray("applicableChannels", value)} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Customer types</Label>
                <p className="text-xs text-muted-foreground">
                  Restrict the coupon to certain customer groups. Empty = all customer types.
                </p>
                <div className="flex flex-wrap gap-2">
                  {CUSTOMER_TYPES.map(({ value, label }) => {
                    const checked = form.applicableCustomerTypes.includes(value);
                    return (
                      <button
                        type="button"
                        key={value}
                        onClick={() => toggleInArray("applicableCustomerTypes", value)}
                        className={`rounded-full border px-3 py-1 text-xs transition ${
                          checked ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Total usage limit</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Unlimited"
                    value={form.usageLimit}
                    onChange={(e) => setForm((p) => ({ ...p, usageLimit: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Per-customer limit</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.perCustomerLimit}
                    onChange={(e) => setForm((p) => ({ ...p, perCustomerLimit: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valid from *</Label>
                  <Input
                    type="date"
                    value={form.validFrom}
                    onChange={(e) => setForm((p) => ({ ...p, validFrom: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valid until *</Label>
                  <Input
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => setForm((p) => ({ ...p, validUntil: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label className="text-sm">Auto-apply</Label>
                  <p className="text-xs text-muted-foreground">
                    Apply this coupon automatically at checkout when conditions are met.
                  </p>
                </div>
                <Switch
                  checked={form.autoApply}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, autoApply: v }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Shown to staff and customers — e.g. 'Diwali 25% off, online only'"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {form.id ? "Save changes" : "Create coupon"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
