import { useState } from "react";
import { useGetGstReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download } from "lucide-react";
import { generateReportPdf, savePdf } from "@workspace/pdf";

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

type GstInvoiceRow = {
  invoiceNo?: string;
  customerName?: string;
  customerGstin?: string;
  subtotal?: number | string;
  cgst?: number | string;
  sgst?: number | string;
  igst?: number | string;
  total?: number | string;
  createdAt?: string;
};

export default function GstReport() {
  const [month, setMonth] = useState(() => (new Date().getMonth() + 1).toString());
  const [year, setYear] = useState(() => new Date().getFullYear().toString());

  const period = `${year}-${month.padStart(2, '0')}`;
  const { data, isLoading } = useGetGstReport({ month: parseInt(month), year: parseInt(year) });

  const report = data?.data as { b2b?: GstInvoiceRow[]; b2c?: GstInvoiceRow[]; summary?: { totalTax?: number; invoiceCount?: number } } | undefined;
  const b2b: GstInvoiceRow[] = report?.b2b ?? [];
  const b2c: GstInvoiceRow[] = report?.b2c ?? [];
  const allRows: GstInvoiceRow[] = [...b2b, ...b2c];

  const totalTax = num(report?.summary?.totalTax);
  const invoiceCount = num(report?.summary?.invoiceCount);
  const totalTaxable = allRows.reduce((s, r) => s + num(r.subtotal), 0);
  const totalCgst = allRows.reduce((s, r) => s + num(r.cgst), 0);
  const totalSgst = allRows.reduce((s, r) => s + num(r.sgst), 0);
  const totalIgst = allRows.reduce((s, r) => s + num(r.igst), 0);

  const handleExportPdf = () => {
    const doc = generateReportPdf({
      title: "GST Report",
      subtitle: `Filing period: ${period}`,
      period,
      summary: [
        { label: "Invoice Count", value: invoiceCount.toString() },
        { label: "Taxable Value", value: `Rs. ${totalTaxable.toLocaleString("en-IN")}` },
        { label: "CGST", value: `Rs. ${totalCgst.toLocaleString("en-IN")}` },
        { label: "SGST", value: `Rs. ${totalSgst.toLocaleString("en-IN")}` },
        { label: "IGST", value: `Rs. ${totalIgst.toLocaleString("en-IN")}` },
        { label: "Total GST", value: `Rs. ${totalTax.toLocaleString("en-IN")}` },
        { label: "B2B Count", value: b2b.length.toString() },
        { label: "B2C Count", value: b2c.length.toString() },
      ],
      columns: ["Invoice No", "Customer", "GSTIN", "Type", "Taxable (Rs.)", "CGST", "SGST", "IGST", "Total (Rs.)"],
      rows: allRows.map((r) => [
        r.invoiceNo ?? "-",
        r.customerName ?? "-",
        r.customerGstin ?? "-",
        r.customerGstin ? "B2B" : "B2C",
        num(r.subtotal),
        num(r.cgst),
        num(r.sgst),
        num(r.igst),
        num(r.total),
      ]),
      footerNote: `GST summary for ${period}`,
    });
    savePdf(doc, `gst-report-${period}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">GST Report</h2>
          <p className="text-muted-foreground">Tax filing and compliance overview.</p>
        </div>
        <div className="flex gap-4 items-center bg-card p-2 rounded-lg border">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => (
                <SelectItem key={i+1} value={(i+1).toString()}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-[100px] h-9">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {['2024', '2025', '2026'].map(y => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9" onClick={handleExportPdf} disabled={isLoading} data-testid="gst-export-pdf">
            <Download className="mr-2 h-4 w-4" /> Export PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{invoiceCount}</div>
            <p className="text-xs text-muted-foreground">{b2b.length} B2B / {b2c.length} B2C</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Taxable Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">₹{totalTaxable.toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground">CGST + SGST</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">₹{(totalCgst + totalSgst).toLocaleString('en-IN')}</div>
            <p className="text-xs text-muted-foreground">IGST ₹{totalIgst.toLocaleString('en-IN')}</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-primary">Total GST</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">₹{totalTax.toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoice-wise GST Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>GSTIN</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">CGST</TableHead>
                  <TableHead className="text-right">SGST</TableHead>
                  <TableHead className="text-right">IGST</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                  ))
                ) : allRows.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No invoices for selected period.</TableCell></TableRow>
                ) : (
                  allRows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono">{r.invoiceNo ?? "-"}</TableCell>
                      <TableCell>{r.customerName ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.customerGstin ?? "-"}</TableCell>
                      <TableCell>{r.customerGstin ? "B2B" : "B2C"}</TableCell>
                      <TableCell className="text-right">₹{num(r.subtotal).toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right">₹{num(r.cgst).toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right">₹{num(r.sgst).toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right">₹{num(r.igst).toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right font-medium">₹{num(r.total).toLocaleString('en-IN')}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
