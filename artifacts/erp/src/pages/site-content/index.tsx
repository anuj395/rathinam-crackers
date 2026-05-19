import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  useGetSiteContent,
  useUpdateSiteContent,
} from "@workspace/api-client-react";

// Helpers ------------------------------------------------------------
function get<T = unknown>(obj: any, path: string, fallback?: T): T {
  return path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj) ?? (fallback as T);
}
function setIn(obj: any, path: string, value: unknown): any {
  const keys = path.split(".");
  const next = Array.isArray(obj) ? [...obj] : { ...obj };
  let cur: any = next;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]!;
    cur[k] = cur[k] != null ? (Array.isArray(cur[k]) ? [...cur[k]] : { ...cur[k] }) : {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]!] = value;
  return next;
}

// Reusable field components ------------------------------------------
function Field({
  label,
  helper,
  children,
  testId,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}

function TextField({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <Input
      type={type}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function NumberField({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step ?? 1}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

function ArrayEditor<T extends Record<string, any>>({
  value,
  onChange,
  fields,
  empty,
  testId,
}: {
  value: T[] | undefined;
  onChange: (next: T[]) => void;
  fields: Array<{ key: keyof T & string; label: string; type?: "text" | "textarea" }>;
  empty: T;
  testId?: string;
}) {
  const list: T[] = Array.isArray(value) ? value : [];
  const update = (i: number, patch: Partial<T>) => {
    const next = list.map((row, idx) => (idx === i ? { ...row, ...patch } : row));
    onChange(next as T[]);
  };
  const remove = (i: number) => onChange(list.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="space-y-3" data-testid={testId}>
      {list.length === 0 && (
        <p className="text-xs text-muted-foreground">No entries yet — click "Add" to create one.</p>
      )}
      {list.map((row, i) => (
        <div key={i} className="border rounded-md p-3 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === list.length - 1}>↓</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => remove(i)}>Remove</Button>
            </div>
          </div>
          {fields.map((f) =>
            f.type === "textarea" ? (
              <Textarea
                key={f.key}
                value={String(row[f.key] ?? "")}
                placeholder={f.label}
                onChange={(e) => update(i, { [f.key]: e.target.value } as Partial<T>)}
              />
            ) : (
              <Input
                key={f.key}
                value={String(row[f.key] ?? "")}
                placeholder={f.label}
                onChange={(e) => update(i, { [f.key]: e.target.value } as Partial<T>)}
              />
            ),
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...list, { ...empty }])}>
        + Add
      </Button>
    </div>
  );
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <span className="text-sm">{label}</span>
      <Switch checked={!!value} onCheckedChange={onChange} />
    </div>
  );
}

// Page ---------------------------------------------------------------
export default function SiteContent() {
  const { data, isLoading, refetch } = useGetSiteContent();
  const update = useUpdateSiteContent();
  const { toast } = useToast();
  const [draft, setDraft] = useState<any>(null);
  const [rawText, setRawText] = useState("");
  const [rawDirty, setRawDirty] = useState(false);
  const [activeTab, setActiveTab] = useState("brand");
  const [lastEdit, setLastEdit] = useState<{ when: string; who: string | null } | null>(null);

  useEffect(() => {
    if (data?.data) {
      setDraft(data.data);
      setRawText(JSON.stringify(data.data, null, 2));
      setRawDirty(false);
    }
  }, [data]);

  // Keep the JSON (advanced) tab in sync with form-tab edits, but never
  // overwrite unsaved changes the user has typed directly in the JSON tab.
  useEffect(() => {
    if (draft && !rawDirty) {
      setRawText(JSON.stringify(draft, null, 2));
    }
  }, [draft, rawDirty]);

  // Show "last edited by … at …" by reading the most recent audit-log entry
  // for site-content. Fails silently for non-admin viewers.
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("erp_token") : null;
    if (!token) return;
    apiFetch(`/api/v1/audit-log?entityType=site-content&limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: Array<{ createdAt: string; actorName: string | null }> } | null) => {
        const row = j?.data?.[0];
        if (row) setLastEdit({ when: row.createdAt, who: row.actorName });
      })
      .catch(() => {});
  }, [data]);

  const dirty = useMemo(() => {
    if (!data?.data || !draft) return false;
    return JSON.stringify(data.data) !== JSON.stringify(draft);
  }, [data, draft]);

  const setPath = (path: string, value: unknown) => {
    setDraft((d: any) => setIn(d ?? {}, path, value));
  };

  const handleSave = async () => {
    if (!draft) return;
    try {
      await update.mutateAsync({ data: draft });
      toast({ title: "Saved", description: "Website content updated." });
      await refetch();
    } catch {
      toast({ title: "Save failed", description: "Could not update content.", variant: "destructive" });
    }
  };

  const handleSaveRaw = async () => {
    try {
      const parsed = JSON.parse(rawText);
      setDraft(parsed);
      await update.mutateAsync({ data: parsed });
      setRawDirty(false);
      toast({ title: "Saved", description: "Website content updated." });
      await refetch();
    } catch {
      toast({ title: "Invalid JSON", description: "Please fix the JSON before saving.", variant: "destructive" });
    }
  };

  const handleReset = () => {
    if (data?.data) {
      setDraft(data.data);
      setRawText(JSON.stringify(data.data, null, 2));
    }
  };

  if (isLoading || !draft) {
    return <div className="p-6">Loading…</div>;
  }

  return (
    <>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-1 gap-4">
          <div>
            <h1 className="text-2xl font-bold">Website content (CMS)</h1>
            <p className="text-sm text-muted-foreground">
              Edit your brand, contact details, hero CTAs, promo banner, policies and POS display options.
              Changes appear instantly on the public website.
            </p>
            {lastEdit && (
              <p className="text-xs text-muted-foreground mt-1" data-testid="site-content-last-edit">
                Last edited by{" "}
                <span className="font-medium text-foreground">{lastEdit.who ?? "unknown"}</span>
                {" "}on{" "}
                {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(
                  new Date(lastEdit.when),
                )}
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="outline" onClick={handleReset} disabled={!dirty} data-testid="site-content-reset">
              Reset
            </Button>
            <Button onClick={handleSave} disabled={!dirty || update.isPending} data-testid="site-content-save">
              {update.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="brand">Brand</TabsTrigger>
            <TabsTrigger value="contact">Contact</TabsTrigger>
            <TabsTrigger value="socials">Socials</TabsTrigger>
            <TabsTrigger value="cta">Hero & CTAs</TabsTrigger>
            <TabsTrigger value="promo">Promo</TabsTrigger>
            <TabsTrigger value="policies">Policies</TabsTrigger>
            <TabsTrigger value="pos">POS</TabsTrigger>
            <TabsTrigger value="occasions">Occasions</TabsTrigger>
            <TabsTrigger value="festival">Festival</TabsTrigger>
            <TabsTrigger value="faqs">FAQs</TabsTrigger>
            <TabsTrigger value="how">How it works</TabsTrigger>
            <TabsTrigger value="why">Why us</TabsTrigger>
            <TabsTrigger value="json">JSON (advanced)</TabsTrigger>
          </TabsList>

          {/* BRAND ------------------------------------------------ */}
          <TabsContent value="brand" className="space-y-4 pt-4">
            <Field label="Brand name" helper="Shown in the navbar, footer and meta tags.">
              <TextField value={get(draft, "brand.name")} onChange={(v) => setPath("brand.name", v)} />
            </Field>
            <Field label="Tagline" helper="Short one-liner shown under the logo and in the footer.">
              <TextField value={get(draft, "brand.tagline")} onChange={(v) => setPath("brand.tagline", v)} />
            </Field>
            <Field label="Established year" helper="Used in the 'Since YYYY' line.">
              <NumberField value={get(draft, "brand.establishedYear", 1985)} onChange={(v) => setPath("brand.establishedYear", v)} min={1900} max={2100} />
            </Field>
            <Field label="Bulk WhatsApp message" helper="Pre-filled message body when a visitor taps the bulk-quote button.">
              <TextField value={get(draft, "brand.bulkWhatsAppMessage")} onChange={(v) => setPath("brand.bulkWhatsAppMessage", v)} />
            </Field>
          </TabsContent>

          {/* CONTACT ---------------------------------------------- */}
          <TabsContent value="contact" className="space-y-4 pt-4">
            <Field label="Phone (display)" helper="Click-to-call number in the footer and contact page.">
              <TextField type="tel" value={get(draft, "contact.phone")} onChange={(v) => setPath("contact.phone", v)} />
            </Field>
            <Field label="WhatsApp number (digits only, with country code)" helper="Used to build wa.me links. Example: 919876543210">
              <TextField value={get(draft, "contact.whatsapp")} onChange={(v) => setPath("contact.whatsapp", v)} />
            </Field>
            <Field label="Support email">
              <TextField type="email" value={get(draft, "contact.email")} onChange={(v) => setPath("contact.email", v)} />
            </Field>
            <Field label="Address line 1">
              <TextField value={get(draft, "contact.addressLine1")} onChange={(v) => setPath("contact.addressLine1", v)} />
            </Field>
            <Field label="Address line 2">
              <TextField value={get(draft, "contact.addressLine2")} onChange={(v) => setPath("contact.addressLine2", v)} />
            </Field>
            <Field label="GSTIN">
              <TextField value={get(draft, "contact.gstin")} onChange={(v) => setPath("contact.gstin", v)} />
            </Field>
            <Field label="Google Maps embed URL" helper="Optional iframe URL for the contact page map.">
              <TextField type="url" value={get(draft, "contact.mapUrl")} onChange={(v) => setPath("contact.mapUrl", v)} />
            </Field>
          </TabsContent>

          {/* SOCIALS ---------------------------------------------- */}
          <TabsContent value="socials" className="space-y-4 pt-4">
            <Field label="WhatsApp link" helper="Full https://wa.me/... URL.">
              <TextField type="url" value={get(draft, "socials.whatsapp")} onChange={(v) => setPath("socials.whatsapp", v)} />
            </Field>
            <Field label="Instagram">
              <TextField type="url" value={get(draft, "socials.instagram")} onChange={(v) => setPath("socials.instagram", v)} />
            </Field>
            <Field label="Facebook">
              <TextField type="url" value={get(draft, "socials.facebook")} onChange={(v) => setPath("socials.facebook", v)} />
            </Field>
            <Field label="YouTube">
              <TextField type="url" value={get(draft, "socials.youtube")} onChange={(v) => setPath("socials.youtube", v)} />
            </Field>
            <Field label="Twitter / X">
              <TextField type="url" value={get(draft, "socials.twitter")} onChange={(v) => setPath("socials.twitter", v)} />
            </Field>
          </TabsContent>

          {/* CTA -------------------------------------------------- */}
          <TabsContent value="cta" className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Hero primary button — label">
                <TextField value={get(draft, "cta.heroPrimary.label")} onChange={(v) => setPath("cta.heroPrimary.label", v)} />
              </Field>
              <Field label="Hero primary button — link" helper="Internal path or full URL.">
                <TextField value={get(draft, "cta.heroPrimary.href")} onChange={(v) => setPath("cta.heroPrimary.href", v)} />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Hero secondary button — label">
                <TextField value={get(draft, "cta.heroSecondary.label")} onChange={(v) => setPath("cta.heroSecondary.label", v)} />
              </Field>
              <Field label="Hero secondary button — link" helper="Use 'wa' to link to WhatsApp using the number above.">
                <TextField value={get(draft, "cta.heroSecondary.href")} onChange={(v) => setPath("cta.heroSecondary.href", v)} />
              </Field>
            </div>
            <Field label="Bulk WhatsApp button label">
              <TextField value={get(draft, "cta.bulkWhatsAppLabel")} onChange={(v) => setPath("cta.bulkWhatsAppLabel", v)} />
            </Field>
            <Field label="Bulk Call button label">
              <TextField value={get(draft, "cta.bulkCallLabel")} onChange={(v) => setPath("cta.bulkCallLabel", v)} />
            </Field>
            <ToggleField
              label="Show floating WhatsApp bubble on website"
              value={!!get(draft, "cta.floatingWhatsApp.enabled")}
              onChange={(v) => setPath("cta.floatingWhatsApp.enabled", v)}
            />
            <Field label="Floating WhatsApp tooltip">
              <TextField
                value={get(draft, "cta.floatingWhatsApp.label")}
                onChange={(v) => setPath("cta.floatingWhatsApp.label", v)}
              />
            </Field>
          </TabsContent>

          {/* PROMO ------------------------------------------------ */}
          <TabsContent value="promo" className="space-y-4 pt-4">
            <Field label="Top promo bar text" helper="Shown above the navbar. Leave blank to hide the bar.">
              <TextField value={get(draft, "brand.promoBarText")} onChange={(v) => setPath("brand.promoBarText", v)} />
            </Field>
          </TabsContent>

          {/* POLICIES --------------------------------------------- */}
          <TabsContent value="policies" className="space-y-4 pt-4">
            <Field label="Delivery time text" helper="Free-form text shown at checkout, e.g. '5–10 working days'.">
              <TextField value={get(draft, "policies.deliveryDays")} onChange={(v) => setPath("policies.deliveryDays", v)} />
            </Field>
            <Field label="Return window (days)">
              <NumberField value={get(draft, "policies.returnPolicyDays", 2)} onChange={(v) => setPath("policies.returnPolicyDays", v)} min={0} max={365} />
            </Field>
            <Field label="Minimum order value (₹)" helper="0 = no minimum.">
              <NumberField value={get(draft, "policies.minOrderValue", 0)} onChange={(v) => setPath("policies.minOrderValue", v)} min={0} />
            </Field>
            <Field label="Free delivery threshold (₹)" helper="0 = no free-delivery offer.">
              <NumberField value={get(draft, "policies.freeDeliveryThreshold", 0)} onChange={(v) => setPath("policies.freeDeliveryThreshold", v)} min={0} />
            </Field>
            <Field label="Bulk-pricing threshold (qty)" helper="Auto wholesale rate kicks in at this quantity per SKU.">
              <NumberField value={get(draft, "policies.bulkThreshold", 10)} onChange={(v) => setPath("policies.bulkThreshold", v)} min={1} max={1000} />
            </Field>
            <Field label="Order confirmation window (hours)">
              <NumberField value={get(draft, "policies.confirmationWindowHours", 24)} onChange={(v) => setPath("policies.confirmationWindowHours", v)} min={1} max={168} />
            </Field>
          </TabsContent>

          {/* POS -------------------------------------------------- */}
          <TabsContent value="pos" className="space-y-4 pt-4">
            <Field label="Quick-cash buttons (₹)" helper="Comma-separated amounts shown on the POS keypad. Example: 100, 200, 500, 1000, 2000">
              <TextField
                value={(get<number[]>(draft, "pos.quickCash", []) ?? []).join(", ")}
                onChange={(v) =>
                  setPath(
                    "pos.quickCash",
                    v.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0),
                  )
                }
              />
            </Field>
            <ToggleField
              label="Allow CASH payment"
              value={!!get(draft, "pos.paymentMethods.cash")}
              onChange={(v) => setPath("pos.paymentMethods.cash", v)}
            />
            <ToggleField
              label="Allow UPI payment"
              value={!!get(draft, "pos.paymentMethods.upi")}
              onChange={(v) => setPath("pos.paymentMethods.upi", v)}
            />
            <ToggleField
              label="Allow CARD payment"
              value={!!get(draft, "pos.paymentMethods.card")}
              onChange={(v) => setPath("pos.paymentMethods.card", v)}
            />
            <ToggleField
              label="Allow CREDIT (on-account) payment"
              value={!!get(draft, "pos.paymentMethods.credit")}
              onChange={(v) => setPath("pos.paymentMethods.credit", v)}
            />
            <ToggleField
              label="Show customer picker"
              value={get<boolean>(draft, "pos.showCustomerPicker", true) !== false}
              onChange={(v) => setPath("pos.showCustomerPicker", v)}
            />
            <ToggleField
              label="Show coupon box"
              value={get<boolean>(draft, "pos.showCouponBox", true) !== false}
              onChange={(v) => setPath("pos.showCouponBox", v)}
            />
          </TabsContent>

          {/* OCCASIONS -------------------------------------------- */}
          <TabsContent value="occasions" className="space-y-4 pt-4">
            <p className="text-xs text-muted-foreground">
              Occasions appear as tiles on the homepage and as filter chips on the catalogue.
              The <code className="font-mono">key</code> must be lowercase, no spaces — it is used as
              <code className="font-mono"> ?occasion=KEY</code> in URLs and as the tag stored on each product.
              Use any short emoji as the icon. <code className="font-mono">color</code> is a Tailwind gradient
              (e.g. <em>from-amber-400 via-orange-500 to-red-600</em>).
            </p>
            <ArrayEditor
              testId="occasions-editor"
              value={get<Array<{ key: string; label: string; emoji: string; tag: string; color: string }>>(draft, "occasions", [])}
              onChange={(next) => setPath("occasions", next)}
              fields={[
                { key: "key", label: "Key (url-safe, e.g. diwali)" },
                { key: "label", label: "Label (shown to customers)" },
                { key: "emoji", label: "Emoji" },
                { key: "tag", label: "Tag (e.g. Festival, Bulk)" },
                { key: "color", label: "Tailwind gradient classes" },
              ]}
              empty={{ key: "", label: "", emoji: "🎉", tag: "", color: "from-amber-400 via-orange-500 to-red-600" }}
            />
            <p className="text-xs text-muted-foreground">
              After saving, tag each product with one or more occasions on the
              <strong> Products → Edit </strong> page.
            </p>
          </TabsContent>

          {/* FESTIVAL COUNTDOWN + NEWSLETTER + BULK CTA ----------- */}
          <TabsContent value="festival" className="space-y-6 pt-4">
            <div className="space-y-4 border rounded-md p-4 bg-muted/30">
              <h3 className="text-sm font-semibold">Hero countdown</h3>
              <p className="text-xs text-muted-foreground">
                The countdown only appears on the homepage if a target date is set and is still in the future.
                Leave the date blank to hide it.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Festival name" testId="festival-name">
                  <TextField
                    value={get<string>(draft, "festival.name", "")}
                    onChange={(v) => setPath("festival.name", v)}
                    placeholder="Diwali, Karthigai, New Year…"
                  />
                </Field>
                <Field label="Target date (yyyy-mm-dd)" testId="festival-date">
                  <TextField
                    type="date"
                    value={get<string>(draft, "festival.targetDate", "")}
                    onChange={(v) => setPath("festival.targetDate", v)}
                    placeholder="2025-11-01"
                  />
                </Field>
                <Field label="Countdown label" helper="e.g. 'Diwali season starts in'" testId="festival-label">
                  <TextField
                    value={get<string>(draft, "festival.countdownLabel", "")}
                    onChange={(v) => setPath("festival.countdownLabel", v)}
                  />
                </Field>
                <ToggleField
                  label="Show countdown on homepage"
                  value={get<boolean>(draft, "festival.enabled", true)}
                  onChange={(v) => setPath("festival.enabled", v)}
                />
              </div>
            </div>

            <div className="space-y-4 border rounded-md p-4 bg-muted/30">
              <h3 className="text-sm font-semibold">Occasion section copy</h3>
              <Field label="Eyebrow">
                <TextField
                  value={get<string>(draft, "occasionSection.eyebrow", "")}
                  onChange={(v) => setPath("occasionSection.eyebrow", v)}
                />
              </Field>
              <Field label="Title">
                <TextField
                  value={get<string>(draft, "occasionSection.title", "")}
                  onChange={(v) => setPath("occasionSection.title", v)}
                />
              </Field>
              <Field label="Subtitle">
                <Textarea
                  value={get<string>(draft, "occasionSection.subtitle", "")}
                  onChange={(e) => setPath("occasionSection.subtitle", e.target.value)}
                />
              </Field>
            </div>

            <div className="space-y-4 border rounded-md p-4 bg-muted/30">
              <h3 className="text-sm font-semibold">Newsletter band</h3>
              <Field label="Heading">
                <TextField
                  value={get<string>(draft, "newsletter.heading", "")}
                  onChange={(v) => setPath("newsletter.heading", v)}
                />
              </Field>
              <Field label="Body">
                <Textarea
                  value={get<string>(draft, "newsletter.body", "")}
                  onChange={(e) => setPath("newsletter.body", e.target.value)}
                />
              </Field>
            </div>

            <div className="space-y-4 border rounded-md p-4 bg-muted/30">
              <h3 className="text-sm font-semibold">Bulk / weddings CTA band</h3>
              <Field label="Eyebrow">
                <TextField
                  value={get<string>(draft, "bulkCta.eyebrow", "")}
                  onChange={(v) => setPath("bulkCta.eyebrow", v)}
                />
              </Field>
              <Field label="Title">
                <TextField
                  value={get<string>(draft, "bulkCta.title", "")}
                  onChange={(v) => setPath("bulkCta.title", v)}
                />
              </Field>
              <Field label="Body">
                <Textarea
                  value={get<string>(draft, "bulkCta.body", "")}
                  onChange={(e) => setPath("bulkCta.body", e.target.value)}
                />
              </Field>
              <Field label="Perks line">
                <TextField
                  value={get<string>(draft, "bulkCta.perks", "")}
                  onChange={(v) => setPath("bulkCta.perks", v)}
                />
              </Field>
            </div>
          </TabsContent>

          {/* FAQs ------------------------------------------------- */}
          <TabsContent value="faqs" className="space-y-4 pt-4">
            <p className="text-xs text-muted-foreground">
              Frequently-asked questions shown on the website FAQ section. Each entry has a question and an answer.
            </p>
            <ArrayEditor
              testId="faqs-editor"
              value={get<Array<{ q: string; a: string }>>(draft, "homeFaqs", [])}
              onChange={(next) => setPath("homeFaqs", next)}
              fields={[
                { key: "q", label: "Question" },
                { key: "a", label: "Answer", type: "textarea" },
              ]}
              empty={{ q: "", a: "" }}
            />
          </TabsContent>

          {/* HOW IT WORKS ----------------------------------------- */}
          <TabsContent value="how" className="space-y-4 pt-4">
            <p className="text-xs text-muted-foreground">
              The numbered steps shown on the homepage explaining how customers buy from you.
              Use any short emoji as the icon (e.g. 📦, 🚚, ✅).
            </p>
            <ArrayEditor
              testId="how-editor"
              value={get<Array<{ step: string; icon: string; title: string; desc: string }>>(draft, "howItWorks", [])}
              onChange={(next) => setPath("howItWorks", next)}
              fields={[
                { key: "step", label: "Step number (e.g. 01)" },
                { key: "icon", label: "Icon (emoji)" },
                { key: "title", label: "Title" },
                { key: "desc", label: "Short description", type: "textarea" },
              ]}
              empty={{ step: "", icon: "", title: "", desc: "" }}
            />
          </TabsContent>

          {/* WHY US ----------------------------------------------- */}
          <TabsContent value="why" className="space-y-4 pt-4">
            <p className="text-xs text-muted-foreground">
              The selling points shown in the "Why us" homepage section. Use a short emoji as the icon.
            </p>
            <ArrayEditor
              testId="why-editor"
              value={get<Array<{ icon: string; title: string; desc: string }>>(draft, "whyUs", [])}
              onChange={(next) => setPath("whyUs", next)}
              fields={[
                { key: "icon", label: "Icon (emoji)" },
                { key: "title", label: "Title" },
                { key: "desc", label: "Short description", type: "textarea" },
              ]}
              empty={{ icon: "", title: "", desc: "" }}
            />
          </TabsContent>

          {/* RAW JSON --------------------------------------------- */}
          <TabsContent value="json" className="space-y-4 pt-4">
            <p className="text-xs text-muted-foreground">
              Power-user editor. Edit any section directly — including arrays like FAQs, testimonials,
              how-it-works steps and homepage stats.
            </p>
            <Textarea
              className="w-full h-[60vh] font-mono text-xs"
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                setRawDirty(true);
              }}
              data-testid="site-content-editor"
            />
            <Button onClick={handleSaveRaw} disabled={update.isPending} data-testid="site-content-save-raw">
              {update.isPending ? "Saving…" : "Save raw JSON"}
            </Button>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
