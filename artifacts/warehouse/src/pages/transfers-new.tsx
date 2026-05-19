import { useState } from "react";
import { useListProducts, useCreateTransfer, useListLocations } from "@workspace/api-client-react";
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
import { Plus, Trash2, Send, Loader2, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";

interface TransferItem {
  productId: string;
  variantId: string;
  quantity: number;
}

export default function NewTransfer() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [items, setItems] = useState<TransferItem[]>([]);
  const { data: locationsResp } = useListLocations();
  const locations = locationsResp?.data ?? [];

  const { data: productsData } = useListProducts({});
  const createMutation = useCreateTransfer({
    mutation: {
      onSuccess: () => {
        toast({ title: "Transfer Created", description: "Internal transfer request has been logged" });
        setLocation("/transfers");
      },
      onError: (err: any) => {
        toast({ 
          title: "Error", 
          description: err.response?.data?.message || "Failed to create transfer",
          variant: "destructive"
        });
      }
    }
  });

  const addItem = () => {
    setItems([...items, { productId: "", variantId: "", quantity: 1 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof TransferItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    if (field === "productId") {
      const product = productsData?.data?.find(p => p.id === value);
      if (product && product.variants && product.variants.length > 0) {
        newItems[index].variantId = product.variants[0].variantId ?? "";
      }
    }
    setItems(newItems);
  };

  const handleSubmit = () => {
    if (!fromLocationId || !toLocationId) {
      toast({ title: "Required", description: "Select source and destination locations" });
      return;
    }
    if (fromLocationId === toLocationId) {
      toast({ title: "Invalid", description: "Source and destination cannot be the same" });
      return;
    }
    if (items.length === 0) {
      toast({ title: "Required", description: "Add at least one item" });
      return;
    }

    createMutation.mutate({
      data: {
        fromLocationId,
        toLocationId,
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
      <div className="flex items-center space-x-4">
        <Link href="/transfers">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Stock Transfer</h1>
          <p className="text-muted-foreground">Move inventory between locations.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Route</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>From Location</Label>
              <Select value={fromLocationId} onValueChange={setFromLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map(loc => (
                    <SelectItem key={loc.id} value={loc.id ?? ""}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>To Location</Label>
              <Select value={toLocationId} onValueChange={setToLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Destination" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map(loc => (
                    <SelectItem key={loc.id} value={loc.id ?? ""}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Transfer Items</CardTitle>
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4 mr-2" /> Add Item
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[45%]">Product</TableHead>
                  <TableHead className="w-[30%]">Variant</TableHead>
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
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter className="flex justify-end border-t pt-6">
            <Button 
              className="bg-blue-600 hover:bg-blue-700" 
              onClick={handleSubmit}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Create Transfer
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
