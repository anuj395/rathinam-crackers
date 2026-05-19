import { Link, useLocation } from "wouter";
import { mediaUrl } from "../../lib/api";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Package,
  ArrowDownToLine,
  ArrowLeftRight,
  History,
  Settings2,
  LogOut,
  ChevronLeft,
  HelpCircle,
  Menu,
} from "lucide-react";
import logoUrl from "@assets/rathinam_logo.png";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: Package, label: "Stock Levels", href: "/stock" },
  { icon: ArrowDownToLine, label: "Receive Stock", href: "/receive" },
  { icon: Settings2, label: "Stock Adjust", href: "/adjust" },
  { icon: ArrowLeftRight, label: "Transfers", href: "/transfers" },
  { icon: History, label: "Stock Ledger", href: "/ledger" },
  { icon: HelpCircle, label: "Help & Guide", href: "/help" },
];

interface SidebarBodyProps {
  isCollapsed?: boolean;
  onNavigate?: () => void;
}

function SidebarBody({ isCollapsed = false, onNavigate }: SidebarBodyProps) {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  const handleLogout = () => {
    localStorage.removeItem("wh_token");
    toast({ title: "Logged out", description: "You have been logged out successfully" });
    onNavigate?.();
    setLocation("/login");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center h-16 px-3 border-b border-sidebar-border bg-sidebar-accent/40 shrink-0">
        <img src={mediaUrl(logoUrl)} alt="" className="h-9 w-9 rounded bg-white/95 p-0.5 object-contain shrink-0" />
        {!isCollapsed && (
          <div className="ml-2.5 flex flex-col leading-tight">
            <span className="font-extrabold text-sm tracking-wide">RATHINAM</span>
            <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-amber-300/90">Warehouse</span>
          </div>
        )}
      </div>

      <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center px-4 py-3 transition-colors hover:bg-sidebar-accent",
                isActive ? "bg-sidebar-accent text-amber-300 border-r-4 border-amber-400" : "text-sidebar-foreground/85",
                isCollapsed && "justify-center"
              )}
            >
              <item.icon className={cn("h-5 w-5 shrink-0", !isCollapsed && "mr-3")} />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border shrink-0">
        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center w-full px-4 py-3 text-sidebar-foreground/85 transition-colors hover:bg-destructive hover:text-destructive-foreground rounded-md",
            isCollapsed && "justify-center"
          )}
        >
          <LogOut className={cn("h-5 w-5 shrink-0", !isCollapsed && "mr-3")} />
          {!isCollapsed && <span>Logout</span>}
        </button>
      </div>
    </div>
  );
}

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div
      className={cn(
        "relative hidden md:flex flex-col h-screen border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300",
        isCollapsed ? "w-16" : "w-64",
        className
      )}
    >
      <SidebarBody isCollapsed={isCollapsed} />
      <Button
        variant="ghost"
        size="icon"
        className="absolute -right-4 top-20 h-8 w-8 rounded-full border bg-white text-black hover:bg-gray-100 hidden md:flex"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <ChevronLeft className={cn("h-4 w-4 transition-transform", isCollapsed && "rotate-180")} />
      </Button>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isLoginPage = location === "/login";

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-30 h-14 flex items-center gap-2 px-3 border-b bg-sidebar text-sidebar-foreground">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72 bg-sidebar text-sidebar-foreground border-sidebar-border">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarBody onNavigate={() => setDrawerOpen(false)} />
            </SheetContent>
          </Sheet>
          <img src={mediaUrl(logoUrl)} alt="" className="h-8 w-8 rounded bg-white/95 p-0.5 object-contain" />
          <div className="flex flex-col leading-tight">
            <span className="font-extrabold text-xs tracking-wide">RATHINAM</span>
            <span className="text-[9px] font-semibold tracking-[0.18em] uppercase text-amber-300/90">Warehouse</span>
          </div>
        </div>
        <div className="p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
