import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Save, KeyRound, Lock, UserCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Me = {
  id: string;
  name: string;
  username: string;
  role: string;
  email: string | null;
  phone: string | null;
  locationIds: string[];
  maxDiscountPct: string | null;
  hasPin: boolean;
};

function authHeaders(): HeadersInit {
  const t = localStorage.getItem("erp_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
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

export default function ProfilePage() {
  const { toast } = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // PIN form state
  const [pinCurrentPassword, setPinCurrentPassword] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api<Me>("/v1/auth/me");
      setMe(data);
      setName(data.name);
      setEmail(data.email ?? "");
      setPhone(data.phone ?? "");
    } catch (err: any) {
      toast({ title: "Could not load profile", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const profileDirty =
    !!me && (name !== me.name || email !== (me.email ?? "") || phone !== (me.phone ?? ""));

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const updated = await api<Me>("/v1/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ name, email, phone }),
      });
      setMe((prev) => (prev ? { ...prev, ...updated } : prev));
      toast({ title: "Profile updated" });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    try {
      await api("/v1/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      toast({ title: "Password updated", description: "Use the new password next time you sign in." });
    } catch (err: any) {
      toast({ title: "Change failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingPassword(false);
    }
  };

  const changePin = async () => {
    if (newPin !== confirmPin) {
      toast({ title: "PINs do not match", variant: "destructive" });
      return;
    }
    if (!/^\d{4,6}$/.test(newPin)) {
      toast({ title: "Invalid PIN", description: "Use 4–6 digits.", variant: "destructive" });
      return;
    }
    setSavingPin(true);
    try {
      await api("/v1/auth/change-pin", {
        method: "POST",
        body: JSON.stringify({ currentPassword: pinCurrentPassword, newPin }),
      });
      setPinCurrentPassword(""); setNewPin(""); setConfirmPin("");
      setMe((prev) => (prev ? { ...prev, hasPin: true } : prev));
      toast({ title: "PIN updated", description: "Use the new PIN at the POS terminal." });
    } catch (err: any) {
      toast({ title: "Change failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingPin(false);
    }
  };

  if (loading && !me) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!me) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCircle2 className="h-6 w-6 text-primary" /> My Profile
        </h1>
        <p className="text-sm text-muted-foreground">Manage your account details, password, and POS PIN.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Account</span>
            <Badge variant="secondary">{me.role}</Badge>
          </CardTitle>
          <CardDescription>
            Username <span className="font-mono font-medium">{me.username}</span> · {me.locationIds.length} assigned location{me.locationIds.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile" data-testid="tab-profile"><UserCircle2 className="h-4 w-4 mr-1" /> Profile</TabsTrigger>
          <TabsTrigger value="password" data-testid="tab-password"><Lock className="h-4 w-4 mr-1" /> Password</TabsTrigger>
          <TabsTrigger value="pin" data-testid="tab-pin"><KeyRound className="h-4 w-4 mr-1" /> POS PIN</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader><CardTitle className="text-base">Personal details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Full name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="profile-name" />
                </div>
                <div>
                  <Label className="text-xs">Username</Label>
                  <Input value={me.username} disabled />
                  <p className="text-[11px] text-muted-foreground mt-1">Ask an admin to change your username.</p>
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" data-testid="profile-email" />
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" data-testid="profile-phone" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveProfile} disabled={!profileDirty || savingProfile} data-testid="profile-save">
                  {savingProfile ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="password">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Change password</CardTitle>
              <CardDescription>You'll need your current password to confirm.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <div>
                <Label className="text-xs">Current password</Label>
                <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" data-testid="pwd-current" />
              </div>
              <div>
                <Label className="text-xs">New password</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" data-testid="pwd-new" />
                <p className="text-[11px] text-muted-foreground mt-1">At least 8 characters.</p>
              </div>
              <div>
                <Label className="text-xs">Confirm new password</Label>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" data-testid="pwd-confirm" />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={changePassword}
                  disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                  data-testid="pwd-save"
                >
                  {savingPassword ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Lock className="h-4 w-4 mr-1" />} Update password
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pin">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{me.hasPin ? "Change POS PIN" : "Set POS PIN"}</CardTitle>
              <CardDescription>4–6 digit PIN used to sign in at the POS terminal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <div>
                <Label className="text-xs">Current password</Label>
                <Input type="password" value={pinCurrentPassword} onChange={(e) => setPinCurrentPassword(e.target.value)} autoComplete="current-password" data-testid="pin-current-pwd" />
              </div>
              <div>
                <Label className="text-xs">New PIN</Label>
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                  data-testid="pin-new"
                />
              </div>
              <div>
                <Label className="text-xs">Confirm PIN</Label>
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                  data-testid="pin-confirm"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={changePin}
                  disabled={savingPin || !pinCurrentPassword || !newPin || !confirmPin}
                  data-testid="pin-save"
                >
                  {savingPin ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <KeyRound className="h-4 w-4 mr-1" />} Update PIN
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
