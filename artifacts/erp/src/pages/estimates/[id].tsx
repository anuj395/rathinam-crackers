import { useGetEstimate, useConvertEstimateToInvoice } from "@workspace/api-client-react";
import { useRoute, Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ArrowRightLeft, Calendar, User, FileText, IndianRupee, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateEstimatePdf, savePdf } from "@workspace/pdf";

export default function EstimateDetail() {
  const [, params] = useRoute("/estimates/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: estimate, isLoading, refetch } = useGetEstimate(params?.id as string);
  const convertMutation = useConvertEstimateToInvoice();

  const handleDownloadPdf = () => {
    if (!estimate) return;
    const doc = generateEstimatePdf(estimate as any);
    savePdf(doc, `estimate-${estimate.estimateNo || estimate.id?.slice(0, 8)}`);
    toast({ title: "PDF downloaded" });
  };

  const handleConvert = async () => {
    try {
      await convertMutation.mutateAsync({ 
        id: params?.id as string,
        data: { paymentMode: "CASH" } 
      });
      toast({ title: "Success", description: "Estimate converted to invoice successfully" });
      refetch();
    } catch (error) {
      toast({ title: "Error", description: "Failed to convert estimate", variant: "destructive" });
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
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!estimate) return <div>Estimate not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/estimates">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Estimate #{estimate.estimateNo || estimate.id?.slice(0,8)}</h2>
            <div className="flex gap-2 mt-1">
              <Badge variant="outline">{estimate.status}</Badge>
              {estimate.type && <Badge variant="secondary">{estimate.type}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadPdf} data-testid="estimate-download-pdf">
            <Download className="mr-2 h-4 w-4" /> Download PDF
          </Button>
          {estimate.status !== 'converted' && (
            <Button onClick={handleConvert} disabled={convertMutation.isPending}>
              <ArrowRightLeft className="mr-2 h-4 w-4" /> Convert to Invoice
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customer</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{estimate.customerName}</div>
            <p className="text-xs text-muted-foreground">ID: {estimate.customerId}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Date & Validity</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{estimate.createdAt ? new Date(estimate.createdAt).toLocaleDateString('en-IN') : 'N/A'}</div>
            <p className="text-xs text-muted-foreground">Status: {estimate.status ?? 'draft'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">₹{estimate.total?.toLocaleString('en-IN')}</div>
            <p className="text-xs text-muted-foreground">Includes GST 18%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Variant</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {estimate.items?.map((item, i: number) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{item.productName}</TableCell>
                  <TableCell>{item.variantSize}</TableCell>
                  <TableCell className="text-right">{item.qty}</TableCell>
                  <TableCell className="text-right">₹{item.resolvedPrice?.toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-right font-medium">₹{item.amount?.toLocaleString('en-IN')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {estimate.notes && (
            <div className="mt-6 p-4 bg-muted rounded-md">
              <div className="text-sm font-medium mb-1">Notes:</div>
              <p className="text-sm text-muted-foreground">{estimate.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
