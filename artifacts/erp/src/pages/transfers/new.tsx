import { useState, useEffect } from "react";
import { formatVariantLabel } from "@/lib/variant-label";
import { apiFetch } from "../../lib/api";
import { 
  useListProducts, 
  useCreateTransfer 
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Loader2, MapPin, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function NewTransfer() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [locations, setLocations] = useState<any[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [fromLocationId, setFromLocationId] = useState<string>("");
  const [toLocationId, setToLocationId] = useState<string>("");
  const [items, setItems] = useState<any[]>([]);

  const { data: products } = useListProducts({ limit: 1000 });
  const createMutation = useCreateTransfer();

  useEffect(() => {
    const fetchLocations = async () => {
      setLoadingLocations(true);
      try {
        const token = localStorage.getItem("erp_token");
        const res = await apiFetch("/api/v1/locations", {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setLocations(data.data || []);
      } catch (err) {
        toast({ title: "Error", description: "Failed to load locations", variant: "destructive" });
      } finally {
        setLoadingLocations(false);
      }
    };
    fetchLocations();
  }, []);

  const addItem = () => {
    setItems([...items, { productId: "", variantId: "", qty: 1 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromLocationId || !toLocationId) {
      toast({ title: "Error", description: "Please select both locations", variant: "destructive" });
      return;
    }
    if (fromLocationId === toLocationId) {
      toast({ title: "Error", description: "Source and destination must be different", variant: "destructive" });
      return;
    }
    if (items.length === 0) {
      toast({ title: "Error", description: "Please add at least one item", variant: "destructive" });
      return;
    }

    try {
      await createMutation.mutateAsync({
        data: {
          fromLocationId,
          toLocationId,
          items: items.map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            qty: item.qty
          }))
        }
      });
      toast({ title: "Success", description: "Transfer request created successfully" });
      setLocation("/transfers");
    } catch (error) {
      toast({ title: "Error", description: "Failed to create transfer", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight">New Stock Transfer</h2>
        <Button variant="outline" onClick={() => setLocation("/transfers")}>Cancel</Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Locations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2 items-center">
              <div className="space-y-2">
                <Label>From Location (Source)</Label>
                <Select value={fromLocationId} onValueChange={setFromLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc: any) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name} ({loc.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-center md:pt-6">
                <ArrowRight className="h-6 w-6 text-muted-foreground hidden md:block" />
              </div>
              <div className="space-y-2">
                <Label>To Location (Destination)</Label>
                <Select value={toLocationId} onValueChange={setToLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc: any) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name} ({loc.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Transfer Items</CardTitle>
            <Button type="button" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4 mr-2" /> Add Product
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Product</TableHead>
                  <TableHead className="w-[40%]">Variant</TableHead>
                  <TableHead className="w-[15%]">Qty</TableHead>
                  <TableHead className="w-[5%]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Select 
                        value={item.productId} 
                        onValueChange={(val) => updateItem(index, "productId", val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products?.data?.map((p: any) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select 
                        value={item.variantId} 
                        onValueChange={(val) => updateItem(index, "variantId", val)}
                        disabled={!item.productId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Variant" />
                        </SelectTrigger>
                        <SelectContent>
                          {(() => {
                            const all = products?.data?.find((p: any) => p.id === item.productId)?.variants ?? [];
                            return all.map((v: any) => (
                              <SelectItem key={v.variantId ?? v.id} value={v.variantId ?? v.id}>
                                {formatVariantLabel(v, all)}
                              </SelectItem>
                            ));
                          })()}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input 
                        type="number" 
                        min="1" 
                        value={item.qty} 
                        onChange={(e) => updateItem(index, "qty", parseInt(e.target.value) || 1)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => removeItem(index)} className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No products added. Click "Add Product" to define items to move.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/transfers")}>Cancel</Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Transfer Request
          </Button>
        </div>
      </form>
    </div>
  );
}
