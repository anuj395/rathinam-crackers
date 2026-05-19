import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { setAuthTokenGetter, setUnauthorizedHandler } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { apiFetch } from "./api";

export type User = {
  id: string;
  name: string;
  username: string;
  role: string;
  email?: string | null;
  phone?: string | null;
  locationIds?: string[];
  maxDiscountPct?: string | number;
  hasPin?: boolean;
};

const ADMIN_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "ERP_MANAGER", "MANAGER"]);

const AuthContext = createContext<{
  token: string | null;
  user: User | null;
  setToken: (token: string | null) => void;
  logout: () => void;
  hasAnyRole: (roles?: string[]) => boolean;
  isAdmin: boolean;
  refreshUser: () => Promise<void>;
}>({
  token: null,
  user: null,
  setToken: () => {},
  logout: () => {},
  hasAnyRole: () => false,
  isAdmin: false,
  refreshUser: async () => {},
});

async function fetchMe(token: string): Promise<User | null> {
  try {
    const r = await apiFetch("/api/v1/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const j = await r.json();
    return (j?.data ?? null) as User | null;
  } catch {
    return null;
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem("erp_token"));
  const [user, setUser] = useState<User | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem("erp_token"));
    setUnauthorizedHandler(() => {
      // Stale/expired token: clear it and bounce to login so a 401 doesn't
      // leave the user stuck on a "Failed to load…" error screen.
      if (localStorage.getItem("erp_token")) {
        localStorage.removeItem("erp_token");
        setTokenState(null);
        setUser(null);
        setLocation("/login");
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [setLocation]);

  // Whenever the token changes, refresh the cached user profile so role
  // checks (sidebar, route guards) immediately reflect who's signed in.
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setUser(null);
      return;
    }
    fetchMe(token).then((u) => {
      if (!cancelled) setUser(u);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const setToken = (newToken: string | null) => {
    if (newToken) {
      localStorage.setItem("erp_token", newToken);
    } else {
      localStorage.removeItem("erp_token");
    }
    setTokenState(newToken);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setLocation("/login");
  };

  const hasAnyRole = useCallback(
    (roles?: string[]) => {
      if (!roles || roles.length === 0) return true; // unrestricted
      if (!user?.role) return false;
      return roles.includes(user.role);
    },
    [user],
  );

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const u = await fetchMe(token);
    setUser(u);
  }, [token]);

  const isAdmin = ADMIN_ROLES.has(user?.role ?? "");

  return (
    <AuthContext.Provider value={{ token, user, setToken, logout, hasAnyRole, isAdmin, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
