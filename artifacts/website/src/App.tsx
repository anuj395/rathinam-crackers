import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/context/cart";
import { ShopAuthProvider } from "@/context/auth";
import { ErrorBoundary } from "@/components/error-boundary";
import Home from "@/pages/home";
import Catalogue from "@/pages/catalogue/index";
import ProductDetail from "@/pages/product/[id]";
import Cart from "@/pages/cart";
import Checkout from "@/pages/checkout";
import WebsiteHelp from "@/pages/help";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import AccountIndex from "@/pages/account/index";
import AccountOrders from "@/pages/account/orders";
import AccountOrderDetail from "@/pages/account/order-detail";
import AccountAddresses from "@/pages/account/addresses";
import AccountWishlist from "@/pages/account/wishlist";
import AccountProfile from "@/pages/account/profile";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/catalogue" component={Catalogue} />
      <Route path="/product/:id" component={ProductDetail} />
      <Route path="/cart" component={Cart} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/help" component={WebsiteHelp} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/account" component={AccountIndex} />
      <Route path="/account/orders" component={AccountOrders} />
      <Route path="/account/orders/:id" component={AccountOrderDetail} />
      <Route path="/account/addresses" component={AccountAddresses} />
      <Route path="/account/wishlist" component={AccountWishlist} />
      <Route path="/account/profile" component={AccountProfile} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ShopAuthProvider>
            <CartProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
            </CartProvider>
          </ShopAuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
