import { useState } from "react";
import { useGetLoyaltyReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sparkles, Download } from "lucide-react";
import { generateReportPdf, savePdf } from "@workspace/pdf";

export default function LoyaltyReport() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const { data, isLoading } = useGetLoyaltyReport({ dateFrom, dateTo });
  const report = data?.data as any;
  const summary = report?.summary ?? {};
  const top = (report?.topCustomers as any[]) ?? [];
  const recent = (report?.recent as any[]) ?? [];

  const handleExport = () => {
    const doc = generateReportPdf({
      title: "Loyalty Report",
      subtitle: `${dateFrom} → ${dateTo}`,
      period: `${dateFrom} → ${dateTo}`,
      summary: [
        { label: "Earned", value: String(summary.earned ?? 0) },
        { label: "Redeemed", value: String(summary.redeemed ?? 0) },
        { label: "Outstanding Points", value: String(summary.outstandingPoints ?? 0) },
        { label: "Active Customers", value: String(summary.activeCustomers ?? 0) },
      ],
      columns: ["Customer", "Points"],
      rows: top.map((c: any) => [c.customerName ?? "—", Number(c.loyaltyPoints ?? 0)]),
    });
    savePdf(doc, `loyalty-${dateFrom}_to_${dateTo}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-amber-500" /> Loyalty Report
          </h2>
          <p className="text-muted-foreground">Points earned, redeemed, and the wallet liability.</p>
        </div>
        <div className="flex gap-2 items-end bg-card p-2 rounded-lg border">
          <div className="grid gap-1"><Label className="text-[10px] uppercase font-bold px-1">From</Label>
            <Input type="date" className="h-8 w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
          <div className="grid gap-1"><Label className="text-[10px] uppercase font-bold px-1">To</Label>
            <Input type="date" className="h-8 w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
          <Button variant="outline" size="sm" className="h-9" onClick={handleExport} disabled={isLoading} data-testid="loyalty-export">
            <Download className="mr-2 h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Earned</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{Number(summary.earned ?? 0).toLocaleString("en-IN")}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Redeemed</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{Number(summary.redeemed ?? 0).toLocaleString("en-IN")}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Outstanding</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{Number(summary.outstandingPoints ?? 0).toLocaleString("en-IN")}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Active Customers</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{Number(summary.activeCustomers ?? 0)}</div></CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Top customers</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase"><tr><th className="text-left p-3">Customer</th><th className="text-right p-3">Points</th></tr></thead>
              <tbody>
                {top.length === 0 && <tr><td colSpan={2} className="p-6 text-center text-muted-foreground">No customers with points yet.</td></tr>}
                {top.map((c: any) => (
                  <tr key={c.customerId} className="border-t"><td className="p-3">{c.customerName ?? "—"}</td><td className="p-3 text-right font-medium">{Number(c.loyaltyPoints ?? 0).toLocaleString("en-IN")}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent activity</CardTitle></CardHeader>
          <CardContent className="p-0 max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase sticky top-0"><tr><th className="text-left p-3">Date</th><th className="text-left p-3">Customer</th><th className="text-left p-3">Type</th><th className="text-right p-3">Pts</th></tr></thead>
              <tbody>
                {recent.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No activity.</td></tr>}
                {recent.map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3">{new Date(r.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="p-3">{r.customerName ?? "—"}</td>
                    <td className="p-3 text-xs">{r.type}</td>
                    <td className={`p-3 text-right font-mono ${r.type === "REDEEM" ? "text-rose-600" : "text-emerald-600"}`}>{Number(r.points)}</td>
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
