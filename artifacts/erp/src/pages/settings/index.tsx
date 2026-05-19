import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Building, IndianRupee, Settings as SettingsIcon, Save, Loader2, Database, ShieldCheck, RefreshCw, Plus, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../../lib/api";

type Company = {
  name: string;
  gstin: string;
  email: string;
  phone: string;
  address: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  invoiceStartNumber: number;
  financialYear: string;
  defaultHSN: string;
};
type HsnSlab = { hsn: string; rate: number; label?: string; active?: boolean };
type Pricing = {
  wholesaleThreshold: number;
  gstEnabled: boolean;
  defaultGstRate: number;
  hsnRates: HsnSlab[];
  loyaltyEarnRate: number;
  loyaltyRedemptionRate: number;
  defaultPriceListId: string | null;
  taxRate?: number;
};
type BackupItem = { file: string; sizeBytes: number; createdAt: string };
type SystemInfo = {
  lastSweep?: string;
  passing?: string;
  lastBackup?: BackupItem | null;
  backupCount?: number;
};

const companyDefaults: Company = {
  name: "", gstin: "", email: "", phone: "", address: "",
  bankName: "", accountNumber: "", ifscCode: "",
  invoiceStartNumber: 1, financialYear: "2025-2026", defaultHSN: "36049000",
};
const pricingDefaults: Pricing = {
  wholesaleThreshold: 50, gstEnabled: true, defaultGstRate: 18, hsnRates: [],
  loyaltyEarnRate: 1, loyaltyRedemptionRate: 1, defaultPriceListId: null,
};

function tok(): string { return localStorage.getItem("erp_token") ?? ""; }

export default function Settings() {
  const [activeTab, setActiveTab] = useState("company");
  const [company, setCompany] = useState<Company>(companyDefaults);
  const [pricing, setPricing] = useState<Pricing>(pricingDefaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"company" | "pricing" | null>(null);
  const [sysInfo, setSysInfo] = useState<SystemInfo>({});
  const [backupBusy, setBackupBusy] = useState(false);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${tok()}` };
      const [compRes, priceRes] = await Promise.all([
        apiFetch("/api/v1/settings/company", { headers }),
        apiFetch("/api/v1/settings/pricing", { headers }),
      ]);
      if (!compRes.ok || !priceRes.ok) throw new Error("Failed to load settings");
      const compData = await compRes.json();
      const priceData = await priceRes.json();
      setCompany({ ...companyDefaults, ...(compData.data ?? {}) });
      setPricing({ ...pricingDefaults, ...(priceData.data ?? {}) });
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemInfo = async () => {
    try {
      const headers = { Authorization: `Bearer ${tok()}` };
      const [healthRes, backupsRes] = await Promise.all([
        apiFetch("/api/v1/system/health", { headers }),
        apiFetch("/api/v1/system/backups", { headers }),
      ]);
      const info: SystemInfo = {};
      if (healthRes.ok) {
        const j = await healthRes.json();
        info.lastSweep = j?.data?.finishedAt;
        info.passing = `${j?.data?.totals?.passed}/${j?.data?.totals?.total}`;
      }
      if (backupsRes.ok) {
        const j = await backupsRes.json();
        info.lastBackup = j?.data?.items?.[0] ?? null;
        info.backupCount = j?.data?.items?.length ?? 0;
      }
      setSysInfo(info);
    } catch { /* non-fatal */ }
  };

  useEffect(() => { void fetchData(); void fetchSystemInfo(); }, []);

  const save = async (key: "company" | "pricing", body: Company | Pricing) => {
    setSaving(key);
    try {
      const r = await apiFetch(`/api/v1/settings/${key}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) {
        const msg = j?.error?.message ?? `Server returned ${r.status}`;
        const detail = Array.isArray(j?.error?.details) && j.error.details[0]?.message
          ? `${msg}: ${j.error.details[0].message}`
          : msg;
        toast({ title: "Save failed", description: detail, variant: "destructive" });
        return;
      }
      toast({ title: "Saved", description: key === "company" ? "Company profile updated" : "Pricing rules updated" });
      // Echo back the canonical server-side value so derived fields (e.g. taxRate) reflect.
      if (key === "company") setCompany({ ...companyDefaults, ...(j.data ?? {}) });
      else setPricing({ ...pricingDefaults, ...(j.data ?? {}) });
    } catch (err) {
      toast({ title: "Save failed", description: (err as Error).message, variant: "destructive" });
    } finally { setSaving(null); }
  };

  const runBackupNow = async () => {
    setBackupBusy(true);
    try {
      const r = await apiFetch("/api/v1/system/backup/run", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok()}` },
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.success) {
        toast({ title: "Backup created", description: j.data?.message ?? "Database snapshot saved." });
        await fetchSystemInfo();
      } else {
        toast({ title: "Backup failed", description: j?.data?.message ?? `Server returned ${r.status}`, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Backup failed", description: (err as Error).message, variant: "destructive" });
    } finally { setBackupBusy(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">System Settings</h2>
        <p className="text-muted-foreground">Configure your business identity and application rules.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="company" className="flex items-center gap-2"><Building className="h-4 w-4" /> Company Profile</TabsTrigger>
          <TabsTrigger value="pricing" className="flex items-center gap-2"><IndianRupee className="h-4 w-4" /> Pricing & Tax</TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-2"><SettingsIcon className="h-4 w-4" /> System</TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <form onSubmit={(e) => { e.preventDefault(); void save("company", company); }}>
            <Card>
              <CardHeader>
                <CardTitle>Business Identity</CardTitle>
                <CardDescription>This information appears on invoices, estimates and reports.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Company Name *</Label>
                    <Input data-testid="setting-company-name" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>GSTIN</Label>
                    <Input data-testid="setting-company-gstin" value={company.gstin} onChange={(e) => setCompany({ ...company, gstin: e.target.value.toUpperCase() })} placeholder="33XXXXXXXXXXXXX" maxLength={15} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={company.email} onChange={(e) => setCompany({ ...company, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Registered Address</Label>
                  <Textarea value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} />
                </div>

                <div className="border-t pt-4">
                  <h4 className="text-sm font-bold mb-4">Invoice Numbering</h4>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Financial Year</Label>
                      <Input value={company.financialYear} onChange={(e) => setCompany({ ...company, financialYear: e.target.value })} placeholder="2025-2026" />
                    </div>
                    <div className="space-y-2">
                      <Label>Invoice Start Number</Label>
                      <Input type="number" min={1} value={company.invoiceStartNumber} onChange={(e) => setCompany({ ...company, invoiceStartNumber: parseInt(e.target.value || "1", 10) })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Default HSN</Label>
                      <Input value={company.defaultHSN} onChange={(e) => setCompany({ ...company, defaultHSN: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="text-sm font-bold mb-4">Bank Details (For Invoices)</h4>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Bank Name</Label>
                      <Input value={company.bankName} onChange={(e) => setCompany({ ...company, bankName: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Account Number</Label>
                      <Input value={company.accountNumber} onChange={(e) => setCompany({ ...company, accountNumber: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>IFSC Code</Label>
                      <Input value={company.ifscCode} onChange={(e) => setCompany({ ...company, ifscCode: e.target.value.toUpperCase() })} maxLength={11} />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={saving === "company"} data-testid="save-company">
                    {saving === "company" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        </TabsContent>

        <TabsContent value="pricing">
          <form onSubmit={(e) => { e.preventDefault(); void save("pricing", pricing); }}>
            <Card>
              <CardHeader>
                <CardTitle>Pricing & Loyalty Rules</CardTitle>
                <CardDescription>Global configuration for automated price discovery.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold">Price Tiers</h4>
                    <div className="space-y-2">
                      <Label>Wholesale Qty Threshold</Label>
                      <Input type="number" min={1} value={pricing.wholesaleThreshold} onChange={(e) => setPricing({ ...pricing, wholesaleThreshold: parseInt(e.target.value || "1", 10) })} />
                      <p className="text-[10px] text-muted-foreground">Orders above this qty per item qualify for wholesale rates.</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold">Loyalty</h4>
                    <div className="space-y-2">
                      <Label>Loyalty Earn Rate (per ₹100)</Label>
                      <Input type="number" step="0.1" min={0} value={pricing.loyaltyEarnRate} onChange={(e) => setPricing({ ...pricing, loyaltyEarnRate: parseFloat(e.target.value || "0") })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Loyalty Redemption Rate (₹ per point)</Label>
                      <Input type="number" step="0.1" min={0} value={pricing.loyaltyRedemptionRate} onChange={(e) => setPricing({ ...pricing, loyaltyRedemptionRate: parseFloat(e.target.value || "0") })} />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold">GST</h4>
                      <p className="text-xs text-muted-foreground">When off, invoices and POS bills are tax-free. When on, every line uses its product override → HSN slab → default rate.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="gst-enabled" className="text-sm">Apply GST</Label>
                      <Switch id="gst-enabled" checked={pricing.gstEnabled} onCheckedChange={(v) => setPricing({ ...pricing, gstEnabled: v })} data-testid="gst-enabled" />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Default GST Rate (%)</Label>
                      <Input type="number" min={0} max={28} disabled={!pricing.gstEnabled} value={pricing.defaultGstRate} onChange={(e) => setPricing({ ...pricing, defaultGstRate: parseInt(e.target.value || "0", 10) })} />
                      <p className="text-[10px] text-muted-foreground">Used when a product has no override and its HSN code is not in the slab table below.</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm">HSN tax slabs</Label>
                      <Button type="button" size="sm" variant="outline" disabled={!pricing.gstEnabled}
                        onClick={() => setPricing({ ...pricing, hsnRates: [...pricing.hsnRates, { hsn: "", rate: pricing.defaultGstRate, label: "", active: true }] })}
                        data-testid="hsn-add">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add slab
                      </Button>
                    </div>
                    {pricing.hsnRates.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-3 text-center border rounded-md border-dashed">
                        No HSN-specific slabs. All products fall back to the default rate.
                      </p>
                    ) : (
                      <div className="border rounded-md overflow-hidden">
                        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/40 text-[11px] font-medium uppercase text-muted-foreground">
                          <div className="col-span-3">HSN code</div>
                          <div className="col-span-5">Label</div>
                          <div className="col-span-2 text-right">Rate %</div>
                          <div className="col-span-1 text-center">Active</div>
                          <div className="col-span-1"></div>
                        </div>
                        {pricing.hsnRates.map((slab, idx) => (
                          <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 border-t items-center">
                            <Input className="col-span-3 h-8" value={slab.hsn}
                              onChange={(e) => {
                                const next = [...pricing.hsnRates];
                                next[idx] = { ...slab, hsn: e.target.value };
                                setPricing({ ...pricing, hsnRates: next });
                              }} placeholder="36049000" data-testid={`hsn-code-${idx}`} disabled={!pricing.gstEnabled} />
                            <Input className="col-span-5 h-8" value={slab.label ?? ""}
                              onChange={(e) => {
                                const next = [...pricing.hsnRates];
                                next[idx] = { ...slab, label: e.target.value };
                                setPricing({ ...pricing, hsnRates: next });
                              }} placeholder="Fireworks (12%)" disabled={!pricing.gstEnabled} />
                            <Input type="number" min={0} max={28} className="col-span-2 h-8 text-right" value={slab.rate}
                              onChange={(e) => {
                                const next = [...pricing.hsnRates];
                                next[idx] = { ...slab, rate: Number(e.target.value || "0") };
                                setPricing({ ...pricing, hsnRates: next });
                              }} data-testid={`hsn-rate-${idx}`} disabled={!pricing.gstEnabled} />
                            <div className="col-span-1 flex justify-center">
                              <Switch checked={slab.active ?? true} disabled={!pricing.gstEnabled}
                                onCheckedChange={(v) => {
                                  const next = [...pricing.hsnRates];
                                  next[idx] = { ...slab, active: v };
                                  setPricing({ ...pricing, hsnRates: next });
                                }} />
                            </div>
                            <div className="col-span-1 flex justify-end">
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => setPricing({ ...pricing, hsnRates: pricing.hsnRates.filter((_, i) => i !== idx) })}
                                data-testid={`hsn-remove-${idx}`}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-2">Each product can also override the rate from its own edit page (Products → Basic Information → GST rate).</p>
                  </div>
                </div>
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={saving === "pricing"} data-testid="save-pricing">
                    {saving === "pricing" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        </TabsContent>

        <TabsContent value="system">
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Health</CardTitle>
                  <CardDescription>Latest result from the every-minute self-monitor.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchSystemInfo}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-sm text-muted-foreground">Last sweep</span>
                  <span className="font-mono text-sm">{sysInfo.lastSweep ? new Date(sysInfo.lastSweep).toLocaleString() : "—"}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-sm text-muted-foreground">Checks passing</span>
                  <span className="font-mono text-sm">{sysInfo.passing ?? "—"}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> Database backups</CardTitle>
                  <CardDescription>Daily Postgres dumps, last 7 retained.</CardDescription>
                </div>
                <Button onClick={runBackupNow} disabled={backupBusy} data-testid="run-backup">
                  {backupBusy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Database className="h-3.5 w-3.5 mr-1.5" />}
                  Back up now
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-sm text-muted-foreground">Most recent backup</span>
                  <span className="font-mono text-sm">{sysInfo.lastBackup ? `${sysInfo.lastBackup.file} (${(sysInfo.lastBackup.sizeBytes / 1024).toFixed(1)} KB)` : "—"}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-sm text-muted-foreground">Created</span>
                  <span className="font-mono text-sm">{sysInfo.lastBackup ? new Date(sysInfo.lastBackup.createdAt).toLocaleString() : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Backups on disk</span>
                  <span className="font-mono text-sm">{sysInfo.backupCount ?? 0}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
