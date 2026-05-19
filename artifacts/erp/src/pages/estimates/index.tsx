import { useState } from "react";
import { useListEstimates, useConvertEstimateToInvoice } from "@workspace/api-client-react";
import { Link } from "wouter";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FileText, Eye, ArrowRightLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export default function EstimatesList() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  const queryParams: any = { page, limit: 50 };
  if (status !== "ALL") queryParams.status = status;

  const { data, isLoading, refetch } = useListEstimates(queryParams);
  const convertMutation = useConvertEstimateToInvoice();

  const handleConvert = async (id: string) => {
    try {
      await convertMutation.mutateAsync({ 
        id,
        data: { paymentMode: "CASH" }
      });
      toast({
        title: "Success",
        description: "Estimate converted to invoice successfully",
      });
      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to convert estimate to invoice",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const s = (status ?? "").toLowerCase();
    const label = s ? s[0]!.toUpperCase() + s.slice(1) : "—";
    switch (s) {
      case "draft": return <Badge variant="secondary">{label}</Badge>;
      case "confirmed": return <Badge variant="default" className="bg-blue-500">{label}</Badge>;
      case "converted": return <Badge variant="default" className="bg-green-500">{label}</Badge>;
      case "cancelled": return <Badge variant="destructive">{label}</Badge>;
      default: return <Badge variant="outline">{label}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Estimates</h2>
          <p className="text-muted-foreground">Manage and convert customer estimates.</p>
        </div>
        <Button asChild>
          <Link href="/estimates/new">
            <Plus className="mr-2 h-4 w-4" /> New Estimate
          </Link>
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-4 rounded-lg border">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by customer or estimate #..."
            className="pl-9 w-full bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-[200px]">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-32 text-muted-foreground">
                  No estimates found.
                </TableCell>
              </TableRow>
            ) : (
              (data?.data ?? [])
                .filter((e: any) => {
                  if (!search) return true;
                  const q = search.toLowerCase();
                  return (
                    (e.estimateNo ?? "").toLowerCase().includes(q) ||
                    (e.customerName ?? "").toLowerCase().includes(q)
                  );
                })
                .map((estimate: any) => (
                <TableRow key={estimate.id}>
                  <TableCell className="font-mono text-sm">{estimate.estimateNo || estimate.id?.slice(0,8)}</TableCell>
                  <TableCell className="font-medium">{estimate.customerName ?? "Walk-in"}</TableCell>
                  <TableCell>{estimate.createdAt ? new Date(estimate.createdAt).toLocaleDateString('en-IN') : ''}</TableCell>
                  <TableCell>₹{Number(estimate.total ?? 0).toLocaleString('en-IN')}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{estimate.type || 'Manual'}</Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(estimate.status ?? '')}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" asChild title="View">
                        <Link href={`/estimates/${estimate.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      {estimate.status !== 'converted' && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          title="Convert to Invoice"
                          onClick={() => handleConvert(estimate.id!)}
                          disabled={convertMutation.isPending}
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
