import { useState } from "react";
import { useListProducts, useGetStockLevels, useAdjustStock, useListLocations } from "@workspace/api-client-react";
import { formatVariantLabel } from "@/lib/variant-label";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function StockAdjust() {
  const { toast } = useToast();
  const [locationId, setLocationId] = useState("");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [adjustment, setAdjustment] = useState<number>(0);
  const [reason, setReason] = useState("");

  const { data: locationsResp } = useListLocations();
  const locations = locationsResp?.data ?? [];
  const { data: productsData } = useListProducts({});
  const { data: stockLevels } = useGetStockLevels({
    locationId: locationId || undefined,
  }, {
    query: {
      enabled: !!locationId && !!variantId,
      queryKey: ["stockLevels", locationId, variantId],
    }
  });

  const adjustMutation = useAdjustStock({
    mutation: {
      onSuccess: () => {
        toast({ title: "Success", description: "Stock adjusted successfully" });
        setAdjustment(0);
        setReason("");
      },
      onError: (err: any) => {
        toast({ 
          title: "Error", 
          description: err.response?.data?.message || "Failed to adjust stock",
          variant: "destructive"
        });
      }
    }
  });

  const currentStockItem = stockLevels?.data?.find(s => s.variantId === variantId);
  const currentQty = currentStockItem?.currentQty || 0;
  const newQty = currentQty + adjustment;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationId || !productId || !variantId || adjustment === 0 || !reason) {
      toast({ title: "Required", description: "Please fill all fields" });
      return;
    }

    adjustMutation.mutate({
      data: {
        locationId,
        productId,
        variantId,
        qty: adjustment,
        reason
      }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Stock Adjustment</h1>
        <p className="text-muted-foreground">Manually correct stock levels due to damage, loss, or auditing.</p>
      </div>

      <div className="max-w-2xl mx-auto">
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Adjustment Form</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
                  <Label>Product</Label>
                  <Select value={productId} onValueChange={(v) => { setProductId(v); setVariantId(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Product" />
                    </SelectTrigger>
                    <SelectContent>
                      {productsData?.data?.map(p => (
                        <SelectItem key={p.id} value={p.id ?? ""}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Variant</Label>
                <Select value={variantId} onValueChange={setVariantId} disabled={!productId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Variant" />
                  </SelectTrigger>
                  <SelectContent>
                    {productsData?.data
                      ?.find(p => p.id === productId)
                      ?.variants?.map((v, _i, all) => (
                        <SelectItem key={v.variantId} value={v.variantId ?? ""}>{formatVariantLabel(v, all)}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
                <div className="text-center">
                  <Label className="text-muted-foreground text-xs uppercase">Current Qty</Label>
                  <div className="text-xl font-bold">{currentQty}</div>
                </div>
                <div className="text-center flex flex-col items-center justify-center">
                  <Label className="text-muted-foreground text-xs uppercase">Adjustment</Label>
                  <div className="flex items-center space-x-2">
                    <span className="text-lg font-bold">{adjustment > 0 ? "+" : adjustment < 0 ? "" : ""}</span>
                    <Input 
                      type="number" 
                      className="w-20 text-center h-8 font-bold"
                      value={adjustment}
                      onChange={(e) => setAdjustment(parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="text-center">
                  <Label className="text-muted-foreground text-xs uppercase">Final Qty</Label>
                  <div className={`text-xl font-bold ${newQty < 0 ? "text-red-500" : "text-teal-600"}`}>
                    {newQty}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Reason for Adjustment</Label>
                <Textarea 
                  placeholder="e.g. Audit correction, Damaged stock, etc." 
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button 
                type="submit" 
                className="bg-amber-600 hover:bg-amber-700"
                disabled={adjustMutation.isPending || adjustment === 0}
              >
                {adjustMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Adjustment
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
  );
}
