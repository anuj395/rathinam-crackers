import app from "./app";
import { logger } from "./lib/logger";
import { startSystemHealthScheduler } from "./lib/system-health";
import { startBackupScheduler } from "./lib/system-backup";
import { startAuditRetentionScheduler } from "./lib/audit-retention";
import { startPaymentReminderScheduler } from "./lib/payment-reminder";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  // Self-monitor: sweep data-integrity & security checks every minute.
  startSystemHealthScheduler(60_000);
  // Recoverability: nightly Postgres dump, retain last 7.
  startBackupScheduler();
  // Retention: prune audit_log rows older than the configured window
  // (default 365d, configurable via settings.audit.retentionDays).
  startAuditRetentionScheduler();
  // Outbound: nudge customers with outstanding balances once a day at 10:00 IST.
  // No-op unless settings.paymentReminders.enabled is true.
  startPaymentReminderScheduler();
});
