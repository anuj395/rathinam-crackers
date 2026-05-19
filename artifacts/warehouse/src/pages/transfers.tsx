import { useState, useEffect } from "react";
import { useListPendingTransfers, useListTransfers, useDispatchTransfer, useReceiveTransfer } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { ArrowRight, Package, Truck, CheckCircle2, Loader2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function Transfers() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("pending");

  const { data: pendingTransfers, refetch: refetchPending } = useListPendingTransfers({});
  const { data: allTransfers } = useListTransfers({});

  const dispatchMutation = useDispatchTransfer({
    mutation: {
      onSuccess: () => {
        toast({ title: "Dispatched", description: "Transfer has been marked as dispatched" });
        refetchPending();
      }
    }
  });

  const receiveMutation = useReceiveTransfer({
    mutation: {
      onSuccess: () => {
        toast({ title: "Received", description: "Transfer has been received and stock updated" });
        refetchPending();
      }
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock Transfers</h1>
          <p className="text-muted-foreground">Manage stock movements between warehouses and shops.</p>
        </div>
        <Link href="/transfers/new">
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" /> New Transfer
          </Button>
        </Link>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="pending">Pending ({pendingTransfers?.data?.length || 0})</TabsTrigger>
          <TabsTrigger value="all">All Transfers</TabsTrigger>
        </TabsList>
        
        <TabsContent value="pending" className="mt-6">
          <div className="grid gap-4">
            {pendingTransfers?.data?.map((transfer) => (
              <Card key={transfer.id}>
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center space-x-4">
                      <div className="p-3 bg-blue-50 rounded-full text-blue-600">
                        <Package className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold">{transfer.fromLocationName}</span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <span className="font-bold">{transfer.toLocationName}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {transfer.items?.length ?? 0} items
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className="mr-4 capitalize">{(transfer.status ?? "").toLowerCase()}</Badge>
                      {transfer.status === "draft" && (
                        <Button 
                          size="sm" 
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={() => dispatchMutation.mutate({ id: transfer.id ?? "", data: {} })}
                          disabled={dispatchMutation.isPending}
                        >
                          <Truck className="h-4 w-4 mr-2" /> Dispatch
                        </Button>
                      )}
                      {transfer.status === "in_transit" && (
                        <Button 
                          size="sm" 
                          className="bg-teal-600 hover:bg-teal-700 text-white"
                          onClick={() => receiveMutation.mutate({
                            id: transfer.id ?? "",
                            data: {
                              items: (transfer.items ?? [])
                                .filter((it) => it.productId && it.variantId)
                                .map((it) => ({
                                  productId: it.productId as string,
                                  variantId: it.variantId as string,
                                  receivedQty: Number(it.qty ?? 0),
                                })),
                            },
                          })}
                          disabled={receiveMutation.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" /> Receive
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {pendingTransfers?.data?.length === 0 && (
              <div className="text-center py-12 bg-white rounded-lg border border-dashed">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium">No pending transfers</h3>
                <p className="text-muted-foreground">All stock movements are completed.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="all" className="mt-6">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allTransfers?.data?.map((transfer) => (
                    <TableRow key={transfer.id}>
                      <TableCell className="text-sm">
                        {transfer.createdAt ? new Date(transfer.createdAt).toLocaleDateString() : ''}
                      </TableCell>
                      <TableCell>{transfer.fromLocationName}</TableCell>
                      <TableCell>{transfer.toLocationName}</TableCell>
                      <TableCell>{transfer.items?.length ?? 0}</TableCell>
                      <TableCell>
                        <Badge variant={
                          transfer.status === 'received' ? 'default' : 
                          transfer.status === 'in_transit' ? 'secondary' : 
                          'outline'
                        }>
                          {transfer.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
