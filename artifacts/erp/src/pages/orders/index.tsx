import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Eye } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "../../lib/api";

type Order = {
  id: string;
  invoiceNo: string;
  customerName: string | null;
  total: string;
  status: string;
  createdAt: string;
  logisticsDetails?: {
    status?: string;
    paymentMode?: string;
    courier?: { name?: string; trackingNumber?: string };
  };
};

const STAGE_OPTIONS = [
  { value: "ALL", label: "All stages" },
  { value: "pending_confirmation", label: "Pending confirmation" },
  { value: "confirmed", label: "Confirmed" },
  { value: "packed", label: "Packed" },
  { value: "dispatched", label: "Dispatched" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

function stageBadge(stage: string, isCancelled: boolean) {
  if (isCancelled) return <Badge variant="destructive">Cancelled</Badge>;
  const map: Record<string, { cls: string; label: string }> = {
    pending_confirmation: { cls: "bg-amber-500 text-white", label: "Pending" },
    confirmed: { cls: "bg-blue-500 text-white", label: "Confirmed" },
    packed: { cls: "bg-indigo-500 text-white", label: "Packed" },
    dispatched: { cls: "bg-purple-500 text-white", label: "Dispatched" },
    delivered: { cls: "bg-green-500 text-white", label: "Delivered" },
  };
  const m = map[stage] ?? { cls: "bg-gray-400 text-white", label: stage || "—" };
  return <Badge className={m.cls}>{m.label}</Badge>;
}

export default function OnlineOrdersList() {
  const { token } = useAuth();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<string>("ALL");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/v1/admin/orders?status=${encodeURIComponent(stage)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!cancelled) setOrders(json?.data ?? []);
      } catch {
        if (!cancelled) setOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (token) load();
    return () => { cancelled = true; };
  }, [stage, token]);

  const filtered = useMemo(() => {
    const list = orders ?? [];
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(
      (o) =>
        (o.invoiceNo ?? "").toLowerCase().includes(q) ||
        (o.customerName ?? "").toLowerCase().includes(q),
    );
  }, [orders, search]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Online Orders</h2>
        <p className="text-muted-foreground">
          Manage the lifecycle of customer-placed online orders: confirm, pack, dispatch, deliver, cancel.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-center bg-card p-4 rounded-lg border">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by order # or customer..."
            className="pl-9 w-full bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="orders-search"
          />
        </div>
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="w-[200px] bg-background" data-testid="orders-stage-filter">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            {STAGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Placed</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Courier</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center h-32 text-muted-foreground">
                  No online orders found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((o) => {
                const ld = o.logisticsDetails ?? {};
                const isCancelled = o.status === "cancelled";
                const courier = ld.courier;
                return (
                  <TableRow key={o.id} data-testid={`row-order-${o.id}`}>
                    <TableCell className="font-mono text-sm">{o.invoiceNo}</TableCell>
                    <TableCell className="font-medium">{o.customerName ?? "—"}</TableCell>
                    <TableCell>{new Date(o.createdAt).toLocaleString("en-IN")}</TableCell>
                    <TableCell className="uppercase text-xs">{ld.paymentMode ?? "—"}</TableCell>
                    <TableCell>₹{Number(o.total ?? 0).toLocaleString("en-IN")}</TableCell>
                    <TableCell>{stageBadge(ld.status ?? "pending_confirmation", isCancelled)}</TableCell>
                    <TableCell className="text-xs">
                      {courier?.name ? (
                        <>
                          <div>{courier.name}</div>
                          {courier.trackingNumber && (
                            <div className="text-muted-foreground font-mono">{courier.trackingNumber}</div>
                          )}
                        </>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/orders/${o.id}`} data-testid={`btn-view-${o.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
