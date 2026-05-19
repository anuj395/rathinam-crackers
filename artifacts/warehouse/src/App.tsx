import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { ErrorBoundary } from "@/components/error-boundary";
import { setAuthTokenGetter, setUnauthorizedHandler } from "@workspace/api-client-react";

// Pages
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import StockLevels from "@/pages/stock";
import ReceiveStock from "@/pages/receive";
import StockAdjust from "@/pages/adjust";
import Transfers from "@/pages/transfers";
import NewTransfer from "@/pages/transfers-new";
import StockLedger from "@/pages/ledger";
import WarehouseHelp from "@/pages/help";
import NotFound from "@/pages/not-found";

// Setup API client auth
setAuthTokenGetter(() => localStorage.getItem("wh_token"));

// On 401: drop the stale token and bounce to login so the user isn't stuck
// looking at a "Failed to load…" error on every warehouse screen.
setUnauthorizedHandler(() => {
  if (localStorage.getItem("wh_token")) {
    localStorage.removeItem("wh_token");
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    window.location.href = `${base}/login`;
  }
});

const queryClient = new QueryClient();

// Redirect to /login whenever a protected page is opened without a token,
// so users don't sit on a screen full of empty dropdowns wondering what's wrong.
function AuthGuard({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const hasToken = typeof window !== "undefined" && !!localStorage.getItem("wh_token");
  useEffect(() => {
    if (!hasToken && location !== "/login") navigate("/login", { replace: true });
  }, [hasToken, location, navigate]);
  if (!hasToken && location !== "/login") return null;
  return <>{children}</>;
}

function Router() {
  return (
    <Layout>
      <AuthGuard>
        <Switch>
          <Route path="/login" component={Login} />
          <Route path="/" component={Dashboard} />
          <Route path="/stock" component={StockLevels} />
          <Route path="/receive" component={ReceiveStock} />
          <Route path="/adjust" component={StockAdjust} />
          <Route path="/transfers" component={Transfers} />
          <Route path="/transfers/new" component={NewTransfer} />
          <Route path="/ledger" component={StockLedger} />
          <Route path="/help" component={WarehouseHelp} />
          <Route component={NotFound} />
        </Switch>
      </AuthGuard>
    </Layout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
