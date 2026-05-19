import {
  useGetStockLedger,
  useGetStockLevels,
  useListPendingTransfers,
  useListPurchaseOrders,
  useListLocations,
  useGetDashboardByLocation,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  Settings2,
  History,
  AlertCircle,
  ClipboardList,
  MapPin,
  Building2,
} from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Dashboard() {
  const { data: stockLevels } = useGetStockLevels({});
  const { data: pendingTransfers } = useListPendingTransfers({});
  const { data: pendingPOs } = useListPurchaseOrders({ status: "Sent" });
  const { data: ledgerEntries } = useGetStockLedger({ limit: 10 });
  const { data: locations } = useListLocations();
  const { data: byLocation } = useGetDashboardByLocation();

  const lowStockCount = stockLevels?.data?.filter(s => (s.currentQty || 0) <= (s.reorderLevel || 0)).length || 0;
  const pendingTransferCount = pendingTransfers?.data?.length || 0;
  const pendingPOCount = pendingPOs?.data?.length || 0;
  const activeLocations = (locations?.data ?? []).filter((l) => l.isActive !== false);
  const locationCount = activeLocations.length;
  const locationRows = byLocation?.data ?? [];
  const locationNameMap = new Map((locations?.data ?? []).map((l) => [l.id, l.name]));

  const quickActions = [
    { label: "Receive Stock", icon: ArrowDownToLine, href: "/receive", color: "bg-teal-500" },
    { label: "New Transfer", icon: ArrowLeftRight, href: "/transfers/new", color: "bg-blue-500" },
    { label: "Stock Adjust", icon: Settings2, href: "/adjust", color: "bg-amber-500" },
    { label: "View Ledger", icon: History, href: "/ledger", color: "bg-purple-500" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Warehouse Dashboard</h1>
        <p className="text-muted-foreground">Overview of current stock operations and pending tasks.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
            <AlertCircle className={`h-4 w-4 ${lowStockCount > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lowStockCount}</div>
            <p className="text-xs text-muted-foreground">Items below reorder level</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Transfers</CardTitle>
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingTransferCount}</div>
            <p className="text-xs text-muted-foreground">Internal stock movements</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending POs</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingPOCount}</div>
            <p className="text-xs text-muted-foreground">Purchase orders to receive</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Locations</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="warehouse-location-count">{locationCount}</div>
            <p className="text-xs text-muted-foreground">Active warehouses & shops</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex flex-col items-center justify-center p-6 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all group"
            >
              <div className={`p-3 rounded-full ${action.color} text-white mb-3 group-hover:scale-110 transition-transform`}>
                <action.icon className="h-6 w-6" />
              </div>
              <span className="font-medium text-gray-900">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <Card data-testid="warehouse-by-location">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>By Location</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Low stock and activity for every active location.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Low stock</TableHead>
                <TableHead className="text-right">Today invoices</TableHead>
                <TableHead className="text-right">Open shifts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locationRows.map((r) => (
                <TableRow key={r.locationId}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      {r.locationName ?? locationNameMap.get(r.locationId ?? "") ?? r.locationId}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{r.type}</Badge>
                  </TableCell>
                  <TableCell className={`text-right font-semibold ${(r.lowStockCount ?? 0) > 0 ? "text-red-600" : ""}`}>
                    {r.lowStockCount ?? 0}
                  </TableCell>
                  <TableCell className="text-right">{r.todayInvoices ?? 0}</TableCell>
                  <TableCell className="text-right">{r.openShifts ?? 0}</TableCell>
                </TableRow>
              ))}
              {locationRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No location data available.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Stock Movements</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledgerEntries?.data?.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-sm">
                    {entry.ts ? new Date(entry.ts).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) : ''}
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                      entry.type === 'IN' ? 'default' :
                      entry.type === 'OUT' ? 'destructive' :
                      'outline'
                    } className="text-[10px] px-1.5 py-0">
                      {entry.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {entry.productName}
                    <div className="text-xs text-muted-foreground">{entry.variantId}</div>
                  </TableCell>
                  <TableCell>
                    {locationNameMap.get(entry.locationId ?? "") ?? entry.locationId}
                  </TableCell>
                  <TableCell className={`text-right font-semibold ${(entry.qty ?? 0) > 0 ? "text-green-600" : "text-red-600"}`}>
                    {(entry.qty ?? 0) > 0 ? "+" : ""}{entry.qty ?? 0}
                  </TableCell>
                </TableRow>
              ))}
              {(!ledgerEntries?.data || ledgerEntries.data.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No recent ledger entries found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
