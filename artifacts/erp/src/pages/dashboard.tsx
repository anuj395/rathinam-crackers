import { useState } from "react";
import {
  useGetDashboardSummary,
  useGetSalesByChannel,
  useGetTopProducts,
  useGetAgentPerformance,
  useGetDailySales,
  useListLocations,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle, ArrowDownRight, ArrowUpRight, IndianRupee,
  Package, Users, Box, FileText, TrendingUp,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Bar, BarChart, ResponsiveContainer, XAxis, YAxis,
  Tooltip as RechartsTooltip, Line, LineChart, CartesianGrid,
} from "recharts";

const fmt = (n?: number) => `₹${(n ?? 0).toLocaleString("en-IN")}`;

export default function Dashboard() {
  const [days, setDays] = useState("30");
  const [locationId, setLocationId] = useState<string>("all");

  const { data: summary, isLoading: loadingSummary, error: errorSummary } = useGetDashboardSummary();
  const { data: sales, isLoading: loadingSales } = useGetSalesByChannel();
  const { data: topProducts, isLoading: loadingTop } = useGetTopProducts();
  const { data: agentPerf, isLoading: loadingAgents } = useGetAgentPerformance();
  const { data: locations } = useListLocations();
  const { data: daily, isLoading: loadingDaily } = useGetDailySales({
    days: Number(days),
    ...(locationId !== "all" ? { locationId } : {}),
  });

  if (errorSummary) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load dashboard data.</AlertDescription>
      </Alert>
    );
  }

  const monthGrowth = summary?.data?.monthGrowth ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h2>
        <p className="text-muted-foreground">Overview of today's operations and key metrics.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales (Today)</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Skeleton className="h-7 w-[100px]" />
            ) : (
              <div className="text-2xl font-bold" data-testid="dashboard-today-sales">
                {fmt(summary?.data?.todaySales)}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {summary?.data?.todayInvoices ?? 0} invoices today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Month-to-date Sales</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Skeleton className="h-7 w-[100px]" />
            ) : (
              <div className="text-2xl font-bold">{fmt(summary?.data?.monthSales)}</div>
            )}
            <p className={`text-xs mt-1 flex items-center gap-1 ${monthGrowth >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              {monthGrowth >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(monthGrowth)}% vs last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Transfers</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Skeleton className="h-7 w-[100px]" />
            ) : (
              <div className="text-2xl font-bold">{summary?.data?.activeTransfers ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">In-transit transfers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Skeleton className="h-7 w-[100px]" />
            ) : (
              <div className="text-2xl font-bold text-accent">{fmt(summary?.data?.outstandingTotal)}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Across all customers</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Daily Sales</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Revenue trend over time</p>
          </div>
          <div className="flex gap-2">
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger className="w-[180px]" data-testid="dashboard-location-filter">
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations?.data?.filter((l) => !!l.id).map((l) => (
                  <SelectItem key={l.id} value={l.id as string}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[120px]" data-testid="dashboard-days-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pl-2">
          {loadingDaily ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily?.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
                  />
                  <RechartsTooltip
                    formatter={(v: number) => fmt(v)}
                    labelFormatter={(label: string) => `Date: ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader><CardTitle>Sales by Channel</CardTitle></CardHeader>
          <CardContent className="pl-2">
            {loadingSales ? (
              <Skeleton className="h-[350px] w-full" />
            ) : (
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sales?.data ?? []}>
                    <XAxis dataKey="channel" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} />
                    <RechartsTooltip cursor={{ fill: "transparent" }} />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader><CardTitle>Top Products</CardTitle></CardHeader>
          <CardContent>
            {loadingTop ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="space-y-4">
                {topProducts?.data?.map((item, i) => (
                  <div key={i} className="flex items-center">
                    <div className="bg-primary/10 p-2 rounded-md mr-4">
                      <Box className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">{item.totalQty} units sold</p>
                    </div>
                    <div className="font-medium">{fmt(item.totalRevenue)}</div>
                  </div>
                ))}
                {(topProducts?.data?.length ?? 0) === 0 && (
                  <p className="text-sm text-muted-foreground">No sales yet.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {(agentPerf?.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle>Agent Performance (This Month)</CardTitle></CardHeader>
          <CardContent>
            {loadingAgents ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="space-y-3">
                {agentPerf?.data?.map((a) => (
                  <div key={a.agentId} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{a.agentName}</span>
                      <span className="text-muted-foreground">
                        {fmt(a.sales)} / {fmt(a.target)} ({a.achievement}%)
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded">
                      <div
                        className="h-2 rounded bg-primary"
                        style={{ width: `${Math.min(100, a.achievement ?? 0)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
