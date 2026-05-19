import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, MessageCircle, Save, Send, Loader2, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../../lib/api";

type SmtpSafe = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromName: string;
  fromEmail: string;
  hasPassword: boolean;
};
type WhatsappSafe =
  | { enabled: boolean; provider: "disabled" }
  | { enabled: boolean; provider: "meta_cloud"; phoneNumberId: string; defaultLanguage?: string; defaultTemplate?: string; hasAccessToken: boolean }
  | { enabled: boolean; provider: "twilio"; accountSid: string; fromNumber: string; defaultLanguage?: string; defaultTemplate?: string; hasAuthToken: boolean };

type LogRow = {
  id: string;
  channel: "email" | "whatsapp" | "sms";
  status: "queued" | "sent" | "failed";
  eventType: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  errorMsg: string | null;
  createdAt: string;
};

function tok() { return localStorage.getItem("erp_token") ?? ""; }
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}`, ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json?.error?.message ?? "Request failed");
  return (json.data ?? json) as T;
}

const SMTP_DEFAULT: SmtpSafe = { enabled: false, host: "", port: 587, secure: false, username: "", fromName: "Rathinam Crackers", fromEmail: "", hasPassword: false };

export default function NotificationsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"smtp" | "whatsapp" | null>(null);
  const [testing, setTesting] = useState<"smtp" | "whatsapp" | null>(null);

  const [smtp, setSmtp] = useState<SmtpSafe>(SMTP_DEFAULT);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpTestTo, setSmtpTestTo] = useState("");

  const [waProvider, setWaProvider] = useState<"disabled" | "meta_cloud" | "twilio">("disabled");
  const [waEnabled, setWaEnabled] = useState(false);
  const [waPhoneNumberId, setWaPhoneNumberId] = useState("");
  const [waMetaToken, setWaMetaToken] = useState("");
  const [waHasMetaToken, setWaHasMetaToken] = useState(false);
  const [waAccountSid, setWaAccountSid] = useState("");
  const [waAuthToken, setWaAuthToken] = useState("");
  const [waHasAuthToken, setWaHasAuthToken] = useState(false);
  const [waFromNumber, setWaFromNumber] = useState("");
  const [waDefaultLang, setWaDefaultLang] = useState("en");
  const [waTestTo, setWaTestTo] = useState("");

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const data = await api<{ smtp: SmtpSafe; whatsapp: WhatsappSafe }>("/v1/notify/config");
      setSmtp(data.smtp);
      setSmtpPassword("");
      const w = data.whatsapp;
      setWaProvider(w.provider);
      setWaEnabled(w.enabled);
      if (w.provider === "meta_cloud") {
        setWaPhoneNumberId(w.phoneNumberId);
        setWaHasMetaToken(w.hasAccessToken);
        setWaDefaultLang(w.defaultLanguage ?? "en");
      } else if (w.provider === "twilio") {
        setWaAccountSid(w.accountSid);
        setWaFromNumber(w.fromNumber);
        setWaHasAuthToken(w.hasAuthToken);
        setWaDefaultLang(w.defaultLanguage ?? "en");
      }
    } catch (err: any) {
      toast({ title: "Could not load settings", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await apiFetch(`/api/v1/notify/log?limit=20`, { headers: { Authorization: `Bearer ${tok()}` } });
      const json = await res.json();
      setLogs(json.data ?? []);
    } catch {
      // non-fatal
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => { void loadAll(); void loadLogs(); }, []); // eslint-disable-line

  const saveSmtp = async () => {
    setSaving("smtp");
    try {
      await api("/v1/notify/config/smtp", {
        method: "PUT",
        body: JSON.stringify({
          enabled: smtp.enabled,
          host: smtp.host, port: Number(smtp.port), secure: smtp.secure,
          username: smtp.username, fromName: smtp.fromName, fromEmail: smtp.fromEmail,
          password: smtpPassword || undefined,
        }),
      });
      setSmtpPassword("");
      toast({ title: "SMTP saved" });
      await loadAll();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const saveWhatsapp = async () => {
    setSaving("whatsapp");
    try {
      const payload: Record<string, unknown> = { enabled: waEnabled, provider: waProvider, defaultLanguage: waDefaultLang };
      if (waProvider === "meta_cloud") {
        payload["phoneNumberId"] = waPhoneNumberId;
        if (waMetaToken) payload["accessToken"] = waMetaToken;
      } else if (waProvider === "twilio") {
        payload["accountSid"] = waAccountSid;
        payload["fromNumber"] = waFromNumber;
        if (waAuthToken) payload["authToken"] = waAuthToken;
      }
      await api("/v1/notify/config/whatsapp", { method: "PUT", body: JSON.stringify(payload) });
      setWaMetaToken(""); setWaAuthToken("");
      toast({ title: "WhatsApp saved" });
      await loadAll();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const testSmtp = async () => {
    if (!smtpTestTo) return;
    setTesting("smtp");
    try {
      await api("/v1/notify/test/email", { method: "POST", body: JSON.stringify({ to: smtpTestTo }) });
      toast({ title: "Test email sent", description: `Sent to ${smtpTestTo}` });
      void loadLogs();
    } catch (err: any) {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    } finally {
      setTesting(null);
    }
  };

  const testWhatsapp = async () => {
    if (!waTestTo) return;
    setTesting("whatsapp");
    try {
      await api("/v1/notify/test/whatsapp", { method: "POST", body: JSON.stringify({ to: waTestTo }) });
      toast({ title: "Test WhatsApp sent", description: `Sent to ${waTestTo}` });
      void loadLogs();
    } catch (err: any) {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-72 w-full" /></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-sm text-muted-foreground">Configure SMTP and WhatsApp so the system can send invoices, OTPs, and updates to customers and staff.</p>
      </div>

      <Tabs defaultValue="smtp">
        <TabsList>
          <TabsTrigger value="smtp"><Mail className="h-4 w-4 mr-1" /> Email (SMTP)</TabsTrigger>
          <TabsTrigger value="whatsapp"><MessageCircle className="h-4 w-4 mr-1" /> WhatsApp</TabsTrigger>
          <TabsTrigger value="logs"><History className="h-4 w-4 mr-1" /> Recent activity</TabsTrigger>
        </TabsList>

        <TabsContent value="smtp">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>SMTP server</span>
                <div className="flex items-center gap-2 text-sm font-normal">
                  <span className="text-muted-foreground">Enabled</span>
                  <Switch checked={smtp.enabled} onCheckedChange={(v) => setSmtp({ ...smtp, enabled: v })} data-testid="smtp-enabled" />
                </div>
              </CardTitle>
              <CardDescription>Used for invoice delivery, password resets, and customer notifications.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2"><Label className="text-xs">Host</Label>
                  <Input value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.gmail.com" data-testid="smtp-host" />
                </div>
                <div><Label className="text-xs">Port</Label>
                  <Input type="number" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })} data-testid="smtp-port" />
                </div>
                <div><Label className="text-xs">Username</Label>
                  <Input value={smtp.username} onChange={(e) => setSmtp({ ...smtp, username: e.target.value })} autoComplete="off" data-testid="smtp-username" />
                </div>
                <div><Label className="text-xs">Password {smtp.hasPassword && <span className="text-[11px] text-muted-foreground">(stored — leave blank to keep)</span>}</Label>
                  <Input type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} placeholder={smtp.hasPassword ? "••••••••" : ""} autoComplete="off" data-testid="smtp-password" />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={smtp.secure} onCheckedChange={(v) => setSmtp({ ...smtp, secure: v })} id="smtp-secure" />
                  <Label htmlFor="smtp-secure" className="text-sm">Use TLS (port 465)</Label>
                </div>
                <div><Label className="text-xs">From name</Label>
                  <Input value={smtp.fromName} onChange={(e) => setSmtp({ ...smtp, fromName: e.target.value })} />
                </div>
                <div className="md:col-span-2"><Label className="text-xs">From email</Label>
                  <Input type="email" value={smtp.fromEmail} onChange={(e) => setSmtp({ ...smtp, fromEmail: e.target.value })} placeholder="hello@rathinamcrackers.com" data-testid="smtp-from-email" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveSmtp} disabled={saving === "smtp"} data-testid="smtp-save">
                  {saving === "smtp" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save SMTP
                </Button>
              </div>

              <div className="border-t pt-4">
                <Label className="text-xs">Send test email</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={smtpTestTo} onChange={(e) => setSmtpTestTo(e.target.value)} placeholder="recipient@example.com" data-testid="smtp-test-to" />
                  <Button onClick={testSmtp} disabled={!smtpTestTo || testing === "smtp"} variant="outline" data-testid="smtp-test-btn">
                    {testing === "smtp" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Send
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Save SMTP settings first. The test sends a small message and writes to the activity log.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>WhatsApp</span>
                <div className="flex items-center gap-2 text-sm font-normal">
                  <span className="text-muted-foreground">Enabled</span>
                  <Switch checked={waEnabled} onCheckedChange={setWaEnabled} disabled={waProvider === "disabled"} data-testid="wa-enabled" />
                </div>
              </CardTitle>
              <CardDescription>Choose a provider and store its credentials. Outgoing numbers must be in E.164 format (e.g. +919876543210).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs">Provider</Label>
                <Select value={waProvider} onValueChange={(v) => setWaProvider(v as typeof waProvider)}>
                  <SelectTrigger data-testid="wa-provider"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">Disabled</SelectItem>
                    <SelectItem value="meta_cloud">Meta WhatsApp Cloud API</SelectItem>
                    <SelectItem value="twilio">Twilio</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {waProvider === "meta_cloud" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label className="text-xs">Phone Number ID</Label>
                    <Input value={waPhoneNumberId} onChange={(e) => setWaPhoneNumberId(e.target.value)} placeholder="123456789012345" data-testid="wa-meta-phoneid" />
                  </div>
                  <div><Label className="text-xs">Default language</Label>
                    <Input value={waDefaultLang} onChange={(e) => setWaDefaultLang(e.target.value)} placeholder="en" />
                  </div>
                  <div className="md:col-span-2"><Label className="text-xs">Access token {waHasMetaToken && <span className="text-[11px] text-muted-foreground">(stored — leave blank to keep)</span>}</Label>
                    <Input type="password" value={waMetaToken} onChange={(e) => setWaMetaToken(e.target.value)} placeholder={waHasMetaToken ? "••••••••" : "EAA…"} autoComplete="off" data-testid="wa-meta-token" />
                  </div>
                </div>
              )}

              {waProvider === "twilio" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label className="text-xs">Account SID</Label>
                    <Input value={waAccountSid} onChange={(e) => setWaAccountSid(e.target.value)} placeholder="AC…" data-testid="wa-twilio-sid" />
                  </div>
                  <div><Label className="text-xs">From number (E.164)</Label>
                    <Input value={waFromNumber} onChange={(e) => setWaFromNumber(e.target.value)} placeholder="+14155551234" data-testid="wa-twilio-from" />
                  </div>
                  <div className="md:col-span-2"><Label className="text-xs">Auth token {waHasAuthToken && <span className="text-[11px] text-muted-foreground">(stored — leave blank to keep)</span>}</Label>
                    <Input type="password" value={waAuthToken} onChange={(e) => setWaAuthToken(e.target.value)} placeholder={waHasAuthToken ? "••••••••" : ""} autoComplete="off" data-testid="wa-twilio-token" />
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={saveWhatsapp} disabled={saving === "whatsapp"} data-testid="wa-save">
                  {saving === "whatsapp" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save WhatsApp
                </Button>
              </div>

              {waProvider !== "disabled" && (
                <div className="border-t pt-4">
                  <Label className="text-xs">Send test WhatsApp</Label>
                  <div className="flex gap-2 mt-1">
                    <Input value={waTestTo} onChange={(e) => setWaTestTo(e.target.value)} placeholder="+919876543210" data-testid="wa-test-to" />
                    <Button onClick={testWhatsapp} disabled={!waTestTo || testing === "whatsapp"} variant="outline" data-testid="wa-test-btn">
                      {testing === "whatsapp" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Send
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">For Meta Cloud sandbox, recipients must be added to the test list inside Meta Business Manager.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent activity</CardTitle>
                <CardDescription>Last 20 outbound messages.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={loadLogs} disabled={logsLoading}>
                {logsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
              </Button>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No notifications sent yet.</p>
              ) : (
                <div className="space-y-1 text-sm">
                  {logs.map((l) => (
                    <div key={l.id} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-b-0">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{l.eventType} <span className="text-muted-foreground">→ {l.recipientEmail || l.recipientPhone || "—"}</span></div>
                        {l.errorMsg && <div className="text-[11px] text-red-600 truncate">{l.errorMsg}</div>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-[10px] uppercase">{l.channel}</Badge>
                        <Badge
                          variant={l.status === "sent" ? "default" : l.status === "failed" ? "destructive" : "secondary"}
                          className="text-[10px] uppercase"
                        >{l.status}</Badge>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
