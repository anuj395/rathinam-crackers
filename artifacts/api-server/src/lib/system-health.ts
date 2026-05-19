import {
  db,
  stockLevelsTable,
  stockLedgerTable,
  heldBillsTable,
  locationsTable,
  usersTable,
  settingsTable,
  customersTable,
  invoicesTable,
  transfersTable,
} from "@workspace/db";
import { sql, lt, eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { logger } from "./logger.js";
import { getMostRecentBackup, getLastBackupResult } from "./system-backup.js";

export type Severity = "info" | "warn" | "error";

export type CheckResult = {
  id: string;
  label: string;
  description: string;
  severity: Severity;
  ok: boolean;
  detail: string;
  count: number;
  autoFixable: boolean;
  durationMs: number;
};

export type HealthSnapshot = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  ok: boolean;
  totals: { passed: number; failed: number; total: number };
  checks: CheckResult[];
  recentFixes: FixLogEntry[];
};

export type FixLogEntry = {
  ts: string;
  checkId: string;
  ok: boolean;
  message: string;
  affected: number;
};

type Check = {
  id: string;
  label: string;
  description: string;
  severity: Severity;
  autoFixable: boolean;
  run: () => Promise<{ ok: boolean; detail: string; count: number }>;
  fix?: () => Promise<{ ok: boolean; message: string; affected: number }>;
};

// Stale-held-bill threshold (days). Configurable here so the auto-fixer and
// the check agree exactly.
const HELD_BILL_STALE_DAYS = 30;

const checks: Check[] = [
  {
    id: "db_connectivity",
    label: "Database connectivity",
    description: "Confirms the API server can talk to PostgreSQL.",
    severity: "error",
    autoFixable: false,
    run: async () => {
      const rows = await db.execute(sql`select 1 as v`);
      const ok = Array.isArray((rows as { rows?: unknown[] }).rows ?? rows)
        ? true
        : true;
      return { ok, detail: "SELECT 1 succeeded", count: 0 };
    },
  },
  {
    id: "stock_non_negative",
    label: "Stock levels non-negative",
    description:
      "Ensures no stock_levels row holds a negative currentQty (which corrupts availability checks at checkout).",
    severity: "error",
    autoFixable: true,
    run: async () => {
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(stockLevelsTable)
        .where(lt(stockLevelsTable.currentQty, 0));
      const count = Number(rows[0]?.count ?? 0);
      return {
        ok: count === 0,
        detail: count === 0 ? "All stock levels >= 0" : `${count} row(s) with negative qty`,
        count,
      };
    },
    fix: async () => {
      // Find every offending row, write an ADJUST ledger entry that brings
      // it back to zero (so the audit trail stays intact), then clamp.
      const bad = await db
        .select()
        .from(stockLevelsTable)
        .where(lt(stockLevelsTable.currentQty, 0));
      let affected = 0;
      for (const row of bad) {
        const delta = -row.currentQty;
        await db.insert(stockLedgerTable).values({
          productId: row.productId,
          variantId: row.variantId,
          locationId: row.locationId,
          type: "ADJUST",
          qty: delta,
          refType: "AUTO_HEAL",
          refId: "system_health",
          notes: `Auto-heal: clamped negative stock (${row.currentQty} → 0)`,
          createdBy: "system",
        });
        await db
          .update(stockLevelsTable)
          .set({ currentQty: 0, updatedAt: new Date() })
          .where(
            and(
              eq(stockLevelsTable.productId, row.productId),
              eq(stockLevelsTable.variantId, row.variantId),
              eq(stockLevelsTable.locationId, row.locationId),
            ),
          );
        affected += 1;
      }
      return {
        ok: true,
        message: `Clamped ${affected} negative stock row(s) to 0 with audit ledger entries.`,
        affected,
      };
    },
  },
  {
    id: "stale_held_bills",
    label: "Stale POS held bills",
    description: `Reports held bills older than ${HELD_BILL_STALE_DAYS} days that were never resumed. They clutter the cashier UI.`,
    severity: "warn",
    autoFixable: true,
    run: async () => {
      const cutoff = new Date(Date.now() - HELD_BILL_STALE_DAYS * 86400000);
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(heldBillsTable)
        .where(lt(heldBillsTable.createdAt, cutoff));
      const count = Number(rows[0]?.count ?? 0);
      return {
        ok: count === 0,
        detail:
          count === 0
            ? "No stale held bills"
            : `${count} held bill(s) older than ${HELD_BILL_STALE_DAYS} days`,
        count,
      };
    },
    fix: async () => {
      const cutoff = new Date(Date.now() - HELD_BILL_STALE_DAYS * 86400000);
      const deleted = await db
        .delete(heldBillsTable)
        .where(lt(heldBillsTable.createdAt, cutoff))
        .returning({ id: heldBillsTable.id });
      return {
        ok: true,
        message: `Removed ${deleted.length} stale held bill(s).`,
        affected: deleted.length,
      };
    },
  },
  {
    id: "stuck_transfers",
    label: "Long-running transfers",
    description:
      "Surfaces transfers stuck in_transit for more than 14 days — likely lost or never received.",
    severity: "warn",
    autoFixable: false,
    run: async () => {
      const cutoff = new Date(Date.now() - 14 * 86400000);
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(transfersTable)
        .where(
          and(
            eq(transfersTable.status, "in_transit"),
            lt(transfersTable.createdAt, cutoff),
          ),
        );
      const count = Number(rows[0]?.count ?? 0);
      return {
        ok: count === 0,
        detail:
          count === 0
            ? "No stuck transfers"
            : `${count} transfer(s) in_transit for > 14 days`,
        count,
      };
    },
  },
  {
    id: "orphan_invoice_customer",
    label: "Invoice → customer integrity",
    description:
      "Finds invoices that reference a customer ID which no longer exists in the customers table.",
    severity: "warn",
    autoFixable: false,
    run: async () => {
      // NOT EXISTS keeps the work in the database and avoids loading every
      // customer ID into memory.
      const result = (await db.execute(sql`
        select count(*)::int as count
        from ${invoicesTable} i
        where i.customer_id is not null
          and not exists (
            select 1 from ${customersTable} c where c.id = i.customer_id
          )
      `)) as unknown as { rows?: Array<{ count: number }> } | Array<{ count: number }>;
      const arr = Array.isArray(result) ? result : (result.rows ?? []);
      const count = Number(arr[0]?.count ?? 0);
      return {
        ok: count === 0,
        detail:
          count === 0
            ? "All invoice customer references resolve"
            : `${count} invoice(s) reference missing customer`,
        count,
      };
    },
  },
  {
    id: "locations_seeded",
    label: "At least one location configured",
    description:
      "POS terminals require a location row. Without one, sales cannot be recorded.",
    severity: "error",
    autoFixable: false,
    run: async () => {
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(locationsTable);
      const count = Number(rows[0]?.count ?? 0);
      return {
        ok: count > 0,
        detail: `${count} location(s) configured`,
        count,
      };
    },
  },
  {
    id: "admin_user_exists",
    label: "Admin user available",
    description:
      "There must be at least one SUPER_ADMIN or ADMIN user, otherwise the ERP can become unmanageable.",
    severity: "error",
    autoFixable: false,
    run: async () => {
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(usersTable)
        .where(sql`${usersTable.role} in ('SUPER_ADMIN','ADMIN')`);
      const count = Number(rows[0]?.count ?? 0);
      return {
        ok: count > 0,
        detail: `${count} admin/super-admin user(s)`,
        count,
      };
    },
  },
  {
    id: "default_admin_password",
    label: "No default admin password",
    description:
      "Verifies that no admin/super-admin still uses the seeded 'admin123' password — a critical attack vector if the system is reachable from the internet.",
    severity: "error",
    autoFixable: false,
    run: async () => {
      const admins = await db
        .select({ id: usersTable.id, username: usersTable.username, passwordHash: usersTable.passwordHash })
        .from(usersTable)
        .where(sql`${usersTable.role} in ('SUPER_ADMIN','ADMIN')`);
      const offenders: string[] = [];
      for (const a of admins) {
        if (!a.passwordHash) continue;
        try {
          if (await bcrypt.compare("admin123", a.passwordHash)) offenders.push(a.username);
        } catch { /* ignore malformed hashes */ }
      }
      return {
        ok: offenders.length === 0,
        detail:
          offenders.length === 0
            ? "All admins use a custom password"
            : `Default password still active for: ${offenders.join(", ")}`,
        count: offenders.length,
      };
    },
  },
  {
    id: "jwt_secret_strong",
    label: "JWT signing secret is strong",
    description:
      "Confirms SESSION_SECRET is set, sufficiently long (>= 32 chars), and not one of the well-known defaults.",
    severity: "error",
    autoFixable: false,
    run: async () => {
      const s = process.env["SESSION_SECRET"] ?? "";
      const weak = ["", "secret", "changeme", "rathinam-secret", "dev-secret", "test"];
      const isWeak = weak.includes(s.toLowerCase()) || s.length < 32;
      return {
        ok: !isWeak,
        detail: isWeak
          ? `SESSION_SECRET is too weak (length=${s.length}). Generate at least 32 random chars.`
          : `Strong (length=${s.length})`,
        count: isWeak ? 1 : 0,
      };
    },
  },
  {
    id: "recent_backup_present",
    label: "Recent database backup exists",
    description:
      "Recoverability guard: a Postgres backup must exist on disk and be less than 25 hours old.",
    severity: "warn",
    autoFixable: true,
    run: async () => {
      const last = await getMostRecentBackup();
      if (!last) {
        return { ok: false, detail: "No backup files found yet.", count: 1 };
      }
      const ageHours = (Date.now() - new Date(last.createdAt).getTime()) / 3600_000;
      if (ageHours > 25) {
        return {
          ok: false,
          detail: `Most recent backup (${last.file}) is ${ageHours.toFixed(1)}h old — overdue.`,
          count: 1,
        };
      }
      const last2 = getLastBackupResult();
      const tail = last2 && !last2.ok ? ` Last attempt: ${last2.message}` : "";
      return {
        ok: true,
        detail: `Latest: ${last.file} (${(last.sizeBytes / 1024).toFixed(1)} KB, ${ageHours.toFixed(1)}h old).${tail}`,
        count: 0,
      };
    },
    fix: async () => {
      const { runBackup } = await import("./system-backup.js");
      const r = await runBackup();
      return {
        ok: r.ok,
        message: r.message,
        affected: r.ok ? 1 : 0,
      };
    },
  },
  {
    id: "company_settings_present",
    label: "Company settings present",
    description:
      "The 'company' settings row holds the brand info shown on invoices and receipts.",
    severity: "warn",
    autoFixable: false,
    run: async () => {
      const rows = await db
        .select()
        .from(settingsTable)
        .where(eq(settingsTable.key, "company"))
        .limit(1);
      const ok = rows.length > 0;
      return {
        ok,
        detail: ok ? "company key found" : "settings.company is missing",
        count: ok ? 0 : 1,
      };
    },
  },
];

// ---- Cached snapshot + scheduler ----

let lastSnapshot: HealthSnapshot | null = null;
const recentFixes: FixLogEntry[] = [];
const RECENT_FIX_LIMIT = 50;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let autoHealEnabled = false;

export function isAutoHealEnabled(): boolean {
  return autoHealEnabled;
}
export function setAutoHeal(v: boolean): void {
  autoHealEnabled = v;
}

export function getLastSnapshot(): HealthSnapshot | null {
  return lastSnapshot;
}

export function getCheckById(id: string): Check | undefined {
  return checks.find((c) => c.id === id);
}

export async function runAllChecks(opts: { allowAutoHeal?: boolean } = {}): Promise<HealthSnapshot> {
  const allowAutoHeal = opts.allowAutoHeal !== false;
  if (running && lastSnapshot) return lastSnapshot;
  running = true;
  const startedAt = new Date();
  const results: CheckResult[] = [];
  for (const c of checks) {
    const t0 = Date.now();
    try {
      const r = await c.run();
      results.push({
        id: c.id,
        label: c.label,
        description: c.description,
        severity: c.severity,
        autoFixable: c.autoFixable,
        ok: r.ok,
        detail: r.detail,
        count: r.count,
        durationMs: Date.now() - t0,
      });
    } catch (err) {
      results.push({
        id: c.id,
        label: c.label,
        description: c.description,
        severity: c.severity,
        autoFixable: c.autoFixable,
        ok: false,
        detail: `Threw: ${(err as Error).message ?? String(err)}`,
        count: 0,
        durationMs: Date.now() - t0,
      });
    }
  }
  const finishedAt = new Date();
  const passed = results.filter((r) => r.ok).length;
  const snapshot: HealthSnapshot = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    ok: results.every((r) => r.ok),
    totals: { passed, failed: results.length - passed, total: results.length },
    checks: results,
    recentFixes: [...recentFixes].slice(-10).reverse(),
  };
  lastSnapshot = snapshot;
  running = false;

  if (autoHealEnabled && allowAutoHeal) {
    for (const r of results) {
      if (!r.ok && r.autoFixable) {
        await runFix(r.id, "auto").catch((e) =>
          logger.error({ err: e, checkId: r.id }, "auto-heal failed"),
        );
      }
    }
  }
  return snapshot;
}

export async function runFix(
  id: string,
  trigger: "manual" | "auto" = "manual",
): Promise<FixLogEntry> {
  const c = getCheckById(id);
  const ts = new Date().toISOString();
  if (!c || !c.fix) {
    const entry: FixLogEntry = {
      ts,
      checkId: id,
      ok: false,
      message: "No fixer registered for this check",
      affected: 0,
    };
    pushFixLog(entry);
    return entry;
  }
  try {
    const r = await c.fix();
    const entry: FixLogEntry = {
      ts,
      checkId: id,
      ok: r.ok,
      message: `${trigger === "auto" ? "[auto] " : ""}${r.message}`,
      affected: r.affected,
    };
    pushFixLog(entry);
    logger.info({ checkId: id, trigger, affected: r.affected }, "system-health fix applied");
    // Refresh the snapshot but skip auto-heal to avoid runFix → runAllChecks → runFix recursion.
    await runAllChecks({ allowAutoHeal: false });
    return entry;
  } catch (err) {
    const entry: FixLogEntry = {
      ts,
      checkId: id,
      ok: false,
      message: `Fixer threw: ${(err as Error).message ?? String(err)}`,
      affected: 0,
    };
    pushFixLog(entry);
    return entry;
  }
}

function pushFixLog(e: FixLogEntry): void {
  recentFixes.push(e);
  if (recentFixes.length > RECENT_FIX_LIMIT) {
    recentFixes.splice(0, recentFixes.length - RECENT_FIX_LIMIT);
  }
}

/** Start the every-60s background sweep. Idempotent. */
export function startSystemHealthScheduler(intervalMs = 60_000): void {
  if (timer) return;
  // Kick off an initial run on boot, then schedule recurring sweeps.
  runAllChecks().catch((e) =>
    logger.error({ err: e }, "initial system-health sweep failed"),
  );
  timer = setInterval(() => {
    runAllChecks().catch((e) =>
      logger.error({ err: e }, "scheduled system-health sweep failed"),
    );
  }, intervalMs);
  // Don't keep the process alive purely for this timer.
  if (typeof timer === "object" && timer !== null && "unref" in (timer as object)) {
    (timer as unknown as { unref?: () => void }).unref?.();
  }
  logger.info({ intervalMs }, "system-health scheduler started");
}

export function stopSystemHealthScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
