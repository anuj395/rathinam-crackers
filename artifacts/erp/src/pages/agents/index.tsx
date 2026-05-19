import { useState } from "react";
import { useListAgents, useCreateAgent } from "@workspace/api-client-react";
import { Link } from "wouter";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, UserRound, Phone, Ticket, Percent, Target, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { BulkIO } from "@/components/bulk-io";

export default function AgentsList() {
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data, isLoading, refetch } = useListAgents({ search });
  const createMutation = useCreateAgent();

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = {
      name: formData.get("name") as string,
      phone: formData.get("phone") as string,
      promoCode: formData.get("promoCode") as string,
      maxDiscountPct: parseFloat(formData.get("maxDiscountPct") as string) || 0,
      monthlyTarget: parseFloat(formData.get("monthlyTarget") as string) || 0,
      commissionTiers: [] // Basic default
    };

    try {
      await createMutation.mutateAsync({ data: payload });
      toast({ title: "Success", description: "Agent added successfully" });
      setIsDialogOpen(false);
      refetch();
    } catch (error) {
      toast({ title: "Error", description: "Failed to add agent", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Sales Agents</h2>
          <p className="text-muted-foreground">Manage agents, promo codes, and commission structures.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
        <BulkIO resource="agents" label="Agents" onImported={() => refetch()} />
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New Agent
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleCreate}>
              <DialogHeader>
                <DialogTitle>Add New Sales Agent</DialogTitle>
                <DialogDescription>Add a sales agent who will earn commission on orders they bring in.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">Full Name</Label>
                  <Input id="name" name="name" className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="phone" className="text-right">Phone</Label>
                  <Input id="phone" name="phone" className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="promoCode" className="text-right">Promo Code</Label>
                  <Input id="promoCode" name="promoCode" className="col-span-3" required placeholder="e.g. AGENT10" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="maxDiscountPct" className="text-right">Max Discount %</Label>
                  <Input id="maxDiscountPct" name="maxDiscountPct" type="number" step="0.1" className="col-span-3" defaultValue="10" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="monthlyTarget" className="text-right">Monthly Target</Label>
                  <Input id="monthlyTarget" name="monthlyTarget" type="number" className="col-span-3" defaultValue="100000" />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Agent
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search agents by name or code..."
          className="pl-9 w-full bg-background"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent Name</TableHead>
              <TableHead>Promo Code</TableHead>
              <TableHead>Max Disc%</TableHead>
              <TableHead>Monthly Target</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-32 text-muted-foreground">
                  No agents found.
                </TableCell>
              </TableRow>
            ) : (
              data?.data?.map((agent: any) => (
                <TableRow key={agent.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{agent.name}</span>
                      <span className="text-xs text-muted-foreground">{agent.phone}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="bg-muted px-2 py-0.5 rounded text-xs font-bold">{agent.promoCode}</code>
                  </TableCell>
                  <TableCell>{agent.maxDiscountPct}%</TableCell>
                  <TableCell>₹{agent.monthlyTarget?.toLocaleString('en-IN')}</TableCell>
                  <TableCell>
                    <Badge variant={agent.status === 'Active' ? 'default' : 'secondary'}>{agent.status || 'Active'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/agents/${agent.id}`}>View</Link>
                    </Button>
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
