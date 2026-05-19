import { Link } from "wouter";
import { AccountShell } from "@/components/account-shell";
import { useListShopOrders } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";

export default function AccountOrders() {
  const { data, isLoading } = useListShopOrders();
  const orders = ((data as any)?.data ?? []) as any[];

  return (
    <AccountShell>
      <h1 className="text-2xl font-extrabold mb-4">My orders</h1>
      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center">
          <Package className="h-10 w-10 mx-auto text-gray-300" />
          <p className="text-gray-500 mt-3">No orders yet.</p>
          <Link href="/catalogue" className="inline-block mt-4 text-primary font-semibold hover:underline">Browse catalogue →</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Link key={o.id} href={`/account/orders/${o.id}`}>
              <div className="bg-white rounded-2xl p-5 border border-gray-100 hover:border-primary/30 cursor-pointer" data-testid={`order-row-${o.id}`}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-bold text-lg">#{o.invoiceNo}</p>
                    <p className="text-xs text-gray-500">{new Date(o.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold text-xl">₹{Number(o.total).toLocaleString("en-IN")}</p>
                    <Badge variant="secondary" className="mt-1 capitalize">
                      {(o.logisticsDetails?.status ?? o.status)?.toString().replace(/_/g, " ")}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  {(o.items ?? []).length} item{(o.items ?? []).length === 1 ? "" : "s"} · {(o.items ?? [])[0]?.productName}{(o.items ?? []).length > 1 ? ` + ${(o.items ?? []).length - 1} more` : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AccountShell>
  );
}
