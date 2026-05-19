import { db, customersTable, settingsTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { logger } from "./logger.js";
import { sendEmail, sendWhatsapp, getSmtpConfig, getWhatsappConfig } from "./notifier.js";

// We persist "last successful run date (IST)" in a settings row so that a
// process restart during the send window does NOT cause us to re-spam every
// debtor. The in-memory Set is just a within-run guard.
const remindedThisRun = new Set<string>();
const RUN_STATE_KEY = "paymentRemindersState";
type RunState = { lastRunDateIST?: string };

// Stable IST date string ("YYYY-MM-DD") computed via Intl, which correctly
// handles the +05:30 offset. The previous bit-shift approach was wrong for
// the first half of any UTC hour.
function todayIST(): string {
  // en-CA gives ISO-style "YYYY-MM-DD".
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}
function hourIST(): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(new Date());
  return Number(h);
}

async function getRunState(): Promise<RunState> {
  const row = (await db.select().from(settingsTable).where(eq(settingsTable.key, RUN_STATE_KEY)).limit(1))[0];
  return (row?.value as RunState) ?? {};
}
async function setRunState(s: RunState): Promise<void> {
  const existing = (await db.select().from(settingsTable).where(eq(settingsTable.key, RUN_STATE_KEY)).limit(1))[0];
  if (existing) {
    await db.update(settingsTable).set({ value: s, updatedAt: new Date() }).where(eq(settingsTable.key, RUN_STATE_KEY));
  } else {
    await db.insert(settingsTable).values({ key: RUN_STATE_KEY, value: s });
  }
}

const REMINDER_KEY = "paymentReminders";
type ReminderConfig = {
  enabled: boolean;
  minOutstanding: number; // ₹ — skip dust balances
  channel: "email" | "whatsapp" | "both";
};
const DEFAULT_CFG: ReminderConfig = { enabled: false, minOutstanding: 100, channel: "email" };

async function getConfig(): Promise<ReminderConfig> {
  const row = (await db.select().from(settingsTable).where(eq(settingsTable.key, REMINDER_KEY)).limit(1))[0];
  return { ...DEFAULT_CFG, ...((row?.value as Partial<ReminderConfig>) ?? {}) };
}

async function runOnce(): Promise<void> {
  const cfg = await getConfig();
  if (!cfg.enabled) return;

  // Persistent guard: refuse to run if we already completed today's pass.
  // Survives restarts so a deploy at 10:30 IST won't re-spam everyone.
  const today = todayIST();
  const state = await getRunState();
  if (state.lastRunDateIST === today) return;
  remindedThisRun.clear();

  const [smtp, wa] = await Promise.all([getSmtpConfig(), getWhatsappConfig()]);
  const wantEmail = cfg.channel === "email" || cfg.channel === "both";
  const wantWa = cfg.channel === "whatsapp" || cfg.channel === "both";
  if (wantEmail && !smtp.enabled && !wantWa) return;
  if (wantWa && !wa.enabled && !wantEmail) return;

  const debtors = await db
    .select()
    .from(customersTable)
    .where(sql`cast(${customersTable.outstandingBalance} as numeric) >= ${cfg.minOutstanding}`)
    .limit(500);

  let sent = 0;
  for (const c of debtors) {
    if (remindedThisRun.has(c.id)) continue;
    const amount = Number(c.outstandingBalance).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const subject = `Payment reminder: ₹${amount} outstanding`;
    const body =
      `Dear ${c.name},\n\n` +
      `This is a friendly reminder that your account currently shows an outstanding balance of ₹${amount}. ` +
      `Please arrange payment at your earliest convenience.\n\n` +
      `Thank you,\nRathinam Crackers`;

    let anySent = false;
    if (wantEmail && smtp.enabled && c.email) {
      const r = await sendEmail({
        eventType: "payment.reminder",
        to: c.email,
        subject,
        text: body,
        recipientId: c.id,
        recipientType: "customer",
      });
      if (r.ok) anySent = true;
    }
    if (wantWa && wa.enabled && c.phone) {
      const phone = c.phone.startsWith("+") ? c.phone : `+91${c.phone}`;
      const r = await sendWhatsapp({
        eventType: "payment.reminder",
        to: phone,
        body,
        recipientId: c.id,
        recipientType: "customer",
      });
      if (r.ok) anySent = true;
    }
    if (anySent) {
      remindedThisRun.add(c.id);
      sent++;
    }
  }
  // Mark the day done even if 0 sent — next attempt is tomorrow regardless.
  await setRunState({ lastRunDateIST: today });
  if (sent > 0) logger.info({ sent, debtors: debtors.length }, "payment reminders sent");
}

let timer: NodeJS.Timeout | null = null;

// Wake every hour, but only fire reminders during a configured "send window"
// (default 10:00 IST). One pass per day max — the in-memory set guards against
// duplicates within the same calendar day.
export function startPaymentReminderScheduler(): void {
  if (timer) return;
  const tick = async () => {
    try {
      // Send window: 10:00–10:59 IST. Outside the window we no-op. The
      // persistent lastRunDateIST guard inside runOnce() prevents double-send
      // on restart even within the window.
      if (hourIST() !== 10) return;
      await runOnce();
    } catch (err) {
      logger.error({ err }, "payment reminder scheduler failed");
    }
  };
  timer = setInterval(tick, 60 * 60 * 1000); // hourly
  logger.info({ intervalMs: 60 * 60 * 1000, sendHourIST: 10 }, "payment reminder scheduler started");
  // Fire once at startup so a fresh deploy doesn't have to wait an hour to
  // discover whether the config + credentials are wired correctly. Safe
  // because runOnce() short-circuits if today already ran.
  void tick();
}
