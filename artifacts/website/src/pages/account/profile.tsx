import { useEffect, useState } from "react";
import { AccountShell } from "@/components/account-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useShopAuth } from "@/context/auth";
import {
  useGetShopMe,
  useUpdateShopMe,
  useChangeShopPassword,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export default function Profile() {
  const { data, refetch } = useGetShopMe();
  const { updateCustomer } = useShopAuth();
  const update = useUpdateShopMe();
  const changePw = useChangeShopPassword();
  const { toast } = useToast();
  const me = (data as any)?.data;

  const [form, setForm] = useState({ name: "", email: "" });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });

  useEffect(() => {
    if (me) setForm({ name: me.name ?? "", email: me.email ?? "" });
  }, [me]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await update.mutateAsync({ data: form });
      const updated = (res as any).data;
      if (updated) updateCustomer(updated);
      toast({ title: "Profile updated" });
      refetch();
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };
  const savePw = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await changePw.mutateAsync({ data: pw });
      toast({ title: "Password changed" });
      setPw({ currentPassword: "", newPassword: "" });
    } catch (e: any) {
      toast({ title: "Change failed", description: e?.data?.error?.message || "Try again.", variant: "destructive" });
    }
  };

  return (
    <AccountShell>
      <h1 className="text-2xl font-extrabold mb-4">Profile</h1>
      <form onSubmit={saveProfile} className="bg-white rounded-2xl p-5 border border-gray-100 mb-4 space-y-3" data-testid="profile-form">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div><Label>Phone</Label><Input value={me?.phone ?? ""} disabled /></div>
          <div className="col-span-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        </div>
        <Button type="submit" disabled={update.isPending} data-testid="profile-save">Save profile</Button>
      </form>

      <form onSubmit={savePw} className="bg-white rounded-2xl p-5 border border-gray-100 space-y-3" data-testid="password-form">
        <h2 className="font-bold">Change password</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Current password</Label><Input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required /></div>
          <div><Label>New password (6+ chars)</Label><Input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required /></div>
        </div>
        <Button type="submit" disabled={changePw.isPending} data-testid="password-save">Change password</Button>
      </form>
    </AccountShell>
  );
}
