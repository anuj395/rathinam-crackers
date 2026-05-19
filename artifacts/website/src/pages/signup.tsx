import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useShopSignup } from "@workspace/api-client-react";
import { useShopAuth } from "@/context/auth";
import { useToast } from "@/hooks/use-toast";
import { UserPlus } from "lucide-react";

export default function Signup() {
  const [, navigate] = useLocation();
  const { setSession } = useShopAuth();
  const { toast } = useToast();
  const signup = useShopSignup();
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "" });

  const handle = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await signup.mutateAsync({ data: form });
      const data = (res as any).data;
      setSession(data.token, data.customer);
      toast({ title: "Welcome to Rathinam Crackers!", description: "Your account is ready." });
      navigate("/account");
    } catch (e: any) {
      toast({ title: "Signup failed", description: e?.data?.error?.message || "Please try again.", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 grid place-items-center">
              <UserPlus className="h-5 w-5 text-amber-600" />
            </div>
            <h1 className="text-2xl font-extrabold">Create your account</h1>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Full name</Label>
              <Input value={form.name} onChange={handle("name")} required data-testid="signup-name" />
            </div>
            <div>
              <Label>Phone (10 digits)</Label>
              <Input value={form.phone} onChange={handle("phone")} required data-testid="signup-phone" />
            </div>
            <div>
              <Label>Email (optional)</Label>
              <Input type="email" value={form.email} onChange={handle("email")} data-testid="signup-email" />
            </div>
            <div>
              <Label>Password (6+ chars)</Label>
              <Input type="password" value={form.password} onChange={handle("password")} required data-testid="signup-password" />
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 h-12 text-primary-foreground" disabled={signup.isPending} data-testid="signup-submit">
              {signup.isPending ? "Creating…" : "Create account"}
            </Button>
          </form>
          <p className="text-sm text-gray-600 mt-6 text-center">
            Already a customer?{" "}
            <Link href="/login" className="text-primary font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}
