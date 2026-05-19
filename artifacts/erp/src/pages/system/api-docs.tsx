import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Ban, Copy, Check, Loader2, AlertCircle, KeyRound } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiFetch as baseApiFetch } from "../../lib/api";

type ApiToken = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[] | null;
  createdById: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

const apiFetch = async (url: string, init?: RequestInit) => {
  const token = localStorage.getItem("erp_token") || "";
  const r = await baseApiFetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const json = await r.json();
  if (!r.ok || json?.success === false) {
    throw new Error(json?.error?.message || `Request failed (${r.status})`);
  }
  return json.data;
};

// Pretty-formatted dates so empty cells read as "—" instead of "null".
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

const statusOf = (t: ApiToken): { label: string; tone: "active" | "revoked" | "expired" } => {
  if (t.revokedAt) return { label: "Revoked", tone: "revoked" };
  if (t.expiresAt && new Date(t.expiresAt).getTime() < Date.now()) return { label: "Expired", tone: "expired" };
  return { label: "Active", tone: "active" };
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function TokenManager() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [newToken, setNewToken] = useState<string | null>(null);

  const { data: tokens, isLoading } = useQuery<ApiToken[]>({
    queryKey: ["api-tokens"],
    queryFn: () => apiFetch("/api/v1/api-tokens"),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Token name is required");
      return apiFetch("/api/v1/api-tokens", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      }) as Promise<ApiToken & { token: string }>;
    },
    onSuccess: (data) => {
      setNewToken(data.token);
      qc.invalidateQueries({ queryKey: ["api-tokens"] });
      setName("");
      setExpiresAt("");
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/api-tokens/${id}/revoke`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-tokens"] });
      toast({ title: "Token revoked" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/api-tokens/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-tokens"] });
      toast({ title: "Token deleted" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setNewToken(null);
    setName("");
    setExpiresAt("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">API tokens</h2>
          <p className="text-sm text-muted-foreground">
            Long-lived tokens for third-party systems (warehouse scanners, accounting, partners).
            Treat each token like a password — anyone holding it can read and write your ERP data.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="btn-create-token">
          <Plus className="h-4 w-4 mr-2" /> Create token
        </Button>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(7)].map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !tokens || tokens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No API tokens yet. Create one to share with a third-party system.
                </TableCell>
              </TableRow>
            ) : (
              tokens.map((t) => {
                const s = statusOf(t);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="font-mono text-xs">{t.prefix}…</TableCell>
                    <TableCell>
                      <Badge
                        variant={s.tone === "active" ? "default" : "secondary"}
                        className={s.tone === "revoked" ? "bg-destructive text-destructive-foreground" : s.tone === "expired" ? "bg-muted text-muted-foreground" : ""}
                      >
                        {s.label}
                      </Badge>
                    </TableCell>
                    <TableCell>{fmtDate(t.lastUsedAt)}</TableCell>
                    <TableCell>{fmtDate(t.expiresAt)}</TableCell>
                    <TableCell>{fmtDate(t.createdAt)}</TableCell>
                    <TableCell className="text-right space-x-2">
                      {!t.revokedAt && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => revokeMut.mutate(t.id)}
                          disabled={revokeMut.isPending}
                        >
                          <Ban className="h-3.5 w-3.5 mr-1" /> Revoke
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          if (confirm(`Permanently delete "${t.name}"? Any system using it will stop working immediately.`)) {
                            deleteMut.mutate(t.id);
                          }
                        }}
                        disabled={deleteMut.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => (o ? setDialogOpen(true) : closeDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{newToken ? "Token created" : "Create API token"}</DialogTitle>
            <DialogDescription>
              {newToken
                ? "Copy the token now — it will never be shown again."
                : "Give this token a recognisable name so you know where it is being used."}
            </DialogDescription>
          </DialogHeader>

          {newToken ? (
            <div className="space-y-4">
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-3 text-sm flex gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
                <span>This is the only time the full token is shown. Store it in your partner's secret manager now.</span>
              </div>
              <div className="font-mono text-xs break-all p-3 bg-muted rounded-md border">{newToken}</div>
              <div className="flex justify-end">
                <CopyButton value={newToken} />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Warehouse scanner — Madurai"
                  data-testid="token-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Expires (optional)</Label>
                <Input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Leave blank for a token that never expires.</p>
              </div>
            </div>
          )}

          <DialogFooter>
            {newToken ? (
              <Button onClick={closeDialog}>I have saved it — Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                  {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create token
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Documented endpoints. Kept short and curated — full schemas live in the
// OpenAPI spec at /lib/api-spec/openapi.yaml. Marketing this as "common
// endpoints" sets the right expectation.
const endpoints: Array<{ method: string; path: string; desc: string }> = [
  { method: "GET", path: "/api/v1/products", desc: "List products (filters: search, category, brand, page, limit)" },
  { method: "GET", path: "/api/v1/products/:id", desc: "Fetch a single product with variants & GST info" },
  { method: "POST", path: "/api/v1/products", desc: "Create a product" },
  { method: "PATCH", path: "/api/v1/products/:id", desc: "Update product details, variants or pricing" },
  { method: "GET", path: "/api/v1/categories", desc: "List active product categories" },
  { method: "GET", path: "/api/v1/brands", desc: "List brands" },
  { method: "GET", path: "/api/v1/customers", desc: "List customers (search, page, limit)" },
  { method: "POST", path: "/api/v1/customers", desc: "Create a customer" },
  { method: "GET", path: "/api/v1/invoices", desc: "List invoices (status, customerId, locationId, from, to)" },
  { method: "GET", path: "/api/v1/invoices/:id", desc: "Fetch invoice with line items + payments" },
  { method: "GET", path: "/api/v1/stock", desc: "Live on-hand quantity per location & variant" },
  { method: "POST", path: "/api/v1/stock/adjust", desc: "Adjust stock with a reason (audit-logged)" },
  { method: "GET", path: "/api/v1/dashboard/summary", desc: "Headline KPIs (sales, dues, stock value)" },
];

const methodTone: Record<string, string> = {
  GET: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  POST: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  PATCH: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  PUT: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  DELETE: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

function ApiDocs() {
  const baseUrl = useMemo(() => {
    if (typeof window === "undefined") return "https://your-erp.example.com";
    return `${window.location.origin}`;
  }, []);

  const curlExample = `curl -X GET "${baseUrl}/api/v1/products?limit=5" \\
  -H "Authorization: Bearer rkc_YOUR_API_TOKEN_HERE"`;

  const createCustomerExample = `curl -X POST "${baseUrl}/api/v1/customers" \\
  -H "Authorization: Bearer rkc_YOUR_API_TOKEN_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Acme Traders","phone":"9876543210","gstin":"33ABCDE1234F1Z5"}'`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">API documentation</h2>
        <p className="text-sm text-muted-foreground">
          Programmatic access for our own systems and trusted third parties. All endpoints accept and return JSON.
        </p>
      </div>

      {/* Quick-start info card. */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="border rounded-md p-4 bg-card space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Base URL</div>
          <div className="font-mono text-sm break-all">{baseUrl}/api/v1</div>
        </div>
        <div className="border rounded-md p-4 bg-card space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Authentication</div>
          <div className="font-mono text-xs">Authorization: Bearer rkc_…</div>
          <div className="text-xs text-muted-foreground">Send your API token on every request.</div>
        </div>
        <div className="border rounded-md p-4 bg-card space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Rate limit</div>
          <div className="text-sm">600 requests / minute / token</div>
          <div className="text-xs text-muted-foreground">Contact us if you need more headroom.</div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">Quick start</h3>
        <ol className="list-decimal list-inside text-sm space-y-1 text-muted-foreground">
          <li>Create an API token in the <strong>Tokens</strong> tab — copy the value (shown once).</li>
          <li>Send it as a Bearer token in the <code>Authorization</code> header.</li>
          <li>All responses follow <code>{`{ success: boolean, data?: T, error?: { code, message } }`}</code>.</li>
        </ol>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">List products</h3>
          <CopyButton value={curlExample} />
        </div>
        <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto border">{curlExample}</pre>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Create a customer</h3>
          <CopyButton value={createCustomerExample} />
        </div>
        <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto border">{createCustomerExample}</pre>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">Common endpoints</h3>
        <div className="border rounded-md bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Method</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {endpoints.map((e) => (
                <TableRow key={`${e.method} ${e.path}`}>
                  <TableCell>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${methodTone[e.method] ?? ""}`}>
                      {e.method}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.path}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.desc}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          Need the full schema? The complete OpenAPI spec lives in <code>lib/api-spec/openapi.yaml</code>.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">Error codes</h3>
        <div className="border rounded-md bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">HTTP</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Meaning</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow><TableCell>400</TableCell><TableCell><code>VALIDATION</code></TableCell><TableCell>Request body or query is malformed</TableCell></TableRow>
              <TableRow><TableCell>401</TableCell><TableCell><code>UNAUTHORIZED</code> / <code>INVALID_TOKEN</code></TableCell><TableCell>Missing or invalid API token</TableCell></TableRow>
              <TableRow><TableCell>403</TableCell><TableCell><code>FORBIDDEN</code></TableCell><TableCell>Token lacks required permission</TableCell></TableRow>
              <TableRow><TableCell>404</TableCell><TableCell><code>NOT_FOUND</code></TableCell><TableCell>Resource does not exist</TableCell></TableRow>
              <TableRow><TableCell>409</TableCell><TableCell><code>CONFLICT</code></TableCell><TableCell>Duplicate key or state conflict</TableCell></TableRow>
              <TableRow><TableCell>500</TableCell><TableCell><code>INTERNAL</code></TableCell><TableCell>Unexpected server error — please retry</TableCell></TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

export default function ApiDocsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
          <KeyRound className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">API access</h1>
          <p className="text-sm text-muted-foreground">
            Generate tokens and read the integration docs for connecting external systems to Rathinam Crackers.
          </p>
        </div>
      </div>

      <Tabs defaultValue="tokens">
        <TabsList>
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
          <TabsTrigger value="docs">Documentation</TabsTrigger>
        </TabsList>
        <TabsContent value="tokens" className="pt-4">
          <TokenManager />
        </TabsContent>
        <TabsContent value="docs" className="pt-4">
          <ApiDocs />
        </TabsContent>
      </Tabs>
    </div>
  );
}
