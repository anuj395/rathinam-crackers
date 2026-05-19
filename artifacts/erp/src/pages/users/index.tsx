import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Loader2, Store, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type User = {
  id: string;
  name: string;
  username: string;
  role: string;
  email: string | null;
  phone: string | null;
  locationIds: string[] | null;
  maxDiscountPct: string | null;
  isActive: boolean;
};

type Location = { id: string; name: string; type: string; city: string | null; isActive: boolean };

type UserForm = {
  id?: string;
  name: string;
  username: string;
  role: string;
  password: string;
  pin: string;
  email: string;
  phone: string;
  locationIds: string[];
  isActive: boolean;
};

const ROLES = [
  { value: "CASHIER", label: "Cashier (POS)", needsLocations: true, default: true },
  { value: "WH_MANAGER", label: "Warehouse Manager", needsLocations: true, default: false },
  { value: "ERP_MANAGER", label: "ERP Manager", needsLocations: false, default: false },
  { value: "ACCOUNTANT", label: "Accountant", needsLocations: false, default: false },
  { value: "AGENT", label: "Sales Agent", needsLocations: false, default: false },
  { value: "SUPER_ADMIN", label: "Super Admin", needsLocations: false, default: false },
];

const emptyForm: UserForm = {
  name: "",
  username: "",
  role: "CASHIER",
  password: "",
  pin: "",
  email: "",
  phone: "",
  locationIds: [],
  isActive: true,
};

const apiFetch = async (url: string, init?: RequestInit) => {
  const token = localStorage.getItem("erp_token") || "";
  const r = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || json?.success === false) {
    throw new Error(json?.error?.message || `Request failed (${r.status})`);
  }
  return json;
};

const roleBadge = (role: string) => {
  const tone =
    role === "SUPER_ADMIN" ? "destructive"
    : role === "ERP_MANAGER" ? "default"
    : role === "CASHIER" ? "secondary"
    : "outline";
  return <Badge variant={tone as any}>{role.replace(/_/g, " ")}</Badge>;
};

export default function UsersList() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<UserForm>(emptyForm);

  const { data: usersResp, isLoading } = useQuery<{ data: User[] }>({
    queryKey: ["users"],
    queryFn: () => apiFetch("/api/v1/users"),
  });
  const users = usersResp?.data ?? [];

  // Locations are needed both for the multi-select in the dialog and for
  // showing shop-name badges in the user table — load once.
  const { data: locsResp } = useQuery<{ data: Location[] }>({
    queryKey: ["locations"],
    queryFn: () => apiFetch("/api/v1/locations"),
  });
  const locations = locsResp?.data ?? [];
  const shops = useMemo(() => locations.filter((l) => l.type === "shop" && l.isActive), [locations]);
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? id;

  const roleNeedsLocations = useMemo(
    () => ROLES.find((r) => r.value === form.role)?.needsLocations ?? false,
    [form.role],
  );

  // Snap locationIds when role changes from a needs-location to one that
  // doesn't, so admins don't accidentally save stale assignments.
  useEffect(() => {
    if (!roleNeedsLocations && form.locationIds.length > 0) {
      setForm((p) => ({ ...p, locationIds: [] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.role]);

  const createMut = useMutation({
    mutationFn: (f: UserForm) =>
      apiFetch("/api/v1/users", {
        method: "POST",
        body: JSON.stringify({
          name: f.name.trim(),
          username: f.username.trim(),
          role: f.role,
          password: f.password,
          pin: f.pin || null,
          email: f.email.trim() || null,
          phone: f.phone.trim() || null,
          locationIds: f.locationIds,
          isActive: f.isActive,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "User created" });
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiFetch(`/api/v1/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fail = (title: string) => { toast({ title, variant: "destructive" }); };
    if (!form.name.trim()) { fail("Name is required"); return; }
    if (!form.username.trim()) { fail("Username is required"); return; }
    if (!form.id && !form.password) { fail("Password is required for new users"); return; }
    if (form.role === "CASHIER" && !form.pin) { fail("Cashiers need a 4-digit PIN for POS login"); return; }
    if (form.pin && !/^\d{4}$/.test(form.pin)) { fail("PIN must be exactly 4 digits"); return; }
    if (roleNeedsLocations && form.locationIds.length === 0) {
      fail(form.role === "CASHIER" ? "Pick at least one shop for this cashier" : "Pick at least one location");
      return;
    }
    if (form.id) {
      updateMut.mutate(
        {
          id: form.id,
          body: {
            name: form.name.trim(),
            username: form.username.trim(),
            role: form.role,
            ...(form.password ? { password: form.password } : {}),
            pin: form.pin || null,
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            locationIds: form.locationIds,
            isActive: form.isActive,
          },
        },
        {
          onSuccess: () => {
            toast({ title: "User updated" });
            setDialogOpen(false);
            setForm(emptyForm);
          },
        },
      );
    } else {
      createMut.mutate(form);
    }
  };

  const openNew = () => { setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (u: User) => {
    setForm({
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      password: "",
      pin: "",
      email: u.email ?? "",
      phone: u.phone ?? "",
      locationIds: u.locationIds ?? [],
      isActive: u.isActive,
    });
    setDialogOpen(true);
  };

  const toggleActive = (u: User) =>
    updateMut.mutate(
      { id: u.id, body: { isActive: !u.isActive } },
      { onSuccess: () => toast({ title: u.isActive ? "User disabled" : "User enabled" }) },
    );

  const toggleLocation = (id: string) =>
    setForm((p) => ({
      ...p,
      locationIds: p.locationIds.includes(id) ? p.locationIds.filter((x) => x !== id) : [...p.locationIds, id],
    }));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">System Users</h2>
          <p className="text-muted-foreground">
            Create cashiers and assign each one to the shop(s) they work at. Cashiers only see shops they belong to in the POS.
          </p>
        </div>
        <Button onClick={openNew} data-testid="btn-new-user">
          <Plus className="mr-2 h-4 w-4" /> New User
        </Button>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Assigned shops</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
              ))
            ) : users.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No users found.</TableCell></TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="font-mono text-xs">{u.username}</TableCell>
                  <TableCell>{roleBadge(u.role)}</TableCell>
                  <TableCell>
                    {(u.locationIds ?? []).length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">
                        {u.role === "CASHIER" ? "No shops — cannot log in to POS" : "All / N/A"}
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(u.locationIds ?? []).map((id) => (
                          <Badge key={id} variant="secondary" className="text-xs">
                            <Store className="h-3 w-3 mr-1" />
                            {locationName(id)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch checked={u.isActive} onCheckedChange={() => toggleActive(u)} disabled={updateMut.isPending} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{form.id ? "Edit user" : "New user"}</DialogTitle>
              <DialogDescription>
                Cashiers (default) need a 4-digit PIN and at least one shop. Other roles don't need shop assignments.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full name *</Label>
                  <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Username *</Label>
                  <Input
                    value={form.username}
                    onChange={(e) => setForm((p) => ({ ...p, username: e.target.value.replace(/\s+/g, "").toLowerCase() }))}
                    className="font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Role *</Label>
                  <Select value={form.role} onValueChange={(v) => setForm((p) => ({ ...p, role: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}{r.default ? " — default" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{form.role === "CASHIER" ? "PIN (4 digits) *" : "PIN (4 digits, optional)"}</Label>
                  <Input
                    value={form.pin}
                    onChange={(e) => setForm((p) => ({ ...p, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                    placeholder="1234"
                    maxLength={4}
                    inputMode="numeric"
                    className="font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{form.id ? "New password (leave blank to keep)" : "Password *"}</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    required={!form.id}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              </div>

              {roleNeedsLocations && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{form.role === "CASHIER" ? "Assigned shops *" : "Assigned locations *"}</Label>
                    <span className="text-xs text-muted-foreground">{form.locationIds.length} selected</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {form.role === "CASHIER"
                      ? "On the POS terminal, this cashier will only appear when one of these shops is selected."
                      : "Locations this user can manage."}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {shops.length === 0 && (
                      <p className="text-sm text-muted-foreground italic col-span-2">
                        No active shops yet. Add one under Settings → Locations first.
                      </p>
                    )}
                    {shops.map((s) => {
                      const checked = form.locationIds.includes(s.id);
                      return (
                        <button
                          type="button"
                          key={s.id}
                          onClick={() => toggleLocation(s.id)}
                          aria-pressed={checked}
                          className={`flex items-center gap-2 rounded-md border p-3 text-left text-sm transition ${
                            checked ? "border-primary bg-primary/5" : "hover:bg-accent"
                          }`}
                          data-testid={`location-${s.id}`}
                        >
                          <Store className={`h-4 w-4 ${checked ? "text-primary" : "text-muted-foreground"}`} />
                          <div className="flex-1">
                            <div className="font-medium">{s.name}</div>
                            {s.city && <div className="text-xs text-muted-foreground">{s.city}</div>}
                          </div>
                          <span
                            aria-hidden="true"
                            className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                              checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                            }`}
                          >
                            {checked && <Check className="h-3 w-3" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label className="text-sm">Active</Label>
                  <p className="text-xs text-muted-foreground">Inactive users cannot log in.</p>
                </div>
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {form.id ? "Save changes" : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
