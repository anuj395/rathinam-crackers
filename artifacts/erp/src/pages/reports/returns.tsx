import { useState } from "react";
import { useGetReturnsReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Download } from "lucide-react";
import { generateReportPdf, savePdf } from "@workspace/pdf";

export default function ReturnsReport() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const { data, isLoading } = useGetReturnsReport({ dateFrom, dateTo });
  const report = data?.data as any;
  const summary = report?.summary ?? {};
  const topReasons = (report?.topReasons as any[]) ?? [];
  const recent = (report?.recent as any[]) ?? [];

  const handleExport = () => {
    const doc = generateReportPdf({
      title: "Returns Report",
      subtitle: `${dateFrom} → ${dateTo}`,
      period: `${dateFrom} → ${dateTo}`,
      summary: [
        { label: "Total Returns", value: String(summary.totalReturns ?? 0) },
        { label: "Credit Issued", value: `Rs. ${Number(summary.totalCredit ?? 0).toLocaleString("en-IN")}` },
      ],
      columns: ["Reason", "Count"],
      rows: topReasons.map((r: any) => [r.reason, r.count]),
    });
    savePdf(doc, `returns-${dateFrom}_to_${dateTo}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <RotateCcw className="h-7 w-7" /> Returns Report
          </h2>
          <p className="text-muted-foreground">Returns volume, credit issued, and top reasons.</p>
        </div>
        <div className="flex gap-2 items-end bg-card p-2 rounded-lg border">
          <div className="grid gap-1"><Label className="text-[10px] uppercase font-bold px-1">From</Label>
            <Input type="date" className="h-8 w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
          <div className="grid gap-1"><Label className="text-[10px] uppercase font-bold px-1">To</Label>
            <Input type="date" className="h-8 w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
          <Button variant="outline" size="sm" className="h-9" onClick={handleExport} disabled={isLoading} data-testid="returns-export">
            <Download className="mr-2 h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Total Returns</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{summary.totalReturns ?? 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Credit Issued</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">Rs. {Number(summary.totalCredit ?? 0).toLocaleString("en-IN")}</div></CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Top reasons</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase"><tr><th className="text-left p-3">Reason</th><th className="text-right p-3">Count</th></tr></thead>
              <tbody>
                {topReasons.length === 0 && <tr><td colSpan={2} className="p-6 text-center text-muted-foreground">No returns yet.</td></tr>}
                {topReasons.map((r: any, i: number) => (
                  <tr key={i} className="border-t"><td className="p-3 truncate max-w-xs" title={r.reason}>{r.reason}</td><td className="p-3 text-right font-medium">{r.count}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent returns</CardTitle></CardHeader>
          <CardContent className="p-0 max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase sticky top-0"><tr><th className="text-left p-3">Return No</th><th className="text-left p-3">Customer</th><th className="text-left p-3">Mode</th><th className="text-right p-3">Credit</th></tr></thead>
              <tbody>
                {recent.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No returns in this period.</td></tr>}
                {recent.map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3 font-mono text-xs">{r.returnNo ?? "—"}</td>
                    <td className="p-3">{r.customerName ?? "—"}</td>
                    <td className="p-3"><Badge variant="secondary">{r.refundMode}</Badge></td>
                    <td className="p-3 text-right">Rs. {Number(r.creditAmount ?? 0).toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
