import { useState } from "react";
import { 
  useListTransfers, 
  useListPendingTransfers, 
  useDispatchTransfer, 
  useReceiveTransfer 
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Send, PackageCheck, ArrowRightLeft, Clock, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function TransfersList() {
  const [activeTab, setActiveTab] = useState("pending");
  const { toast } = useToast();

  const { data: pendingData, isLoading: loadingPending, refetch: refetchPending } = useListPendingTransfers();
  const { data: allData, isLoading: loadingAll, refetch: refetchAll } = useListTransfers({ limit: 50 });
  
  const dispatchMutation = useDispatchTransfer();
  const receiveMutation = useReceiveTransfer();

  const handleDispatch = async (id: string) => {
    try {
      await dispatchMutation.mutateAsync({ id, data: {} });
      toast({ title: "Success", description: "Transfer dispatched successfully" });
      refetchPending();
      refetchAll();
    } catch (error) {
      toast({ title: "Error", description: "Failed to dispatch transfer", variant: "destructive" });
    }
  };

  const handleReceive = async (transfer: { id?: string; items?: Array<{ productId?: string; variantId?: string; qty?: number }> }) => {
    if (!transfer.id) return;
    const items = (transfer.items ?? [])
      .filter((it) => it.productId && it.variantId)
      .map((it) => ({
        productId: it.productId as string,
        variantId: it.variantId as string,
        receivedQty: Number(it.qty ?? 0),
      }));
    try {
      await receiveMutation.mutateAsync({ id: transfer.id, data: { items } });
      toast({ title: "Success", description: "Transfer received successfully" });
      refetchPending();
      refetchAll();
    } catch (error) {
      toast({ title: "Error", description: "Failed to receive transfer", variant: "destructive" });
    }
  };

  const getStatusBadge = (status: string) => {
    const label = (status ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    switch (status) {
      case "draft": return <Badge variant="outline">{label}</Badge>;
      case "pending_approval": return <Badge variant="secondary">{label}</Badge>;
      case "in_transit": return <Badge variant="default" className="bg-blue-500">{label}</Badge>;
      case "received": return <Badge variant="default" className="bg-green-500">{label}</Badge>;
      case "cancelled": return <Badge variant="destructive">{label}</Badge>;
      default: return <Badge variant="outline">{label || status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Stock Transfers</h2>
          <p className="text-muted-foreground">Move inventory between warehouses and retail shops.</p>
        </div>
        <Button asChild>
          <Link href="/transfers/new">
            <Plus className="mr-2 h-4 w-4" /> New Transfer
          </Link>
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="h-4 w-4" /> Pending Transfers
          </TabsTrigger>
          <TabsTrigger value="all" className="flex items-center gap-2">
            <History className="h-4 w-4" /> All Transfers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          <div className="border rounded-md bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From Location</TableHead>
                  <TableHead>To Location</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPending ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5}><Skeleton className="h-4 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : pendingData?.data?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No pending transfers.
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingData?.data?.map((transfer: any) => (
                    <TableRow key={transfer.id}>
                      <TableCell className="font-medium">{transfer.fromLocationName}</TableCell>
                      <TableCell className="font-medium">{transfer.toLocationName}</TableCell>
                      <TableCell>{transfer.items?.length || 0} items</TableCell>
                      <TableCell>{new Date(transfer.createdAt).toLocaleDateString('en-IN')}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleDispatch(transfer.id)}
                            disabled={dispatchMutation.isPending}
                          >
                            <Send className="mr-2 h-4 w-4" /> Dispatch
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleReceive(transfer)}
                            disabled={receiveMutation.isPending}
                          >
                            <PackageCheck className="mr-2 h-4 w-4" /> Receive
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          <div className="border rounded-md bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingAll ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : allData?.data?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No transfers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  allData?.data?.map((transfer: any) => (
                    <TableRow key={transfer.id}>
                      <TableCell>{transfer.fromLocationName}</TableCell>
                      <TableCell>{transfer.toLocationName}</TableCell>
                      <TableCell>{transfer.itemsCount || transfer.items?.length || 0}</TableCell>
                      <TableCell>{getStatusBadge(transfer.status)}</TableCell>
                      <TableCell>{new Date(transfer.createdAt).toLocaleDateString('en-IN')}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/transfers/${transfer.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
