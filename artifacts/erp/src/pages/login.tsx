import { useState } from "react";
import { mediaUrl } from "../lib/api";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import logoUrl from "@assets/rathinam_logo.png";

export default function Login() {
  const [, setLocation] = useLocation();
  const { setToken } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  
  const loginMutation = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(
      { data: { username, password } },
      {
        onSuccess: (res) => {
          if (res.data?.accessToken) {
            setToken(res.data.accessToken);
            setLocation("/");
          }
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[hsl(197,65%,12%)] via-[hsl(197,65%,18%)] to-[hsl(200,35%,5%)] p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 inline-flex items-center justify-center h-24 w-24 rounded-3xl bg-white/95 p-3 shadow-xl shadow-black/30 ring-1 ring-amber-300/40">
            <img src={mediaUrl(logoUrl)} alt="Rathinam Crackers" className="h-full w-full object-contain" />
          </div>
          <p className="text-amber-300 font-semibold tracking-[0.2em] uppercase text-xs">ERP Operations Console</p>
        </div>

        <Card className="border-[hsl(197,50%,22%)] bg-[hsl(200,30%,10%)] text-zinc-100 shadow-2xl">
          <form onSubmit={handleSubmit}>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl text-white">Staff Login</CardTitle>
              <CardDescription className="text-zinc-400">
                Enter your credentials to access the terminal
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loginMutation.isError && (
                <Alert variant="destructive" className="bg-red-950 border-red-900 text-red-200">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Invalid credentials. Please try again.
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="username" className="text-zinc-300">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="bg-[hsl(200,35%,7%)] border-[hsl(197,50%,22%)] text-zinc-100 focus-visible:ring-amber-400"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-zinc-300">Password</Label>
                </div>
                <Input
                  id="password"
                  type="password"
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
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold" 
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Authenticating..." : "Sign In"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
