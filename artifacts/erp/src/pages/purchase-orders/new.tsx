import { useState } from "react";
import { formatVariantLabel } from "@/lib/variant-label";
import { 
  useListSuppliers, 
  useListProducts, 
  useListLocations,
  useCreatePurchaseOrder,
  type Location,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Loader2, IndianRupee } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function NewPurchaseOrder() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [supplierId, setSupplierId] = useState<string>("");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<any[]>([]);

  const { data: suppliers } = useListSuppliers({ limit: 100 });
  const { data: products } = useListProducts({ limit: 1000 });
  const { data: locations } = useListLocations();

  const createMutation = useCreatePurchaseOrder();

  const addItem = () => {
    setItems([...items, { productId: "", variantId: "", qty: 1, unitCost: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const total = items.reduce((sum, item) => sum + (item.qty * item.unitCost), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      toast({ title: "Error", description: "Please select a supplier", variant: "destructive" });
      return;
    }
    if (!warehouseId) {
      toast({ title: "Error", description: "Please select a destination warehouse", variant: "destructive" });
      return;
    }
    if (items.length === 0) {
      toast({ title: "Error", description: "Please add at least one item", variant: "destructive" });
      return;
    }

    try {
      await createMutation.mutateAsync({
        data: {
          supplierId,
          warehouseId,
          expectedDate: expectedDelivery || undefined,
          notes,
          items: items.map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            orderedQty: item.qty,
            unitPrice: item.unitCost,
          }))
        }
      });
      toast({ title: "Success", description: "Purchase order created successfully" });
      setLocation("/purchase-orders");
    } catch (error) {
      toast({ title: "Error", description: "Failed to create purchase order", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight">New Purchase Order</h2>
        <Button variant="outline" onClick={() => setLocation("/purchase-orders")}>Cancel</Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Supplier & Delivery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="supplier">Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers?.data?.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse">Destination Warehouse</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations?.data?.map((l: Location) => (
                      <SelectItem key={l.id} value={l.id ?? ""}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="delivery">Expected Delivery</Label>
                <Input 
                  id="delivery" 
                  type="date" 
                  value={expectedDelivery} 
                  onChange={(e) => setExpectedDelivery(e.target.value)} 
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Additional Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="notes">Notes / Instructions</Label>
                <Textarea 
                  id="notes" 
                  placeholder="Special instructions for supplier..." 
                  className="min-h-[120px]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Line Items</CardTitle>
            <Button type="button" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4 mr-2" /> Add Item
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Product</TableHead>
                  <TableHead className="w-[200px]">Variant</TableHead>
                  <TableHead className="w-[120px]">Qty</TableHead>
                  <TableHead className="w-[150px]">Unit Cost (₹)</TableHead>
                  <TableHead>Subtotal</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
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
                          <SelectValue placeholder="Product" />
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
                          <SelectValue placeholder="Variant" />
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
                      <Input 
                        type="number" 
                        min="0" 
                        step="0.01"
                        value={item.unitCost} 
                        onChange={(e) => updateItem(index, "unitCost", parseFloat(e.target.value) || 0)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      ₹{(item.qty * item.unitCost).toLocaleString('en-IN')}
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
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No items added. Click "Add Item" to begin stock procurement.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="mt-6 flex flex-col items-end border-t pt-4">
              <div className="flex justify-between w-[300px] text-lg font-bold">
                <span>Total Amount:</span>
                <span className="text-primary">₹{total.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/purchase-orders")}>Cancel</Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Purchase Order
          </Button>
        </div>
      </form>
    </div>
  );
}
