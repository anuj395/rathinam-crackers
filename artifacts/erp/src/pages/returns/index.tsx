import { useState } from "react";
import { Link } from "wouter";
import { useListReturns } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, RotateCcw } from "lucide-react";

export default function ReturnsList() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { data, isLoading } = useListReturns({
    ...(dateFrom && { dateFrom }),
    ...(dateTo && { dateTo }),
  });
  const rows = (data?.data as any[]) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <RotateCcw className="h-7 w-7" /> Returns & Credit Notes
          </h2>
          <p className="text-muted-foreground">
            Process customer returns, restock goods, and issue credit notes.
          </p>
        </div>
        <Link href="/returns/new">
          <Button data-testid="returns-new">
            <Plus className="mr-2 h-4 w-4" /> New Return
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3 items-end">
          <div className="grid gap-1">
            <Label className="text-xs">From</Label>
            <Input type="date" className="h-9 w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">To</Label>
            <Input type="date" className="h-9 w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>
            Clear
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase">
                <tr>
                  <th className="text-left p-3">Return No</th>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Invoice</th>
                  <th className="text-left p-3">Customer</th>
                  <th className="text-left p-3">Reason</th>
                  <th className="text-right p-3">Credit (Rs.)</th>
                  <th className="text-left p-3">Mode</th>
                  <th className="text-left p-3">Credit Note</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={9} className="p-10 text-center text-muted-foreground">
                    No returns yet. Click "New Return" to record one.
                  </td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/20" data-testid={`return-row-${r.id}`}>
                    <td className="p-3 font-mono text-xs">{r.returnNo ?? r.id.slice(0, 8)}</td>
                    <td className="p-3">{new Date(r.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="p-3"><Badge variant="outline">{r.type}</Badge></td>
                    <td className="p-3 font-mono text-xs">{r.referenceNo ?? "—"}</td>
                    <td className="p-3">{r.customerName ?? "—"}</td>
                    <td className="p-3 max-w-xs truncate" title={r.reason}>{r.reason}</td>
                    <td className="p-3 text-right font-medium">{Number(r.creditAmount ?? 0).toLocaleString("en-IN")}</td>
                    <td className="p-3"><Badge variant="secondary">{r.refundMode}</Badge></td>
                    <td className="p-3 font-mono text-xs">{r.creditNoteNo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
