import { useGetPurchaseOrder, useReceivePurchaseOrder, useGetCompanySettings } from "@workspace/api-client-react";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, PackageCheck, Truck, Calendar, IndianRupee, User, FileText, Loader2, Download, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generatePurchaseOrderPdf, savePdf, type CompanyInfo } from "@workspace/pdf";
import { resolveCompanyInfo } from "@/lib/company-info";

export default function PurchaseOrderDetail() {
  const [, params] = useRoute("/purchase-orders/:id");
  const { toast } = useToast();
  
  const { data: po, isLoading, refetch } = useGetPurchaseOrder(params?.id as string);
  const { data: companyData } = useGetCompanySettings();
  const company: CompanyInfo = resolveCompanyInfo(companyData);
  const receiveMutation = useReceivePurchaseOrder();

  const handleDownloadPdf = () => {
    if (!po) return;
    const doc = generatePurchaseOrderPdf(po, company);
    savePdf(doc, `purchase-order-${po.poNumber || po.id?.slice(0, 8)}`);
    toast({ title: "PDF downloaded" });
  };

  const handlePrint = () => window.print();

  const handleReceive = async () => {
    if (!po) return;
    try {
      await receiveMutation.mutateAsync({ 
        id: params?.id as string,
        data: {
          items: (po.items ?? []).map((it) => ({
            productId: it.productId,
            variantId: it.variantId,
            receivedQty: it.orderedQty,
          })),
        }
      });
      toast({ title: "Success", description: "Purchase order marked as received and stock updated" });
      refetch();
    } catch (error) {
      toast({ title: "Error", description: "Failed to receive purchase order", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/4" />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!po) return <div>Purchase order not found.</div>;

  return (
    <div className="space-y-6 print-area">
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-bold">{company.name}</h1>
        {company.address && <p className="text-sm">{company.address}</p>}
        {company.gstin && <p className="text-sm">GSTIN: {company.gstin}</p>}
        {(company.phone || company.email) && (
          <p className="text-sm">{[company.phone, company.email].filter(Boolean).join(" | ")}</p>
        )}
        <hr className="my-3" />
        <h2 className="text-xl font-bold">PURCHASE ORDER</h2>
        <p className="text-sm">
          # {po.poNumber || po.id?.slice(0, 8)} &nbsp;|&nbsp; Date: {po.createdAt ? new Date(po.createdAt).toLocaleDateString("en-IN") : "—"}
        </p>
      </div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/purchase-orders">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">PO #{po.poNumber || po.id?.slice(0,8)}</h2>
            <div className="flex gap-2 mt-1">
              <Badge variant={po.status === 'received' ? 'default' : 'secondary'}>{po.status}</Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint} data-testid="po-print">
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
          <Button variant="outline" onClick={handleDownloadPdf} data-testid="po-download-pdf">
            <Download className="mr-2 h-4 w-4" /> Download PDF
          </Button>
          {po.status === 'sent' && (
            <Button onClick={handleReceive} disabled={receiveMutation.isPending}>
              {receiveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-2 h-4 w-4" />}
              Mark as Received
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Supplier</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{po.supplierName}</div>
            <p className="text-xs text-muted-foreground">ID: {po.supplierId}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expected Date</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">
              {po.expectedDate ? new Date(po.expectedDate).toLocaleDateString('en-IN') : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">Ordered: {po.createdAt ? new Date(po.createdAt).toLocaleDateString('en-IN') : ''}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{Number(po.totalAmount ?? 0).toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>PO Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Variant</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.items?.map((item, i: number) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{item.productName}</TableCell>
                  <TableCell>{item.variantId}</TableCell>
                  <TableCell className="text-right">{item.orderedQty}</TableCell>
                  <TableCell className="text-right">₹{Number(item.unitPrice ?? 0).toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-right font-medium">₹{(Number(item.orderedQty ?? 0) * Number(item.unitPrice ?? 0)).toLocaleString('en-IN')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {po.notes && (
            <div className="mt-6 p-4 bg-muted rounded-md border">
              <div className="text-sm font-semibold mb-1 flex items-center gap-2">
                <FileText className="h-4 w-4" /> Notes
              </div>
              <p className="text-sm text-muted-foreground">{po.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="hidden print:grid grid-cols-2 gap-12 mt-16 text-sm">
        <div>
          <div className="border-t pt-2">Prepared By</div>
        </div>
        <div>
          <div className="border-t pt-2">Authorized Signatory — {company.name}</div>
        </div>
      </div>
    </div>
  );
}
