import { Router, type IRouter } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import {
  getLastSnapshot,
  runAllChecks,
  runFix,
  isAutoHealEnabled,
  setAutoHeal,
  getCheckById,
} from "../../lib/system-health.js";
import {
  listBackups,
  runBackup,
  getLastBackupResult,
  getBackupDir,
} from "../../lib/system-backup.js";
import { resetDemoData, seedDemoData, demoStats } from "../../lib/demo-data.js";

const router: IRouter = Router();

/** Latest cached snapshot — cheap, served by every poll from the ERP UI. */
router.get(
  "/system/health",
  authenticate,
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (_req, res) => {
    const snap = getLastSnapshot();
    if (!snap) {
      const fresh = await runAllChecks();
      res.json({ success: true, data: { ...fresh, autoHeal: isAutoHealEnabled() } });
      return;
    }
    res.json({ success: true, data: { ...snap, autoHeal: isAutoHealEnabled() } });
  },
);

/** Force a fresh sweep on demand. */
router.post(
  "/system/health/run",
  authenticate,
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (_req, res) => {
    const fresh = await runAllChecks();
    res.json({ success: true, data: { ...fresh, autoHeal: isAutoHealEnabled() } });
  },
);

/** Toggle the auto-heal flag (admins only). */
router.put(
  "/system/health/auto-heal",
  authenticate,
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const enabled = !!(req.body as { enabled?: boolean })?.enabled;
    setAutoHeal(enabled);
    res.json({ success: true, data: { autoHeal: enabled } });
  },
);

/** Run a single check's auto-fixer (admins only). */
router.post(
  "/system/health/fix/:id",
  authenticate,
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const id = String(req.params["id"] ?? "");
    const c = getCheckById(id);
    if (!c) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: `Unknown check '${id}'` },
      });
      return;
    }
    if (!c.fix) {
      res.status(409).json({
        success: false,
        error: { code: "NOT_FIXABLE", message: `Check '${id}' has no auto-fixer.` },
      });
      return;
    }
    const result = await runFix(id, "manual");
    res.json({ success: result.ok, data: result });
  },
);

/** List available database backups (admins only). */
router.get(
  "/system/backups",
  authenticate,
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (_req, res) => {
    const items = await listBackups();
    res.json({
      success: true,
      data: { dir: getBackupDir(), last: getLastBackupResult(), items },
    });
  },
);

/** Trigger a fresh DB backup on demand (admins only). */
router.post(
  "/system/backup/run",
  authenticate,
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (_req, res) => {
    const r = await runBackup();
    res.status(r.ok ? 200 : 500).json({ success: r.ok, data: r });
  },
);

// ---------- Demo data (SUPER_ADMIN only) ----------
//
// These endpoints power the ERP /system/demo screen. They are gated to
// SUPER_ADMIN so a stray cashier or accountant can never blow away
// production data — the UI also double-confirms with a typed phrase.

/** Cheap row counts for the confirmation card on the demo page. */
router.get(
  "/system/demo/stats",
  authenticate,
  requireRole("SUPER_ADMIN"),
  async (_req, res) => {
    const data = await demoStats();
    res.json({ success: true, data });
  },
);

/** Wipe all transactional tables (preserves masters: products/customers/etc). */
router.post(
  "/system/demo/reset",
  authenticate,
  requireRole("SUPER_ADMIN"),
  async (req, res) => {
    const confirm = String((req.body as { confirm?: string })?.confirm ?? "");
    if (confirm !== "RESET") {
      res.status(400).json({
        success: false,
        error: { code: "CONFIRM_REQUIRED", message: "Body must include { confirm: 'RESET' }" },
      });
      return;
    }
    const result = await resetDemoData();
    req.log?.warn({ cleared: result.cleared, actor: (req as any).user?.id }, "demo data reset");
    res.json({ success: true, data: result });
  },
);

/** Seed a small batch of deterministic demo records on top of existing masters. */
router.post(
  "/system/demo/seed",
  authenticate,
  requireRole("SUPER_ADMIN"),
  async (req, res) => {
    const result = await seedDemoData();
    req.log?.info({ created: result.created, actor: (req as any).user?.id }, "demo data seeded");
    res.json({ success: true, data: result });
  },
);

export default router;
