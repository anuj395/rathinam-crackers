import React, { createContext, useContext, useEffect, useState } from "react";
import { setAuthTokenGetter, setUnauthorizedHandler } from "@workspace/api-client-react";

// Configure the global API token getter immediately at module-load time so that
// authenticated requests fired during the very first render (before any
// useEffect runs) include the bearer token. Without this, hard reloads on a
// protected route can race a 401 in before the provider's effect registers.
setAuthTokenGetter(() => localStorage.getItem("shop_token"));

type ShopCustomer = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  loyaltyPoints?: number;
};

type AuthCtx = {
  token: string | null;
  customer: ShopCustomer | null;
  setSession: (token: string, customer: ShopCustomer) => void;
  updateCustomer: (c: Partial<ShopCustomer>) => void;
  logout: () => void;
  isLoggedIn: boolean;
};

const AuthContext = createContext<AuthCtx>({
  token: null,
  customer: null,
  setSession: () => {},
  updateCustomer: () => {},
  logout: () => {},
  isLoggedIn: false,
});

export const ShopAuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("shop_token"));
  const [customer, setCustomer] = useState<ShopCustomer | null>(() => {
    const raw = localStorage.getItem("shop_customer");
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (localStorage.getItem("shop_token")) {
        localStorage.removeItem("shop_token");
        localStorage.removeItem("shop_customer");
        setToken(null);
        setCustomer(null);
      }
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const setSession = (t: string, c: ShopCustomer) => {
    localStorage.setItem("shop_token", t);
    localStorage.setItem("shop_customer", JSON.stringify(c));
    setToken(t);
    setCustomer(c);
  };
  const updateCustomer = (patch: Partial<ShopCustomer>) => {
    setCustomer((prev) => {
      const next = { ...(prev as ShopCustomer), ...patch } as ShopCustomer;
      localStorage.setItem("shop_customer", JSON.stringify(next));
      return next;
    });
  };
  const logout = () => {
    localStorage.removeItem("shop_token");
    localStorage.removeItem("shop_customer");
    setToken(null);
    setCustomer(null);
  };

  return (
    <AuthContext.Provider value={{ token, customer, setSession, updateCustomer, logout, isLoggedIn: !!token }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useShopAuth = () => useContext(AuthContext);
