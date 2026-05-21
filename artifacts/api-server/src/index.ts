// Load `.env` for development. Prefer package-local `.env`, else fall back
// to repository root `.env` so running from the package folder still picks
// up the project's root .env file.
import { config as dotenvConfig } from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Walk up from this file's directory looking for a .env file (max 6 levels).
const startDir = path.dirname(fileURLToPath(import.meta.url));
console.error(`[env] startDir=${startDir}`);
let dir = startDir;
for (let i = 0; i < 6; i++) {
  const candidate = path.join(dir, ".env");
  if (fs.existsSync(candidate)) {
    dotenvConfig({ path: candidate });
    console.error(`[env] loaded ${candidate}`);
    break;
  }
  const parent = path.resolve(dir, "..");
  if (parent === dir) break;
  dir = parent;
}
console.error(`[env] dotenv search finished, process.env.DATABASE_URL=${process.env.DATABASE_URL ? '[SET]' : '[MISSING]'}`);
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
