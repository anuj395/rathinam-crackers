import { useState, useEffect } from "react";
import { formatVariantLabel } from "@/lib/variant-label";
import { 
  useListCustomers, 
  useListAgents, 
  useListProducts, 
  useResolveProductPrice, 
  useCreateEstimate,
  type Product,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Calculator, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function NewEstimate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [customerId, setCustomerId] = useState<string>("");
  const [agentId, setAgentId] = useState<string>("");
  const [notes, setNotes] = useState("");
  type EstimateLine = {
    productId: string;
    variantId: string;
    qty: number;
    unitPrice: number;
    total: number;
    variantLabel: string;
    tier?: string;
  };
  const [items, setItems] = useState<EstimateLine[]>([]);

  const { data: customers } = useListCustomers({ limit: 100 });
  const { data: agents } = useListAgents({ limit: 100 });
  const { data: products } = useListProducts({ limit: 1000 });

  const createEstimateMutation = useCreateEstimate();

  const addItem = () => {
    setItems([...items, { productId: "", variantId: "", qty: 1, unitPrice: 0, total: 0, variantLabel: "", tier: "" }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const replaceItem = (index: number, value: EstimateLine) => {
    const newItems = [...items];
    newItems[index] = value;
    setItems(newItems);
  };

  const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);
  const gst = subtotal * 0.18;
  const total = subtotal + gst;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      toast({ title: "Error", description: "Please select a customer", variant: "destructive" });
      return;
    }
    if (items.length === 0) {
      toast({ title: "Error", description: "Please add at least one item", variant: "destructive" });
      return;
    }

    try {
      await createEstimateMutation.mutateAsync({
        data: {
          type: "RETAIL",
          customerId,
          agentId: agentId || undefined,
          items: items.map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            qty: item.qty
          })),
          notes,
        }
      });
      toast({ title: "Success", description: "Estimate created successfully" });
      setLocation("/estimates");
    } catch (error) {
      toast({ title: "Error", description: "Failed to create estimate", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight">New Estimate</h2>
        <Button variant="outline" onClick={() => setLocation("/estimates")}>Cancel</Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Customer Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer">Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers?.data?.map((c) => (
                      <SelectItem key={c.id} value={c.id!}>{c.name} ({c.customerType})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent">Agent (Optional)</Label>
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents?.data?.map((a) => (
                      <SelectItem key={a.id} value={a.id!}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Validity & Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea 
                  id="notes" 
                  placeholder="Additional terms or notes..." 
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
                  <TableHead className="w-[100px]">Qty</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <LineItemRow 
                    key={index} 
                    item={item} 
                    products={products?.data || []}
                    customerId={customerId}
                    onChange={(updatedItem: EstimateLine) => replaceItem(index, updatedItem)}
                    onRemove={() => removeItem(index)}
                  />
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No items added. Click "Add Item" to begin.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="mt-6 flex flex-col items-end space-y-2">
              <div className="flex justify-between w-[300px] text-sm">
                <span>Subtotal:</span>
                <span className="font-medium">₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between w-[300px] text-sm text-muted-foreground">
                <span>GST (18%):</span>
                <span>₹{gst.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between w-[300px] text-lg font-bold border-t pt-2">
                <span>Total:</span>
                <span className="text-primary">₹{total.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/estimates")}>Cancel</Button>
          <Button type="submit" disabled={createEstimateMutation.isPending}>
            {createEstimateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Estimate
          </Button>
        </div>
      </form>
    </div>
  );
}

type LineItemRowProps = {
  item: {
    productId: string;
    variantId: string;
    qty: number;
    unitPrice: number;
    total: number;
    variantLabel: string;
    tier?: string;
  };
  products: Product[];
  customerId: string;
  onChange: (updated: LineItemRowProps["item"]) => void;
  onRemove: () => void;
};

function LineItemRow({ item, products, customerId, onChange, onRemove }: LineItemRowProps) {
  const selectedProduct = products.find((p) => p.id === item.productId);
  
  const { data: priceData, isFetching: isResolving } = useResolveProductPrice(
    item.productId,
    { 
      variantId: item.variantId,
      customerId,
      qty: item.qty,
      channel: "estimate",
    },
    { query: { enabled: !!(item.productId && item.variantId && customerId), queryKey: ["resolvePrice", item.productId, item.variantId, item.qty, customerId] } }
  );

  useEffect(() => {
    if (priceData?.data) {
      const unitPrice = priceData.data.resolvedPrice ?? 0;
      onChange({ 
        ...item, 
        unitPrice, 
        total: unitPrice * item.qty,
        tier: priceData.data.tier
      });
    }
  }, [priceData]);

  return (
    <TableRow>
      <TableCell>
        <Select 
          value={item.productId} 
          onValueChange={(val) => onChange({ ...item, productId: val, variantId: "", unitPrice: 0, total: 0 })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select Product" />
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id!}>{p.name} ({p.code})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select 
          value={item.variantId} 
          onValueChange={(val) => onChange({ ...item, variantId: val })}
          disabled={!item.productId}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select Variant" />
          </SelectTrigger>
          <SelectContent>
            {selectedProduct?.variants?.map((v, _i, all) => (
              <SelectItem key={v.variantId} value={v.variantId!}>{formatVariantLabel(v, all)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input 
          type="number" 
          min="1" 
          value={item.qty} 
          onChange={(e) => onChange({ ...item, qty: parseInt(e.target.value) || 1 })}
        />
      </TableCell>
      <TableCell>
        {isResolving ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="flex flex-col">
            <span>₹{item.unitPrice?.toLocaleString('en-IN')}</span>
            {item.tier && <span className="text-[10px] text-accent font-bold uppercase">{item.tier}</span>}
          </div>
        )}
      </TableCell>
      <TableCell className="font-medium">
        ₹{item.total?.toLocaleString('en-IN')}
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="sm" onClick={onRemove} className="text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
