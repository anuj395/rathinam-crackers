import { useGetAgent, useGetAgentCommission } from "@workspace/api-client-react";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, UserRound, Phone, Ticket, Percent, Target, TrendingUp, Wallet } from "lucide-react";

export default function AgentDetail() {
  const [, params] = useRoute("/agents/:id");
  const agentId = params?.id as string;
  
  const { data: agent, isLoading: loadingAgent } = useGetAgent(agentId);
  const { data: commissionData, isLoading: loadingCommission } = useGetAgentCommission(agentId);

  if (loadingAgent) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/4" />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!agent) return <div>Agent not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/agents">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h2 className="text-3xl font-bold tracking-tight">{agent.name}</h2>
        <Badge variant={agent.status === 'Active' ? 'default' : 'secondary'} className="ml-2">
          {agent.status || 'Active'}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Promo Code</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{agent.promoCode}</div>
            <p className="text-xs text-muted-foreground">Max Discount: {agent.maxDiscountPct}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Target</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{agent.monthlyTarget?.toLocaleString('en-IN')}</div>
            <p className="text-xs text-muted-foreground">Current Month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Commission Earned</CardTitle>
            <Wallet className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">₹{commissionData?.data?.totalCommission?.toLocaleString('en-IN') || 0}</div>
            <p className="text-xs text-muted-foreground">Total payout pending</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Commission Structure</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales Range</TableHead>
                  <TableHead className="text-right">Commission Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agent.commissionTiers?.map((tier, i: number) => (
                  <TableRow key={i}>
                    <TableCell>₹{tier.from?.toLocaleString('en-IN')} +</TableCell>
                    <TableCell className="text-right font-bold">{tier.rate}%</TableCell>
                  </TableRow>
                )) || (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center py-4 text-muted-foreground">No tiers defined.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-sm text-muted-foreground">Total Sales Generated</span>
              <span className="font-bold">₹{commissionData?.data?.totalSales?.toLocaleString('en-IN') || 0}</span>
            </div>
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-sm text-muted-foreground">Orders Placed</span>
              <span className="font-bold">{commissionData?.data?.items?.length || 0}</span>
            </div>
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-sm text-muted-foreground">Avg. Order Value</span>
              <span className="font-bold">₹{((commissionData?.data?.totalSales ?? 0) / (commissionData?.data?.items?.length || 1)).toLocaleString('en-IN')}</span>
            </div>
            <div className="pt-2">
              <div className="flex justify-between text-xs mb-1">
                <span>Target Progress</span>
                <span>{Math.round(((commissionData?.data?.totalSales || 0) / (agent.monthlyTarget || 1)) * 100)}%</span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-primary h-full" 
                  style={{ width: `${Math.min(100, ((commissionData?.data?.totalSales || 0) / (agent.monthlyTarget || 1)) * 100)}%` }}
                ></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
