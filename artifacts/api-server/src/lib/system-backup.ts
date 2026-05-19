import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { logger } from "./logger.js";

const execFileP = promisify(execFile);

// Resolve a writable backup directory. /tmp persists for the life of the
// container; for production deployments a mounted volume should be used,
// but this keeps the system functional out of the box.
const BACKUP_DIR =
  process.env["SYSTEM_BACKUP_DIR"] ??
  path.resolve(process.cwd(), ".local/backups");
const RETAIN = 7;

export type BackupEntry = {
  file: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
};

export type BackupResult = {
  ok: boolean;
  file?: string;
  sizeBytes?: number;
  durationMs: number;
  message: string;
};

let busy = false;
let lastResult: BackupResult | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

export function getLastBackupResult(): BackupResult | null {
  return lastResult;
}

export async function listBackups(): Promise<BackupEntry[]> {
  if (!existsSync(BACKUP_DIR)) return [];
  const files = await readdir(BACKUP_DIR);
  const out: BackupEntry[] = [];
  for (const f of files) {
    if (!f.endsWith(".sql.gz") && !f.endsWith(".sql")) continue;
    const p = path.join(BACKUP_DIR, f);
    const s = await stat(p);
    out.push({
      file: f,
      path: p,
      sizeBytes: s.size,
      createdAt: s.mtime.toISOString(),
    });
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getMostRecentBackup(): Promise<BackupEntry | null> {
  const all = await listBackups();
  return all[0] ?? null;
}

export async function runBackup(): Promise<BackupResult> {
  if (busy) {
    return {
      ok: false,
      durationMs: 0,
      message: "A backup is already running.",
    };
  }
  const dbUrl = process.env["DATABASE_URL"];
  if (!dbUrl) {
    const r: BackupResult = {
      ok: false,
      durationMs: 0,
      message: "DATABASE_URL is not set; cannot dump.",
    };
    lastResult = r;
    return r;
  }
  busy = true;
  const t0 = Date.now();
  try {
    await mkdir(BACKUP_DIR, { recursive: true });
    const stamp = new Date()
      .toISOString()
      .replace(/[:T]/g, "-")
      .replace(/\..+$/, "")
      .replace(/-/g, "")
      .replace(/(\d{8})(\d{6})/, "$1-$2");
    const file = `backup-${stamp}.sql.gz`;
    const dest = path.join(BACKUP_DIR, file);

    // pg_dump → gzip in a shell pipeline. Use bash -c so the pipe works
    // portably without spawning a separate gzip process from Node.
    await execFileP("bash", [
      "-c",
      `pg_dump --no-owner --no-privileges --format=plain "${dbUrl.replace(/"/g, '\\"')}" | gzip -9 > "${dest}"`,
    ], { maxBuffer: 1024 * 1024 * 64 });

    const s = await stat(dest);
    if (s.size < 1024) {
      // pg_dump exited 0 but produced an empty/tiny file — treat as failure.
      await unlink(dest).catch(() => {});
      const r: BackupResult = {
        ok: false,
        durationMs: Date.now() - t0,
        message: `pg_dump produced only ${s.size} bytes — backup discarded.`,
      };
      lastResult = r;
      return r;
    }

    // Retention: keep the most recent RETAIN backups.
    const all = await listBackups();
    for (const old of all.slice(RETAIN)) {
      await unlink(old.path).catch(() => {});
    }

    const r: BackupResult = {
      ok: true,
      file,
      sizeBytes: s.size,
      durationMs: Date.now() - t0,
      message: `Wrote ${file} (${(s.size / 1024).toFixed(1)} KB).`,
    };
    lastResult = r;
    logger.info({ file, sizeBytes: s.size, ms: r.durationMs }, "system backup complete");
    return r;
  } catch (err) {
    const r: BackupResult = {
      ok: false,
      durationMs: Date.now() - t0,
      message: `pg_dump failed: ${(err as Error).message ?? String(err)}`,
    };
    lastResult = r;
    logger.error({ err }, "system backup failed");
    return r;
  } finally {
    busy = false;
  }
}

/** Schedule a backup once every 24h. Idempotent. */
export function startBackupScheduler(intervalMs = 24 * 60 * 60 * 1000): void {
  if (timer) return;
  // First backup runs after ~10s so server boot stays snappy.
  setTimeout(() => {
    void runBackup();
  }, 10_000);
  timer = setInterval(() => {
    void runBackup();
  }, intervalMs);
  if (typeof timer === "object" && timer !== null && "unref" in (timer as object)) {
    (timer as unknown as { unref?: () => void }).unref?.();
  }
  logger.info({ intervalMs, dir: BACKUP_DIR }, "backup scheduler started");
}

export function getBackupDir(): string {
  return BACKUP_DIR;
}
