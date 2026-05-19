import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useShopAuth } from "@/context/auth";
import { LogOut, ShoppingBag, MapPin, User, Heart, LayoutDashboard } from "lucide-react";
import { useEffect } from "react";

const items = [
  { href: "/account", label: "Overview", icon: LayoutDashboard },
  { href: "/account/orders", label: "My orders", icon: ShoppingBag },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
  { href: "/account/wishlist", label: "Wishlist", icon: Heart },
  { href: "/account/profile", label: "Profile", icon: User },
];

export function AccountShell({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, customer, logout } = useShopAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (!isLoggedIn) {
      navigate(`/login?next=${encodeURIComponent(location)}`);
    }
  }, [isLoggedIn, location, navigate]);

  if (!isLoggedIn || !customer) return null;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
        <aside className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm h-fit">
          <div className="px-2 py-3 mb-2 border-b">
            <p className="text-xs uppercase text-gray-400 tracking-wide">Signed in as</p>
            <p className="font-bold text-gray-900 truncate">{customer.name}</p>
            <p className="text-xs text-gray-500 truncate">{customer.phone}</p>
          </div>
          <nav className="space-y-1">
            {items.map((it) => {
              const Icon = it.icon;
              const active = location === it.href || (it.href !== "/account" && location.startsWith(it.href));
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    active ? "bg-primary/10 text-primary font-semibold" : "text-gray-700 hover:bg-gray-50"
                  }`}
                  data-testid={`account-nav-${it.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <Icon className="h-4 w-4" />
                  {it.label}
                </Link>
              );
            })}
            <button
              onClick={() => { logout(); navigate("/"); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-destructive/10 hover:text-destructive"
              data-testid="account-logout"
            >
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </nav>
        </aside>
        <section>{children}</section>
      </div>
    </Layout>
  );
}
