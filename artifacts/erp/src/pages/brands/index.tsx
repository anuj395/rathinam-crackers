import { useState } from "react";
import { mediaUrl } from "../../lib/api";
import {
  useListBrands,
  useCreateBrand,
  useUpdateBrand,
  useDeleteBrand,
  type Brand,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, ImageIcon, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { BulkIO } from "@/components/bulk-io";

type BrandForm = {
  id?: string;
  name: string;
  logoUrl: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
};

const emptyForm: BrandForm = {
  name: "",
  logoUrl: "",
  description: "",
  sortOrder: 0,
  isActive: true,
};

export default function BrandsPage() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useListBrands();
  const createMutation = useCreateBrand();
  const updateMutation = useUpdateBrand();
  const deleteMutation = useDeleteBrand();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<BrandForm>(emptyForm);

  const brands: Brand[] = (data?.data ?? []) as Brand[];

  const openNew = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (b: Brand) => {
    setForm({
      id: b.id ?? "",
      name: b.name ?? "",
      logoUrl: b.logoUrl ?? "",
      description: b.description ?? "",
      sortOrder: b.sortOrder ?? 0,
      isActive: b.isActive ?? true,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Brand name is required", variant: "destructive" });
      return;
    }
    const payload = {
      name: form.name.trim(),
      logoUrl: form.logoUrl.trim() || null,
      description: form.description.trim() || null,
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive,
    };
    try {
      if (form.id) {
        await updateMutation.mutateAsync({ id: form.id!, data: payload });
        toast({ title: "Brand updated" });
      } else {
        await createMutation.mutateAsync({ data: payload });
        toast({ title: "Brand created" });
      }
      setDialogOpen(false);
      refetch();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || "Failed to save brand";
      toast({ title: msg, variant: "destructive" });
    }
  };

  const handleDelete = async (b: Brand) => {
    if (!confirm(`Delete brand "${b.name}"?\n\nProducts that reference this brand will keep the name on their variants but it will no longer appear in the dropdown.`)) return;
    try {
      if (!b.id) return;
      await deleteMutation.mutateAsync({ id: b.id });
      toast({ title: "Brand deleted" });
      refetch();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || "Failed to delete brand";
      toast({ title: msg, variant: "destructive" });
    }
  };

  const toggleActive = async (b: Brand) => {
    try {
      if (!b.id) return;
      await updateMutation.mutateAsync({ id: b.id, data: { isActive: !b.isActive } });
      refetch();
    } catch {
      toast({ title: "Failed to toggle brand", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Brand Master</h2>
          <p className="text-muted-foreground">Manufacturer brands available for product variants. Each brand can have its own logo.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <BulkIO resource="brands" label="Brands" onImported={() => refetch()} />
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} data-testid="btn-new-brand">
              <Plus className="mr-2 h-4 w-4" /> New Brand
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{form.id ? "Edit Brand" : "New Brand"}</DialogTitle>
              <DialogDescription>
                Brand name appears in the product variant dropdown. Logo is shown in catalogs and on the storefront.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Sri Kaliswari"
                  data-testid="input-brand-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Logo URL</Label>
                <Input
                  value={form.logoUrl}
                  onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                  placeholder="https://… or /uploads/…"
                  data-testid="input-brand-logo"
                />
                {form.logoUrl && (
                  <div className="mt-2 p-2 border rounded-md bg-muted/40 inline-flex items-center gap-2">
                    <img
                      src={mediaUrl(form.logoUrl)}
                      alt="logo preview"
                      className="h-12 w-12 object-contain bg-white rounded"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                    <span className="text-xs text-muted-foreground">Live preview</span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional notes"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sort Order</Label>
                  <Input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Active</Label>
                  <div className="h-10 flex items-center">
                    <Switch
                      checked={form.isActive}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                    />
                    <span className="ml-2 text-sm text-muted-foreground">{form.isActive ? "Visible in dropdowns" : "Hidden"}</span>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="btn-save-brand"
              >
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {form.id ? "Save Changes" : "Create Brand"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Logo</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Sort</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                ))
              ) : brands.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    No brands yet. Click "New Brand" to add your first one.
                  </TableCell>
                </TableRow>
              ) : (
                brands.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      {b.logoUrl ? (
                        <img
                          src={mediaUrl(b.logoUrl)}
                          alt={b.name}
                          className="h-10 w-10 object-contain bg-white rounded p-0.5 border"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="h-10 w-10 flex items-center justify-center bg-muted rounded border">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{b.slug}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{b.description || "—"}</TableCell>
                    <TableCell className="text-center">{b.sortOrder ?? 0}</TableCell>
                    <TableCell className="text-center">
                      <Switch checked={!!b.isActive} onCheckedChange={() => toggleActive(b)} />
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(b)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(b)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Tip: Brand names you set here populate the dropdown on the Product edit screen. To replace every variant's brand at once, use "Apply default brand to all variants" on the product page.
      </p>
    </div>
  );
}
