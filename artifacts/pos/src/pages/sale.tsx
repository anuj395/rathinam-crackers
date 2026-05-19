import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { formatVariantLabel } from "@/lib/variant-label";
import { apiFetch, mediaUrl } from "../lib/api";
import {
  useGetPosProducts,
  useHoldBill,
  useListHeldBills,
  useValidateCoupon,
  usePosCreateSale,
  useCloseShift,
  useOpenShift,
  useGetCurrentShift,
  useGetRecentPosSales,
  useListCustomers,
  useCreateCustomer,
} from "@workspace/api-client-react";
import { useCart, type CouponData, type CartItem } from "@/context/cart";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Search, Plus, Minus, Trash2, Pause, History, LogOut, User, UserX,
  HelpCircle, ScanLine, Keyboard, Settings2, Wallet, Receipt, Tag,
} from "lucide-react";
import ScannerSettingsDialog from "@/components/pos/scanner-settings-dialog";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

const categories = ["All", "Ground", "Aerial", "Sparkler", "Gift Box", "Bundle"];
const DEFAULT_QUICK_CASH = [100, 200, 500, 1000, 2000];

type PosConfig = {
  quickCash: number[];
  paymentMethods: { cash: boolean; upi: boolean; card: boolean; credit: boolean };
};
const DEFAULT_POS_CONFIG: PosConfig = {
  quickCash: DEFAULT_QUICK_CASH,
  paymentMethods: { cash: true, upi: true, card: true, credit: true },
};

type Variant = { variantId?: string; id?: string; size?: string; label?: string; price?: number | string; stock?: number; brand?: string };
type Product = { id: string; code?: string; name: string; category?: string; variants?: Variant[]; hsnCode?: string | null; gstRate?: number | null; imageUrl?: string | null };

// Deterministic accent so two cards in the same row don't look identical.
const accentFor = (key: string) => {
  const palette = [
    "from-amber-500/20 to-rose-500/10",
    "from-sky-500/20 to-indigo-500/10",
    "from-emerald-500/20 to-teal-500/10",
    "from-fuchsia-500/20 to-purple-500/10",
    "from-orange-500/20 to-red-500/10",
    "from-cyan-500/20 to-blue-500/10",
  ];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
};

const inr = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SaleScreen = () => {
  const [search, setSearch] = useState("");
  const [barcode, setBarcode] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [couponCode, setCouponCode] = useState("");
  const [activeLocationId, setActiveLocationId] = useState<string>("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const createCustomerMut = useCreateCustomer();
  const [heldBillsOpen, setHeldBillsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [scannerSettingsOpen, setScannerSettingsOpen] = useState(false);

  // Shift state
  const [openShiftDialog, setOpenShiftDialog] = useState(false);
  const [openingCash, setOpeningCash] = useState("");
  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [zReport, setZReport] = useState<any | null>(null);

  // Multi-tender state — independent amounts per mode.
  const [tenderCash, setTenderCash] = useState("");
  const [tenderUpi, setTenderUpi] = useState("");
  const [tenderCard, setTenderCard] = useState("");
  const [tenderUpiRef, setTenderUpiRef] = useState("");
  const [tenderCardRef, setTenderCardRef] = useState("");

  // Manual discount
  const [manualDiscount, setManualDiscount] = useState("");
  const [discountReason, setDiscountReason] = useState("");

  // Reprint
  const [reprintOpen, setReprintOpen] = useState(false);

  // Optional delivery address for POS sales (only when a customer is selected).
  type PosAddress = {
    name: string; phone: string; line1: string; line2: string;
    city: string; state: string; pincode: string; landmark: string;
  };
  const EMPTY_POS_ADDR: PosAddress = { name: "", phone: "", line1: "", line2: "", city: "", state: "Tamil Nadu", pincode: "", landmark: "" };
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [includeDelivery, setIncludeDelivery] = useState(false);
  const [deliveryShip, setDeliveryShip] = useState<PosAddress>(EMPTY_POS_ADDR);
  const [deliveryBill, setDeliveryBill] = useState<PosAddress>(EMPTY_POS_ADDR);
  const [deliverySameAsShip, setDeliverySameAsShip] = useState(true);
  const isAddrComplete = (a: PosAddress) =>
    !!(a.name && a.phone.replace(/\D/g, "").length >= 10 && a.line1 && a.city && a.state && /^\d{6}$/.test(a.pincode.replace(/\D/g, "")));

  const barcodeRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const cashRef = useRef<HTMLInputElement>(null);

  const {
    items, addItem, removeItem, updateQty, clearCart, loadHeldBill,
    subtotal, gst, discount, total: cartTotal, taxRate, pricingLoaded,
    coupon, applyCoupon, customer, setCustomer,
  } = useCart();

  // Sale total includes the manual discount on top of coupon discount.
  const md = Math.max(0, parseFloat(manualDiscount) || 0);
  const taxableAmount = Math.max(0, subtotal - discount - md);
  const gstAdj = taxableAmount * taxRate;
  const total = taxableAmount + gstAdj;

  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Cashier / shop info captured at login.
  const [cashierName] = useState<string>(() => localStorage.getItem("pos_user_name") ?? "");
  const [cashierRole] = useState<string>(() => localStorage.getItem("pos_user_role") ?? "");
  const [locationName, setLocationName] = useState<string>(() => localStorage.getItem("pos_location_name") ?? "");
  // Live wall-clock so cashiers always know the till time.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Lock in the location chosen at pin-login. If somehow missing (older
  // session), fall back to the user's first shop.
  useEffect(() => {
    const stored = localStorage.getItem("pos_location_id");
    if (stored) { setActiveLocationId(stored); return; }
    const token = localStorage.getItem("pos_token");
    if (!token) { setLocation("/"); return; }
    apiFetch("/api/v1/locations", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((res) => {
        const locs = res?.data ?? [];
        const shop = locs.find((l: any) => l.type === "shop") ?? locs[0];
        if (shop?.id) {
          setActiveLocationId(shop.id);
          localStorage.setItem("pos_location_id", shop.id);
          if (shop.name) { localStorage.setItem("pos_location_name", shop.name); setLocationName(shop.name); }
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Logout clears every POS-scoped key so the next session starts fresh.
  const handlePosLogout = useCallback(() => {
    ["pos_token", "pos_user_id", "pos_user_name", "pos_user_role", "pos_location_id", "pos_location_name"].forEach((k) => localStorage.removeItem(k));
    setLocation("/");
  }, [setLocation]);

  // POS config (quick cash denominations + enabled payment methods) is admin-
  // editable in the ERP CMS. Falls back to the original defaults if the call fails.
  const [posConfig, setPosConfig] = useState<PosConfig>(DEFAULT_POS_CONFIG);
  useEffect(() => {
    apiFetch("/api/v1/site-content/public")
      .then((r) => r.json())
      .then((res) => {
        const pos = res?.data?.pos ?? {};
        const qc = Array.isArray(pos.quickCash)
          ? pos.quickCash.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n) && n > 0)
          : DEFAULT_QUICK_CASH;
        setPosConfig({
          quickCash: qc.length ? qc : DEFAULT_QUICK_CASH,
          paymentMethods: {
            cash:   pos.paymentMethods?.cash   !== false,
            upi:    pos.paymentMethods?.upi    !== false,
            card:   pos.paymentMethods?.card   !== false,
            credit: pos.paymentMethods?.credit !== false,
          },
        });
      })
      .catch(() => {});
  }, []);
  const QUICK_CASH = posConfig.quickCash;
  const pmEnabled = posConfig.paymentMethods;

  const { data: productsData } = useGetPosProducts(
    { locationId: activeLocationId },
    { query: { enabled: !!activeLocationId, queryKey: ["pos-products", activeLocationId] } },
  );
  const { mutate: holdBill } = useHoldBill();
  const { data: heldBillsResponse, refetch: refetchHeldBills } = useListHeldBills(
    { locationId: activeLocationId },
    { query: { enabled: !!activeLocationId, queryKey: ["held-bills", activeLocationId] } },
  );
  const { mutate: validateCoupon, isPending: validatingCoupon } = useValidateCoupon();
  const { mutate: createSale, isPending: checkingOut } = usePosCreateSale();
  const { mutate: closeShift, isPending: closingShift } = useCloseShift();
  const { mutate: openShift, isPending: openingShift } = useOpenShift();

  const {
    data: currentShiftResp,
    refetch: refetchShift,
    isLoading: shiftLoading,
  } = useGetCurrentShift(
    { locationId: activeLocationId || undefined },
    { query: { enabled: !!activeLocationId, queryKey: ["pos-shift-current", activeLocationId], refetchInterval: 30000 } },
  );
  const currentShift = (currentShiftResp?.data ?? null) as any;

  const { data: recentResp, refetch: refetchRecent } = useGetRecentPosSales(
    { locationId: activeLocationId || undefined, limit: 10 },
    { query: { enabled: !!activeLocationId && reprintOpen, queryKey: ["pos-recent", activeLocationId] } },
  );
  const recentSales = (recentResp?.data ?? []) as any[];

  const { data: customersData } = useListCustomers(
    { search: customerSearch || undefined, limit: 10 },
    { query: { enabled: customerSearch.length >= 2, queryKey: ["customers", customerSearch] } },
  );

  const products: Product[] = (productsData?.data ?? []) as Product[];
  const heldBills = heldBillsResponse?.data || [];

  // Auto-open the shift dialog ONCE per session per location. The previous
  // implementation kept openShiftDialog in deps and treated dismissal as
  // implicit, which re-opened the modal in a loop on multi-shop accounts.
  const dialogPrimedRef = useRef<string>("");
  useEffect(() => {
    if (shiftLoading || !activeLocationId) return;
    if (!currentShift && dialogPrimedRef.current !== activeLocationId) {
      dialogPrimedRef.current = activeLocationId;
      setOpenShiftDialog(true);
    }
  }, [shiftLoading, currentShift, activeLocationId]);

  // -------- Filters --------
  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((p) => {
      const catOk = activeCategory === "All" || (p.category && p.category.toLowerCase() === activeCategory.toLowerCase());
      if (!catOk) return false;
      if (!term) return true;
      return p.name.toLowerCase().includes(term) || (p.code ?? "").toLowerCase().includes(term);
    });
  }, [products, search, activeCategory]);

  // -------- Helpers --------
  const variantPrice = (v: Variant) => Number(v.price) || 0;
  const variantId = (v: Variant) => v.variantId ?? v.id ?? "";
  // Self-describing label so cashiers can tell "Small / Sky" apart from
  // "Small / Bijili" instead of seeing "Small" three times in a row.
  const variantLabel = (v: Variant, siblings?: Variant[]) => formatVariantLabel(v, siblings);

  const addVariantToCart = useCallback((product: Product, variant: Variant) => {
    const stock = typeof variant.stock === "number" ? variant.stock : Infinity;
    if (stock <= 0) {
      toast({ title: "Out of stock", description: `${product.name} (${variantLabel(variant)})`, variant: "destructive" });
      return;
    }
    addItem({
      productId: product.id, variantId: variantId(variant),
      productName: product.name, variantLabel: variantLabel(variant),
      qty: 1, unitPrice: variantPrice(variant),
      // Include tax-resolution fields so the cart can mirror the server's
      // per-line GST math (override → HSN slab → default).
      hsnCode: product.hsnCode ?? null,
      gstRate: product.gstRate ?? null,
    });
  }, [addItem, toast]);

  const handleApplyCoupon = () => {
    if (!couponCode) return;
    validateCoupon(
      { data: { code: couponCode, cartTotal: subtotal } },
      {
        onSuccess: (res) => {
          if (res.data?.valid) {
            applyCoupon({ code: couponCode, type: "PERCENT", value: res.data.discountAmount || 0 });
            toast({ title: "Coupon applied" });
          } else {
            toast({ title: res.data?.error || "Invalid coupon", variant: "destructive" });
          }
        },
        onError: () => toast({ title: "Error validating coupon", variant: "destructive" }),
      },
    );
  };

  // ---- multi-tender helpers ----
  const cashAmt = parseFloat(tenderCash) || 0;
  const upiAmt = parseFloat(tenderUpi) || 0;
  const cardAmt = parseFloat(tenderCard) || 0;
  const tenderTotal = cashAmt + upiAmt + cardAmt;
  const remainingDue = Math.max(0, total - tenderTotal);
  const overTendered = tenderTotal > total + 0.5;
  const change = cashAmt > 0 ? Math.max(0, tenderTotal - total) : 0;

  // Clear any partial tenders and fill cash with the precise bill total —
  // gives the cashier a one-click way to settle exactly without having to
  // type decimal paise. We never collect more than the invoice value.
  const setCashExact = () => {
    setTenderUpi("");
    setTenderCard("");
    setTenderCash(total.toFixed(2));
  };
  const addCash = (amt: number) => {
    const current = parseFloat(tenderCash) || 0;
    setTenderCash((current + amt).toString());
  };

  const handleCheckout = () => {
    if (items.length === 0) { toast({ title: "Cart is empty", variant: "destructive" }); return; }
    if (!currentShift?.id) { toast({ title: "Open a shift first", variant: "destructive" }); setOpenShiftDialog(true); return; }
    if (overTendered && !cashAmt) {
      toast({ title: "Tender exceeds bill (only cash can over-tender for change)", variant: "destructive" });
      return;
    }
    if (remainingDue > 0.5) {
      toast({ title: `Short by ${inr(remainingDue)}`, variant: "destructive" });
      return;
    }

    const tenders: Array<{ mode: "CASH" | "UPI" | "CARD"; amount: number; reference?: string }> = [];
    // Cap cash at the actual portion of the bill so over-tender becomes change, not paid amount.
    if (cashAmt > 0) tenders.push({ mode: "CASH", amount: Math.min(cashAmt, total - upiAmt - cardAmt) });
    if (upiAmt > 0) tenders.push({ mode: "UPI", amount: upiAmt, reference: tenderUpiRef || undefined });
    if (cardAmt > 0) tenders.push({ mode: "CARD", amount: cardAmt, reference: tenderCardRef || undefined });

    // Only attach delivery address when a customer is selected, the toggle is on,
    // and the shipping address is complete. Billing falls back to shipping
    // unless the cashier explicitly supplied a different one.
    const deliveryPayload =
      customer?.id && includeDelivery && isAddrComplete(deliveryShip)
        ? {
            shippingAddress: deliveryShip,
            billingAddress:
              !deliverySameAsShip && isAddrComplete(deliveryBill) ? deliveryBill : deliveryShip,
          }
        : {};

    createSale(
      {
        data: {
          items: items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty })),
          tenders,
          cashReceived: cashAmt,
          orderDiscount: md > 0 ? md : undefined,
          discountReason: md > 0 ? (discountReason || undefined) : undefined,
          locationId: activeLocationId,
          shiftId: currentShift.id,
          couponCode: coupon?.code,
          customerId: customer?.id,
          ...deliveryPayload,
        } as any,
      },
      {
        onSuccess: (res) => {
          if (res.data?.invoice?.id) {
            refetchShift();
            refetchRecent();
            const ch = change.toFixed(2);
            setLocation(`/receipt?id=${res.data.invoice.id}&change=${ch}&received=${cashAmt || ""}`);
            // Clear tender inputs for next sale
            setTenderCash(""); setTenderUpi(""); setTenderCard("");
            setTenderUpiRef(""); setTenderCardRef("");
            setManualDiscount(""); setDiscountReason("");
          }
        },
        onError: (err) => toast({ title: "Checkout failed", description: (err as any).message, variant: "destructive" }),
      },
    );
  };

  const handleHoldBill = () => {
    if (items.length === 0) { toast({ title: "Nothing to hold" }); return; }
    holdBill(
      {
        data: {
          locationId: activeLocationId, customerId: customer?.id,
          items: items.map((i: CartItem) => ({
            productId: i.productId, variantId: i.variantId,
            productName: i.productName, variantLabel: i.variantLabel,
            qty: i.qty, unitPrice: i.unitPrice,
          })),
          coupon: coupon ? ({ ...coupon } as Record<string, unknown>) : undefined,
        },
      },
      { onSuccess: () => { clearCart(); refetchHeldBills(); toast({ title: "Bill held" }); } },
    );
  };

  type ResumableHeldBill = {
    items?: Array<{ productId?: string; variantId?: string; productName?: string; variantLabel?: string; qty?: number; unitPrice?: number }>;
    customer?: unknown;
    coupon?: CouponData | null;
  };
  const handleResumeBill = (bill: ResumableHeldBill) => {
    const billItems = (bill.items ?? []).map((i) => ({
      productId: i.productId ?? "", variantId: i.variantId ?? "",
      productName: i.productName ?? "Item", variantLabel: i.variantLabel ?? "",
      qty: i.qty ?? 1, unitPrice: i.unitPrice ?? 0,
    }));
    loadHeldBill({ items: billItems, customer: bill.customer ?? null, coupon: bill.coupon ?? null });
    setHeldBillsOpen(false);
    toast({ title: "Bill resumed", description: `Loaded ${billItems.length} items` });
  };

  const handleOpenShift = () => {
    const oc = parseFloat(openingCash);
    if (!activeLocationId || isNaN(oc) || oc < 0) { toast({ title: "Enter opening cash", variant: "destructive" }); return; }
    if (oc > 1_000_000) { toast({ title: "Opening cash too high", description: "Maximum is ₹10,00,000.", variant: "destructive" }); return; }
    openShift(
      { data: { locationId: activeLocationId, openingCash: oc } },
      {
        onSuccess: () => { setOpenShiftDialog(false); setOpeningCash(""); refetchShift(); toast({ title: "Shift opened", description: `Float ${inr(oc)}` }); },
        onError: (err: any) => {
          // Backend now returns 409 when there's already an open shift. Adopt
          // it and close the dialog rather than leaving the cashier stuck.
          const code = err?.response?.data?.error?.code ?? err?.error?.code;
          if (code === "SHIFT_ALREADY_OPEN" || code === "SHIFT_ALREADY_OPEN_ELSEWHERE") {
            setOpenShiftDialog(false);
            setOpeningCash("");
            refetchShift();
            toast({
              title: code === "SHIFT_ALREADY_OPEN_ELSEWHERE" ? "Shift open elsewhere" : "Shift already open",
              description: err?.response?.data?.error?.message ?? "Using the existing shift.",
            });
            return;
          }
          toast({ title: "Could not open shift", description: err?.response?.data?.error?.message ?? err?.message, variant: "destructive" });
        },
      },
    );
  };

  const handleCloseShift = () => {
    if (!currentShift?.id) { toast({ title: "No open shift" }); return; }
    const counted = parseFloat(countedCash);
    if (isNaN(counted) || counted < 0) { toast({ title: "Enter counted cash", variant: "destructive" }); return; }
    closeShift(
      { data: { shiftId: currentShift.id, closingCash: counted, notes: closingNotes || undefined } },
      {
        onSuccess: (res) => { setZReport(res.data); refetchShift(); toast({ title: "Shift closed" }); },
        onError: (err) => toast({ title: "Close failed", description: (err as any).message, variant: "destructive" }),
      },
    );
  };

  const handleZReportDone = () => {
    setZReport(null);
    setCloseShiftOpen(false);
    setCountedCash(""); setClosingNotes("");
    localStorage.removeItem("pos_token");
    setLocation("/");
  };

  // -------- Barcode --------
  const handleBarcodeSubmit = () => {
    const code = barcode.trim();
    if (!code) return;
    const match = products.find((p) => (p.code ?? "").toLowerCase() === code.toLowerCase());
    if (!match) { toast({ title: "No product matches that code", variant: "destructive" }); return; }
    const variants = match.variants ?? [];
    const inStock = variants.find((v) => (typeof v.stock === "number" ? v.stock > 0 : true)) ?? variants[0];
    if (!inStock) { toast({ title: `${match.name} has no variants`, variant: "destructive" }); return; }
    addVariantToCart(match, inStock);
    setBarcode("");
  };

  // -------- Keyboard shortcuts --------
  const focusBarcode = useCallback(() => barcodeRef.current?.focus(), []);
  const focusSearch = useCallback(() => searchRef.current?.focus(), []);

  useKeyboardShortcuts({
    F2: focusSearch,
    F3: focusBarcode,
    F4: () => setCustomerOpen(true),
    F9: handleHoldBill,
    F12: handleCheckout,
    "?": () => setShortcutsOpen((v) => !v),
    Escape: () => {
      if (shortcutsOpen) { setShortcutsOpen(false); return; }
      if (customerOpen) { setCustomerOpen(false); return; }
      setSearch(""); setBarcode(""); barcodeRef.current?.focus();
    },
  });

  useEffect(() => { barcodeRef.current?.focus(); }, [items.length]);

  useBarcodeScanner({
    enabled: !scannerSettingsOpen && !openShiftDialog && !closeShiftOpen,
    onScan: ({ code }) => {
      const match = products.find((p) => (p.code ?? "").toLowerCase() === code.toLowerCase());
      if (!match) { toast({ title: "No product matches that scan", description: code, variant: "destructive" }); return; }
      const variants = match.variants ?? [];
      const inStock = variants.find((v) => (typeof v.stock === "number" ? v.stock > 0 : true)) ?? variants[0];
      if (!inStock) { toast({ title: `${match.name} has no variants`, variant: "destructive" }); return; }
      addVariantToCart(match, inStock);
      setBarcode("");
    },
  });

  const running = currentShift?.running ?? null;

  return (
    <div className="flex flex-col md:flex-row h-screen md:overflow-hidden bg-[#0d0d0d]">
      {/* Left Panel: Products */}
      <div className="w-full md:w-[60%] flex flex-col border-b md:border-b-0 md:border-r border-zinc-800 min-h-[60vh] md:min-h-0">
        {/* Shop / cashier / clock — always visible so the operator knows
            where they are. Each chip uses whitespace-nowrap so labels never
            split across two lines on narrow viewports; the row itself wraps. */}
        <div className="px-4 pt-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-zinc-900/70 border border-zinc-800 rounded-lg px-3 py-2 text-xs">
            <User className="h-4 w-4 text-amber-300 shrink-0" />
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="font-bold text-white">{cashierName || "Cashier"}</span>
              {cashierRole && <span className="text-zinc-500">{cashierRole.replace(/_/g, " ").toLowerCase()}</span>}
            </div>
            <span className="text-zinc-700">•</span>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-zinc-400">Shop</span>
              <span className="font-bold text-white">{locationName || "—"}</span>
            </div>
            <span className="text-zinc-700">•</span>
            <span className="text-zinc-400 whitespace-nowrap">{now.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
            <Button
              size="sm" variant="ghost"
              className="ml-auto h-7 px-2 text-xs text-zinc-400 hover:text-red-400 whitespace-nowrap shrink-0"
              onClick={handlePosLogout}
              data-testid="pos-logout-btn"
              title="Sign out of POS"
            >
              <LogOut className="h-3.5 w-3.5 mr-1" /> Logout
            </Button>
          </div>
        </div>

        {/* Shift bar — Float = cash put in the till at shift open; Sales =
            all invoices billed in this shift (any payment mode); Drawer =
            Float + cash sales only (physical cash you should have on hand).
            UPI/Card sales never affect the drawer. Each chip is nowrap so
            labels never break across two lines on narrow viewports; the row
            itself wraps if there isn't enough horizontal space. */}
        {currentShift && running && (
          <div className="px-4 pt-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-zinc-900/70 border border-zinc-800 rounded-lg px-3 py-2 text-xs">
              <Wallet className="h-4 w-4 text-emerald-400 shrink-0" />
              <div className="flex items-center gap-1.5 whitespace-nowrap" title="Unique ID for this cashier shift">
                <span className="text-zinc-400">Shift</span>
                <span className="font-bold text-white">{String(currentShift.id).slice(0, 8)}</span>
              </div>
              <span className="text-zinc-700">•</span>
              <div
                className="flex items-center gap-1.5 whitespace-nowrap cursor-help"
                title="Opening Float — the cash you put in the till when this shift was opened. Stays fixed for the whole shift."
              >
                <span className="text-zinc-400">Float</span>
                <span className="font-bold">{inr(Number(currentShift.openingCash) || 0)}</span>
              </div>
              <span className="text-zinc-700">•</span>
              <div
                className="flex items-center gap-1.5 whitespace-nowrap cursor-help"
                title={`Total Sales billed this shift (all payment modes).\nCash ${inr(running.cashSales || 0)} • UPI ${inr(running.upiSales || 0)} • Card ${inr(running.cardSales || 0)}${running.creditSales ? ` • Credit ${inr(running.creditSales)}` : ""}`}
              >
                <span className="text-zinc-400">Sales</span>
                <span className="font-bold text-amber-300">{inr(running.totalSales || 0)}</span>
                <span className="text-zinc-500">({running.txnCount || 0} txn)</span>
              </div>
              <span className="text-zinc-700">•</span>
              <div
                className="flex items-center gap-1.5 whitespace-nowrap cursor-help"
                title={`Cash Drawer — physical cash that should be in the till right now.\nOpening Float ${inr(Number(currentShift.openingCash) || 0)} + Cash Sales ${inr(running.cashSales || 0)} = ${inr(running.expectedCash || 0)}.\nUPI / Card sales do not affect the drawer.`}
              >
                <span className="text-zinc-400">Drawer</span>
                <span className="font-bold text-emerald-400">{inr(running.expectedCash || 0)}</span>
              </div>
              <Button
                size="sm" variant="ghost"
                className="ml-auto h-7 px-2 text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap shrink-0"
                onClick={() => setReprintOpen(true)}
                data-testid="pos-reprint-btn"
              >
                <Receipt className="h-3.5 w-3.5 mr-1" /> Reprint
              </Button>
            </div>
          </div>
        )}

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
              <Input
                ref={barcodeRef}
                placeholder="Scan barcode or type product code, then press Enter  (F3)"
                className="pl-10 h-14 bg-zinc-900 border-primary/40 text-lg focus-visible:ring-primary"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleBarcodeSubmit(); } }}
                data-testid="pos-barcode-input"
              />
            </div>
            <Button variant="outline" size="icon" className="h-14 w-14 border-zinc-800" onClick={() => setScannerSettingsOpen(true)} title="Scanner settings">
              <Settings2 className="h-6 w-6 text-primary" />
            </Button>
            <Button variant="outline" size="icon" className="h-14 w-14 border-zinc-800" onClick={() => setShortcutsOpen(true)} title="Shortcuts (?)">
              <Keyboard className="h-6 w-6 text-blue-400" />
            </Button>
            <Button
              variant="outline" size="icon" className="h-14 w-14 border-zinc-800"
              onClick={() => { if (!currentShift) { setOpenShiftDialog(true); } else { setCloseShiftOpen(true); } }}
              title={currentShift ? "End shift (Z-report)" : "Open shift"}
              data-testid="pos-shift-toggle"
            >
              <LogOut className={`h-6 w-6 ${currentShift ? "text-red-500" : "text-emerald-500"}`} />
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              ref={searchRef}
              placeholder="Search products by name or code  (F2)"
              className="pl-10 h-11 bg-zinc-900 border-zinc-800"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="pos-product-search"
            />
          </div>

          <Tabs value={activeCategory} onValueChange={setActiveCategory}>
            <TabsList className="bg-zinc-900 w-full justify-start overflow-x-auto p-1 h-auto">
              {categories.map((cat) => (
                <TabsTrigger key={cat} value={cat} className="h-10 px-6 data-[state=active]:bg-primary data-[state=active]:text-white">
                  {cat}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <ScrollArea className="flex-1 px-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pb-4">
            {filteredProducts.map((product) => {
              const variants = product.variants ?? [];
              const inStockVariants = variants.filter((v) => typeof v.stock !== "number" || v.stock > 0);
              const cheapest = [...variants].sort((a, b) => variantPrice(a) - variantPrice(b))[0];
              const fromPrice = cheapest ? variantPrice(cheapest) : 0;
              const initials = (product.name || "?").trim().slice(0, 2).toUpperCase();
              const accent = accentFor(product.id);
              const allOos = variants.length > 0 && inStockVariants.length === 0;
              return (
                <Card key={product.id} className={`bg-zinc-900/80 border-zinc-800 overflow-hidden hover:border-amber-400/60 transition-colors ${allOos ? "opacity-60" : ""}`}>
                  <CardContent className="p-0">
                    {/* Compact accent header — no more giant code placeholder. */}
                    <div className={`relative h-20 bg-gradient-to-br ${accent} flex items-center px-3`}>
                      {product.imageUrl ? (
                        <img src={mediaUrl(product.imageUrl)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-zinc-950/60 ring-1 ring-white/10 flex items-center justify-center text-amber-300 font-black text-lg tracking-tight">
                          {initials}
                        </div>
                      )}
                      {product.code && (
                        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-zinc-300/80 bg-zinc-950/40 px-2 py-0.5 rounded">
                          {product.code}
                        </span>
                      )}
                      {allOos && (
                        <span className="absolute top-1.5 left-1.5 text-[10px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded">OUT</span>
                      )}
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="font-bold truncate text-sm leading-tight" title={product.name}>{product.name}</h3>
                        <span className="text-[11px] text-zinc-500 shrink-0">from <span className="text-amber-300 font-bold">₹{fromPrice}</span></span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {variants.slice(0, 6).map((variant) => {
                          const stock = typeof variant.stock === "number" ? variant.stock : null;
                          const oos = stock !== null && stock <= 0;
                          const low = stock !== null && stock > 0 && stock <= 5;
                          return (
                            <button
                              key={variantId(variant)}
                              disabled={oos}
                              onClick={() => addVariantToCart(product, variant)}
                              title={oos ? "Out of stock" : low ? `Only ${stock} left` : `${stock ?? "?"} in stock`}
                              className={`relative h-12 rounded-md border text-left px-2 py-1 transition-colors ${
                                oos
                                  ? "bg-zinc-900 border-zinc-800 text-zinc-600 line-through cursor-not-allowed"
                                  : "bg-zinc-800/60 border-zinc-700 hover:bg-amber-400 hover:text-zinc-950 hover:border-amber-300 active:scale-[0.97]"
                              }`}
                            >
                              <div className="text-[10px] uppercase tracking-wide opacity-70 truncate">{variantLabel(variant, variants)}</div>
                              <div className="text-xs font-bold leading-tight">₹{variantPrice(variant)}</div>
                              {low && <span className="absolute -top-1 -right-1 h-3.5 min-w-3.5 rounded-full bg-amber-500 text-[9px] text-black font-black px-1 leading-[14px]">{stock}</span>}
                            </button>
                          );
                        })}
                      </div>
                      {variants.length > 6 && (
                        <p className="text-[10px] text-zinc-500">+{variants.length - 6} more sizes</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filteredProducts.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-20 text-zinc-600">
                <Search className="h-16 w-16 mb-4 opacity-20" />
                <p className="text-lg font-bold">No products match your filter</p>
                <p className="text-sm">Press Esc to clear, or F3 to scan a barcode</p>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-500 flex flex-wrap gap-x-4 gap-y-1 bg-zinc-950/40">
          <span><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300">F2</kbd> Search</span>
          <span><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300">F3</kbd> Scan</span>
          <span><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300">F4</kbd> Customer</span>
          <span><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300">F9</kbd> Hold</span>
          <span><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300">F12</kbd> Checkout</span>
          <span><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300">?</kbd> Help</span>
          <span><kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300">Esc</kbd> Reset</span>
        </div>
      </div>

      {/* Right Panel: Cart */}
      <div className="w-full md:w-[40%] flex flex-col bg-zinc-950 min-h-[60vh] md:min-h-0">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black">CART</h2>
            <Badge variant="outline" className="text-primary border-primary">{items.length}</Badge>
          </div>
          <div className="flex gap-2">
            <Sheet open={heldBillsOpen} onOpenChange={setHeldBillsOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="border-zinc-800" data-testid="held-bills-trigger" title="Held bills">
                  <History className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-zinc-950 border-zinc-800 text-white w-[400px]">
                <SheetHeader><SheetTitle className="text-white text-2xl font-black">HELD BILLS</SheetTitle></SheetHeader>
                <div className="mt-8 space-y-4">
                  {heldBills.map((bill: any) => (
                    <div key={bill.id} className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-between">
                      <div>
                        <p className="font-bold">Bill #{String(bill.id).slice(0, 8)}</p>
                        <p className="text-xs text-zinc-500">
                          {(bill.items?.length ?? 0)} items
                          {bill.createdAt ? ` • ${new Date(bill.createdAt).toLocaleTimeString()}` : ""}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => handleResumeBill(bill)} data-testid={`resume-${bill.id}`}>Resume</Button>
                    </div>
                  ))}
                  {!heldBills.length && <p className="text-center text-zinc-600 py-8">No held bills</p>}
                </div>
              </SheetContent>
            </Sheet>
            <Button variant="outline" size="icon" className="border-zinc-800 text-amber-500" onClick={handleHoldBill} title="Hold (F9)">
              <Pause className="h-5 w-5" />
            </Button>
            <Button variant="outline" size="icon" className="border-zinc-800 text-red-500" onClick={clearCart} title="Clear cart">
              <Trash2 className="h-5 w-5" />
            </Button>
            <Link href="/help">
              <Button variant="outline" size="icon" className="border-zinc-800 text-blue-400" data-testid="pos-help-link" title="Help">
                <HelpCircle className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {items.map((item) => (
              <div key={`${item.productId}-${item.variantId}`} className="flex items-center gap-3 bg-zinc-900/50 p-3 rounded-lg border border-zinc-900">
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-base leading-tight truncate" title={item.productName}>{item.productName}</h4>
                  <p className="text-xs text-zinc-500 mt-0.5">{item.variantLabel} • ₹{item.unitPrice.toLocaleString("en-IN")}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-primary" onClick={() => updateQty(item.productId, item.variantId, item.qty - 1)}>
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-8 text-center font-bold text-lg">{item.qty}</span>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-primary" onClick={() => updateQty(item.productId, item.variantId, item.qty + 1)}>
                  <Plus className="h-4 w-4" />
                </Button>
                <div className="text-right min-w-[80px]"><p className="font-black text-lg">₹{item.lineTotal.toLocaleString("en-IN")}</p></div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-600 hover:text-red-500" onClick={() => removeItem(item.productId, item.variantId)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-700">
                <ScanLine className="h-16 w-16 mb-4 opacity-20" />
                <p className="text-xl font-bold">Cart is empty</p>
                <p className="text-sm text-zinc-600 mt-2">Scan a barcode or tap a product</p>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 bg-zinc-900 border-t border-zinc-800 space-y-3">
          {/* Coupon + manual discount */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex gap-2">
              <Input placeholder="Coupon" className="h-10 bg-zinc-950 border-zinc-800" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} />
              <Button variant="secondary" className="h-10 px-3" onClick={handleApplyCoupon} disabled={validatingCoupon || !couponCode}>
                <Tag className="h-4 w-4" />
              </Button>
            </div>
            <Input
              placeholder="Manual disc ₹"
              type="number" inputMode="decimal"
              className="h-10 bg-zinc-950 border-zinc-800"
              value={manualDiscount}
              onChange={(e) => setManualDiscount(e.target.value)}
              data-testid="pos-manual-discount"
            />
          </div>
          {md > 0 && (
            <Input
              placeholder="Discount reason (e.g. damaged box, manager comp)"
              className="h-9 bg-zinc-950 border-zinc-800 text-xs"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
            />
          )}

          {/* Customer */}
          <div className="flex items-center gap-2">
            <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex-1 h-11 bg-zinc-950 border-zinc-800 justify-start text-left" data-testid="customer-picker">
                  <User className="h-4 w-4 mr-2 text-primary" />
                  {customer ? (
                    <span className="truncate">
                      <span className="font-bold">{customer.name}</span>
                      {customer.phone ? <span className="text-zinc-500 ml-2">{customer.phone}</span> : null}
                    </span>
                  ) : <span className="text-zinc-500">Walk-in customer  (F4)</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[360px] bg-zinc-950 border-zinc-800 p-0" align="start">
                <div className="p-3 border-b border-zinc-800">
                  <Input autoFocus placeholder="Search by name or phone…" className="bg-zinc-900 border-zinc-800 h-10"
                    value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} data-testid="customer-search-input" />
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {customerSearch.length < 2 && <p className="text-xs text-zinc-500 p-3">Type at least 2 characters</p>}
                  {customerSearch.length >= 2 && (customersData?.data ?? []).length === 0 && (
                    <div className="p-3 space-y-2">
                      <p className="text-xs text-zinc-500">No matches. Walk-in customer is fine, or add a new one.</p>
                    </div>
                  )}
                  {(customersData?.data ?? []).map((c) => (
                    <button key={c.id} onClick={() => { setCustomer(c); setCustomerSearch(""); setCustomerOpen(false); }}
                      className="w-full text-left p-3 hover:bg-zinc-900 border-b border-zinc-900" data-testid={`customer-option-${c.id}`}>
                      <p className="font-bold text-sm">{c.name}</p>
                      <p className="text-xs text-zinc-500">{c.phone} {c.customerType ? `• ${c.customerType}` : ""}</p>
                    </button>
                  ))}
                </div>
                <div className="p-2 border-t border-zinc-800 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 h-9 border-zinc-800"
                    onClick={() => { setCustomer(null); setCustomerSearch(""); setCustomerOpen(false); }}
                    data-testid="customer-walkin">
                    <UserX className="h-4 w-4 mr-2" /> Walk-in
                  </Button>
                  <Button variant="default" size="sm" className="flex-1 h-9"
                    onClick={() => {
                      const initial = customerSearch.trim();
                      if (/^\d{6,}$/.test(initial)) { setNewCustPhone(initial); setNewCustName(""); }
                      else { setNewCustName(initial); setNewCustPhone(""); }
                      setCustomerOpen(false);
                      setNewCustOpen(true);
                    }}
                    data-testid="customer-add-new">
                    <Plus className="h-4 w-4 mr-2" /> New customer
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            {customer && (
              <Button variant="outline" size="icon" className="h-11 w-11 border-zinc-800 text-red-400" onClick={() => setCustomer(null)} title="Clear">
                <UserX className="h-5 w-5" />
              </Button>
            )}
          </div>

          {/* Totals */}
          <div className="space-y-1.5 text-zinc-400 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>₹{subtotal.toLocaleString("en-IN")}</span></div>
            {discount > 0 && (
              <div className="flex justify-between text-green-500">
                <span>Coupon {coupon ? `(${coupon.code})` : ""}</span><span>- ₹{discount.toLocaleString("en-IN")}</span>
              </div>
            )}
            {md > 0 && (
              <div className="flex justify-between text-green-500"><span>Manual discount</span><span>- ₹{md.toLocaleString("en-IN")}</span></div>
            )}
            <div className="flex justify-between"><span>GST ({Math.round(taxRate * 100)}%)</span><span>₹{gstAdj.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between text-white text-3xl font-black pt-2 border-t border-zinc-800">
              <span>TOTAL</span><span className="text-primary">₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Multi-tender (admin-toggleable per method via Website CMS → pos.paymentMethods) */}
          {(() => {
            const cols = (pmEnabled.cash ? 1 : 0) + (pmEnabled.upi ? 1 : 0) + (pmEnabled.card ? 1 : 0);
            const gridCls = cols === 3 ? "grid-cols-3" : cols === 2 ? "grid-cols-2" : "grid-cols-1";
            return (
              <div className={`grid ${gridCls} gap-2 text-xs`}>
                {pmEnabled.cash && (
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-black">Cash</label>
                    <Input ref={cashRef} type="number" inputMode="decimal" className="h-11 bg-zinc-950 border-zinc-800 font-bold"
                      value={tenderCash} onChange={(e) => setTenderCash(e.target.value)} data-testid="tender-cash" />
                  </div>
                )}
                {pmEnabled.upi && (
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-black">UPI</label>
                    <Input type="number" inputMode="decimal" className="h-11 bg-zinc-950 border-zinc-800 font-bold"
                      value={tenderUpi} onChange={(e) => setTenderUpi(e.target.value)} data-testid="tender-upi" />
                  </div>
                )}
                {pmEnabled.card && (
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-black">Card</label>
                    <Input type="number" inputMode="decimal" className="h-11 bg-zinc-950 border-zinc-800 font-bold"
                      value={tenderCard} onChange={(e) => setTenderCard(e.target.value)} data-testid="tender-card" />
                  </div>
                )}
                {pmEnabled.upi && upiAmt > 0 && (
                  <Input placeholder="UPI ref (optional)" className={`${cols === 3 ? "col-span-3" : cols === 2 ? "col-span-2" : "col-span-1"} h-9 bg-zinc-950 border-zinc-800 text-xs`} value={tenderUpiRef} onChange={(e) => setTenderUpiRef(e.target.value)} />
                )}
                {pmEnabled.card && cardAmt > 0 && (
                  <Input placeholder="Card last 4 (optional)" className={`${cols === 3 ? "col-span-3" : cols === 2 ? "col-span-2" : "col-span-1"} h-9 bg-zinc-950 border-zinc-800 text-xs`} value={tenderCardRef} onChange={(e) => setTenderCardRef(e.target.value)} />
                )}
              </div>
            );
          })()}

          <div className="flex flex-wrap gap-2">
            {QUICK_CASH.map((amt) => (
              <Button key={amt} variant="outline" size="sm" className="h-9 px-3 border-zinc-800 bg-zinc-950 text-sm font-bold" onClick={() => addCash(amt)} data-testid={`quick-cash-${amt}`}>
                +₹{amt}
              </Button>
            ))}
            <Button variant="outline" size="sm" className="h-9 px-3 border-primary/40 bg-zinc-950 text-sm font-bold text-primary" onClick={setCashExact} data-testid="quick-cash-exact">
              Exact ₹{total.toFixed(2)}
            </Button>
            <Button variant="ghost" size="sm" className="h-9 px-2 text-zinc-500" onClick={() => { setTenderCash(""); setTenderUpi(""); setTenderCard(""); }}>Clear</Button>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Tendered <span className="text-zinc-300 font-bold">{inr(tenderTotal)}</span></span>
            {remainingDue > 0
              ? <span className="text-red-500 font-bold">Due {inr(remainingDue)}</span>
              : change > 0
                ? <span className="text-green-500 font-bold">Change {inr(change)}</span>
                : <span className="text-emerald-500 font-bold">Settled</span>}
          </div>

          {customer?.id && (
            <div className="flex items-center justify-between text-xs px-1">
              <label className="inline-flex items-center gap-2 text-zinc-400">
                <input
                  type="checkbox"
                  checked={includeDelivery}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setIncludeDelivery(on);
                    if (on && !deliveryShip.name) {
                      setDeliveryShip((p) => ({ ...p, name: customer.name ?? "", phone: customer.phone ?? "" }));
                    }
                    if (on) setDeliveryOpen(true);
                  }}
                  data-testid="pos-include-delivery"
                />
                <span>Add delivery address</span>
              </label>
              {includeDelivery && (
                <Button variant="link" size="sm" className="h-auto p-0 text-primary" onClick={() => setDeliveryOpen(true)}>
                  {isAddrComplete(deliveryShip) ? "Edit address" : "Enter address"}
                </Button>
              )}
            </div>
          )}

          <Button
            className="w-full h-16 text-xl font-black rounded-xl shadow-lg shadow-primary/20"
            disabled={items.length === 0 || remainingDue > 0.5 || checkingOut || !currentShift || !pricingLoaded}
            onClick={handleCheckout}
            data-testid="pos-checkout-btn"
          >
            {checkingOut ? "PROCESSING..." : `CHECKOUT  •  ${inr(total)}`}
          </Button>
        </div>
      </div>

      {/* Delivery address dialog (POS) */}
      <Dialog open={deliveryOpen} onOpenChange={setDeliveryOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Delivery address</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-zinc-400 uppercase mb-2">Shipping</h3>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Recipient name" value={deliveryShip.name} onChange={(e) => setDeliveryShip({ ...deliveryShip, name: e.target.value })} data-testid="pos-ship-name" />
                <Input placeholder="Phone (10 digits)" value={deliveryShip.phone} onChange={(e) => setDeliveryShip({ ...deliveryShip, phone: e.target.value })} data-testid="pos-ship-phone" />
                <Input className="col-span-2" placeholder="Address line 1" value={deliveryShip.line1} onChange={(e) => setDeliveryShip({ ...deliveryShip, line1: e.target.value })} data-testid="pos-ship-line1" />
                <Input className="col-span-2" placeholder="Address line 2 (optional)" value={deliveryShip.line2} onChange={(e) => setDeliveryShip({ ...deliveryShip, line2: e.target.value })} />
                <Input placeholder="City" value={deliveryShip.city} onChange={(e) => setDeliveryShip({ ...deliveryShip, city: e.target.value })} data-testid="pos-ship-city" />
                <Input placeholder="State" value={deliveryShip.state} onChange={(e) => setDeliveryShip({ ...deliveryShip, state: e.target.value })} />
                <Input placeholder="Pincode (6 digits)" value={deliveryShip.pincode} onChange={(e) => setDeliveryShip({ ...deliveryShip, pincode: e.target.value })} data-testid="pos-ship-pincode" />
                <Input placeholder="Landmark (optional)" value={deliveryShip.landmark} onChange={(e) => setDeliveryShip({ ...deliveryShip, landmark: e.target.value })} />
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={deliverySameAsShip} onChange={(e) => setDeliverySameAsShip(e.target.checked)} data-testid="pos-bill-same" />
              <span>Billing address same as shipping</span>
            </label>
            {!deliverySameAsShip && (
              <div>
                <h3 className="text-sm font-bold text-zinc-400 uppercase mb-2">Billing</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Recipient name" value={deliveryBill.name} onChange={(e) => setDeliveryBill({ ...deliveryBill, name: e.target.value })} />
                  <Input placeholder="Phone (10 digits)" value={deliveryBill.phone} onChange={(e) => setDeliveryBill({ ...deliveryBill, phone: e.target.value })} />
                  <Input className="col-span-2" placeholder="Address line 1" value={deliveryBill.line1} onChange={(e) => setDeliveryBill({ ...deliveryBill, line1: e.target.value })} />
                  <Input className="col-span-2" placeholder="Address line 2 (optional)" value={deliveryBill.line2} onChange={(e) => setDeliveryBill({ ...deliveryBill, line2: e.target.value })} />
                  <Input placeholder="City" value={deliveryBill.city} onChange={(e) => setDeliveryBill({ ...deliveryBill, city: e.target.value })} />
                  <Input placeholder="State" value={deliveryBill.state} onChange={(e) => setDeliveryBill({ ...deliveryBill, state: e.target.value })} />
                  <Input placeholder="Pincode (6 digits)" value={deliveryBill.pincode} onChange={(e) => setDeliveryBill({ ...deliveryBill, pincode: e.target.value })} />
                  <Input placeholder="Landmark (optional)" value={deliveryBill.landmark} onChange={(e) => setDeliveryBill({ ...deliveryBill, landmark: e.target.value })} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliveryOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!isAddrComplete(deliveryShip)) {
                  toast({ title: "Shipping address incomplete (10-digit phone, 6-digit pincode required)", variant: "destructive" });
                  return;
                }
                setDeliveryOpen(false);
              }}
              data-testid="pos-delivery-save"
            >
              Save address
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New customer dialog */}
      <Dialog open={newCustOpen} onOpenChange={setNewCustOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
          <DialogHeader><DialogTitle className="text-2xl font-black">NEW CUSTOMER</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs text-zinc-400">Name</label>
              <Input value={newCustName} onChange={(e) => setNewCustName(e.target.value)} placeholder="Customer name" className="bg-zinc-900 border-zinc-800" data-testid="new-cust-name" />
            </div>
            <div>
              <label className="text-xs text-zinc-400">Phone</label>
              <Input value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} placeholder="10-digit phone" className="bg-zinc-900 border-zinc-800" data-testid="new-cust-phone" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-zinc-800" onClick={() => setNewCustOpen(false)}>Cancel</Button>
            <Button
              data-testid="new-cust-save"
              disabled={createCustomerMut.isPending || !newCustName.trim() || !/^\d{6,}$/.test(newCustPhone.trim())}
              onClick={async () => {
                try {
                  const res: any = await createCustomerMut.mutateAsync({
                    data: {
                      name: newCustName.trim(),
                      phone: newCustPhone.trim(),
                      customerType: "retail",
                    },
                  });
                  const created = (res?.data ?? res) as { id?: string; name?: string; phone?: string } | null;
                  if (created?.id) {
                    setCustomer(created);
                  }
                  toast({ title: "Customer added", description: created?.name ?? newCustName });
                  setNewCustOpen(false);
                  setNewCustName("");
                  setNewCustPhone("");
                  setCustomerSearch("");
                } catch (err: any) {
                  // Duplicate phone: server returns 409 with the existing customer in `data`.
                  // Attach it so the cashier isn't blocked by a pre-existing record.
                  const existing = err?.data?.data ?? err?.body?.data ?? null;
                  if (err?.status === 409 && existing?.id) {
                    setCustomer(existing);
                    toast({ title: "Customer already on file", description: existing.name ?? newCustName });
                    setNewCustOpen(false);
                    setNewCustName("");
                    setNewCustPhone("");
                    setCustomerSearch("");
                    return;
                  }
                  toast({ title: "Failed to add customer", description: err?.message ?? "Please try again", variant: "destructive" });
                }
              }}
            >
              {createCustomerMut.isPending ? "Saving…" : "Save customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shortcuts overlay */}
      {shortcutsOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShortcutsOpen(false)}>
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-black">KEYBOARD SHORTCUTS</h2>
            <div className="space-y-2 text-sm">
              {[["F2","Search"],["F3","Scan"],["F4","Customer"],["F9","Hold"],["F12","Checkout"],["?","Help"],["Esc","Reset"]].map(([k, label]) => (
                <div key={k} className="flex items-center justify-between border-b border-zinc-900 pb-2">
                  <span className="text-zinc-400">{label}</span>
                  <kbd className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded font-mono text-zinc-200">{k}</kbd>
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={() => setShortcutsOpen(false)}>Got it</Button>
          </div>
        </div>
      )}

      {/* Open shift dialog */}
      <Dialog open={openShiftDialog} onOpenChange={(v) => setOpenShiftDialog(v)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">OPEN SHIFT</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
                <div className="text-zinc-500 uppercase">Cashier</div>
                <div className="text-base font-semibold text-white">{cashierName || "—"}</div>
              </div>
              <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
                <div className="text-zinc-500 uppercase">Shop</div>
                <div className="text-base font-semibold text-white">{locationName || activeLocationId || "—"}</div>
              </div>
            </div>
            <p className="text-sm text-zinc-400">Count the cash in the drawer and enter the opening float. This becomes the starting balance for the day.</p>
            <div>
              <label className="text-xs uppercase font-black text-zinc-500">Opening cash (₹)</label>
              <Input
                type="number" inputMode="decimal" autoFocus
                className="h-14 text-2xl font-bold bg-zinc-900 border-zinc-800"
                value={openingCash} onChange={(e) => setOpeningCash(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleOpenShift(); }}
                data-testid="open-shift-cash"
              />
              <p className="mt-1 text-[11px] text-zinc-500">Maximum ₹10,00,000.</p>
            </div>
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
            <Button variant="ghost" className="text-zinc-400" onClick={handlePosLogout} data-testid="open-shift-logout">
              Switch user
            </Button>
            <Button onClick={handleOpenShift} disabled={openingShift || !openingCash} data-testid="open-shift-confirm">
              {openingShift ? "Opening..." : "OPEN SHIFT"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close shift / Z-report dialog */}
      <Dialog open={closeShiftOpen} onOpenChange={(v) => { setCloseShiftOpen(v); if (!v) { setZReport(null); setCountedCash(""); setClosingNotes(""); } }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg">
          <DialogHeader><DialogTitle className="text-2xl font-black">{zReport ? "Z-REPORT" : "CLOSE SHIFT"}</DialogTitle></DialogHeader>

          {!zReport && currentShift && running && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 bg-zinc-900 border border-zinc-800 rounded p-3">
                <div className="text-zinc-500">Opening float</div><div className="text-right font-bold">{inr(Number(currentShift.openingCash) || 0)}</div>
                <div className="text-zinc-500">Cash sales</div><div className="text-right font-bold">{inr(running.cashSales || 0)}</div>
                <div className="text-zinc-500">UPI sales</div><div className="text-right font-bold">{inr(running.upiSales || 0)}</div>
                <div className="text-zinc-500">Card sales</div><div className="text-right font-bold">{inr(running.cardSales || 0)}</div>
                <div className="text-zinc-500">Credit sales</div><div className="text-right font-bold">{inr(running.creditSales || 0)}</div>
                <div className="text-zinc-500">Transactions</div><div className="text-right font-bold">{running.txnCount || 0}</div>
                <div className="text-emerald-400 font-black col-span-2 border-t border-zinc-800 pt-2 flex justify-between">
                  <span>Expected drawer</span><span>{inr(running.expectedCash || 0)}</span>
                </div>
              </div>
              <div>
                <label className="text-xs uppercase font-black text-zinc-500">Counted cash (₹)</label>
                <Input
                  type="number" inputMode="decimal" autoFocus
                  className="h-14 text-2xl font-bold bg-zinc-900 border-zinc-800"
                  value={countedCash} onChange={(e) => setCountedCash(e.target.value)}
                  data-testid="close-shift-counted"
                />
              </div>
              <Input
                placeholder="Notes (optional)"
                className="bg-zinc-900 border-zinc-800"
                value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)}
              />
            </div>
          )}

          {zReport && (
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2 bg-zinc-900 border border-zinc-800 rounded p-3">
                <div className="text-zinc-500">Transactions</div><div className="text-right font-bold">{zReport.txnCount}</div>
                <div className="text-zinc-500">Total sales</div><div className="text-right font-bold">{inr(zReport.totalSales)}</div>
                <div className="text-zinc-500">Cash</div><div className="text-right">{inr(zReport.cashSales)}</div>
                <div className="text-zinc-500">UPI</div><div className="text-right">{inr(zReport.upiSales)}</div>
                <div className="text-zinc-500">Card</div><div className="text-right">{inr(zReport.cardSales)}</div>
                <div className="text-zinc-500">Credit</div><div className="text-right">{inr(zReport.creditSales)}</div>
                <div className="text-zinc-500 border-t border-zinc-800 pt-2">Opening float</div><div className="text-right font-bold border-t border-zinc-800 pt-2">{inr(zReport.openingCash)}</div>
                <div className="text-zinc-500">Expected cash</div><div className="text-right font-bold">{inr(zReport.expectedCash)}</div>
                <div className="text-zinc-500">Counted cash</div><div className="text-right font-bold">{inr(zReport.closingCash)}</div>
                <div className={`font-black col-span-2 border-t border-zinc-800 pt-2 flex justify-between ${zReport.overShort < -0.5 ? "text-red-500" : zReport.overShort > 0.5 ? "text-amber-400" : "text-emerald-400"}`}>
                  <span>{zReport.overShort < 0 ? "Short" : "Over"} / Variance</span><span>{inr(Math.abs(zReport.overShort))}</span>
                </div>
              </div>
              <p className="text-xs text-zinc-500">Closed at {new Date(zReport.closedAt).toLocaleString()}.</p>
            </div>
          )}

          <DialogFooter>
            {!zReport && (
              <Button onClick={handleCloseShift} disabled={closingShift || !countedCash} data-testid="close-shift-confirm">
                {closingShift ? "Closing..." : "CLOSE SHIFT"}
              </Button>
            )}
            {zReport && (
              <>
                <Button variant="outline" onClick={() => window.print()}>Print</Button>
                <Button onClick={handleZReportDone} data-testid="z-report-done">DONE — LOG OUT</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reprint dialog */}
      <Dialog open={reprintOpen} onOpenChange={setReprintOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
          <DialogHeader><DialogTitle className="text-2xl font-black">REPRINT RECEIPT</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {recentSales.length === 0 && <p className="text-sm text-zinc-500 text-center py-6">No recent sales</p>}
            {recentSales.map((s) => (
              <button
                key={s.id}
                onClick={() => { setReprintOpen(false); setLocation(`/receipt?id=${s.id}`); }}
                className="w-full text-left p-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded flex items-center justify-between"
                data-testid={`reprint-${s.id}`}
              >
                <div>
                  <p className="font-bold text-sm">{s.invoiceNo}</p>
                  <p className="text-xs text-zinc-500">{s.customerName ?? "Walk-in"} • {s.itemCount} items • {new Date(s.createdAt).toLocaleTimeString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-black">{inr(s.total)}</p>
                  <p className="text-xs text-zinc-500">{s.paymentMode}</p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <ScannerSettingsDialog open={scannerSettingsOpen} onOpenChange={setScannerSettingsOpen} />
    </div>
  );
};

export default SaleScreen;
