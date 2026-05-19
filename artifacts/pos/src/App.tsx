import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/context/cart";
import { ErrorBoundary } from "@/components/error-boundary";
import { setAuthTokenGetter, setUnauthorizedHandler } from "@workspace/api-client-react";
import PinLogin from "@/pages/pin-login";
import SaleScreen from "@/pages/sale";
import ReceiptScreen from "@/pages/receipt";
import PosHelp from "@/pages/help";
import NotFound from "@/pages/not-found";

setAuthTokenGetter(() => localStorage.getItem("pos_token"));

// On 401: drop the stale token and bounce to PIN login so the cashier
// can re-authenticate instead of staring at a broken sale screen.
setUnauthorizedHandler(() => {
  if (localStorage.getItem("pos_token")) {
    localStorage.removeItem("pos_token");
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    window.location.href = `${base}/`;
  }
});

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={PinLogin} />
      <Route path="/sale" component={SaleScreen} />
      <Route path="/receipt" component={ReceiptScreen} />
      <Route path="/help" component={PosHelp} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <CartProvider>
            <div className="dark min-h-screen bg-[#0d0d0d] text-white">
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
            </div>
            <Toaster />
          </CartProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
