import { useState } from "react";
import { useGetSalesReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { IndianRupee, ShoppingBag, FileText, TrendingUp, Download } from "lucide-react";
import { generateReportPdf, savePdf } from "@workspace/pdf";

export default function SalesReport() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

  const { data, isLoading } = useGetSalesReport({ dateFrom, dateTo });

  const report = data?.data as any;
  const totalRevenueDisplay = Number(report?.summary?.totalRevenue) || 0;
  const totalInvoicesDisplay = Number(report?.summary?.totalInvoices) || 0;
  const aovDisplay =
    Number(report?.summary?.avgOrderValue) ||
    (totalInvoicesDisplay ? Math.round(totalRevenueDisplay / totalInvoicesDisplay) : 0);
  const channelData = (report?.byChannel ?? []).map((c: any) => ({
    channel: c.channel ?? "-",
    revenue: Number(c.revenue) || 0,
    count: Number(c.count ?? c.invoices) || 0,
  }));

  const handleExportPdf = () => {
    const doc = generateReportPdf({
      title: "Sales Report",
      subtitle: `Period: ${dateFrom} to ${dateTo}`,
      period: `${dateFrom} → ${dateTo}`,
      summary: [
        { label: "Total Revenue", value: `Rs. ${totalRevenueDisplay.toLocaleString("en-IN")}` },
        { label: "Total Invoices", value: String(totalInvoicesDisplay) },
        { label: "Avg Order Value", value: `Rs. ${aovDisplay.toLocaleString("en-IN")}` },
      ],
      columns: ["Channel", "Revenue (Rs.)", "Invoices"],
      rows: channelData.map((c: { channel: string; revenue: number; count: number }) => [
        c.channel,
        c.revenue,
        c.count,
      ]),
    });
    savePdf(doc, `sales-report-${dateFrom}_to_${dateTo}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Sales Report</h2>
          <p className="text-muted-foreground">Analyze sales performance across channels.</p>
        </div>
        <div className="flex gap-2 items-center bg-card p-2 rounded-lg border">
          <div className="grid gap-1">
            <Label htmlFor="from" className="text-[10px] uppercase font-bold text-muted-foreground px-1">From</Label>
            <Input 
              id="from" 
              type="date" 
              className="h-8 w-36" 
              value={dateFrom} 
              onChange={(e) => setDateFrom(e.target.value)} 
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="to" className="text-[10px] uppercase font-bold text-muted-foreground px-1">To</Label>
            <Input 
              id="to" 
              type="date" 
              className="h-8 w-36" 
              value={dateTo} 
              onChange={(e) => setDateTo(e.target.value)} 
            />
          </div>
          <Button variant="outline" size="sm" className="h-9" onClick={handleExportPdf} disabled={isLoading} data-testid="sales-export-pdf">
            <Download className="mr-2 h-4 w-4" /> Export PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <IndianRupee className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-7 w-24" /> : (
              <div className="text-2xl font-bold">₹{totalRevenueDisplay.toLocaleString('en-IN')}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Taxable amount + GST</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Invoices</CardTitle>
            <FileText className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-7 w-24" /> : (
              <div className="text-2xl font-bold">{totalInvoicesDisplay}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Across all channels</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-7 w-24" /> : (
              <div className="text-2xl font-bold">₹{aovDisplay.toLocaleString('en-IN')}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Revenue per invoice</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sales by Channel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] w-full">
            {isLoading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={channelData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="channel" />
                  <YAxis tickFormatter={(val) => `₹${val.toLocaleString('en-IN')}`} />
                  <Tooltip 
                    formatter={(value: any) => [`₹${value.toLocaleString('en-IN')}`, 'Revenue']}
                    cursor={{fill: 'hsl(var(--muted)/0.3)'}}
                  />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
