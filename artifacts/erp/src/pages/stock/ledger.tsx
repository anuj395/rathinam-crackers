import { useState } from "react";
import { useGetStockLedger } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function StockLedger() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("ALL");

  const queryParams: any = { limit: 100 };
  if (search) queryParams.productId = search;
  if (type !== "ALL") queryParams.type = type;

  const { data: ledger, isLoading } = useGetStockLedger(queryParams);

  const getBadgeVariant = (txType: string) => {
    switch (txType) {
      case "IN": return "default";
      case "OUT": return "secondary";
      case "MOVE": return "outline";
      case "DAMAGE": return "destructive";
      case "ADJUST": return "outline";
      default: return "secondary";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Stock Ledger</h2>
          <p className="text-muted-foreground">Immutable record of all inventory movements.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-4 rounded-lg border">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by Product ID..."
            className="pl-9 w-full bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-[200px]">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Transaction Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="IN">IN</SelectItem>
              <SelectItem value="OUT">OUT</SelectItem>
              <SelectItem value="MOVE">MOVE</SelectItem>
              <SelectItem value="ADJUST">ADJUST</SelectItem>
              <SelectItem value="DAMAGE">DAMAGE</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Qty Change</TableHead>
              <TableHead>Reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                </TableRow>
              ))
            ) : ledger?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-32 text-muted-foreground">
                  No ledger entries found.
                </TableCell>
              </TableRow>
            ) : (
              ledger?.data?.map((entry, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {entry.ts ? format(new Date(entry.ts), "yyyy-MM-dd HH:mm:ss") : "-"}
                  </TableCell>
                  <TableCell className="font-medium">
                    {entry.productName} <span className="text-xs text-muted-foreground">({entry.productId})</span>
                  </TableCell>
                  <TableCell>{entry.locationId}</TableCell>
                  <TableCell>
                    <Badge variant={getBadgeVariant(entry.type || "") as any} className="rounded-sm">
                      {entry.type}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-right font-bold ${entry.qty && entry.qty > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {entry.qty && entry.qty > 0 ? "+" : ""}{entry.qty}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {entry.refType} {entry.refId ? `#${entry.refId.substring(0, 8)}` : ""}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
