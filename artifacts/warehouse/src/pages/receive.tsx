import { useState, useEffect } from "react";
import { useListProducts, useReceiveStock, useListLocations } from "@workspace/api-client-react";
import { formatVariantLabel } from "@/lib/variant-label";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Plus, Trash2, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LineItem {
  productId: string;
  variantId: string;
  quantity: number;
  notes?: string;
  productName?: string;
  variantName?: string;
}

export default function ReceiveStock() {
  const { toast } = useToast();
  const [locationId, setLocationId] = useState("");
  const [reference, setReference] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const { data: locationsResp } = useListLocations();
  const locations = locationsResp?.data ?? [];

  const { data: productsData } = useListProducts({});
  const receiveMutation = useReceiveStock({
    mutation: {
      onSuccess: () => {
        toast({ title: "Success", description: "Stock received successfully" });
        setItems([]);
        setReference("");
      },
      onError: (err: any) => {
        toast({ 
          title: "Error", 
          description: err.response?.data?.message || "Failed to receive stock",
          variant: "destructive"
        });
      }
    }
  });

  // Default-select the first warehouse once locations arrive.
  useEffect(() => {
    if (locations.length === 0) return;
    const wh = locations.find((l: any) => l.type === "warehouse") ?? locations[0];
    setLocationId((prev) => prev || (wh.id ?? ""));
  }, [locations]);

  const addItem = () => {
    setItems([...items, { productId: "", variantId: "", quantity: 1 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof LineItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    if (field === "productId") {
      const product = productsData?.data?.find(p => p.id === value);
      if (product && product.variants && product.variants.length > 0) {
        newItems[index].variantId = product.variants[0].variantId ?? "";
        newItems[index].productName = product.name;
        newItems[index].variantName = product.variants[0].size;
      }
    }
    
    setItems(newItems);
  };

  const handleSubmit = () => {
    if (!locationId) {
      toast({ title: "Required", description: "Select a location" });
      return;
    }
    if (items.length === 0) {
      toast({ title: "Required", description: "Add at least one item" });
      return;
    }
    if (items.some(i => !i.productId || !i.variantId || i.quantity <= 0)) {
      toast({ title: "Invalid Items", description: "Please fill all item details correctly" });
      return;
    }

    receiveMutation.mutate({
      data: {
        purchaseOrderId: reference || "manual",
        warehouseId: locationId,
        items: items.map(i => ({
          productId: i.productId,
          variantId: i.variantId,
          qty: i.quantity,
        }))
      }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Receive Stock</h1>
        <p className="text-muted-foreground">Log incoming inventory from suppliers or production.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Receive Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map(loc => (
                    <SelectItem key={loc.id} value={loc.id ?? ""}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reference (Optional)</Label>
              <Input 
                placeholder="PO# or Delivery Note" 
                value={reference} 
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Line Items</CardTitle>
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4 mr-2" /> Add Row
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Product</TableHead>
                  <TableHead className="w-[25%]">Variant</TableHead>
                  <TableHead className="w-[15%]">Qty</TableHead>
                  <TableHead className="w-[10%]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Select 
                        value={item.productId} 
                        onValueChange={(v) => updateItem(idx, "productId", v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Product" />
                        </SelectTrigger>
                        <SelectContent>
                          {productsData?.data?.map(p => (
                            <SelectItem key={p.id} value={p.id ?? ""}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select 
                        value={item.variantId} 
                        onValueChange={(v) => updateItem(idx, "variantId", v)}
                        disabled={!item.productId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Variant" />
                        </SelectTrigger>
                        <SelectContent>
                          {productsData?.data
                            ?.find(p => p.id === item.productId)
                            ?.variants?.map((v, _i, all) => (
                              <SelectItem key={v.variantId} value={v.variantId ?? ""}>{formatVariantLabel(v, all)}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input 
                        type="number" 
                        min="1" 
                        value={item.quantity} 
                        onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value))}
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No items added yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter className="flex justify-end border-t pt-6">
            <Button 
              className="bg-teal-600 hover:bg-teal-700" 
              onClick={handleSubmit}
              disabled={receiveMutation.isPending}
            >
              {receiveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Confirm Receipt
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
