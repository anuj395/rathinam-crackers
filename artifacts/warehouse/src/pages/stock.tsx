import { useState, useEffect } from "react";
import { useGetStockLevels, useListLocations } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Search, Loader2 } from "lucide-react";

export default function StockLevels() {
  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useState<string>("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const { data: locationsResp } = useListLocations();
  const locations = locationsResp?.data ?? [];

  // Default to the first real location once data arrives.
  useEffect(() => {
    if (locations.length > 0) {
      setLocationId((prev) => (prev === "all" ? (locations[0].id ?? "all") : prev));
    }
  }, [locations]);

  const { data: stockData, isLoading } = useGetStockLevels({
    locationId: locationId === "all" ? undefined : locationId,
    lowStockOnly: lowStockOnly || undefined
  });

  const filteredStock = stockData?.data?.filter(item => 
    (item.productName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (item.productCode ?? "").toLowerCase().includes(search.toLowerCase())
  ) || [];

  const getStatusBadge = (qty: number, reorderLevel: number) => {
    if (qty <= 0) return <Badge variant="destructive">Critical</Badge>;
    if (qty <= reorderLevel) return <Badge variant="outline" className="bg-amber-500 text-white">Low</Badge>;
    return <Badge variant="secondary" className="bg-green-500 text-white hover:bg-green-600">OK</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock Levels</h1>
          <p className="text-muted-foreground">Monitor inventory levels across all locations.</p>
        </div>
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
            <div className="flex items-center space-x-2 py-3">
              <Switch 
                id="low-stock" 
                checked={lowStockOnly} 
                onCheckedChange={setLowStockOnly} 
              />
              <Label htmlFor="low-stock">Low Stock Only</Label>
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
                  <TableHead>Code</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Qty on Hand</TableHead>
                  <TableHead className="text-right">Reorder Level</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStock.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs">{item.productCode}</TableCell>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell>{item.variantSize}</TableCell>
                    <TableCell>{item.locationName}</TableCell>
                    <TableCell className="text-right font-bold">{item.currentQty}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{item.reorderLevel}</TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(item.currentQty || 0, item.reorderLevel || 0)}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredStock.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No stock items found matching your filters.
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
