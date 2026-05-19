import { useState } from "react";
import { useGetDamageReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Download } from "lucide-react";
import { generateReportPdf, savePdf } from "@workspace/pdf";

export default function DamageReport() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const { data, isLoading } = useGetDamageReport({ dateFrom, dateTo });
  const report = data?.data as any;
  const events = (report?.events as any[]) ?? [];
  const totalUnits = Number(report?.summary?.totalUnits ?? 0);

  const handleExport = () => {
    const doc = generateReportPdf({
      title: "Damage / Write-off Report",
      subtitle: `${dateFrom} → ${dateTo}`,
      period: `${dateFrom} → ${dateTo}`,
      summary: [
        { label: "Total Units Lost", value: String(totalUnits) },
        { label: "Events", value: String(events.length) },
      ],
      columns: ["Date", "Product", "Location", "Qty", "Reason"],
      rows: events.map((e: any) => [
        new Date(e.createdAt).toLocaleDateString("en-IN"),
        e.productName ?? "—",
        e.locationName ?? "—",
        Math.abs(Number(e.qty)),
        e.reason ?? "",
      ]),
    });
    savePdf(doc, `damage-${dateFrom}_to_${dateTo}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-7 w-7 text-amber-500" /> Damage Report
          </h2>
          <p className="text-muted-foreground">All write-off / damaged stock movements.</p>
        </div>
        <div className="flex gap-2 items-end bg-card p-2 rounded-lg border">
          <div className="grid gap-1"><Label className="text-[10px] uppercase font-bold px-1">From</Label>
            <Input type="date" className="h-8 w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
          <div className="grid gap-1"><Label className="text-[10px] uppercase font-bold px-1">To</Label>
            <Input type="date" className="h-8 w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
          <Button variant="outline" size="sm" className="h-9" onClick={handleExport} disabled={isLoading} data-testid="damage-export">
            <Download className="mr-2 h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Total Units Lost</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{totalUnits}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Damage Events</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{events.length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Damage Events</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="text-left p-3">Date</th>
                <th className="text-left p-3">Product</th>
                <th className="text-left p-3">Location</th>
                <th className="text-right p-3">Qty</th>
                <th className="text-left p-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No damage in this period.</td></tr>}
              {events.map((e: any) => (
                <tr key={e.id} className="border-t">
                  <td className="p-3">{new Date(e.createdAt).toLocaleDateString("en-IN")}</td>
                  <td className="p-3">{e.productName ?? "—"}</td>
                  <td className="p-3">{e.locationName ?? "—"}</td>
                  <td className="p-3 text-right">{Math.abs(Number(e.qty))}</td>
                  <td className="p-3 text-xs">{e.reason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
