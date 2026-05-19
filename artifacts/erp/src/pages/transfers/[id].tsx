import { useRoute, Link } from "wouter";
import { useMemo } from "react";
import {
  useGetTransfer,
  useDispatchTransfer,
  useReceiveTransfer,
  useGetCompanySettings,
  useListProducts,
  type Transfer,
  type TransferItem,
  type ReceiveTransferBody,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, ArrowRightLeft, Send, PackageCheck, Truck, MapPin, FileText, Download, Printer,
  FileEdit, ClipboardCheck, CircleDot, Circle, Package,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateTransferPdf, savePdf, type CompanyInfo } from "@workspace/pdf";
import { resolveCompanyInfo } from "@/lib/company-info";
import { formatVariantLabel } from "@/lib/variant-label";

export default function TransferDetail() {
  const [, params] = useRoute("/transfers/:id");
  const id = params?.id ?? "";
  const { toast } = useToast();

  const { data, isLoading, refetch } = useGetTransfer(id, {
    query: { enabled: !!id, queryKey: ["transfer", id] },
  });
  const { data: companyData } = useGetCompanySettings();
  const { data: productsData } = useListProducts({ limit: 1000 });
  const dispatchM = useDispatchTransfer();
  const receiveM = useReceiveTransfer();

  const t: Transfer | undefined = data?.data;
  const items: TransferItem[] = t?.items ?? [];
  const company: CompanyInfo = resolveCompanyInfo(companyData);

  // Build a productId -> product map so we can enrich each line item with
  // human-readable variant label, HSN, and a value estimate. The transfer
  // payload only persists {productId, variantId, qty}, so without this lookup
  // the variant column would render a raw UUID.
  const productMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of productsData?.data ?? []) m.set(p.id ?? "", p);
    return m;
  }, [productsData]);

  const enriched = useMemo(() => {
    return items.map((i) => {
      const p = productMap.get(i.productId ?? "");
      const variants: any[] = p?.variants ?? [];
      const v = variants.find((x) => x?.variantId === i.variantId);
      const variantLabel = v ? formatVariantLabel(v, variants) : (i.variantId ?? "");
      const purchase = Number(v?.prices?.purchase ?? 0);
      const value = purchase * Number(i.qty ?? 0);
      return {
        ...i,
        resolvedProductName: i.productName || p?.name || i.productId || "—",
        variantLabel,
        hsn: p?.hsnCode ?? "",
        unitValue: purchase,
        lineValue: value,
      };
    });
  }, [items, productMap]);

  const totalQty = enriched.reduce((s, i) => s + Number(i.qty ?? 0), 0);
  const totalReceived = enriched.reduce((s, i) => s + Number(i.receivedQty ?? 0), 0);
  const totalValue = enriched.reduce((s, i) => s + i.lineValue, 0);

  const statusBadge = (status: string | undefined) => {
    const label = (status ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    switch (status) {
      case "draft": return <Badge variant="outline">{label}</Badge>;
      case "pending_approval": return <Badge variant="secondary">{label}</Badge>;
      case "in_transit": return <Badge variant="default" className="bg-blue-500">{label}</Badge>;
      case "received": return <Badge variant="default" className="bg-green-500">{label}</Badge>;
      case "cancelled": return <Badge variant="destructive">{label}</Badge>;
      default: return <Badge variant="outline">{label || status}</Badge>;
    }
  };

  const handleDownloadPdf = () => {
    if (!t) return;
    const doc = generateTransferPdf(t, company);
    savePdf(doc, `transfer-${t.transferNo || t.id?.slice(0, 8) || "note"}`);
    toast({ title: "PDF downloaded" });
  };

  const handlePrint = () => window.print();

  const handleDispatch = async () => {
    try {
      await dispatchM.mutateAsync({ id, data: {} });
      toast({ title: "Transfer dispatched" });
      refetch();
    } catch {
      toast({ title: "Dispatch failed", variant: "destructive" });
    }
  };

  const handleReceive = async () => {
    try {
      const body: ReceiveTransferBody = {
        items: items.map((i) => ({
          productId: i.productId ?? "",
          variantId: i.variantId ?? "",
          receivedQty: i.qty ?? 0,
        })),
      };
      await receiveM.mutateAsync({ id, data: body });
      toast({ title: "Transfer received" });
      refetch();
    } catch {
      toast({ title: "Receive failed", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!t) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/transfers"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Transfers</Link>
        </Button>
        <Card><CardContent className="py-12 text-center text-muted-foreground">Transfer not found.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 print-area">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/transfers"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ArrowRightLeft className="h-6 w-6 text-primary" />
              Transfer {t.transferNo ?? t.id?.slice(0, 8)}
            </h2>
            <p className="text-sm text-muted-foreground">
              Created {t.createdAt ? new Date(t.createdAt).toLocaleString("en-IN") : "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {statusBadge(t.status)}
          <Button variant="outline" onClick={handlePrint} data-testid="transfer-print">
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
          <Button variant="outline" onClick={handleDownloadPdf} data-testid="transfer-download-pdf">
            <Download className="mr-2 h-4 w-4" /> Download PDF
          </Button>
          {(t.status === "draft" || t.status === "pending_approval") && (
            <Button onClick={handleDispatch} disabled={dispatchM.isPending} data-testid="dispatch-btn">
              <Send className="mr-2 h-4 w-4" /> Dispatch
            </Button>
          )}
          {t.status === "in_transit" && (
            <Button onClick={handleReceive} disabled={receiveM.isPending} data-testid="receive-btn">
              <PackageCheck className="mr-2 h-4 w-4" /> Mark Received
            </Button>
          )}
        </div>
      </div>

      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-bold">{company.name}</h1>
        {company.address && <p className="text-sm">{company.address}</p>}
        {company.gstin && <p className="text-sm">GSTIN: {company.gstin}</p>}
        {(company.phone || company.email) && (
          <p className="text-sm">{[company.phone, company.email].filter(Boolean).join(" | ")}</p>
        )}
        <hr className="my-3" />
        <h2 className="text-xl font-bold">STOCK TRANSFER NOTE</h2>
        <p className="text-sm">
          # {t.transferNo ?? t.id?.slice(0, 8)} &nbsp;|&nbsp; Date: {t.createdAt ? new Date(t.createdAt).toLocaleDateString("en-IN") : "—"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" /> From
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold">{t.fromLocationName ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{t.fromLocationId}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" /> To
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold">{t.toLocationName ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{t.toLocationId}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" /> Movement
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>Vehicle: <span className="font-medium">{t.vehicleNo ?? "—"}</span></p>
            <p>Dispatched: <span className="font-medium">{t.dispatchedAt ? new Date(t.dispatchedAt).toLocaleString("en-IN") : "—"}</span></p>
            <p>Received: <span className="font-medium">{t.receivedAt ? new Date(t.receivedAt).toLocaleString("en-IN") : "—"}</span></p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="transfer-status-timeline">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CircleDot className="h-4 w-4 text-primary" /> Status Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const isCancelled = t.status === "cancelled";
            const steps = [
              {
                key: "draft",
                label: "Draft Created",
                icon: FileEdit,
                at: t.createdAt,
                done: true,
              },
              {
                key: "in_transit",
                label: "Dispatched",
                icon: Send,
                at: t.dispatchedAt,
                done: !!t.dispatchedAt || t.status === "in_transit" || t.status === "received",
                meta: t.vehicleNo ? `Vehicle ${t.vehicleNo}` : undefined,
              },
              {
                key: "received",
                label: "Received at destination",
                icon: PackageCheck,
                at: t.receivedAt,
                done: !!t.receivedAt || t.status === "received",
              },
            ];
            return (
              <ol className="relative border-l-2 border-muted ml-3 space-y-6 py-2">
                {steps.map((s) => {
                  const Icon = s.icon;
                  const reached = s.done && !isCancelled;
                  return (
                    <li key={s.key} className="ml-6">
                      <span
                        className={`absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                          reached
                            ? "bg-primary border-primary text-primary-foreground"
                            : "bg-background border-muted-foreground/40 text-muted-foreground"
                        }`}
                      >
                        {reached ? <Icon className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                      </span>
                      <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
                        <p className={`font-medium ${reached ? "" : "text-muted-foreground"}`}>{s.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.at ? new Date(s.at).toLocaleString("en-IN") : reached ? "—" : "Pending"}
                        </p>
                      </div>
                      {s.meta && reached && (
                        <p className="text-xs text-muted-foreground mt-0.5">{s.meta}</p>
                      )}
                    </li>
                  );
                })}
                {isCancelled && (
                  <li className="ml-6">
                    <span className="absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full border-2 bg-destructive border-destructive text-destructive-foreground">
                      <ClipboardCheck className="h-3 w-3" />
                    </span>
                    <p className="font-medium text-destructive">Cancelled</p>
                  </li>
                )}
              </ol>
            );
          })()}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4 print:hidden">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-3.5 w-3.5" /> Line Items
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{enriched.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Total Qty Sent</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{totalQty.toLocaleString("en-IN")}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Total Qty Received</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalReceived.toLocaleString("en-IN")}</p>
            {totalQty > 0 && totalReceived !== totalQty && t.status === "received" && (
              <p className="text-xs text-amber-600 mt-1">
                Variance: {(totalReceived - totalQty).toLocaleString("en-IN")}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Stock Value (at cost)</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              ₹{totalValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line Items ({enriched.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Variant</TableHead>
                <TableHead>HSN</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead className="text-right">Qty Sent</TableHead>
                <TableHead className="text-right">Qty Received</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Line Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enriched.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No items on this transfer.
                  </TableCell>
                </TableRow>
              ) : enriched.map((i, idx) => {
                const variance = Number(i.receivedQty ?? 0) - Number(i.qty ?? 0);
                const showVariance = t.status === "received" && variance !== 0;
                return (
                  <TableRow key={`${i.productId}-${i.variantId}-${idx}`}>
                    <TableCell className="font-medium">{i.resolvedProductName}</TableCell>
                    <TableCell>{i.variantLabel}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{i.hsn || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{i.batchNo ?? "—"}</TableCell>
                    <TableCell className="text-right font-bold">{Number(i.qty ?? 0).toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right">
                      {Number(i.receivedQty ?? 0).toLocaleString("en-IN")}
                      {showVariance && (
                        <span className={`ml-2 text-xs ${variance < 0 ? "text-destructive" : "text-amber-600"}`}>
                          ({variance > 0 ? "+" : ""}{variance})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {i.unitValue > 0 ? `₹${i.unitValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {i.lineValue > 0 ? `₹${i.lineValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            {enriched.length > 0 && (
              <tfoot>
                <TableRow className="border-t-2 font-bold">
                  <TableCell colSpan={4} className="text-right">Totals</TableCell>
                  <TableCell className="text-right">{totalQty.toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right">{totalReceived.toLocaleString("en-IN")}</TableCell>
                  <TableCell />
                  <TableCell className="text-right">
                    ₹{totalValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              </tfoot>
            )}
          </Table>
        </CardContent>
      </Card>

      {t.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{t.notes}</p>
          </CardContent>
        </Card>
      )}

      <div className="hidden print:grid grid-cols-2 gap-12 mt-16 text-sm">
        <div>
          <div className="border-t pt-2">Sender Signature</div>
        </div>
        <div>
          <div className="border-t pt-2">Receiver Signature</div>
        </div>
      </div>
    </div>
  );
}
