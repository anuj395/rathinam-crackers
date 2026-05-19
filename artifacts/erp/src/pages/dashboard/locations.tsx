import { useGetDashboardByLocation } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertCircle, MapPin, Package, Receipt, Wallet } from "lucide-react";

const fmt = (n?: number) => `₹${(n ?? 0).toLocaleString("en-IN")}`;

export default function LocationsDashboard() {
  const { data, isLoading, error } = useGetDashboardByLocation();
  const rows = data?.data ?? [];

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load location metrics.</AlertDescription>
      </Alert>
    );
  }

  const totals = rows.reduce<{ todaySales: number; monthSales: number; todayInvoices: number; lowStock: number }>(
    (acc, r) => ({
      todaySales: acc.todaySales + (r.todaySales ?? 0),
      monthSales: acc.monthSales + (r.monthSales ?? 0),
      todayInvoices: acc.todayInvoices + (r.todayInvoices ?? 0),
      lowStock: acc.lowStock + (r.lowStockCount ?? 0),
    }),
    { todaySales: 0, monthSales: 0, todayInvoices: 0, lowStock: 0 }
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Locations</h2>
        <p className="text-muted-foreground">Sales and inventory metrics for every active location.</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Today (All)</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{fmt(totals.todaySales)}</div>
                <p className="text-xs text-muted-foreground mt-1">{totals.todayInvoices} invoices</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">This Month (All)</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{fmt(totals.monthSales)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Locations</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{rows.length}</div>
                <p className="text-xs text-muted-foreground mt-1">active</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Low-Stock Items</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{totals.lowStock}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="location-cards">
            {rows.map((r) => (
              <Card key={r.locationId}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      {r.locationName}
                    </CardTitle>
                    <Badge variant="secondary">{r.type}</Badge>
                  </div>
                  {r.city && <p className="text-xs text-muted-foreground">{r.city}</p>}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Today</p>
                      <p className="text-lg font-semibold">{fmt(r.todaySales)}</p>
                      <p className="text-xs text-muted-foreground">{r.todayInvoices} invoices</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">This Month</p>
                      <p className="text-lg font-semibold">{fmt(r.monthSales)}</p>
                      <p className="text-xs text-muted-foreground">{r.monthInvoices} invoices</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm pt-2 border-t">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Wallet className="h-3 w-3" /> Avg order
                    </span>
                    <span className="font-medium">{fmt(r.averageOrderValue)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Package className="h-3 w-3" /> Low stock
                    </span>
                    <span className={`font-medium ${(r.lowStockCount ?? 0) > 0 ? "text-destructive" : ""}`}>
                      {r.lowStockCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Receipt className="h-3 w-3" /> Open shifts
                    </span>
                    <span className="font-medium">{r.openShifts}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground">No active locations configured.</p>
            )}
          </div>

          <Card>
            <CardHeader><CardTitle>Comparison</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Today</TableHead>
                    <TableHead className="text-right">Month</TableHead>
                    <TableHead className="text-right">Avg order</TableHead>
                    <TableHead className="text-right">Low stock</TableHead>
                    <TableHead className="text-right">Open shifts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.locationId}>
                      <TableCell className="font-medium">{r.locationName}</TableCell>
                      <TableCell>{r.type}</TableCell>
                      <TableCell className="text-right">{fmt(r.todaySales)}</TableCell>
                      <TableCell className="text-right">{fmt(r.monthSales)}</TableCell>
                      <TableCell className="text-right">{fmt(r.averageOrderValue)}</TableCell>
                      <TableCell className="text-right">{r.lowStockCount}</TableCell>
                      <TableCell className="text-right">{r.openShifts}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
