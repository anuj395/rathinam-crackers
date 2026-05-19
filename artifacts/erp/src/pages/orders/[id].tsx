import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "../../lib/api";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowLeft, Truck, XCircle, CheckCircle2, Package, MapPin, Phone, Receipt } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const STAGES = [
  { key: "pending_confirmation", label: "Order placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "packed", label: "Packed" },
  { key: "dispatched", label: "Dispatched" },
  { key: "delivered", label: "Delivered" },
];

function stageIdx(s: string): number {
  const i = STAGES.findIndex((x) => x.key === s);
  return i < 0 ? 0 : i;
}

export default function OnlineOrderDetail() {
  const [, params] = useRoute("/orders/:id");
  const id = params?.id ?? "";
  const { token } = useAuth();
  const { toast } = useToast();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Dispatch modal state
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [courierName, setCourierName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [expectedDeliveryAt, setExpectedDeliveryAt] = useState("");

  // Cancel modal state
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/v1/invoices/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setOrder(json?.data ?? json);
    } catch (e: any) {
      toast({ title: "Failed to load order", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (token && id) load(); /* eslint-disable-next-line */ }, [id, token]);

  async function transition(to: string) {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/admin/orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: to }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message || `HTTP ${res.status}`);
      toast({ title: `Marked as ${to.replace(/_/g, " ")}` });
      await load();
    } catch (e: any) {
      toast({ title: "Could not update status", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function dispatchOrder() {
    if (!courierName.trim()) {
      toast({ title: "Courier name required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/admin/orders/${id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          courierName: courierName.trim(),
          trackingNumber: trackingNumber.trim(),
          trackingUrl: trackingUrl.trim(),
          expectedDeliveryAt: expectedDeliveryAt || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message || `HTTP ${res.status}`);
      toast({ title: "Order dispatched", description: "Customer notified by SMS / WhatsApp." });
      setDispatchOpen(false);
      setCourierName(""); setTrackingNumber(""); setTrackingUrl(""); setExpectedDeliveryAt("");
      await load();
    } catch (e: any) {
      toast({ title: "Dispatch failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder() {
    if (!cancelReason.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/admin/orders/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message || `HTTP ${res.status}`);
      toast({ title: "Order cancelled", description: "Stock restored. Customer notified." });
      setCancelOpen(false);
      setCancelReason("");
      await load();
    } catch (e: any) {
      toast({ title: "Cancel failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (!order) return <div>Order not found.</div>;

  const ld: any = order.logisticsDetails ?? {};
  const stage: string = ld.status ?? "pending_confirmation";
  const isCancelled = order.status === "cancelled";
  const idx = stageIdx(stage);
  const ship = ld.shippingAddress ?? ld.address;
  const bill = ld.billingAddress;
  const courier = ld.courier;
  const history: Array<{ status: string; at: string; reason?: string; actor?: string }> =
    Array.isArray(ld.statusHistory) ? ld.statusHistory : [];

  return (
    <div className="space-y-6">
      <Link href="/orders" className="text-sm text-primary inline-flex items-center gap-1">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to online orders
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Order #{order.invoiceNo}</h2>
          <p className="text-sm text-muted-foreground">
            Placed {new Date(order.createdAt).toLocaleString("en-IN")} · {order.customerName ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isCancelled ? (
            <Badge variant="destructive">Cancelled</Badge>
          ) : (
            <Badge className="capitalize">{stage.replace(/_/g, " ")}</Badge>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href={`/invoices/${order.id}`}>
              <Receipt className="h-4 w-4 mr-1" /> Invoice view
            </Link>
          </Button>
        </div>
      </div>

      {/* Stepper */}
      {!isCancelled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lifecycle</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              {STAGES.map((s, i) => {
                const done = i <= idx;
                return (
                  <div key={s.key} className="flex-1 flex flex-col items-center relative">
                    {i > 0 && (
                      <div className={`absolute top-3 right-1/2 w-full h-0.5 ${i <= idx ? "bg-primary" : "bg-muted"}`} />
                    )}
                    <div className={`relative z-10 h-7 w-7 rounded-full flex items-center justify-center border-2 ${
                      done ? "bg-primary border-primary text-primary-foreground" : "bg-background border-muted text-muted-foreground"
                    }`}>
                      {done ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-xs">{i + 1}</span>}
                    </div>
                    <p className={`text-xs mt-2 text-center ${done ? "font-semibold" : "text-muted-foreground"}`}>{s.label}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action bar */}
      {!isCancelled && stage !== "delivered" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {stage === "pending_confirmation" && (
              <Button onClick={() => transition("confirmed")} disabled={busy} data-testid="btn-confirm">
                <CheckCircle2 className="h-4 w-4 mr-1" /> Confirm order
              </Button>
            )}
            {stage === "confirmed" && (
              <Button onClick={() => transition("packed")} disabled={busy} data-testid="btn-pack">
                <Package className="h-4 w-4 mr-1" /> Mark packed
              </Button>
            )}
            {stage === "packed" && (
              <Dialog open={dispatchOpen} onOpenChange={setDispatchOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="btn-dispatch"><Truck className="h-4 w-4 mr-1" /> Dispatch</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Dispatch order</DialogTitle>
                    <DialogDescription>Record courier details. Customer will be notified.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Courier name *</Label>
                      <Input value={courierName} onChange={(e) => setCourierName(e.target.value)} placeholder="DTDC, Professional Couriers, etc." data-testid="dispatch-courier" />
                    </div>
                    <div>
                      <Label>Tracking number</Label>
                      <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} data-testid="dispatch-tracking" />
                    </div>
                    <div>
                      <Label>Tracking URL</Label>
                      <Input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://..." data-testid="dispatch-url" />
                    </div>
                    <div>
                      <Label>Expected delivery</Label>
                      <Input type="date" value={expectedDeliveryAt} onChange={(e) => setExpectedDeliveryAt(e.target.value)} data-testid="dispatch-eta" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDispatchOpen(false)} disabled={busy}>Cancel</Button>
                    <Button onClick={dispatchOrder} disabled={busy} data-testid="dispatch-submit">
                      {busy ? "Dispatching…" : "Dispatch & notify"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            {stage === "dispatched" && (
              <Button onClick={() => transition("delivered")} disabled={busy} data-testid="btn-delivered">
                <CheckCircle2 className="h-4 w-4 mr-1" /> Mark delivered
              </Button>
            )}

            <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" data-testid="btn-cancel"><XCircle className="h-4 w-4 mr-1" /> Cancel order</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cancel order</DialogTitle>
                  <DialogDescription>
                    Stock will be restored automatically. Customer will be notified by SMS / WhatsApp.
                  </DialogDescription>
                </DialogHeader>
                <div>
                  <Label>Reason *</Label>
                  <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Out of stock, customer request, payment failed, etc." data-testid="cancel-reason" />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={busy}>Back</Button>
                  <Button variant="destructive" onClick={cancelOrder} disabled={busy} data-testid="cancel-submit">
                    {busy ? "Cancelling…" : "Cancel order"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}

      {/* Cancel info */}
      {isCancelled && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-6">
            <p className="font-semibold text-destructive">Cancelled</p>
            <p className="text-sm mt-1">Reason: {ld.cancelReason ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {ld.cancelledAt ? new Date(ld.cancelledAt).toLocaleString("en-IN") : ""} · by {ld.cancelledBy ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-2">Stock has been restored to inventory.</p>
          </CardContent>
        </Card>
      )}

      {/* Courier */}
      {courier?.name && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" /> Courier</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <p><span className="text-muted-foreground">Carrier:</span> <span className="font-semibold">{courier.name}</span></p>
            {courier.trackingNumber && <p><span className="text-muted-foreground">Tracking #:</span> <span className="font-mono">{courier.trackingNumber}</span></p>}
            {courier.trackingUrl && <p><a href={courier.trackingUrl} target="_blank" rel="noreferrer" className="text-primary underline">Open tracking page</a></p>}
            {courier.dispatchedAt && <p className="text-xs text-muted-foreground">Dispatched {new Date(courier.dispatchedAt).toLocaleString("en-IN")}</p>}
            {courier.expectedDeliveryAt && <p className="text-xs text-muted-foreground">Expected by {new Date(courier.expectedDeliveryAt).toLocaleDateString("en-IN")}</p>}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ship && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" /> Shipping</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <p className="font-semibold">{ship.name} · <Phone className="inline h-3 w-3" /> {ship.phone}</p>
              <p>{ship.line1}{ship.line2 ? `, ${ship.line2}` : ""}</p>
              <p>{[ship.city, ship.state].filter(Boolean).join(", ")}{ship.pincode ? ` - ${ship.pincode}` : ""}</p>
              {ship.landmark && <p className="text-xs text-muted-foreground">Landmark: {ship.landmark}</p>}
            </CardContent>
          </Card>
        )}
        {bill && bill !== ship && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4" /> Billing</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <p className="font-semibold">{bill.name}</p>
              <p>{bill.line1}{bill.line2 ? `, ${bill.line2}` : ""}</p>
              <p>{[bill.city, bill.state].filter(Boolean).join(", ")}{bill.pincode ? ` - ${bill.pincode}` : ""}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Items */}
      <Card>
        <CardHeader><CardTitle className="text-base">Items</CardTitle></CardHeader>
        <CardContent>
          <div className="divide-y">
            {(order.items ?? []).map((it: any, i: number) => (
              <div key={i} className="py-2 flex justify-between text-sm">
                <div>
                  <p className="font-semibold">{it.productName}</p>
                  <p className="text-xs text-muted-foreground">{it.variantSize} × {it.qty}</p>
                </div>
                <p className="font-bold">₹{Number(it.amount).toLocaleString("en-IN")}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t flex justify-between font-extrabold">
            <span>Total</span>
            <span>₹{Number(order.total ?? 0).toLocaleString("en-IN")}</span>
          </div>
          {ld.paymentMode && (
            <p className="text-xs text-muted-foreground mt-2">Payment mode: <span className="uppercase font-semibold">{ld.paymentMode}</span></p>
          )}
        </CardContent>
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Status history</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm">
              {history.map((h, i) => (
                <li key={i} className="flex justify-between border-b last:border-0 pb-1">
                  <span className="capitalize">{h.status.replace(/_/g, " ")}{h.reason ? ` — ${h.reason}` : ""}</span>
                  <span className="text-xs text-muted-foreground">{new Date(h.at).toLocaleString("en-IN")}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
