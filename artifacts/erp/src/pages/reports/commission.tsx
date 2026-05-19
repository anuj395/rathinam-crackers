import { useState } from "react";
import { useGetCommissionReport, useListAgents } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Wallet, Users, Target, Download } from "lucide-react";
import { generateReportPdf, savePdf } from "@workspace/pdf";

export default function CommissionReport() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1); // First of current month
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [agentId, setAgentId] = useState<string>("ALL");

  const { data: agents } = useListAgents({ limit: 100 });
  const { data, isLoading } = useGetCommissionReport({ 
    dateFrom, 
    dateTo, 
    agentId: agentId === "ALL" ? undefined : agentId 
  });

  const report = data?.data;

  // API returns { agents: [{ agentId, agentName, totalSales, commission }] }.
  // Some legacy code expected items[] with salesTotal/commissionEarned — accept both.
  const r = report as any;
  const rawAgents: any[] = r?.agents ?? r?.items ?? [];
  const rows = rawAgents.map((a: any) => ({
    agentName: a.agentName ?? "-",
    promoCode: a.promoCode ?? "-",
    salesTotal: Number(a.totalSales ?? a.salesTotal) || 0,
    commissionRate: Number(a.commissionRate) || 0,
    commissionEarned: Number(a.commission ?? a.commissionEarned) || 0,
  }));
  const totalAgentSales = rows.reduce((s, x) => s + x.salesTotal, 0);
  const totalCommission = rows.reduce((s, x) => s + x.commissionEarned, 0);

  const handleExportPdf = () => {
    const doc = generateReportPdf({
      title: "Commission Report",
      subtitle: `Period: ${dateFrom} to ${dateTo}${agentId !== "ALL" ? ` (filtered by agent)` : ""}`,
      period: `${dateFrom} → ${dateTo}`,
      summary: [
        { label: "Total Agent Sales", value: `Rs. ${totalAgentSales.toLocaleString("en-IN")}` },
        { label: "Total Commission", value: `Rs. ${totalCommission.toLocaleString("en-IN")}` },
        { label: "Active Agents", value: String(rows.length) },
      ],
      columns: ["Agent Name", "Promo Code", "Sales Total (Rs.)", "Commission Rate (%)", "Commission Earned (Rs.)"],
      rows: rows.map((it) => [
        it.agentName,
        it.promoCode,
        it.salesTotal,
        it.commissionRate,
        it.commissionEarned,
      ]),
    });
    savePdf(doc, `commission-report-${dateFrom}_to_${dateTo}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Commission Report</h2>
          <p className="text-muted-foreground">Track agent earnings and performance.</p>
        </div>
        <div className="flex flex-wrap gap-4 items-end bg-card p-4 rounded-lg border">
          <div className="grid gap-1">
            <Label htmlFor="agent" className="text-xs font-bold uppercase text-muted-foreground px-1">Agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="All Agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Agents</SelectItem>
                {agents?.data?.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="from" className="text-xs font-bold uppercase text-muted-foreground px-1">From</Label>
            <Input id="from" type="date" className="h-9 w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="to" className="text-xs font-bold uppercase text-muted-foreground px-1">To</Label>
            <Input id="to" type="date" className="h-9 w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" className="h-9" onClick={handleExportPdf} disabled={isLoading} data-testid="commission-export-pdf">
            <Download className="mr-2 h-4 w-4" /> Export PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Agent Sales</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{totalAgentSales.toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Commission</CardTitle>
            <Wallet className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">₹{totalCommission.toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
            <Target className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rows.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Commission Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent Name</TableHead>
                  <TableHead>Promo Code</TableHead>
                  <TableHead className="text-right">Sales Total</TableHead>
                  <TableHead className="text-right">Commission Rate</TableHead>
                  <TableHead className="text-right">Commission Earned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5}><Skeleton className="h-4 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No commission data for this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((item, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{item.agentName}</TableCell>
                      <TableCell><code>{item.promoCode}</code></TableCell>
                      <TableCell className="text-right">₹{item.salesTotal.toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right">{item.commissionRate}%</TableCell>
                      <TableCell className="text-right font-bold text-accent">
                        ₹{item.commissionEarned.toLocaleString('en-IN')}
                      </TableCell>
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
