import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { BulkIO } from "@/components/bulk-io";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  emoji: string | null;
  imageUrl: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
};

type CategoryForm = {
  id?: string;
  name: string;
  description: string;
  emoji: string;
  imageUrl: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
};

const emptyForm: CategoryForm = {
  name: "",
  description: "",
  emoji: "",
  imageUrl: "",
  color: "",
  sortOrder: 0,
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
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error?.message || `HTTP ${r.status}`);
  return body;
};

export default function CategoriesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch("/api/v1/categories"),
  });
  const items: Category[] = (data?.data ?? []) as Category[];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CategoryForm>(emptyForm);

  const saveMutation = useMutation({
    mutationFn: async (payload: CategoryForm) => {
      const body = {
        name: payload.name.trim(),
        description: payload.description.trim() || null,
        emoji: payload.emoji.trim() || null,
        imageUrl: payload.imageUrl.trim() || null,
        color: payload.color.trim() || null,
        sortOrder: Number(payload.sortOrder) || 0,
        isActive: payload.isActive,
      };
      if (payload.id) {
        return apiFetch(`/api/v1/categories/${payload.id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      return apiFetch("/api/v1/categories", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      setDialogOpen(false);
      toast({ title: form.id ? "Category updated" : "Category created" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      toast({ title: "Category deleted" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const openNew = () => { setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (c: Category) => {
    setForm({
      id: c.id,
      name: c.name ?? "",
      description: c.description ?? "",
      emoji: c.emoji ?? "",
      imageUrl: c.imageUrl ?? "",
      color: c.color ?? "",
      sortOrder: c.sortOrder ?? 0,
      isActive: c.isActive ?? true,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast({ title: "Category name is required", variant: "destructive" });
      return;
    }
    saveMutation.mutate(form);
  };

  const handleDelete = (c: Category) => {
    if (!confirm(`Delete category "${c.name}"?\n\nProducts that reference this category will keep the name on their record but it will no longer appear in the dropdown.`)) return;
    deleteMutation.mutate(c.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Categories</h2>
          <p className="text-muted-foreground">Manage the catalogue's product categories — used by the website, POS and ERP.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BulkIO resource="categories" label="Categories" onImported={() => qc.invalidateQueries({ queryKey: ["categories"] })} />
          <Button onClick={openNew} data-testid="btn-add-category"><Plus className="mr-2 h-4 w-4" /> Add Category</Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <div className="p-6 space-y-2">
            {[0,1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            No categories yet. Click <strong>Add Category</strong> to create your first one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id} data-testid={`row-category-${c.slug}`}>
                  <TableCell className="w-12 text-muted-foreground">{c.sortOrder}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      {c.emoji && <span className="text-lg leading-none">{c.emoji}</span>}
                      {c.name}
                    </div>
                    {c.description && <div className="text-xs text-muted-foreground mt-0.5">{c.description}</div>}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{c.slug}</TableCell>
                  <TableCell>
                    {c.isActive
                      ? <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">Active</Badge>
                      : <Badge variant="outline">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(c)} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit category" : "New category"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Aerial" />
              </div>
              <div className="space-y-2">
                <Label>Emoji</Label>
                <Input value={form.emoji} onChange={(e) => setForm((p) => ({ ...p, emoji: e.target.value }))} placeholder="🎇" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Short blurb shown on the website's category strip" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Display order</Label>
                <Input type="number" value={form.sortOrder} onChange={(e) => setForm((p) => ({ ...p, sortOrder: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Image URL (optional)</Label>
                <Input value={form.imageUrl} onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))} placeholder="https://…" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tailwind gradient (optional)</Label>
              <Input value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} placeholder="from-orange-500 to-red-600" />
              <p className="text-xs text-muted-foreground">Used as the card accent on the website.</p>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {form.id ? "Save changes" : "Create category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
