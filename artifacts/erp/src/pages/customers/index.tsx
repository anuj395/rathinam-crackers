import { useState } from "react";
import { useListCustomers, useCreateCustomer } from "@workspace/api-client-react";
import { Link } from "wouter";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, User, MapPin, Phone, CreditCard, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { BulkIO } from "@/components/bulk-io";

export default function CustomersList() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("ALL");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const queryParams: { limit: number; search?: string; customerType?: string } = { limit: 50 };
  if (search) queryParams.search = search;
  if (type !== "ALL") queryParams.customerType = type;

  const { data, isLoading, refetch } = useListCustomers(queryParams);
  const createMutation = useCreateCustomer();

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = {
      name: formData.get("name") as string,
      phone: formData.get("phone") as string,
      email: formData.get("email") as string,
      customerType: formData.get("type") as string,
      city: formData.get("city") as string,
      gstin: (formData.get("gstin") as string) || undefined,
      creditLimit: parseFloat(formData.get("creditLimit") as string) || 0,
    };

    try {
      await createMutation.mutateAsync({ data: payload });
      toast({ title: "Success", description: "Customer created successfully" });
      setIsDialogOpen(false);
      refetch();
    } catch (error) {
      toast({ title: "Error", description: "Failed to create customer", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Customers</h2>
          <p className="text-muted-foreground">Manage your retail and wholesale customer base.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
        <BulkIO resource="customers" label="Customers" onImported={() => refetch()} />
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New Customer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleCreate}>
              <DialogHeader>
                <DialogTitle>Add New Customer</DialogTitle>
                <DialogDescription>Add a buyer to your customer list. You can manage their addresses and ledger after saving.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">Name</Label>
                  <Input id="name" name="name" className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="phone" className="text-right">Phone</Label>
                  <Input id="phone" name="phone" className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="type" className="text-right">Type</Label>
                  <Select name="type" defaultValue="RETAIL">
                    <SelectTrigger className="col-span-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RETAIL">Retail</SelectItem>
                      <SelectItem value="WHOLESALE">Wholesale</SelectItem>
                      <SelectItem value="VIP">VIP</SelectItem>
                      <SelectItem value="AGENT_CUSTOMER">Agent customer</SelectItem>
                      <SelectItem value="WALK_IN">Walk-in</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="city" className="text-right">City</Label>
                  <Input id="city" name="city" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="gstin" className="text-right">GSTIN</Label>
                  <Input id="gstin" name="gstin" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="creditLimit" className="text-right">Credit Limit</Label>
                  <Input id="creditLimit" name="creditLimit" type="number" className="col-span-3" defaultValue="0" />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Customer
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-4 rounded-lg border">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by name, phone or city..."
            className="pl-9 w-full bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-[200px]">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="RETAIL">Retail</SelectItem>
              <SelectItem value="WHOLESALE">Wholesale</SelectItem>
              <SelectItem value="VIP">VIP</SelectItem>
              <SelectItem value="AGENT_CUSTOMER">Agent customer</SelectItem>
              <SelectItem value="WALK_IN">Walk-in</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Outstanding</TableHead>
              <TableHead>Loyalty Pts</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center h-32 text-muted-foreground">
                  No customers found.
                </TableCell>
              </TableRow>
            ) : (
              data?.data?.map((customer: any) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{customer.name}</span>
                      <span className="text-xs text-muted-foreground">{customer.phone}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{customer.customerType}</Badge>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      // Source-tag styling: website orders are the highest-
                      // value acquisition channel so we surface them in
                      // green; pos = walk-in (neutral); erp = staff-entered
                      // (subdued); import = legacy migration (outline).
                      const src = (customer.source ?? 'erp') as string;
                      const tone =
                        src === 'website' ? 'bg-green-100 text-green-800 hover:bg-green-100' :
                        src === 'pos' ? 'bg-blue-100 text-blue-800 hover:bg-blue-100' :
                        src === 'import' ? 'bg-amber-100 text-amber-800 hover:bg-amber-100' :
                        'bg-muted text-muted-foreground hover:bg-muted';
                      const label = src === 'website' ? 'Online' : src === 'pos' ? 'POS' : src === 'erp' ? 'ERP' : 'Import';
                      return <Badge className={tone} variant="outline">{label}</Badge>;
                    })()}
                  </TableCell>
                  <TableCell>{customer.city || 'N/A'}</TableCell>
                  <TableCell>
                    {(() => {
                      const ob = Number(customer.outstandingBalance ?? 0);
                      return (
                        <span className={ob > 0 ? "text-destructive font-bold" : "text-green-600"}>
                          ₹{ob.toLocaleString('en-IN')}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <span className="text-green-600 font-medium">{customer.loyaltyPoints || 0}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/customers/${customer.id}`}>View</Link>
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
