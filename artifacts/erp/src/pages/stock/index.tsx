import { useState } from "react";
import { useGetStockLevels } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Stock() {
  const [search, setSearch] = useState("");
  const { data: stock, isLoading } = useGetStockLevels({ productId: search || undefined });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Stock Levels</h2>
          <p className="text-muted-foreground">Current inventory across all locations.</p>
        </div>
      </div>

      <div className="flex items-center bg-card p-4 rounded-lg border">
        <div className="relative flex-1 w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by Product ID..."
            className="pl-9 w-full bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Location</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Variant</TableHead>
              <TableHead className="text-right">Current Qty</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : stock?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-32 text-muted-foreground">
                  No stock records found.
                </TableCell>
              </TableRow>
            ) : (
              stock?.data?.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>{item.locationName}</TableCell>
                  <TableCell className="font-medium">
                    {item.productName} <span className="text-xs text-muted-foreground">({item.productCode})</span>
                  </TableCell>
                  <TableCell>{item.variantSize}</TableCell>
                  <TableCell className="text-right font-bold">{item.currentQty}</TableCell>
                  <TableCell className="text-right">
                    {item.isLow ? (
                      <Badge variant="destructive" className="rounded-sm">Low Stock</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded-sm border-0">Adequate</Badge>
                    )}
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
