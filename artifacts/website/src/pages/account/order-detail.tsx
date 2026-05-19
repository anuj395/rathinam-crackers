import { useState } from "react";
import { Link, useRoute } from "wouter";
import { AccountShell } from "@/components/account-shell";
import { useGetShopOrder } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, Receipt, Truck, Download, Share2, CheckCircle2, Circle, Clock, XCircle, ExternalLink } from "lucide-react";
import { useShopAuth } from "@/context/auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Addr = {
  name?: string; phone?: string; line1?: string; line2?: string | null;
  city?: string; state?: string; pincode?: string; landmark?: string | null;
};

const STAGES: { key: string; label: string }[] = [
  { key: "pending_confirmation", label: "Order placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "packed", label: "Packed" },
  { key: "dispatched", label: "Dispatched" },
  { key: "delivered", label: "Delivered" },
];

// Exact-match first so "pending_confirmation" maps to stage 0 (Order placed),
// not stage 1 (Confirmed). Fuzzy fallback covers unknown future statuses.
const STATUS_INDEX: Record<string, number> = {
  pending_confirmation: 0,
  pending: 0,
  placed: 0,
  new: 0,
  confirmed: 1,
  processing: 1,
  packed: 2,
  packing: 2,
  ready_to_ship: 2,
  dispatched: 3,
  shipped: 3,
  in_transit: 3,
  out_for_delivery: 3,
  delivered: 4,
  completed: 4,
  cancelled: -1,
  canceled: -1,
  refunded: -1,
};

function StatusTimeline({ status }: { status: string }) {
  const raw = (status || "").toLowerCase().trim();
  let activeIdx = STATUS_INDEX[raw];
  if (activeIdx === undefined) {
    // Fuzzy fallback: order matters — check terminal/late stages first so
    // partial matches like "pending_confirmation" don't trip "confirm".
    if (raw.startsWith("pending")) activeIdx = 0;
    else if (raw.includes("deliver") || raw.includes("complete")) activeIdx = 4;
    else if (raw.includes("dispatch") || raw.includes("ship") || raw.includes("transit")) activeIdx = 3;
    else if (raw.includes("pack")) activeIdx = 2;
    else if (raw.includes("confirm") || raw.includes("process")) activeIdx = 1;
    else if (raw.includes("cancel") || raw.includes("refund")) activeIdx = -1;
    else activeIdx = 0;
  }

  if (activeIdx === -1) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-800 flex items-center gap-2">
        <Circle className="h-4 w-4" /> This order has been cancelled.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100">
      <h2 className="font-bold mb-4">Order status</h2>
      {/* Desktop: horizontal stepper */}
      <div className="hidden sm:flex items-center justify-between">
        {STAGES.map((stage, i) => {
          const done = i <= activeIdx;
          const current = i === activeIdx;
          return (
            <div key={stage.key} className="flex-1 flex flex-col items-center relative">
              {i > 0 && (
                <div className={`absolute top-3 right-1/2 w-full h-0.5 ${i <= activeIdx ? "bg-primary" : "bg-gray-200"}`} />
              )}
              <div className={`relative z-10 h-7 w-7 rounded-full flex items-center justify-center border-2 ${
                done ? "bg-primary border-primary text-white" : "bg-white border-gray-300 text-gray-400"
              } ${current ? "ring-4 ring-primary/15" : ""}`}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
              </div>
              <p className={`text-xs mt-2 text-center ${done ? "font-semibold text-gray-900" : "text-gray-500"}`}>
                {stage.label}
              </p>
            </div>
          );
        })}
      </div>
      {/* Mobile: vertical stepper */}
      <ol className="sm:hidden space-y-3">
        {STAGES.map((stage, i) => {
          const done = i <= activeIdx;
          const current = i === activeIdx;
          return (
            <li key={stage.key} className="flex items-center gap-3">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center border-2 ${
                done ? "bg-primary border-primary text-white" : "bg-white border-gray-300 text-gray-400"
              } ${current ? "ring-4 ring-primary/15" : ""}`}>
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3 w-3" />}
              </div>
              <span className={done ? "font-semibold" : "text-gray-500"}>{stage.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function AddressBlock({ title, icon, addr }: { title: string; icon: React.ReactNode; addr: Addr }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100">
      <h2 className="font-bold mb-3 flex items-center gap-2">{icon} {title}</h2>
      <p className="font-semibold">{addr.name} · {addr.phone}</p>
      <p className="text-sm text-gray-600 mt-1">
        {addr.line1}
        {addr.line2 ? `, ${addr.line2}` : ""}
        {addr.city ? `, ${addr.city}` : ""}{addr.state ? `, ${addr.state}` : ""}
        {addr.pincode ? ` - ${addr.pincode}` : ""}
      </p>
      {addr.landmark && <p className="text-xs text-gray-500 mt-1">Landmark: {addr.landmark}</p>}
    </div>
  );
}

export default function OrderDetail() {
  const [, params] = useRoute("/account/orders/:id");
  const id = params?.id ?? "";
  const { data, isLoading } = useGetShopOrder(id);
  const order = (data as any)?.data;
  const { token } = useShopAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const cancelOrder = async () => {
    if (!order || !token) return;
    if (!cancelReason.trim()) {
      toast({ title: "Please tell us why you'd like to cancel", variant: "destructive" });
      return;
    }
    setCancelling(true);
    try {
      const res = await apiFetch(`/api/v1/shop/orders/${order.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message || `HTTP ${res.status}`);
      toast({ title: "Order cancelled", description: "Refund (if applicable) will be initiated within 5-7 days." });
      setCancelOpen(false);
      setCancelReason("");
      await qc.invalidateQueries();
    } catch (e: any) {
      toast({ title: "Could not cancel order", description: e?.message, variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  const downloadInvoice = async () => {
    if (!order || !token) return;
    setDownloading(true);
    try {
      const res = await apiFetch(`/api/v1/shop/orders/${order.id}/invoice.pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${order.invoiceNo}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Could not download invoice", description: e?.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const shareInvoice = async (channel: "whatsapp" | "email") => {
    if (!order || !token) return;
    setSharing(true);
    try {
      const res = await apiFetch(`/api/v1/shop/orders/${order.id}/share-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ channel }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message || `HTTP ${res.status}`);
      toast({ title: `Invoice sent via ${channel === "whatsapp" ? "WhatsApp" : "email"}` });
    } catch (e: any) {
      toast({ title: "Could not share invoice", description: e?.message, variant: "destructive" });
    } finally {
      setSharing(false);
    }
  };

  return (
    <AccountShell>
      <Link href="/account/orders" className="text-sm text-primary font-semibold inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to orders
      </Link>
      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : !order ? (
        <p className="text-gray-500">Order not found.</p>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
            <div>
              <h1 className="text-2xl font-extrabold">Order #{order.invoiceNo}</h1>
              <p className="text-sm text-gray-500">Placed on {new Date(order.createdAt).toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="capitalize text-sm">
                {(order.logisticsDetails?.status ?? order.status)?.toString().replace(/_/g, " ")}
              </Badge>
              <Button size="sm" variant="outline" onClick={downloadInvoice} disabled={downloading} data-testid="invoice-download">
                <Download className="h-4 w-4 mr-1" /> {downloading ? "Preparing…" : "Invoice PDF"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => shareInvoice("whatsapp")} disabled={sharing} data-testid="invoice-share-wa">
                <Share2 className="h-4 w-4 mr-1" /> WhatsApp
              </Button>
              {(() => {
                const stage = (order.logisticsDetails?.status ?? "").toString();
                const canCancel = order.status !== "cancelled" && (stage === "pending_confirmation" || stage === "confirmed");
                if (!canCancel) return null;
                return (
                  <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="destructive" data-testid="btn-cancel-order">
                        <XCircle className="h-4 w-4 mr-1" /> Cancel order
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Cancel this order?</DialogTitle>
                        <DialogDescription>
                          Once you cancel, we'll restore the items to stock and process any applicable refund within 5-7 business days.
                        </DialogDescription>
                      </DialogHeader>
                      <div>
                        <Label>Reason for cancelling</Label>
                        <Textarea
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Changed my mind, ordered wrong items, etc."
                          data-testid="cancel-reason"
                        />
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelling}>
                          Keep order
                        </Button>
                        <Button variant="destructive" onClick={cancelOrder} disabled={cancelling} data-testid="cancel-submit">
                          {cancelling ? "Cancelling…" : "Yes, cancel order"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                );
              })()}
            </div>
          </div>

          <div className="mb-4">
            <StatusTimeline status={order.logisticsDetails?.status ?? order.status ?? ""} />
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-100 mb-4">
            <h2 className="font-bold mb-3">Items</h2>
            <div className="space-y-2">
              {(order.items ?? []).map((it: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-semibold">{it.productName}</p>
                    <p className="text-xs text-gray-500">{it.variantSize} × {it.qty}</p>
                  </div>
                  <p className="font-bold">₹{Number(it.amount).toLocaleString("en-IN")}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>₹{Number(order.subtotal).toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between"><span>GST</span><span>₹{(Number(order.cgst) + Number(order.sgst) + Number(order.igst ?? 0)).toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between font-extrabold text-lg pt-2 border-t"><span>Total</span><span>₹{Number(order.total).toLocaleString("en-IN")}</span></div>
            </div>
            {order.logisticsDetails?.paymentMode && (
              <p className="text-xs text-gray-500 mt-3">Payment mode: <span className="font-semibold uppercase">{order.logisticsDetails.paymentMode}</span></p>
            )}
          </div>

          {(() => {
            const ld = order.logisticsDetails ?? {};
            const ship: Addr | null = ld.shippingAddress ?? ld.address ?? null;
            const bill: Addr | null = ld.billingAddress ?? null;
            const sameAsShipping = ld.sameAsShipping ?? (!bill || JSON.stringify(bill) === JSON.stringify(ship));
            if (!ship && !bill) return null;
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {ship && <AddressBlock title="Shipping to" icon={<MapPin className="h-4 w-4" />} addr={ship} />}
                {bill && !sameAsShipping ? (
                  <AddressBlock title="Billing to" icon={<Receipt className="h-4 w-4" />} addr={bill} />
                ) : ship ? (
                  <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 flex items-center justify-center text-sm text-gray-500">
                    Billing address same as shipping
                  </div>
                ) : null}
              </div>
            );
          })()}

          {order.logisticsDetails?.notes && (
            <div className="bg-white rounded-2xl p-5 border border-gray-100 mb-4">
              <p className="font-bold text-sm mb-1">Order notes</p>
              <p className="text-sm text-gray-700">{order.logisticsDetails.notes}</p>
            </div>
          )}

          {(() => {
            const ld = order.logisticsDetails ?? {};
            const courier = ld.courier;
            if (courier?.name) {
              return (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 text-sm text-blue-900 mb-4">
                  <div className="flex items-start gap-2">
                    <Truck className="h-5 w-5 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold">Shipped via {courier.name}</p>
                      {courier.trackingNumber && (
                        <p className="font-mono text-xs mt-1">Tracking #: {courier.trackingNumber}</p>
                      )}
                      {courier.expectedDeliveryAt && (
                        <p className="text-xs mt-1">Expected by {new Date(courier.expectedDeliveryAt).toLocaleDateString("en-IN")}</p>
                      )}
                      {courier.trackingUrl && (
                        <a
                          href={courier.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 mt-2 font-semibold text-blue-700 hover:underline"
                          data-testid="link-tracking"
                        >
                          Track shipment <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            }
            if (order.status === "cancelled") {
              return (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-sm text-red-900">
                  <p className="font-bold">Order cancelled</p>
                  {ld.cancelReason && <p className="mt-1">Reason: {ld.cancelReason}</p>}
                  {ld.cancelledAt && <p className="text-xs mt-1">on {new Date(ld.cancelledAt).toLocaleString("en-IN")}</p>}
                </div>
              );
            }
            return (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 text-sm text-amber-900">
                <div className="flex items-start gap-2">
                  <Truck className="h-5 w-5 mt-0.5" />
                  <div>
                    <p className="font-bold">What happens next?</p>
                    <p>Our team will call you within 24 hours to confirm and arrange dispatch via licensed cracker logistics. You'll receive SMS / WhatsApp updates with tracking.</p>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </AccountShell>
  );
}
