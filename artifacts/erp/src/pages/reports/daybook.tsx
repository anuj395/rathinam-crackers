import { useState } from "react";
import { useGetDaybookReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Download, IndianRupee, Receipt } from "lucide-react";
import { generateReportPdf, savePdf } from "@workspace/pdf";

export default function DaybookReport() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const { data, isLoading } = useGetDaybookReport({ date });
  const report = data?.data as any;
  const cashIn = Number(report?.cashIn ?? 0);
  const upiIn = Number(report?.upiIn ?? 0);
  const totalSales = Number(report?.totalSales ?? 0);
  const entries = (report?.entries as any[]) ?? [];

  const handleExport = () => {
    const doc = generateReportPdf({
      title: "Day Book",
      subtitle: date,
      period: date,
      summary: [
        { label: "Total Sales", value: `Rs. ${totalSales.toLocaleString("en-IN")}` },
        { label: "Cash In", value: `Rs. ${cashIn.toLocaleString("en-IN")}` },
        { label: "UPI In", value: `Rs. ${upiIn.toLocaleString("en-IN")}` },
        { label: "Invoices", value: String(entries.length) },
      ],
      columns: ["Invoice", "Customer", "Mode", "Amount"],
      rows: entries.map((e: any) => [e.invoiceNo ?? "", e.customerName ?? "Walk-in", e.paymentMode ?? "", Number(e.total)]),
    });
    savePdf(doc, `daybook-${date}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-7 w-7" /> Day Book
          </h2>
          <p className="text-muted-foreground">All cash & UPI movement for the day.</p>
        </div>
        <div className="flex gap-2 items-end bg-card p-2 rounded-lg border">
          <div className="grid gap-1">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground px-1">Date</Label>
            <Input type="date" className="h-8 w-40" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" className="h-9" onClick={handleExport} disabled={isLoading} data-testid="daybook-export">
            <Download className="mr-2 h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-2"><IndianRupee className="h-4 w-4" />Total Sales</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">Rs. {totalSales.toLocaleString("en-IN")}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Cash In</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">Rs. {cashIn.toLocaleString("en-IN")}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">UPI In</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">Rs. {upiIn.toLocaleString("en-IN")}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-2"><Receipt className="h-4 w-4" />Invoices</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{entries.length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Transactions</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="text-left p-3">Invoice</th>
                <th className="text-left p-3">Customer</th>
                <th className="text-left p-3">Mode</th>
                <th className="text-right p-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No transactions for {date}.</td></tr>}
              {entries.map((e: any) => (
                <tr key={e.id} className="border-t">
                  <td className="p-3 font-mono text-xs">{e.invoiceNo}</td>
                  <td className="p-3">{e.customerName ?? "Walk-in"}</td>
                  <td className="p-3"><Badge variant="outline">{e.paymentMode ?? "—"}</Badge></td>
                  <td className="p-3 text-right">Rs. {Number(e.total).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
