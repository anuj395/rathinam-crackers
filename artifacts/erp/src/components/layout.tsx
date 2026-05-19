import { useAuth } from "@/lib/auth";
import { mediaUrl } from "../lib/api";
import { Link, useLocation } from "wouter";
import {
  BarChart3, Box, Package, Users, UsersRound, Truck,
  ShoppingCart, Tags, FileText, FileBarChart, Settings, LogOut, ShoppingBag,
  HelpCircle, ShieldCheck, Award, UserCircle2, RotateCcw, Image as ImageIcon,
  Menu,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";
import logoUrl from "@assets/rathinam_logo.png";

// Role groups mirror the backend constants in
// artifacts/api-server/src/lib/auth-roles.ts so the sidebar shows exactly
// what the user is allowed to do — no more "you can see it but the API
// will 403 you" surprises. Keep the two lists in sync when adding roles.
const ADMIN = ["SUPER_ADMIN", "ADMIN", "ERP_MANAGER", "MANAGER"];
const SALES = [...ADMIN, "AGENT", "ACCOUNTANT"];
const FINANCE = [...ADMIN, "ACCOUNTANT"];
const WAREHOUSE = [...ADMIN, "WH_MANAGER"];
const ALL = [...ADMIN, "AGENT", "ACCOUNTANT", "WH_MANAGER", "CASHIER"];

type NavItem = { icon: any; label: string; href: string; roles?: string[] };

const navItems: NavItem[] = [
  { icon: BarChart3, label: "Dashboard", href: "/", roles: ALL },
  { icon: BarChart3, label: "Locations Overview", href: "/dashboard/locations", roles: ADMIN },
  { icon: BarChart3, label: "Business Overview", href: "/dashboard/business", roles: ADMIN },
  { icon: Box, label: "Products", href: "/products", roles: ALL },
  { icon: Award, label: "Brands", href: "/brands", roles: ADMIN },
  { icon: Tags, label: "Categories", href: "/categories", roles: ADMIN },
  { icon: ImageIcon, label: "Media Library", href: "/media", roles: ADMIN },
  { icon: Package, label: "Stock", href: "/stock", roles: [...ALL] },
  { icon: FileText, label: "Estimates", href: "/estimates", roles: SALES },
  { icon: FileText, label: "Invoices", href: "/invoices", roles: SALES },
  { icon: ShoppingBag, label: "Online Orders", href: "/orders", roles: [...ADMIN, "ACCOUNTANT"] },
  { icon: Users, label: "Customers", href: "/customers", roles: SALES },
  { icon: Truck, label: "Suppliers", href: "/suppliers", roles: [...ADMIN, "WH_MANAGER", "ACCOUNTANT"] },
  { icon: UsersRound, label: "Agents", href: "/agents", roles: [...ADMIN, "ACCOUNTANT"] },
  { icon: ShoppingCart, label: "Purchase Orders", href: "/purchase-orders", roles: FINANCE },
  { icon: Truck, label: "Transfers", href: "/transfers", roles: WAREHOUSE },
  { icon: Tags, label: "Coupons", href: "/coupons", roles: ADMIN },
  { icon: RotateCcw, label: "Returns", href: "/returns", roles: SALES },
];

const reportItems: NavItem[] = [
  { icon: FileBarChart, label: "Sales", href: "/reports/sales", roles: [...ADMIN, "ACCOUNTANT"] },
  { icon: FileBarChart, label: "Day Book", href: "/reports/daybook", roles: [...ADMIN, "ACCOUNTANT"] },
  { icon: FileBarChart, label: "Outstanding", href: "/reports/outstanding", roles: [...ADMIN, "ACCOUNTANT"] },
  { icon: FileBarChart, label: "Commission", href: "/reports/commission", roles: [...ADMIN, "ACCOUNTANT"] },
  { icon: FileBarChart, label: "GST", href: "/reports/gst", roles: [...ADMIN, "ACCOUNTANT"] },
  { icon: FileBarChart, label: "Returns", href: "/reports/returns", roles: [...ADMIN, "ACCOUNTANT"] },
  { icon: FileBarChart, label: "Damage", href: "/reports/damage", roles: [...ADMIN, "WH_MANAGER", "ACCOUNTANT"] },
  { icon: FileBarChart, label: "Loyalty", href: "/reports/loyalty", roles: [...ADMIN, "ACCOUNTANT"] },
  { icon: FileBarChart, label: "Activity log", href: "/reports/activity", roles: ADMIN },
];

const settingsItems: NavItem[] = [
  { icon: Settings, label: "Users", href: "/users", roles: ADMIN },
  { icon: Settings, label: "Roles & Permissions", href: "/system/roles", roles: ["SUPER_ADMIN", "ERP_MANAGER"] },
  { icon: Settings, label: "API Access", href: "/system/api-docs", roles: ADMIN },
  { icon: Settings, label: "Notifications", href: "/system/notifications", roles: ADMIN },
  { icon: Settings, label: "Locations", href: "/locations", roles: ADMIN },
  { icon: Settings, label: "Website Content", href: "/site-content", roles: ADMIN },
  { icon: Settings, label: "Product Reviews", href: "/reviews", roles: ADMIN },
  { icon: Settings, label: "Demo Data", href: "/system/demo", roles: ["SUPER_ADMIN"] },
  { icon: Settings, label: "General Settings", href: "/settings", roles: ADMIN },
];

const helpItems: NavItem[] = [
  { icon: HelpCircle, label: "Help & Guide", href: "/help", roles: ALL },
  { icon: ShieldCheck, label: "System Verifier", href: "/verifier", roles: ADMIN },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { logout, user, hasAnyRole } = useAuth();

  const linkCls = (active: boolean) =>
    cn(
      "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
      active
        ? "bg-sidebar-primary text-sidebar-primary-foreground"
        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    );

  // Until /auth/me responds we render nothing — better than flashing every
  // menu item to a cashier for half a second on slow networks.
  const visibleNav = user ? navItems.filter((i) => hasAnyRole(i.roles)) : [];
  const visibleReports = user ? reportItems.filter((i) => hasAnyRole(i.roles)) : [];
  const visibleSettings = user ? settingsItems.filter((i) => hasAnyRole(i.roles)) : [];
  const visibleHelp = user ? helpItems.filter((i) => hasAnyRole(i.roles)) : [];

  return (
    <div className="flex flex-col h-full">
      <div className="h-16 flex items-center gap-2.5 px-4 border-b border-sidebar-border bg-sidebar-accent/40 shrink-0">
        <img src={mediaUrl(logoUrl)} alt="" className="h-9 w-9 rounded bg-white/95 p-0.5 object-contain" />
        <div className="flex flex-col leading-tight">
          <span className="font-extrabold text-sm text-sidebar-foreground tracking-wide">RATHINAM</span>
          <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-amber-300/90">ERP Console</span>
        </div>
      </div>

      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-1 px-2">
          {visibleNav.map((item) => {
            const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} onClick={onNavigate} className={linkCls(active)}>
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}

          {visibleReports.length > 0 && (
            <>
              <div className="pt-4 pb-1 px-3 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">Reports</div>
              {visibleReports.map((item) => (
                <Link key={item.href} href={item.href} onClick={onNavigate} className={linkCls(location === item.href)}>
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              ))}
            </>
          )}

          {visibleSettings.length > 0 && (
            <>
              <div className="pt-4 pb-1 px-3 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">System</div>
              {visibleSettings.map((item) => (
                <Link key={item.href} href={item.href} onClick={onNavigate} className={linkCls(location === item.href)}>
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              ))}
            </>
          )}

          {visibleHelp.length > 0 && (
            <>
              <div className="pt-4 pb-1 px-3 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">Resources</div>
              {visibleHelp.map((item) => {
                const active = location === item.href || (item.href === "/help" && location.startsWith("/help"));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    className={linkCls(active)}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </>
          )}
        </nav>
      </ScrollArea>

      <div className="p-3 border-t border-sidebar-border space-y-1 shrink-0">
        {user && (
          <div className="px-3 py-2 text-xs text-sidebar-foreground/60 leading-tight">
            <div className="truncate text-sidebar-foreground/90 font-medium">{user.name}</div>
            <div className="truncate text-[10px] uppercase tracking-wider">{user.role.replace(/_/g, " ")}</div>
          </div>
        )}
        <Link
          href="/profile"
          onClick={onNavigate}
          data-testid="nav-profile"
          className={linkCls(location === "/profile")}
        >
          <UserCircle2 className="h-4 w-4 shrink-0" />
          My Profile
        </Link>
        <button
          onClick={() => { onNavigate?.(); logout(); }}
          className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md text-sidebar-foreground/80 hover:bg-destructive hover:text-destructive-foreground w-full transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Logout
        </button>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Persistent sidebar on lg+ */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 border-r bg-sidebar text-sidebar-foreground flex-col">
        <SidebarNav />
      </aside>

      {/* Main column */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden h-14 flex items-center gap-2 px-3 border-b bg-sidebar text-sidebar-foreground shrink-0">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent" data-testid="mobile-nav-trigger">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72 bg-sidebar text-sidebar-foreground border-sidebar-border">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarNav onNavigate={() => setDrawerOpen(false)} />
            </SheetContent>
          </Sheet>
          <img src={mediaUrl(logoUrl)} alt="" className="h-8 w-8 rounded bg-white/95 p-0.5 object-contain" />
          <div className="flex flex-col leading-tight">
            <span className="font-extrabold text-xs tracking-wide">RATHINAM</span>
            <span className="text-[9px] font-semibold tracking-[0.18em] uppercase text-amber-300/90">ERP Console</span>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 sm:p-6 md:p-8">
            {children}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
