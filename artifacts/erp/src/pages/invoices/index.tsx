import { useState } from "react";
import { useListInvoices } from "@workspace/api-client-react";
import { Link } from "wouter";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Eye, Filter } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function InvoicesList() {
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<string>("ALL");
  const [status, setStatus] = useState<string>("ALL");
  const [page, setPage] = useState(1);

  const queryParams: any = { page, limit: 50 };
  if (search) queryParams.invoiceNo = search;

  const { data, isLoading } = useListInvoices(queryParams);

  const filtered = (data?.data ?? []).filter((inv: any) => {
    if (channel !== "ALL" && inv.channel !== channel) return false;
    if (status !== "ALL") {
      const want = status.toLowerCase();
      const have = (inv.status ?? "").toLowerCase();
      if (want === "paid" && have !== "paid") return false;
      if (want === "partial" && have !== "credit") return false;
      if (want === "unpaid" && have !== "credit") return false;
      if (want === "overdue" && have !== "credit") return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const hit =
        (inv.invoiceNo ?? "").toLowerCase().includes(q) ||
        (inv.customerName ?? "").toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    const s = (status ?? "").toLowerCase();
    switch (s) {
      case "paid": return <Badge variant="default" className="bg-green-500">Paid</Badge>;
      case "credit": return <Badge variant="secondary" className="bg-amber-500 text-white">Credit</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      default: return <Badge variant="outline">{status || "—"}</Badge>;
    }
  };

  const getChannelBadge = (channel: string) => {
    switch (channel) {
      case "POS": return <Badge variant="outline" className="border-primary text-primary">{channel}</Badge>;
      case "Estimate": return <Badge variant="outline" className="border-blue-500 text-blue-500">{channel}</Badge>;
      case "Online": return <Badge variant="outline" className="border-purple-500 text-purple-500">{channel}</Badge>;
      default: return <Badge variant="outline">{channel || 'Manual'}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Invoices</h2>
        <p className="text-muted-foreground">View and manage all sales invoices.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-center bg-card p-4 rounded-lg border">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by invoice # or customer..."
            className="pl-9 w-full bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-4 w-full lg:w-auto">
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="w-[160px] bg-background">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Channels</SelectItem>
              <SelectItem value="POS">POS</SelectItem>
              <SelectItem value="Estimate">Estimate</SelectItem>
              <SelectItem value="Online">Online</SelectItem>
              <SelectItem value="Manual">Manual</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[160px] bg-background">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="Paid">Paid</SelectItem>
              <SelectItem value="Partial">Partial</SelectItem>
              <SelectItem value="Unpaid">Unpaid</SelectItem>
              <SelectItem value="Overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Tax (GST)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-12 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center h-32 text-muted-foreground">
                  No invoices found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((invoice: any) => {
                const tax =
                  Number(invoice.cgst ?? 0) +
                  Number(invoice.sgst ?? 0) +
                  Number(invoice.igst ?? 0);
                return (
                  <TableRow key={invoice.id} data-testid={`row-invoice-${invoice.id}`}>
                    <TableCell className="font-mono text-sm">{invoice.invoiceNo ?? invoice.id.slice(0, 8)}</TableCell>
                    <TableCell className="font-medium">{invoice.customerName ?? "Walk-in"}</TableCell>
                    <TableCell>{new Date(invoice.createdAt).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell>{getChannelBadge(invoice.channel)}</TableCell>
                    <TableCell>₹{Number(invoice.total ?? 0).toLocaleString('en-IN')}</TableCell>
                    <TableCell>₹{tax.toLocaleString('en-IN')}</TableCell>
                    <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/invoices/${invoice.id}`}>
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
