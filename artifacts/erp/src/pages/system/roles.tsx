import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Plus, ShieldCheck, Trash2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Role = { id: string; name: string; description: string | null; isSystem: boolean; permissions: string[]; userCount: number };
type Permission = { key: string; description: string; category: string };

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("erp_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json?.error?.message ?? "Request failed");
  return json.data as T;
}

export default function RolesPage() {
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [draftDescription, setDraftDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const reload = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        api<Role[]>("/v1/rbac/roles"),
        api<Permission[]>("/v1/rbac/permissions"),
      ]);
      setRoles(r);
      setPermissions(p);
      if (!activeRoleId && r.length) setActiveRoleId(r[0].id);
    } catch (err: any) {
      toast({ title: "Could not load roles", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const activeRole = roles.find((r) => r.id === activeRoleId) ?? null;

  // Sync the draft permission set when the selected role changes.
  useEffect(() => {
    if (activeRole) {
      setDraft(new Set(activeRole.permissions));
      setDraftDescription(activeRole.description ?? "");
    } else {
      setDraft(new Set());
      setDraftDescription("");
    }
  }, [activeRole?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => {
    const out: Record<string, Permission[]> = {};
    for (const p of permissions) (out[p.category] ??= []).push(p);
    return out;
  }, [permissions]);

  const isSuperAdmin = activeRole?.name === "SUPER_ADMIN";
  const dirty = activeRole
    ? draftDescription !== (activeRole.description ?? "") ||
      draft.size !== activeRole.permissions.length ||
      activeRole.permissions.some((k) => !draft.has(k))
    : false;

  const togglePerm = (key: string) => {
    if (isSuperAdmin) return;
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = async () => {
    if (!activeRole) return;
    setSaving(true);
    try {
      await api(`/v1/rbac/roles/${activeRole.id}`, {
        method: "PUT",
        body: JSON.stringify({ description: draftDescription, permissions: Array.from(draft) }),
      });
      toast({ title: "Saved", description: `Updated ${activeRole.name}` });
      await reload();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const create = async () => {
    if (!/^[A-Z][A-Z0-9_]{1,40}$/.test(newName)) {
      toast({ title: "Invalid name", description: "Use UPPER_SNAKE, starting with a letter (e.g. STORE_MANAGER).", variant: "destructive" });
      return;
    }
    try {
      const created = await api<Role>("/v1/rbac/roles", {
        method: "POST",
        body: JSON.stringify({ name: newName, description: newDescription || undefined, permissions: [] }),
      });
      setCreateOpen(false);
      setNewName(""); setNewDescription("");
      await reload();
      setActiveRoleId(created.id);
      toast({ title: "Role created", description: created.name });
    } catch (err: any) {
      toast({ title: "Create failed", description: err.message, variant: "destructive" });
    }
  };

  const remove = async () => {
    if (!activeRole || activeRole.isSystem) return;
    if (!confirm(`Delete role "${activeRole.name}"? This cannot be undone.`)) return;
    try {
      await api(`/v1/rbac/roles/${activeRole.id}`, { method: "DELETE" });
      setActiveRoleId(null);
      await reload();
      toast({ title: "Role deleted" });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  if (loading && roles.length === 0) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-amber-500" /> Roles & Permissions</h1>
          <p className="text-sm text-muted-foreground">Define what each role can do. System roles can be re-scoped but not renamed or deleted.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="new-role-btn"><Plus className="h-4 w-4 mr-1" /> New role</Button>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-4">
          <CardHeader><CardTitle className="text-sm">Roles</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {roles.map((r) => (
              <button
                key={r.id}
                onClick={() => setActiveRoleId(r.id)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${activeRoleId === r.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"}`}
                data-testid={`role-row-${r.name}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{r.name}</span>
                  <div className="flex gap-1">
                    {r.isSystem && <Badge variant="secondary" className="text-[10px]">System</Badge>}
                    <Badge variant="outline" className="text-[10px]">{r.userCount}</Badge>
                  </div>
                </div>
                {r.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{r.description}</p>}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="col-span-8">
          {activeRole ? (
            <>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{activeRole.name}</span>
                  <div className="flex gap-2">
                    {!activeRole.isSystem && (
                      <Button variant="outline" size="sm" onClick={remove} className="text-red-600">
                        <Trash2 className="h-4 w-4 mr-1" /> Delete
                      </Button>
                    )}
                    <Button size="sm" onClick={save} disabled={!dirty || saving || isSuperAdmin} data-testid="save-role-btn">
                      {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs">Description</Label>
                  <Input
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                    placeholder="What does this role do?"
                    disabled={isSuperAdmin}
                  />
                </div>

                {isSuperAdmin && (
                  <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-md p-2">
                    Super-admin always has full access — its permission set cannot be edited.
                  </p>
                )}

                <div className="space-y-3">
                  {Object.entries(grouped).map(([cat, perms]) => (
                    <div key={cat} className="rounded-md border">
                      <div className="px-3 py-2 bg-muted/50 text-xs font-semibold uppercase tracking-wide">{cat}</div>
                      <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                        {perms.map((p) => (
                          <label key={p.key} className={`flex items-start gap-2 text-sm cursor-pointer ${isSuperAdmin ? "opacity-60" : ""}`}>
                            <Checkbox
                              checked={draft.has(p.key)}
                              onCheckedChange={() => togglePerm(p.key)}
                              disabled={isSuperAdmin}
                              data-testid={`perm-${p.key}`}
                            />
                            <span>
                              <span className="font-medium">{p.key}</span>
                              <span className="block text-xs text-muted-foreground">{p.description}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="p-8 text-center text-sm text-muted-foreground">Select a role to edit its permissions.</CardContent>
          )}
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New role</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value.toUpperCase())} placeholder="E.G. STORE_MANAGER" />
              <p className="text-[11px] text-muted-foreground mt-1">UPPER_SNAKE, 2–41 chars, starts with a letter.</p>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="What does this role do?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={create} data-testid="create-role-confirm">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
