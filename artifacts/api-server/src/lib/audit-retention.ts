import { db, auditLogTable, settingsTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";
import { logger } from "./logger.js";

export const AUDIT_SETTINGS_KEY = "audit";
export const DEFAULT_RETENTION_DAYS = 365;
export const MIN_RETENTION_DAYS = 1;
export const MAX_RETENTION_DAYS = 3650;

export type AuditSettings = {
  retentionDays: number;
};

export const auditDefaults: AuditSettings = {
  retentionDays: DEFAULT_RETENTION_DAYS,
};

export type PruneResult = {
  ok: boolean;
  deleted: number;
  cutoff: string;
  retentionDays: number;
  durationMs: number;
  message: string;
};

let busy = false;
let lastResult: PruneResult | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

export function getLastPruneResult(): PruneResult | null {
  return lastResult;
}

/** Read the current audit retention window (days) from settings.audit. */
export async function getAuditRetentionDays(): Promise<number> {
  try {
    const row = (
      await db
        .select()
        .from(settingsTable)
        .where(eq(settingsTable.key, AUDIT_SETTINGS_KEY))
        .limit(1)
    )[0];
    const stored = (row?.value as Partial<AuditSettings> | undefined) ?? {};
    const n = Number(stored.retentionDays);
    if (!Number.isFinite(n) || n < MIN_RETENTION_DAYS) {
      return DEFAULT_RETENTION_DAYS;
    }
    return Math.min(Math.floor(n), MAX_RETENTION_DAYS);
  } catch (err) {
    logger.error({ err }, "audit retention: failed to read settings");
    return DEFAULT_RETENTION_DAYS;
  }
}

/** Delete audit_log rows older than the configured retention window. */
export async function pruneOldAuditLogs(): Promise<PruneResult> {
  if (busy) {
    return {
      ok: false,
      deleted: 0,
      cutoff: new Date().toISOString(),
      retentionDays: 0,
      durationMs: 0,
      message: "A prune is already running.",
    };
  }
  busy = true;
  const t0 = Date.now();
  try {
    const retentionDays = await getAuditRetentionDays();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    // Use rowCount rather than RETURNING * so a large backlog doesn't pull
    // every deleted id into memory just to count them.
    const result = await db
      .delete(auditLogTable)
      .where(lt(auditLogTable.createdAt, cutoff));
    const deleted = (result as { rowCount?: number | null }).rowCount ?? 0;
    const r: PruneResult = {
      ok: true,
      deleted,
      cutoff: cutoff.toISOString(),
      retentionDays,
      durationMs: Date.now() - t0,
      message: `Pruned ${deleted} row(s) older than ${cutoff.toISOString()} (retention ${retentionDays}d).`,
    };
    lastResult = r;
    if (deleted > 0) {
      logger.info(
        { deleted, cutoff: r.cutoff, retentionDays },
        "audit retention prune complete",
      );
    }
    return r;
  } catch (err) {
    const r: PruneResult = {
      ok: false,
      deleted: 0,
      cutoff: new Date().toISOString(),
      retentionDays: 0,
      durationMs: Date.now() - t0,
      message: `Audit prune failed: ${(err as Error).message ?? String(err)}`,
    };
    lastResult = r;
    logger.error({ err }, "audit retention prune failed");
    return r;
  } finally {
    busy = false;
  }
}

/**
 * Schedule the audit-log prune. Runs once shortly after boot (so a long-lived
 * server still prunes without waiting a full day) and then every `intervalMs`.
 * Idempotent: calling twice is a no-op.
 */
export function startAuditRetentionScheduler(
  intervalMs = 24 * 60 * 60 * 1000,
): void {
  if (timer) return;
  // First prune ~30s after boot to keep startup snappy and avoid colliding
  // with the backup scheduler that fires at ~10s.
  setTimeout(() => {
    void pruneOldAuditLogs();
  }, 30_000);
  timer = setInterval(() => {
    void pruneOldAuditLogs();
  }, intervalMs);
  if (typeof timer === "object" && timer !== null && "unref" in (timer as object)) {
    (timer as unknown as { unref?: () => void }).unref?.();
  }
  logger.info({ intervalMs }, "audit retention scheduler started");
}
