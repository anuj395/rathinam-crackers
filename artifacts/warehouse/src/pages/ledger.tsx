import { useState } from "react";
import { useGetStockLedger, useListLocations } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, Loader2 } from "lucide-react";

export default function StockLedger() {
  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const { data: locationsResp } = useListLocations();
  const locations = locationsResp?.data ?? [];

  const { data: ledgerData, isLoading } = useGetStockLedger({
    locationId: locationId === "all" ? undefined : locationId,
    type: type === "all" ? undefined : type,
  });
  const searchLower = search.trim().toLowerCase();
  const filteredEntries = (ledgerData?.data ?? []).filter((entry) => {
    if (!searchLower) return true;
    const name = (entry.productName ?? "").toLowerCase();
    const variant = (entry.variantId ?? "").toLowerCase();
    return name.includes(searchLower) || variant.includes(searchLower);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Stock Ledger</h1>
        <p className="text-muted-foreground">Historical record of all stock movements.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 items-end">
            <div className="space-y-2">
              <Label>Search Product</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Name or code..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations.map(loc => (
                    <SelectItem key={loc.id} value={loc.id ?? ""}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Movement Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="INWARD">Inward</SelectItem>
                  <SelectItem value="OUTWARD">Outward</SelectItem>
                  <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
                  <SelectItem value="TRANSFER">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry) => (
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
                    <TableCell>{entry.locationId}</TableCell>
                    <TableCell className={`text-right font-bold ${(entry.qty ?? 0) > 0 ? "text-green-600" : "text-red-600"}`}>
                      {(entry.qty ?? 0) > 0 ? "+" : ""}{entry.qty ?? 0}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                      {entry.refId || "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {entry.refType}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredEntries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      No ledger entries found matching your criteria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
