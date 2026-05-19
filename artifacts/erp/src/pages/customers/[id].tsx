import { useState, useEffect } from "react";
import { apiFetch } from "../../lib/api";
import {
  useGetCustomer,
  useGetCustomerStatement,
  useGetCustomerLoyalty,
  useRecordCustomerPayment,
} from "@workspace/api-client-react";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Phone, Mail, MapPin, Building, Wallet, Loader2, FileText, Heart,
  ShoppingBag, UserCircle, Globe, Store, ClipboardList,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// One-shot fetch for the aggregated detail bundle. Hand-rolled because the
// generated react-query hooks don't yet cover the new endpoint and adding it
// to the shared schema for one consumer wasn't worth a codegen cycle.
type RelatedBundle = {
  customer: any;
  invoices: any[];
  estimates: any[];
  addresses: any[];
  wishlist: { productId: string; productName: string | null; productSku: string | null; addedAt: string }[];
  agent: any | null;
  stats: { totalSpend: number; orderCount: number; lastOrderAt: string | null };
};

function useCustomerRelated(id: string | undefined) {
  const [bundle, setBundle] = useState<RelatedBundle | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    const token = localStorage.getItem("erp_token") ?? "";
    apiFetch(`/api/v1/customers/${id}/related`, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j?.success) setBundle(j.data); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);
  return { bundle, loading };
}

function formatINR(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : (n ?? 0);
  return `₹${(v || 0).toLocaleString("en-IN")}`;
}

function SourcePill({ source }: { source?: string }) {
  // Match the list-page pill so users see consistent provenance treatment
  // across screens. Includes an icon to communicate the channel at a glance.
  const src = (source ?? "erp") as string;
  if (src === "website") return <Badge className="bg-green-100 text-green-800 hover:bg-green-100" variant="outline"><Globe className="h-3 w-3 mr-1" />Online customer</Badge>;
  if (src === "pos") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100" variant="outline"><Store className="h-3 w-3 mr-1" />POS walk-in</Badge>;
  if (src === "import") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100" variant="outline"><ClipboardList className="h-3 w-3 mr-1" />Imported</Badge>;
  return <Badge variant="outline"><UserCircle className="h-3 w-3 mr-1" />Staff-added</Badge>;
}

export default function CustomerDetail() {
  const [, params] = useRoute("/customers/:id");
  const { toast } = useToast();
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);

  const customerId = params?.id as string;
  const { data: customer, isLoading: loadingCustomer } = useGetCustomer(customerId);
  const { data: statementData, isLoading: loadingStatement, refetch: refetchStatement } = useGetCustomerStatement(customerId);
  const { data: loyaltyData } = useGetCustomerLoyalty(customerId);
  const { bundle, loading: loadingBundle } = useCustomerRelated(customerId);

  const paymentMutation = useRecordCustomerPayment();

  const handlePayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const amount = parseFloat(formData.get("amount") as string);
    try {
      await paymentMutation.mutateAsync({
        id: customerId,
        data: { amount, date: new Date().toISOString().slice(0, 10), reference: formData.get("reference") as string },
      });
      toast({ title: "Success", description: "Payment recorded successfully" });
      setIsPaymentDialogOpen(false);
      refetchStatement();
    } catch {
      toast({ title: "Error", description: "Failed to record payment", variant: "destructive" });
    }
  };

  if (loadingCustomer) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/4" />
        <div className="grid gap-6 md:grid-cols-4">
          <Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!customer) return <div>Customer not found.</div>;

  const stats = bundle?.stats;
  const invoices = bundle?.invoices ?? [];
  const estimates = bundle?.estimates ?? [];
  const addresses = bundle?.addresses ?? [];
  const wishlist = bundle?.wishlist ?? [];
  const agent = bundle?.agent;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/customers"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{customer.name}</h2>
            <div className="flex flex-wrap gap-2 mt-1">
              <Badge variant="secondary">{customer.customerType}</Badge>
              <SourcePill source={(customer as any).source} />
              {customer.gstin && <Badge variant="outline">GSTIN: {customer.gstin}</Badge>}
              {customer.email && (customer as any).emailVerified && <Badge variant="outline">Email verified</Badge>}
              {agent && <Badge variant="outline">Agent: {agent.name}</Badge>}
            </div>
          </div>
        </div>
        <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
          <DialogTrigger asChild><Button><Wallet className="mr-2 h-4 w-4" /> Record Payment</Button></DialogTrigger>
          <DialogContent>
            <form onSubmit={handlePayment}>
              <DialogHeader>
                <DialogTitle>Record Customer Payment</DialogTitle>
                <DialogDescription>Record a payment received from this customer against their outstanding balance.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="amount" className="text-right">Amount</Label>
                  <Input id="amount" name="amount" type="number" step="0.01" className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="method" className="text-right">Method</Label>
                  <Select name="method" defaultValue="CASH">
                    <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="CHEQUE">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="reference" className="text-right">Reference</Label>
                  <Input id="reference" name="reference" placeholder="TXN ID, Cheque #" className="col-span-3" />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={paymentMutation.isPending}>
                  {paymentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Record Payment
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards: lifetime + balance + loyalty */}
      <div className="grid gap-6 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase text-muted-foreground">Outstanding</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${Number(customer.outstandingBalance ?? 0) > 0 ? "text-destructive" : "text-green-600"}`}>
              {formatINR(customer.outstandingBalance)}
            </div>
            <p className="text-[10px] text-muted-foreground">Limit: {formatINR(customer.creditLimit)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase text-muted-foreground">Lifetime Spend</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loadingBundle ? "…" : formatINR(stats?.totalSpend ?? 0)}</div>
            <p className="text-[10px] text-muted-foreground">{stats?.orderCount ?? 0} orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase text-muted-foreground">Last Order</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.lastOrderAt ? new Date(stats.lastOrderAt).toLocaleDateString("en-IN") : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase text-muted-foreground">Loyalty</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{loyaltyData?.data?.totalPoints || 0}</div>
            <p className="text-[10px] text-muted-foreground">Points</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase text-muted-foreground">Wishlist</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{wishlist.length}</div>
            <p className="text-[10px] text-muted-foreground">Items saved</p>
          </CardContent>
        </Card>
      </div>

      {/* Contact + Tabs of related data */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader><CardTitle>Contact Info</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3"><Phone className="h-4 w-4 text-muted-foreground" /><span>{customer.phone}</span></div>
            {customer.email && <div className="flex items-center gap-3"><Mail className="h-4 w-4 text-muted-foreground" /><span>{customer.email}</span></div>}
            {(customer.city || customer.state) && (
              <div className="flex items-center gap-3"><MapPin className="h-4 w-4 text-muted-foreground" /><span>{[customer.city, customer.state].filter(Boolean).join(", ")}</span></div>
            )}
            {customer.gstin && <div className="flex items-center gap-3"><Building className="h-4 w-4 text-muted-foreground" /><span>GSTIN: {customer.gstin}</span></div>}
            {customer.address && <div className="text-xs text-muted-foreground pt-2 border-t">{customer.address}</div>}
            <div className="text-xs text-muted-foreground pt-2 border-t">
              Member since {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString("en-IN") : "—"}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Activity</CardTitle></CardHeader>
          <CardContent>
            <Tabs defaultValue="invoices">
              <TabsList className="mb-4">
                <TabsTrigger value="invoices"><ShoppingBag className="h-3.5 w-3.5 mr-1.5" />Orders ({invoices.length})</TabsTrigger>
                <TabsTrigger value="statement"><FileText className="h-3.5 w-3.5 mr-1.5" />Ledger</TabsTrigger>
                <TabsTrigger value="addresses"><MapPin className="h-3.5 w-3.5 mr-1.5" />Addresses ({addresses.length})</TabsTrigger>
                <TabsTrigger value="wishlist"><Heart className="h-3.5 w-3.5 mr-1.5" />Wishlist ({wishlist.length})</TabsTrigger>
                <TabsTrigger value="estimates"><ClipboardList className="h-3.5 w-3.5 mr-1.5" />Estimates ({estimates.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="invoices">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead><TableHead>Invoice</TableHead><TableHead>Channel</TableHead>
                      <TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingBundle ? (
                      <TableRow><TableCell colSpan={5}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                    ) : invoices.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No orders yet.</TableCell></TableRow>
                    ) : invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="text-xs">{new Date(inv.createdAt).toLocaleDateString("en-IN")}</TableCell>
                        <TableCell><Link href={`/invoices/${inv.id}`} className="text-primary hover:underline font-medium">{inv.invoiceNo}</Link></TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{inv.channel}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={inv.status === "paid" ? "default" : inv.status === "credit" ? "secondary" : "destructive"} className="text-[10px]">
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatINR(inv.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="statement">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead><TableHead>Type</TableHead>
                      <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingStatement ? (
                      <TableRow><TableCell colSpan={5}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                    ) : statementData?.data?.entries?.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No transactions.</TableCell></TableRow>
                    ) : statementData?.data?.entries?.map((e: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{new Date(e.date ?? e.createdAt).toLocaleDateString("en-IN")}</TableCell>
                        <TableCell>
                          <span className="text-xs font-medium uppercase">{e.type}</span>
                          {e.notes && <div className="text-[10px] text-muted-foreground">{e.notes}</div>}
                        </TableCell>
                        <TableCell className="text-right">{Number(e.amount) > 0 ? formatINR(e.amount) : "-"}</TableCell>
                        <TableCell className="text-right">{Number(e.amount) < 0 ? formatINR(-Number(e.amount)) : "-"}</TableCell>
                        <TableCell className="text-right font-medium">{formatINR(e.runningBalance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="addresses">
                {loadingBundle ? <Skeleton className="h-24" /> : addresses.length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground">No saved addresses.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {addresses.map((a) => (
                      <div key={a.id} className="border rounded-md p-3 text-sm">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-medium">{a.label || a.name}</span>
                          {a.isDefault && <Badge variant="default" className="text-[10px]">Default</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />
                          {a.city}, {a.state} - {a.pincode}<br />
                          📞 {a.phone}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="wishlist">
                {loadingBundle ? <Skeleton className="h-24" /> : wishlist.length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground">Wishlist is empty.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>SKU</TableHead><TableHead className="text-right">Added</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {wishlist.map((w) => (
                        <TableRow key={w.productId}>
                          <TableCell><Link href={`/products?q=${encodeURIComponent(w.productSku ?? "")}`} className="hover:underline">{w.productName ?? "—"}</Link></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{w.productSku ?? "—"}</TableCell>
                          <TableCell className="text-right text-xs">{new Date(w.addedAt).toLocaleDateString("en-IN")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="estimates">
                {loadingBundle ? <Skeleton className="h-24" /> : estimates.length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground">No estimates raised.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Estimate</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {estimates.map((e: any) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-xs">{new Date(e.createdAt).toLocaleDateString("en-IN")}</TableCell>
                          <TableCell className="font-medium">{e.estimateNo}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{e.status}</Badge></TableCell>
                          <TableCell className="text-right">{formatINR(e.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
