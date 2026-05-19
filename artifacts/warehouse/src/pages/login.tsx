import React, { useState } from "react";
import { mediaUrl } from "../lib/api";
import { useLocation } from "wouter";
import { useLogin, setAuthTokenGetter } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import logoUrl from "@assets/rathinam_logo.png";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  
  const loginMutation = useLogin({
    mutation: {
      onSuccess: (response) => {
        const token = response.data?.accessToken;
        if (!token) {
          toast({ title: "Login failed", description: "No token received", variant: "destructive" });
          return;
        }
        localStorage.setItem("wh_token", token);
        setAuthTokenGetter(() => localStorage.getItem("wh_token"));
        toast({
          title: "Login successful",
          description: "Welcome to Rathinam Warehouse Management System",
        });
        setLocation("/");
      },
      onError: (error: any) => {
        toast({
          title: "Login failed",
          description: error.response?.data?.message || "Invalid credentials",
          variant: "destructive",
        });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ data: { username, password } });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(197,65%,18%)] via-[hsl(200,30%,12%)] to-[hsl(200,35%,5%)] px-4">
      <Card className="w-full max-w-md border-[hsl(197,50%,22%)] bg-[hsl(200,30%,10%)] text-zinc-100 shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 inline-flex items-center justify-center h-24 w-24 rounded-3xl bg-white/95 p-3 shadow-xl shadow-black/30 ring-1 ring-amber-300/40">
            <img src={mediaUrl(logoUrl)} alt="Rathinam Crackers" className="h-full w-full object-contain" />
          </div>
          <CardTitle className="text-xl font-bold tracking-wide text-amber-300 uppercase">Warehouse Operations</CardTitle>
          <CardDescription className="text-zinc-400">Enter your credentials to access the warehouse system</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-zinc-300">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="bg-[hsl(200,35%,7%)] border-[hsl(197,50%,22%)] text-zinc-100 focus-visible:ring-amber-400"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-zinc-300">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-[hsl(200,35%,7%)] border-[hsl(197,50%,22%)] text-zinc-100 focus-visible:ring-amber-400"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              className="w-full bg-amber-400 text-[hsl(197,65%,12%)] hover:bg-amber-300 font-semibold"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "Logging in..." : "Login"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
