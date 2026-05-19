import { useState } from "react";
import { AccountShell } from "@/components/account-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useListShopAddresses,
  useCreateShopAddress,
  useUpdateShopAddress,
  useDeleteShopAddress,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Star } from "lucide-react";

type AddressType = "shipping" | "billing" | "both";

const EMPTY = {
  label: "", name: "", phone: "", line1: "", line2: "",
  city: "", state: "Tamil Nadu", pincode: "", landmark: "",
  addressType: "both" as AddressType,
  isDefault: false,
};

const TYPE_LABELS: Record<AddressType, string> = {
  shipping: "Shipping only",
  billing: "Billing only",
  both: "Shipping & Billing",
};

const isValidPhone = (s: string) => s.replace(/\D/g, "").length >= 10;
const isValidPincode = (s: string) => /^\d{6}$/.test(s.replace(/\D/g, ""));

export default function Addresses() {
  const { data, refetch, isLoading } = useListShopAddresses();
  const create = useCreateShopAddress();
  const update = useUpdateShopAddress();
  const remove = useDeleteShopAddress();
  const { toast } = useToast();
  const list = ((data as any)?.data ?? []) as any[];
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const onChange = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const startEdit = (a: any) => {
    setForm({
      label: a.label ?? "", name: a.name, phone: a.phone, line1: a.line1, line2: a.line2 ?? "",
      city: a.city, state: a.state, pincode: a.pincode, landmark: a.landmark ?? "",
      addressType: (a.addressType ?? "both") as AddressType,
      isDefault: !!a.isDefault,
    });
    setEditingId(a.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPhone(form.phone)) { toast({ title: "Phone must contain at least 10 digits", variant: "destructive" }); return; }
    if (!isValidPincode(form.pincode)) { toast({ title: "Pincode must be 6 digits", variant: "destructive" }); return; }
    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, data: form as any });
        toast({ title: "Address updated" });
      } else {
        await create.mutateAsync({ data: form as any });
        toast({ title: "Address added" });
      }
      setForm(EMPTY); setEditingId(null); setShowForm(false);
      refetch();
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    }
  };
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this address?")) return;
    await remove.mutateAsync({ id });
    refetch();
  };
  const handleSetDefault = async (a: any) => {
    await update.mutateAsync({ id: a.id, data: { ...a, isDefault: true } as any });
    refetch();
  };

  return (
    <AccountShell>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-extrabold">Addresses</h1>
        <Button onClick={() => { setForm(EMPTY); setEditingId(null); setShowForm(true); }} data-testid="address-add">
          <Plus className="h-4 w-4 mr-1" /> Add address
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-5 border border-gray-100 mb-6 space-y-3" data-testid="address-form">
          <h2 className="font-bold">{editingId ? "Edit address" : "New address"}</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Label</Label><Input placeholder="Home / Office" value={form.label} onChange={onChange("label")} /></div>
            <div>
              <Label>Type *</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.addressType}
                onChange={(e) => setForm({ ...form, addressType: e.target.value as AddressType })}
                data-testid="address-type"
              >
                <option value="both">Shipping & Billing</option>
                <option value="shipping">Shipping only</option>
                <option value="billing">Billing only</option>
              </select>
            </div>
            <div><Label>Recipient name *</Label><Input value={form.name} onChange={onChange("name")} required /></div>
            <div><Label>Phone * (10+ digits)</Label><Input value={form.phone} onChange={onChange("phone")} required /></div>
            <div><Label>Pincode * (6 digits)</Label><Input value={form.pincode} onChange={onChange("pincode")} required /></div>
            <div><Label>City *</Label><Input value={form.city} onChange={onChange("city")} required /></div>
            <div className="col-span-2"><Label>Address line 1 *</Label><Input value={form.line1} onChange={onChange("line1")} required /></div>
            <div className="col-span-2"><Label>Address line 2</Label><Input value={form.line2} onChange={onChange("line2")} /></div>
            <div><Label>State *</Label><Input value={form.state} onChange={onChange("state")} required /></div>
            <div><Label>Landmark</Label><Input value={form.landmark} onChange={onChange("landmark")} /></div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={create.isPending || update.isPending} data-testid="address-save">Save</Button>
            <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : list.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-gray-100 text-center text-gray-500">
          No saved addresses yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((a: any) => {
            const t = (a.addressType ?? "both") as AddressType;
            return (
              <div key={a.id} className="bg-white rounded-2xl p-5 border border-gray-100" data-testid={`address-${a.id}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.label && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs">{a.label}</span>}
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs">{TYPE_LABELS[t]}</span>
                    {a.isDefault && <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs flex items-center gap-1"><Star className="h-3 w-3" /> Default</span>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(a)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDelete(a.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <p className="font-semibold">{a.name} · {a.phone}</p>
                <p className="text-sm text-gray-600 mt-1">
                  {a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} - {a.pincode}
                </p>
                {!a.isDefault && (
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => handleSetDefault(a)}>
                    Set as default
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AccountShell>
  );
}
