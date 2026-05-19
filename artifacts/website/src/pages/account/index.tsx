import { Link } from "wouter";
import { AccountShell } from "@/components/account-shell";
import { useShopAuth } from "@/context/auth";
import { useListShopOrders, useListShopAddresses } from "@workspace/api-client-react";
import { ShoppingBag, MapPin, Award, ArrowRight } from "lucide-react";

export default function AccountIndex() {
  const { customer } = useShopAuth();
  const { data: ordersResp } = useListShopOrders();
  const { data: addrResp } = useListShopAddresses();
  const orders = ((ordersResp as any)?.data ?? []) as any[];
  const addresses = ((addrResp as any)?.data ?? []) as any[];
  const recentOrders = orders.slice(0, 3);

  return (
    <AccountShell>
      <h1 className="text-2xl font-extrabold mb-1">Hi {customer?.name?.split(" ")[0]} 👋</h1>
      <p className="text-gray-600 mb-6">Here is everything in your account.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <div className="flex items-center gap-2 text-gray-500 text-sm"><ShoppingBag className="h-4 w-4" /> Orders</div>
          <p className="text-3xl font-extrabold mt-2" data-testid="account-orders-count">{orders.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <div className="flex items-center gap-2 text-gray-500 text-sm"><MapPin className="h-4 w-4" /> Addresses</div>
          <p className="text-3xl font-extrabold mt-2">{addresses.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <div className="flex items-center gap-2 text-gray-500 text-sm"><Award className="h-4 w-4" /> Loyalty points</div>
          <p className="text-3xl font-extrabold mt-2">{customer?.loyaltyPoints ?? 0}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">Recent orders</h2>
          <Link href="/account/orders" className="text-sm text-primary font-semibold flex items-center gap-1">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">No orders yet — <Link href="/catalogue" className="text-primary font-semibold">start shopping</Link>.</p>
        ) : (
          <div className="space-y-2">
            {recentOrders.map((o) => (
              <Link key={o.id} href={`/account/orders/${o.id}`}>
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <div>
                    <p className="font-semibold">#{o.invoiceNo}</p>
                    <p className="text-xs text-gray-500">{new Date(o.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">₹{Number(o.total).toLocaleString("en-IN")}</p>
                    <p className="text-xs text-gray-500">{(o.logisticsDetails?.status ?? o.status)?.replace(/_/g, " ")}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AccountShell>
  );
}
