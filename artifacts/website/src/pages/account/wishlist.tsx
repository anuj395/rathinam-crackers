import { Link } from "wouter";
import { AccountShell } from "@/components/account-shell";
import {
  useListShopWishlist,
  useRemoveShopWishlist,
  useListPublicProducts,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Heart, Trash2 } from "lucide-react";

export default function Wishlist() {
  const { data, refetch, isLoading } = useListShopWishlist();
  const { data: productsResp } = useListPublicProducts({ limit: 500 });
  const remove = useRemoveShopWishlist();
  const wish = ((data as any)?.data ?? []) as any[];
  const products = ((productsResp as any)?.data ?? []) as any[];

  return (
    <AccountShell>
      <h1 className="text-2xl font-extrabold mb-4">Wishlist</h1>
      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : wish.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center">
          <Heart className="h-10 w-10 mx-auto text-gray-300" />
          <p className="text-gray-500 mt-3">Your wishlist is empty.</p>
          <Link href="/catalogue" className="inline-block mt-4 text-primary font-semibold hover:underline">Browse products →</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {wish.map((w) => {
            const p = products.find((pr) => pr.id === w.productId);
            return (
              <div key={w.productId} className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`wishlist-${w.productId}`}>
                <p className="font-semibold truncate">{p?.name ?? w.productId}</p>
                {p?.category && <p className="text-xs text-gray-500">{p.category}</p>}
                <div className="mt-3 flex gap-2">
                  {p && (
                    <Link href={`/product/${p.id}`}>
                      <Button size="sm" variant="outline">View</Button>
                    </Link>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={async () => { await remove.mutateAsync({ productId: w.productId }); refetch(); }}
                    data-testid={`wishlist-remove-${w.productId}`}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AccountShell>
  );
}
