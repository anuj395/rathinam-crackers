import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { AlertTriangle, Database, RefreshCw, Sparkles } from "lucide-react";
import { apiFetch } from "../../lib/api";

type Stats = {
  invoices: number;
  estimates: number;
  customers: number;
  products: number;
  stockLedger: number;
  auditLog: number;
};

export default function DemoDataPage() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"" | "stats" | "reset" | "seed">("");
  const [lastResult, setLastResult] = useState<any>(null);

  if (user && user.role !== "SUPER_ADMIN") {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Restricted</AlertTitle>
          <AlertDescription>
            Demo data tools are reserved for the Super Admin so production data can't be
            wiped accidentally. Sign in as <code>SUPER_ADMIN</code> to continue.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  async function api(path: string, body?: any) {
    const r = await apiFetch(`/api/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok || !j.success) throw new Error(j?.error?.message ?? `HTTP ${r.status}`);
    return j.data;
  }

  async function loadStats() {
    setBusy("stats");
    try {
      setStats(await api("/system/demo/stats"));
    } catch (e: any) {
      toast({ title: "Couldn't load stats", description: e.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  }

  async function doReset() {
    if (confirm !== "RESET") {
      toast({ title: "Type RESET to confirm", variant: "destructive" });
      return;
    }
    setBusy("reset");
    try {
      const data = await api("/system/demo/reset", { confirm: "RESET" });
      setLastResult({ kind: "reset", ...data });
      setConfirm("");
      await loadStats();
      toast({ title: "Database reset complete" });
    } catch (e: any) {
      toast({ title: "Reset failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  }

  async function doSeed() {
    setBusy("seed");
    try {
      const data = await api("/system/demo/seed", {});
      setLastResult({ kind: "seed", ...data });
      await loadStats();
      toast({ title: "Demo data seeded" });
    } catch (e: any) {
      toast({ title: "Seed failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Database className="h-7 w-7" /> Demo Data
        </h1>
        <p className="text-muted-foreground mt-1">
          Reset the transactional tables back to an empty state, or seed a small
          deterministic batch of demo records on top of your existing catalog.
          Master data (products, customers, brands, settings) is preserved.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Current row counts</CardTitle>
          <CardDescription>Snapshot of how much data lives in the database right now.</CardDescription>
        </CardHeader>
        <CardContent>
          {stats ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {Object.entries(stats).map(([k, v]) => (
                <div key={k} className="rounded-md border p-3 bg-muted/30">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{k}</div>
                  <div className="text-2xl font-semibold">{v}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Click "Refresh stats" to load.</p>
          )}
          <Button onClick={loadStats} disabled={busy === "stats"} className="mt-4" variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${busy === "stats" ? "animate-spin" : ""}`} />
            Refresh stats
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Reset transactional data
          </CardTitle>
          <CardDescription>
            Wipes invoices, estimates, returns, ledgers, shifts, audit logs, idempotency
            keys, packing/transfer/PO records, notifications, and customer outstanding
            balances. <strong>Cannot be undone.</strong> Take a backup first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="confirm">Type <code className="px-1 bg-muted rounded">RESET</code> to enable the button</Label>
            <Input
              id="confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="RESET"
              className="max-w-sm mt-1"
            />
          </div>
          <Button
            variant="destructive"
            disabled={confirm !== "RESET" || busy === "reset"}
            onClick={doReset}
          >
            {busy === "reset" ? "Resetting..." : "Reset transactional data"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> Seed demo records
          </CardTitle>
          <CardDescription>
            Adds two walk-in customers, a paid retail invoice, an open estimate, and an
            open POS shift. Idempotent — safe to run multiple times.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={doSeed} disabled={busy === "seed"}>
            {busy === "seed" ? "Seeding..." : "Seed demo data"}
          </Button>
        </CardContent>
      </Card>

      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle>Last operation</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">{JSON.stringify(lastResult, null, 2)}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
