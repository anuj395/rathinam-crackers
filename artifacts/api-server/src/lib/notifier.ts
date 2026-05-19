import nodemailer, { type Transporter } from "nodemailer";
import { db, settingsTable, notificationLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Settings shapes — persisted as a row in the `settings` table keyed by
// "smtp" / "whatsapp". Secrets (password, accessToken, authToken) are stored
// alongside the rest but are stripped on read by the API layer.
// ---------------------------------------------------------------------------

export type SmtpConfig = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
};

export type WhatsappConfig =
  | {
      enabled: boolean;
      provider: "meta_cloud";
      phoneNumberId: string;
      accessToken: string;
      defaultTemplate?: string;
      defaultLanguage?: string;
    }
  | {
      enabled: boolean;
      provider: "twilio";
      accountSid: string;
      authToken: string;
      fromNumber: string;
      defaultTemplate?: string;
      defaultLanguage?: string;
    }
  | {
      enabled: boolean;
      provider: "disabled";
    };

const SMTP_KEY = "smtp";
const WHATSAPP_KEY = "whatsapp";

const DEFAULT_SMTP: SmtpConfig = {
  enabled: false, host: "", port: 587, secure: false,
  username: "", password: "", fromName: "Rathinam Crackers", fromEmail: "",
};
const DEFAULT_WHATSAPP: WhatsappConfig = { enabled: false, provider: "disabled" };

export async function getSmtpConfig(): Promise<SmtpConfig> {
  const row = (await db.select().from(settingsTable).where(eq(settingsTable.key, SMTP_KEY)).limit(1))[0];
  if (!row) return DEFAULT_SMTP;
  return { ...DEFAULT_SMTP, ...(row.value as Partial<SmtpConfig>) };
}

export async function getWhatsappConfig(): Promise<WhatsappConfig> {
  const row = (await db.select().from(settingsTable).where(eq(settingsTable.key, WHATSAPP_KEY)).limit(1))[0];
  if (!row) return DEFAULT_WHATSAPP;
  return row.value as WhatsappConfig;
}

export async function saveSmtpConfig(cfg: SmtpConfig): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key: SMTP_KEY, value: cfg })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: cfg, updatedAt: new Date() } });
}

export async function saveWhatsappConfig(cfg: WhatsappConfig): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key: WHATSAPP_KEY, value: cfg })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: cfg, updatedAt: new Date() } });
}

// `safe` views never include the persisted secret. Use these when sending the
// config back to the UI; the UI only shows whether a secret is set, not its
// value.
export function smtpSafe(c: SmtpConfig) {
  const { password, ...rest } = c;
  return { ...rest, hasPassword: Boolean(password) };
}
export function whatsappSafe(c: WhatsappConfig) {
  if (c.provider === "twilio") {
    const { authToken, ...rest } = c;
    return { ...rest, hasAuthToken: Boolean(authToken) };
  }
  if (c.provider === "meta_cloud") {
    const { accessToken, ...rest } = c;
    return { ...rest, hasAccessToken: Boolean(accessToken) };
  }
  return c;
}

// ---------------------------------------------------------------------------
// Transport cache. The transporter is rebuilt whenever SMTP settings change.
// ---------------------------------------------------------------------------

let cachedTransporter: { transporter: Transporter; key: string } | null = null;

function smtpKey(c: SmtpConfig) {
  return `${c.host}:${c.port}:${c.secure}:${c.username}:${c.password}`;
}

async function getTransporter(c: SmtpConfig): Promise<Transporter> {
  const key = smtpKey(c);
  if (cachedTransporter && cachedTransporter.key === key) return cachedTransporter.transporter;
  const transporter = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: c.username ? { user: c.username, pass: c.password } : undefined,
  });
  cachedTransporter = { transporter, key };
  return transporter;
}

export function clearTransporterCache() {
  cachedTransporter = null;
}

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

type LogInput = {
  eventType: string;
  channel: "email" | "whatsapp" | "sms";
  status: "queued" | "sent" | "failed";
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  recipientId?: string | null;
  recipientType?: string | null;
  payload?: unknown;
  errorMsg?: string | null;
};
async function logNotification(input: LogInput) {
  try {
    await db.insert(notificationLogsTable).values({
      eventType: input.eventType,
      channel: input.channel,
      status: input.status,
      recipientEmail: input.recipientEmail ?? null,
      recipientPhone: input.recipientPhone ?? null,
      recipientId: input.recipientId ?? null,
      recipientType: input.recipientType ?? null,
      payload: input.payload as never,
      errorMsg: input.errorMsg ?? null,
    });
  } catch (err) {
    logger.error({ err }, "failed to write notification log row");
  }
}

// ---------------------------------------------------------------------------
// Public send APIs
// ---------------------------------------------------------------------------

export type SendEmailInput = {
  eventType: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  recipientId?: string | null;
  recipientType?: string | null;
};
export type SendResult = { ok: true; id?: string } | { ok: false; error: string; code?: string };

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const cfg = await getSmtpConfig();
  if (!cfg.enabled) {
    await logNotification({ ...common(input), status: "failed", errorMsg: "SMTP disabled" });
    return { ok: false, error: "SMTP is not enabled", code: "DISABLED" };
  }
  if (!cfg.host || !cfg.fromEmail) {
    await logNotification({ ...common(input), status: "failed", errorMsg: "SMTP missing host/from" });
    return { ok: false, error: "SMTP is not fully configured", code: "INCOMPLETE" };
  }
  if (!input.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.to)) {
    return { ok: false, error: "Invalid recipient email", code: "BAD_RECIPIENT" };
  }
  try {
    const transporter = await getTransporter(cfg);
    const info = await transporter.sendMail({
      from: cfg.fromName ? `"${cfg.fromName}" <${cfg.fromEmail}>` : cfg.fromEmail,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    await logNotification({ ...common(input), status: "sent" });
    return { ok: true, id: info.messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, to: input.to }, "email send failed");
    await logNotification({ ...common(input), status: "failed", errorMsg: message });
    return { ok: false, error: message };
  }

  function common(i: SendEmailInput) {
    return {
      eventType: i.eventType,
      channel: "email" as const,
      recipientEmail: i.to,
      recipientId: i.recipientId ?? null,
      recipientType: i.recipientType ?? null,
      payload: { subject: i.subject, hasHtml: Boolean(i.html), hasText: Boolean(i.text) },
    };
  }
}

export type SendWhatsappInput = {
  eventType: string;
  to: string; // E.164 (e.g. +919876543210)
  body?: string; // plain text fallback (used by Twilio + Meta `text` messages)
  templateName?: string; // Meta Cloud only
  templateLanguage?: string; // Meta Cloud only
  templateVariables?: string[]; // Meta Cloud body variables in order
  recipientId?: string | null;
  recipientType?: string | null;
};

export async function sendWhatsapp(input: SendWhatsappInput): Promise<SendResult> {
  const cfg = await getWhatsappConfig();
  const baseLog = {
    eventType: input.eventType,
    channel: "whatsapp" as const,
    recipientPhone: input.to,
    recipientId: input.recipientId ?? null,
    recipientType: input.recipientType ?? null,
    payload: {
      provider: cfg.provider,
      hasBody: Boolean(input.body),
      template: input.templateName ?? null,
    },
  };
  if (!cfg.enabled || cfg.provider === "disabled") {
    await logNotification({ ...baseLog, status: "failed", errorMsg: "WhatsApp disabled" });
    return { ok: false, error: "WhatsApp is not enabled", code: "DISABLED" };
  }
  if (!/^\+\d{6,18}$/.test(input.to)) {
    return { ok: false, error: "Recipient must be in E.164 format (e.g. +919876543210)", code: "BAD_RECIPIENT" };
  }
  try {
    let id: string | undefined;
    if (cfg.provider === "meta_cloud") {
      id = await sendViaMetaCloud(cfg, input);
    } else if (cfg.provider === "twilio") {
      id = await sendViaTwilio(cfg, input);
    }
    await logNotification({ ...baseLog, status: "sent" });
    return { ok: true, id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, to: input.to }, "whatsapp send failed");
    await logNotification({ ...baseLog, status: "failed", errorMsg: message });
    return { ok: false, error: message };
  }
}

async function sendViaMetaCloud(
  cfg: Extract<WhatsappConfig, { provider: "meta_cloud" }>,
  input: SendWhatsappInput,
): Promise<string> {
  if (!cfg.phoneNumberId || !cfg.accessToken) throw new Error("Meta Cloud API is not fully configured");
  const url = `https://graph.facebook.com/v20.0/${cfg.phoneNumberId}/messages`;
  const to = input.to.replace(/^\+/, "");
  const body: Record<string, unknown> = { messaging_product: "whatsapp", to };
  if (input.templateName) {
    body["type"] = "template";
    body["template"] = {
      name: input.templateName,
      language: { code: input.templateLanguage ?? cfg.defaultLanguage ?? "en" },
      components: input.templateVariables?.length
        ? [{ type: "body", parameters: input.templateVariables.map((v) => ({ type: "text", text: v })) }]
        : undefined,
    };
  } else {
    body["type"] = "text";
    body["text"] = { preview_url: false, body: input.body ?? "" };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { messages?: Array<{ id: string }>; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Meta Cloud responded ${res.status}`);
  return json.messages?.[0]?.id ?? "";
}

async function sendViaTwilio(
  cfg: Extract<WhatsappConfig, { provider: "twilio" }>,
  input: SendWhatsappInput,
): Promise<string> {
  if (!cfg.accountSid || !cfg.authToken || !cfg.fromNumber) throw new Error("Twilio is not fully configured");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
  const form = new URLSearchParams();
  form.set("From", `whatsapp:${cfg.fromNumber}`);
  form.set("To", `whatsapp:${input.to}`);
  form.set("Body", input.body ?? "");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) throw new Error(json.message ?? `Twilio responded ${res.status}`);
  return json.sid ?? "";
}
