import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useShopLogin } from "@workspace/api-client-react";
import { useShopAuth } from "@/context/auth";
import { useToast } from "@/hooks/use-toast";
import { LogIn } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const { setSession } = useShopAuth();
  const { toast } = useToast();
  const login = useShopLogin();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await login.mutateAsync({ data: { identifier, password } });
      const data = (res as any).data;
      setSession(data.token, data.customer);
      toast({ title: "Welcome back!", description: `Hi ${data.customer.name}.` });
      const next = new URLSearchParams(window.location.search).get("next") || "/account";
      navigate(next);
    } catch (e: any) {
      toast({ title: "Login failed", description: e?.data?.error?.message || "Check your credentials.", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 grid place-items-center">
              <LogIn className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-2xl font-extrabold">Login to your account</h1>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Email or phone</Label>
              <Input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="9876543210 or you@email.com"
                required
                data-testid="login-identifier"
              />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="login-password"
              />
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 h-12 text-primary-foreground" disabled={login.isPending} data-testid="login-submit">
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="text-sm text-gray-600 mt-6 text-center">
            New to Rathinam Crackers?{" "}
            <Link href="/signup" className="text-primary font-semibold hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}
