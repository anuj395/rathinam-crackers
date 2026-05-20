import { useState, useEffect } from "react";
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
import { Plus, Building2, Store, Pencil, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { BulkIO } from "@/components/bulk-io";

type LocationType = "warehouse" | "shop";

type Location = {
  id: string;
  name: string;
  type: LocationType;
  city: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
};

type FormState = {
  id?: string;
  name: string;
  type: LocationType;
  city: string;
  phone: string;
  address: string;
  isActive: boolean;
};

const emptyForm: FormState = {
  name: "",
  type: "shop",
  city: "",
  phone: "",
  address: "",
  isActive: true,
};

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$|\/$/, "");

const apiFetch = async (url: string, init?: RequestInit) => {
  const token = localStorage.getItem("erp_token") || "";
  const res = await fetch(`${API_BASE}${url}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error?.message || `Request failed (${res.status})`);
  }
  return json;
};

export default function LocationsList() {
  const { toast } = useToast();
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = async () => {
    setIsLoading(true);
    try {
      const json = await apiFetch("/api/v1/locations");
      setLocations(json.data ?? []);
    } catch (err: any) {
      toast({ title: "Could not load locations", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const openNew = () => { setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (loc: Location) => {
    setForm({
      id: loc.id,
      name: loc.name,
      type: loc.type,
      city: loc.city ?? "",
      phone: loc.phone ?? "",
      address: loc.address ?? "",
      isActive: loc.isActive,
    });
    setDialogOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    if (!form.address.trim()) { toast({ title: "Address is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        type: form.type,
        city: form.city.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim(),
        isActive: form.isActive,
      };
      if (form.id) {
        await apiFetch(`/api/v1/locations/${form.id}`, { method: "PUT", body: JSON.stringify(body) });
        toast({ title: "Location updated" });
      } else {
        await apiFetch("/api/v1/locations", { method: "POST", body: JSON.stringify(body) });
        toast({ title: "Location created" });
      }
      setDialogOpen(false);
      setForm(emptyForm);
      await reload();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (loc: Location) => {
    setBusyId(loc.id);
    try {
      await apiFetch(`/api/v1/locations/${loc.id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !loc.isActive }),
      });
      await reload();
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (loc: Location) => {
    if (!confirm(`Delete "${loc.name}"? This cannot be undone, and will fail if any stock or users reference it.`)) return;
    setBusyId(loc.id);
    try {
      await apiFetch(`/api/v1/locations/${loc.id}`, { method: "DELETE" });
      toast({ title: "Location deleted" });
      await reload();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const typeLabel = (t: LocationType) => (t === "warehouse" ? "Warehouse" : "Shop");

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Business Locations</h2>
          <p className="text-muted-foreground">Manage warehouses and retail outlet points.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BulkIO resource="locations" label="Locations" onImported={() => void reload()} />
          <Button onClick={openNew} data-testid="btn-new-location">
            <Plus className="mr-2 h-4 w-4" /> New Location
          </Button>
        </div>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Location Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && locations.length === 0 ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
              ))
            ) : locations.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No locations found.</TableCell></TableRow>
            ) : (
              locations.map((loc) => (
                <TableRow key={loc.id} data-testid={`row-location-${loc.id}`}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {loc.type === "warehouse"
                        ? <Building2 className="h-4 w-4 text-muted-foreground" />
                        : <Store className="h-4 w-4 text-primary" />}
                      {loc.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={loc.type === "warehouse" ? "secondary" : "outline"}>
                      {typeLabel(loc.type)}
                    </Badge>
                  </TableCell>
                  <TableCell>{loc.city || "—"}</TableCell>
                  <TableCell>{loc.phone || "—"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={loc.isActive}
                      disabled={busyId === loc.id}
                      onCheckedChange={() => toggleActive(loc)}
                      data-testid={`toggle-active-${loc.id}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(loc)} data-testid={`btn-edit-${loc.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => remove(loc)}
                        disabled={busyId === loc.id}
                        data-testid={`btn-delete-${loc.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{form.id ? "Edit location" : "Add new location"}</DialogTitle>
              <DialogDescription>
                Register a shop, warehouse, or branch where stock will be tracked.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  required
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type *</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setForm((p) => ({ ...p, type: v as LocationType }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="warehouse">Warehouse</SelectItem>
                      <SelectItem value="shop">Retail Shop</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address *</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  required
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label className="text-sm">Active</Label>
                  <p className="text-xs text-muted-foreground">Inactive locations are hidden from POS and warehouse pickers.</p>
                </div>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} data-testid="btn-save-location">
                {saving ? "Saving…" : form.id ? "Save changes" : "Create location"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
