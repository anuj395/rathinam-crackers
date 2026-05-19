import { Router } from "express";
import { db, notificationLogsTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middleware/authenticate.js";
import {
  type SmtpConfig,
  type WhatsappConfig,
  clearTransporterCache,
  getSmtpConfig,
  getWhatsappConfig,
  saveSmtpConfig,
  saveWhatsappConfig,
  sendEmail,
  sendWhatsapp,
  smtpSafe,
  whatsappSafe,
} from "../../lib/notifier.js";

const router = Router();
const adminOnly = requireRole("SUPER_ADMIN");

// --- Logs ------------------------------------------------------------------

router.get("/notify/log", authenticate, async (req, res) => {
  const { eventType, status, channel, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pg = Math.max(1, parseInt(page));
  const lim = Math.min(100, parseInt(limit));
  const offset = (pg - 1) * lim;
  const conditions = [];
  if (eventType) conditions.push(eq(notificationLogsTable.eventType, eventType));
  if (status) conditions.push(eq(notificationLogsTable.status, status as "queued" | "sent" | "failed"));
  if (channel) conditions.push(eq(notificationLogsTable.channel, channel as "whatsapp" | "sms" | "email"));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, countRows] = await Promise.all([
    db.select().from(notificationLogsTable).where(where).orderBy(desc(notificationLogsTable.createdAt)).limit(lim).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(notificationLogsTable).where(where),
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  res.json({ success: true, data: rows, meta: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) } });
});

// --- Config ----------------------------------------------------------------

router.get("/notify/config", authenticate, adminOnly, async (_req, res) => {
  const [smtp, whatsapp] = await Promise.all([getSmtpConfig(), getWhatsappConfig()]);
  res.json({ success: true, data: { smtp: smtpSafe(smtp), whatsapp: whatsappSafe(whatsapp) } });
});

router.put("/notify/config/smtp", authenticate, adminOnly, async (req: AuthRequest, res) => {
  const body = req.body as Partial<SmtpConfig> & { password?: string };
  const current = await getSmtpConfig();
  const port = Number(body.port);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Port must be 1–65535" } });
    return;
  }
  if (body.fromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.fromEmail)) {
    res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Invalid from email" } });
    return;
  }
  const next: SmtpConfig = {
    enabled: Boolean(body.enabled),
    host: String(body.host ?? "").trim(),
    port,
    secure: Boolean(body.secure),
    username: String(body.username ?? "").trim(),
    // Allow leaving the password unchanged: treat empty string as "keep".
    password: typeof body.password === "string" && body.password.length > 0 ? body.password : current.password,
    fromName: String(body.fromName ?? "").trim(),
    fromEmail: String(body.fromEmail ?? "").trim(),
  };
  await saveSmtpConfig(next);
  clearTransporterCache();
  req.log?.info({ host: next.host, enabled: next.enabled }, "smtp config updated");
  res.json({ success: true, data: smtpSafe(next) });
});

router.put("/notify/config/whatsapp", authenticate, adminOnly, async (req: AuthRequest, res) => {
  const body = req.body as Partial<WhatsappConfig> & Record<string, unknown>;
  const provider = body.provider ?? "disabled";
  const current = await getWhatsappConfig();
  let next: WhatsappConfig;
  if (provider === "disabled") {
    next = { enabled: false, provider: "disabled" };
  } else if (provider === "meta_cloud") {
    const accessToken =
      typeof body["accessToken"] === "string" && body["accessToken"].length > 0
        ? (body["accessToken"] as string)
        : current.provider === "meta_cloud"
        ? current.accessToken
        : "";
    next = {
      enabled: Boolean(body.enabled),
      provider: "meta_cloud",
      phoneNumberId: String(body["phoneNumberId"] ?? "").trim(),
      accessToken,
      defaultTemplate: typeof body["defaultTemplate"] === "string" ? (body["defaultTemplate"] as string) : undefined,
      defaultLanguage: typeof body["defaultLanguage"] === "string" ? (body["defaultLanguage"] as string) : "en",
    };
  } else if (provider === "twilio") {
    const authToken =
      typeof body["authToken"] === "string" && body["authToken"].length > 0
        ? (body["authToken"] as string)
        : current.provider === "twilio"
        ? current.authToken
        : "";
    const fromNumber = String(body["fromNumber"] ?? "").trim();
    if (fromNumber && !/^\+\d{6,18}$/.test(fromNumber)) {
      res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "fromNumber must be in E.164 format" } });
      return;
    }
    next = {
      enabled: Boolean(body.enabled),
      provider: "twilio",
      accountSid: String(body["accountSid"] ?? "").trim(),
      authToken,
      fromNumber,
      defaultTemplate: typeof body["defaultTemplate"] === "string" ? (body["defaultTemplate"] as string) : undefined,
      defaultLanguage: typeof body["defaultLanguage"] === "string" ? (body["defaultLanguage"] as string) : "en",
    };
  } else {
    res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Unknown WhatsApp provider" } });
    return;
  }
  await saveWhatsappConfig(next);
  req.log?.info({ provider: next.provider, enabled: next.enabled }, "whatsapp config updated");
  res.json({ success: true, data: whatsappSafe(next) });
});

// --- Test send -------------------------------------------------------------

router.post("/notify/test/email", authenticate, adminOnly, async (req: AuthRequest, res) => {
  const { to, subject, body } = req.body as { to?: string; subject?: string; body?: string };
  if (!to) {
    res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Recipient is required" } });
    return;
  }
  const result = await sendEmail({
    eventType: "test.email",
    to,
    subject: subject ?? "Rathinam Crackers — test message",
    text: body ?? "If you received this, your SMTP settings are working.",
    html: `<p>${(body ?? "If you received this, your SMTP settings are working.").replace(/</g, "&lt;")}</p>`,
    recipientType: "user",
    recipientId: req.user?.id ?? null,
  });
  if (!result.ok) {
    res.status(400).json({ success: false, error: { code: result.code ?? "SEND_FAILED", message: result.error } });
    return;
  }
  res.json({ success: true, data: { messageId: result.id } });
});

router.post("/notify/test/whatsapp", authenticate, adminOnly, async (req: AuthRequest, res) => {
  const { to, body, templateName, templateLanguage, templateVariables } = req.body as {
    to?: string;
    body?: string;
    templateName?: string;
    templateLanguage?: string;
    templateVariables?: string[];
  };
  if (!to) {
    res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Recipient is required" } });
    return;
  }
  const result = await sendWhatsapp({
    eventType: "test.whatsapp",
    to,
    body: body ?? "Rathinam Crackers — test WhatsApp message.",
    templateName,
    templateLanguage,
    templateVariables,
    recipientType: "user",
    recipientId: req.user?.id ?? null,
  });
  if (!result.ok) {
    res.status(400).json({ success: false, error: { code: result.code ?? "SEND_FAILED", message: result.error } });
    return;
  }
  res.json({ success: true, data: { id: result.id } });
});

export default router;
