import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useCart } from "@/context/cart";
import { useShopAuth } from "@/context/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, Truck, ShieldCheck, ChevronLeft, MapPin, Plus, Receipt, Download } from "lucide-react";
import { Layout } from "@/components/layout";
import { apiFetch } from "../lib/api";
import {
  useListShopAddresses,
  useCreateShopAddress,
  usePlaceShopOrder,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const EMPTY_ADDR = {
  label: "Home", name: "", phone: "", line1: "", line2: "",
  city: "", state: "Tamil Nadu", pincode: "", landmark: "",
  addressType: "both" as "shipping" | "billing" | "both",
  isDefault: true,
};

const isValidPhone = (s: string) => s.replace(/\D/g, "").length >= 10;
const isValidPincode = (s: string) => /^\d{6}$/.test(s.replace(/\D/g, ""));

type Addr = {
  id: string; name: string; phone: string; line1: string; line2?: string | null;
  city: string; state: string; pincode: string; landmark?: string | null;
  label?: string | null; addressType?: "shipping" | "billing" | "both";
  isDefault?: boolean;
};

function AddressCard({ a, selected, onSelect, testId }: { a: Addr; selected: boolean; onSelect: () => void; testId: string }) {
  return (
    <label className={`block p-4 rounded-2xl border cursor-pointer transition ${selected ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"}`}>
      <div className="flex items-start gap-3">
        <input type="radio" checked={selected} onChange={onSelect} className="mt-1" data-testid={testId} />
        <div className="flex-1">
          <p className="font-semibold">
            {a.name} · {a.phone}
            {a.label && <span className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-100">{a.label}</span>}
          </p>
          <p className="text-sm text-gray-600 mt-0.5">
            {a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} - {a.pincode}
          </p>
        </div>
      </div>
    </label>
  );
}

export default function Checkout() {
  const { items, subtotal, clearCart } = useCart();
  const { isLoggedIn, customer } = useShopAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: addrResp, refetch: refetchAddr } = useListShopAddresses({ query: { enabled: isLoggedIn } as any });
  const createAddr = useCreateShopAddress();
  const placeOrder = usePlaceShopOrder();

  const allAddresses: Addr[] = (((addrResp as any)?.data ?? []) as Addr[]);
  // Filter usable addresses by type for each picker. `both` works for either.
  const shippingOptions = useMemo(
    () => allAddresses.filter((a) => !a.addressType || a.addressType === "shipping" || a.addressType === "both"),
    [allAddresses],
  );
  const billingOptions = useMemo(
    () => allAddresses.filter((a) => !a.addressType || a.addressType === "billing" || a.addressType === "both"),
    [allAddresses],
  );

  const [shippingId, setShippingId] = useState<string | null>(null);
  const [billingId, setBillingId] = useState<string | null>(null);
  const [sameAsShipping, setSameAsShipping] = useState(true);
  const [showNewShipping, setShowNewShipping] = useState(false);
  const [showNewBilling, setShowNewBilling] = useState(false);
  const [newShipping, setNewShipping] = useState({ ...EMPTY_ADDR, addressType: "shipping" as const });
  const [newBilling, setNewBilling] = useState({ ...EMPTY_ADDR, addressType: "billing" as const, label: "Billing", isDefault: false });
  const [paymentMode, setPaymentMode] = useState<"COD" | "UPI" | "BANK">("COD");
  const [notes, setNotes] = useState("");
  const [placedOrder, setPlacedOrder] = useState<any>(null);

  // Estimated GST shown on checkout. Final GST is computed per-item server-side
  // (using each product's HSN slab / override), so the placed-order total may
  // differ slightly. The success screen and order detail show the actual figures.
  const gst = Math.round(subtotal * 0.18);
  const total = subtotal + gst;

  useEffect(() => {
    if (!isLoggedIn) navigate(`/login?next=${encodeURIComponent("/checkout")}`);
  }, [isLoggedIn, navigate]);

  // Initialize shipping/billing selections once addresses load.
  useEffect(() => {
    if (shippingOptions.length && !shippingId) {
      const def = shippingOptions.find((a) => a.isDefault) ?? shippingOptions[0];
      if (def) setShippingId(def.id);
    }
    if (allAddresses.length === 0 && isLoggedIn) {
      setShowNewShipping(true);
      if (customer) setNewShipping((p) => ({ ...p, name: customer.name, phone: customer.phone }));
    }
  }, [shippingOptions, allAddresses.length, shippingId, isLoggedIn, customer]);

  const validateInline = (a: typeof EMPTY_ADDR, label: string): string | null => {
    if (!a.name || !a.phone || !a.line1 || !a.city || !a.state || !a.pincode) return `Please complete the ${label} address`;
    if (!isValidPhone(a.phone)) return `${label} phone must contain at least 10 digits`;
    if (!isValidPincode(a.pincode)) return `${label} pincode must be 6 digits`;
    return null;
  };

  const handlePlace = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Resolve shipping address id (create new if needed).
      let resolvedShippingId = shippingId;
      if (showNewShipping || !resolvedShippingId) {
        const err = validateInline(newShipping, "shipping");
        if (err) { toast({ title: err, variant: "destructive" }); return; }
        const res = await createAddr.mutateAsync({ data: newShipping as any });
        resolvedShippingId = (res as any).data.id;
      }
      // Resolve billing address id when "same as shipping" is OFF.
      let resolvedBillingId: string | undefined;
      if (!sameAsShipping) {
        if (showNewBilling || !billingId) {
          const err = validateInline(newBilling, "billing");
          if (err) { toast({ title: err, variant: "destructive" }); return; }
          const res = await createAddr.mutateAsync({ data: newBilling as any });
          resolvedBillingId = (res as any).data.id;
        } else {
          resolvedBillingId = billingId ?? undefined;
        }
      }
      await refetchAddr();

      const orderItems = items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty }));
      const res = await placeOrder.mutateAsync({
        data: {
          items: orderItems,
          shippingAddressId: resolvedShippingId!,
          billingAddressId: resolvedBillingId,
          paymentMode,
          notes: notes || undefined,
        } as any,
      });
      setPlacedOrder((res as any).data);
      clearCart();
    } catch (e: any) {
      toast({ title: "Could not place order", description: e?.data?.error?.message || "Try again.", variant: "destructive" });
    }
  };

  if (!isLoggedIn) return null;

  if (placedOrder) {
    const token = (typeof localStorage !== "undefined") ? localStorage.getItem("shop_token") : null;
    const downloadInvoice = async () => {
      try {
        const res = await apiFetch(`/api/v1/shop/orders/${placedOrder.id}/invoice.pdf`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${placedOrder.invoiceNo}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      } catch (e: any) {
        toast({ title: "Could not download invoice", description: e?.message, variant: "destructive" });
      }
    };
    const actualGst = Number(placedOrder.cgst ?? 0) + Number(placedOrder.sgst ?? 0) + Number(placedOrder.igst ?? 0);
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-16">
          <div className="text-center mb-10">
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            <h1 className="text-4xl font-extrabold text-gray-900 mb-2">Order placed!</h1>
            <p className="text-lg text-gray-600">
              Your order ID is <span className="font-bold text-primary">#{placedOrder.invoiceNo}</span>.
            </p>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg flex items-center gap-2"><Receipt className="h-5 w-5 text-primary" /> Invoice summary</h2>
              <Button size="sm" variant="outline" onClick={downloadInvoice} data-testid="success-download-invoice">
                <Download className="h-4 w-4 mr-1" /> Download PDF
              </Button>
            </div>
            <div className="space-y-2 text-sm">
              {(placedOrder.items ?? []).map((it: any, i: number) => (
                <div key={i} className="flex justify-between">
                  <span className="text-gray-700">{it.qty} × {it.productName}{it.variantSize ? ` (${it.variantSize})` : ""}</span>
                  <span className="font-medium">₹{Number(it.amount).toLocaleString("en-IN")}</span>
                </div>
              ))}
              <div className="pt-3 mt-3 border-t space-y-1">
                <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>₹{Number(placedOrder.subtotal).toLocaleString("en-IN")}</span></div>
                <div className="flex justify-between text-gray-600"><span>GST</span><span>₹{actualGst.toLocaleString("en-IN")}</span></div>
                <div className="flex justify-between text-lg font-extrabold pt-2 border-t"><span>Total</span><span>₹{Number(placedOrder.total).toLocaleString("en-IN")}</span></div>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6 mb-8">
            <h3 className="font-bold text-amber-900 mb-1 flex items-center">
              <Truck className="h-5 w-5 mr-2" /> What's next?
            </h3>
            <p className="text-amber-800 leading-relaxed text-sm">
              We'll call you within 24 hours to confirm and arrange dispatch via licensed cracker logistics. Track progress and download a fresh invoice anytime from your account.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Link href={`/account/orders/${placedOrder.id}`}>
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground h-12 px-8 rounded-full font-bold" data-testid="success-view-order">View order</Button>
            </Link>
            <Link href="/catalogue">
              <Button variant="outline" className="h-12 px-8 rounded-full font-bold">Continue shopping</Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  if (items.length === 0) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h1 className="text-3xl font-extrabold mb-4">Your cart is empty</h1>
          <Link href="/catalogue"><Button className="bg-primary hover:bg-primary/90 text-primary-foreground">Browse catalogue</Button></Link>
        </div>
      </Layout>
    );
  }

  // Reusable inline address form.
  const renderAddrFields = (
    val: typeof EMPTY_ADDR,
    set: (v: typeof EMPTY_ADDR) => void,
    keyPrefix: string,
  ) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div><Label>Recipient name *</Label><Input value={val.name} onChange={(e) => set({ ...val, name: e.target.value })} required data-testid={`${keyPrefix}-name`} /></div>
      <div><Label>Phone *</Label><Input value={val.phone} onChange={(e) => set({ ...val, phone: e.target.value })} required data-testid={`${keyPrefix}-phone`} /></div>
      <div className="md:col-span-2"><Label>Address line 1 *</Label><Input value={val.line1} onChange={(e) => set({ ...val, line1: e.target.value })} required data-testid={`${keyPrefix}-line1`} /></div>
      <div className="md:col-span-2"><Label>Address line 2</Label><Input value={val.line2} onChange={(e) => set({ ...val, line2: e.target.value })} /></div>
      <div><Label>City *</Label><Input value={val.city} onChange={(e) => set({ ...val, city: e.target.value })} required data-testid={`${keyPrefix}-city`} /></div>
      <div><Label>State *</Label><Input value={val.state} onChange={(e) => set({ ...val, state: e.target.value })} required /></div>
      <div><Label>Pincode * (6 digits)</Label><Input value={val.pincode} onChange={(e) => set({ ...val, pincode: e.target.value })} required data-testid={`${keyPrefix}-pincode`} /></div>
      <div><Label>Landmark</Label><Input value={val.landmark} onChange={(e) => set({ ...val, landmark: e.target.value })} /></div>
    </div>
  );

  return (
    <Layout>
      <div className="bg-gray-50 min-h-screen py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/cart" className="inline-flex items-center text-sm text-gray-500 hover:text-primary mb-8 transition-colors">
            <ChevronLeft className="h-4 w-4 mr-1" /> Back to cart
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-10">Checkout</h1>

          <form onSubmit={handlePlace} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {/* SHIPPING */}
              <section className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold mb-6 flex items-center"><MapPin className="h-5 w-5 mr-2 text-primary" /> Shipping address</h2>
                {shippingOptions.length > 0 && !showNewShipping && (
                  <div className="space-y-3 mb-4">
                    {shippingOptions.map((a) => (
                      <AddressCard key={a.id} a={a} selected={shippingId === a.id} onSelect={() => setShippingId(a.id)} testId={`ship-radio-${a.id}`} />
                    ))}
                    <Button type="button" variant="outline" onClick={() => { setShowNewShipping(true); setNewShipping({ ...EMPTY_ADDR, addressType: "shipping", name: customer?.name ?? "", phone: customer?.phone ?? "" }); }}>
                      <Plus className="h-4 w-4 mr-1" /> Add new shipping address
                    </Button>
                  </div>
                )}
                {showNewShipping && (
                  <>
                    {renderAddrFields(newShipping as any, (v) => setNewShipping(v as any), "checkout-ship")}
                    {shippingOptions.length > 0 && (
                      <div className="md:col-span-2 mt-3">
                        <Button type="button" variant="ghost" onClick={() => setShowNewShipping(false)}>Use a saved address instead</Button>
                      </div>
                    )}
                  </>
                )}
              </section>

              {/* BILLING */}
              <section className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold mb-3 flex items-center"><Receipt className="h-5 w-5 mr-2 text-primary" /> Billing address</h2>
                <label className="inline-flex items-center gap-2 mb-5">
                  <input type="checkbox" checked={sameAsShipping} onChange={(e) => setSameAsShipping(e.target.checked)} data-testid="billing-same-as-shipping" />
                  <span className="text-sm">Same as shipping address</span>
                </label>
                {!sameAsShipping && (
                  <>
                    {billingOptions.length > 0 && !showNewBilling && (
                      <div className="space-y-3 mb-4">
                        {billingOptions.map((a) => (
                          <AddressCard key={a.id} a={a} selected={billingId === a.id} onSelect={() => setBillingId(a.id)} testId={`bill-radio-${a.id}`} />
                        ))}
                        <Button type="button" variant="outline" onClick={() => { setShowNewBilling(true); setNewBilling({ ...EMPTY_ADDR, addressType: "billing", label: "Billing", isDefault: false, name: customer?.name ?? "", phone: customer?.phone ?? "" }); }}>
                          <Plus className="h-4 w-4 mr-1" /> Add new billing address
                        </Button>
                      </div>
                    )}
                    {(showNewBilling || billingOptions.length === 0) && (
                      <>
                        {renderAddrFields(newBilling as any, (v) => setNewBilling(v as any), "checkout-bill")}
                        {billingOptions.length > 0 && (
                          <div className="md:col-span-2 mt-3">
                            <Button type="button" variant="ghost" onClick={() => setShowNewBilling(false)}>Use a saved address instead</Button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </section>

              <section className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold mb-4">Payment method</h2>
                <div className="space-y-2">
                  {[
                    { v: "COD", label: "Cash on Delivery", desc: "Pay our delivery rep at the doorstep." },
                    { v: "UPI", label: "UPI / QR", desc: "We'll share UPI / QR during the verification call." },
                    { v: "BANK", label: "Bank transfer", desc: "We'll share bank details during the verification call." },
                  ].map((opt) => (
                    <label key={opt.v} className={`block p-4 rounded-2xl border cursor-pointer transition ${paymentMode === opt.v ? "border-primary bg-primary/5" : "border-gray-200"}`}>
                      <div className="flex items-start gap-3">
                        <input type="radio" name="pay" checked={paymentMode === opt.v} onChange={() => setPaymentMode(opt.v as any)} className="mt-1" data-testid={`payment-${opt.v}`} />
                        <div>
                          <p className="font-semibold">{opt.label}</p>
                          <p className="text-sm text-gray-600">{opt.desc}</p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </section>

              <section className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
                <Label className="mb-2 block">Order notes (optional)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special delivery instructions…" />
              </section>
            </div>

            <div className="lg:col-span-1">
              <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 sticky top-28">
                <h2 className="text-xl font-bold text-gray-900 mb-6">Order summary</h2>
                <div className="space-y-3 mb-6 max-h-[300px] overflow-y-auto">
                  {items.map(item => (
                    <div key={`${item.productId}-${item.variantId}`} className="flex justify-between text-sm">
                      <span className="text-gray-600">{item.qty} × {item.productName}</span>
                      <span className="font-medium">₹{item.unitPrice * item.qty}</span>
                    </div>
                  ))}
                </div>
                <Separator className="mb-6" />
                <div className="space-y-3 mb-8">
                  <div className="flex justify-between text-gray-600"><span>Subtotal</span><span className="font-medium">₹{subtotal.toLocaleString('en-IN')}</span></div>
                  <div className="flex justify-between text-gray-600"><span>GST (est. 18%)</span><span className="font-medium">₹{gst.toLocaleString('en-IN')}</span></div>
                  <div className="flex justify-between text-xl font-extrabold text-gray-900 pt-3 border-t"><span>Estimated total</span><span>₹{total.toLocaleString('en-IN')}</span></div>
                  <p className="text-[11px] text-gray-400 leading-snug">Final GST is calculated per item at checkout based on each product's HSN slab.</p>
                </div>
                <Button
                  type="submit"
                  className="w-full h-16 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl font-bold text-xl shadow-lg shadow-[hsl(197,65%,12%)]/10"
                  disabled={placeOrder.isPending || createAddr.isPending}
                  data-testid="checkout-place-order"
                >
                  {placeOrder.isPending ? "Placing order…" : "Place order"}
                </Button>
                <div className="mt-6 flex items-center justify-center space-x-2 text-xs text-gray-400">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Secure checkout · Verified seller</span>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
