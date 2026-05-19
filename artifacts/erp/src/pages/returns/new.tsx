import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useListInvoices, useGetInvoice, useCreateReturn } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, RotateCcw } from "lucide-react";

export default function NewReturn() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [invoiceId, setInvoiceId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [refundMode, setRefundMode] = useState<"CREDIT_NOTE" | "CASH" | "NONE">("CREDIT_NOTE");
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");

  const { data: invList } = useListInvoices({ invoiceNo: search || undefined, limit: 20 });
  const invoices = (invList?.data as any[]) ?? [];
  const { data: invDetail } = useGetInvoice(invoiceId, {
    query: { enabled: !!invoiceId } as any,
  });
  const invoice = (invDetail as any)?.data ?? (invDetail as any);

  const items = useMemo(() => (invoice?.items as any[]) ?? [], [invoice]);

  const creditPreview = useMemo(() => {
    return items.reduce((sum, it: any) => {
      const q = Number(qtys[`${it.productId}|${it.variantId}`] ?? 0);
      return sum + q * Number(it.unitPrice ?? 0);
    }, 0);
  }, [items, qtys]);

  const create = useCreateReturn({
    mutation: {
      onSuccess: (resp: any) => {
        toast({
          title: "Return processed",
          description: `Credit note ${resp?.data?.creditNoteNo ?? ""} for Rs. ${Number(resp?.data?.creditAmount ?? 0).toLocaleString("en-IN")}`,
        });
        navigate("/returns");
      },
      onError: (e: any) => {
        toast({ title: "Failed to create return", description: e?.message ?? "Error", variant: "destructive" });
      },
    },
  });

  const handleSubmit = () => {
    if (!invoiceId) { toast({ title: "Pick an invoice first", variant: "destructive" }); return; }
    if (!reason.trim()) { toast({ title: "Reason is required", variant: "destructive" }); return; }
    const lineItems = items
      .map((it: any) => {
        const q = Number(qtys[`${it.productId}|${it.variantId}`] ?? 0);
        return q > 0
          ? {
              productId: it.productId,
              variantId: it.variantId,
              productName: it.productName,
              variantLabel: it.variantLabel,
              qty: q,
              unitPrice: Number(it.unitPrice ?? 0),
            }
          : null;
      })
      .filter(Boolean) as any[];
    if (lineItems.length === 0) {
      toast({ title: "Enter at least one return quantity", variant: "destructive" });
      return;
    }
    create.mutate({
      data: {
        type: "customer",
        referenceId: invoiceId,
        items: lineItems,
        reason,
        refundMode,
        notes: notes || undefined,
      },
    } as any);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/returns")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <RotateCcw className="h-7 w-7" /> New Return
        </h2>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Select original invoice</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Search by invoice no or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="invoice-search"
          />
          <div className="max-h-60 overflow-y-auto border rounded">
            {invoices.length === 0 && <div className="p-3 text-sm text-muted-foreground">No invoices found.</div>}
            {invoices.map((inv: any) => (
              <button
                key={inv.id}
                onClick={() => { setInvoiceId(inv.id); setQtys({}); }}
                className={`w-full text-left p-3 text-sm border-b hover:bg-muted/40 ${inv.id === invoiceId ? "bg-primary/10" : ""}`}
                data-testid={`pick-inv-${inv.id}`}
              >
                <div className="flex justify-between">
                  <span className="font-mono text-xs">{inv.invoiceNo}</span>
                  <span>Rs. {Number(inv.total ?? 0).toLocaleString("en-IN")}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {inv.customerName ?? "Walk-in"} · {new Date(inv.createdAt).toLocaleDateString("en-IN")}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {invoice && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              2. Items being returned · {invoice.invoiceNo}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase">
                <tr>
                  <th className="text-left p-2">Product</th>
                  <th className="text-right p-2">Sold Qty</th>
                  <th className="text-right p-2">Unit Price</th>
                  <th className="text-right p-2 w-32">Return Qty</th>
                  <th className="text-right p-2">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it: any) => {
                  const key = `${it.productId}|${it.variantId}`;
                  const q = Number(qtys[key] ?? 0);
                  return (
                    <tr key={key} className="border-t">
                      <td className="p-2">{it.productName} {it.variantLabel ? `· ${it.variantLabel}` : ""}</td>
                      <td className="p-2 text-right">{it.qty}</td>
                      <td className="p-2 text-right">Rs. {Number(it.unitPrice ?? 0).toLocaleString("en-IN")}</td>
                      <td className="p-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          max={it.qty}
                          value={q || ""}
                          onChange={(e) => setQtys({ ...qtys, [key]: Math.max(0, Math.min(Number(it.qty), Number(e.target.value) || 0)) })}
                          className="h-8 w-24 ml-auto text-right"
                          data-testid={`qty-${key}`}
                        />
                      </td>
                      <td className="p-2 text-right">Rs. {(q * Number(it.unitPrice ?? 0)).toLocaleString("en-IN")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {invoiceId && (
        <Card>
          <CardHeader><CardTitle className="text-base">3. Refund details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-1">
                <Label>Refund mode</Label>
                <Select value={refundMode} onValueChange={(v: any) => setRefundMode(v)}>
                  <SelectTrigger data-testid="refund-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CREDIT_NOTE">Credit Note (reduce balance / wallet)</SelectItem>
                    <SelectItem value="CASH">Cash refund (paid from till)</SelectItem>
                    <SelectItem value="NONE">No refund (goodwill / replacement)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label>Total credit</Label>
                <div className="text-2xl font-bold">Rs. {creditPreview.toLocaleString("en-IN")}</div>
              </div>
            </div>
            <div className="grid gap-1">
              <Label>Reason *</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Damaged in transit, wrong variant shipped, customer changed mind…"
                data-testid="reason"
                rows={2}
              />
            </div>
            <div className="grid gap-1">
              <Label>Internal notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <Button onClick={handleSubmit} disabled={create.isPending} data-testid="submit-return">
              {create.isPending ? "Processing…" : "Process return & issue credit note"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
