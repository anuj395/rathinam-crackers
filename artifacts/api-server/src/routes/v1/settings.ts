import { Router } from "express";
import { z } from "zod";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middleware/authenticate.js";
import { auditWrite } from "../../lib/audit.js";
import {
  AUDIT_SETTINGS_KEY,
  DEFAULT_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  pruneOldAuditLogs,
  getLastPruneResult,
} from "../../lib/audit-retention.js";

const router = Router();

// --- Schemas ---------------------------------------------------------------
// Field names are kept aligned with the ERP Settings page so PUT/GET round-trip
// without dropping data. Anything not listed here is rejected so the settings
// row stays clean.

const companySchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(120),
  gstin: z.string().trim().max(20).optional().default(""),
  email: z.string().trim().email("Invalid email").or(z.literal("")).optional().default(""),
  phone: z.string().trim().max(20).optional().default(""),
  address: z.string().trim().max(500).optional().default(""),
  bankName: z.string().trim().max(120).optional().default(""),
  accountNumber: z.string().trim().max(40).optional().default(""),
  ifscCode: z.string().trim().max(20).optional().default(""),
  invoiceStartNumber: z.number().int().min(1).optional().default(1),
  financialYear: z.string().trim().max(15).optional().default("2025-2026"),
  defaultHSN: z.string().trim().max(15).optional().default("36049000"),
});

const hsnRateSchema = z.object({
  hsn: z.string().trim().min(1, "HSN is required").max(20),
  rate: z.number().min(0).max(28),
  label: z.string().trim().max(60).optional().default(""),
  active: z.boolean().optional().default(true),
});

const pricingSchema = z.object({
  wholesaleThreshold: z.number().int().min(1).max(10000).default(50),
  // Master GST switch. Off = invoices and POS bills are tax-free (cgst/sgst/igst
  // all zero). On = each line uses the per-product override → HSN slab → default.
  gstEnabled: z.boolean().optional().default(true),
  defaultGstRate: z.number().int().min(0).max(28).default(18),
  // Tax slabs keyed by HSN code. Admins manage this list from Settings → Pricing.
  hsnRates: z.array(hsnRateSchema).optional().default([]),
  loyaltyEarnRate: z.number().min(0).max(100).default(1),
  loyaltyRedemptionRate: z.number().min(0).max(100).optional().default(1),
  defaultPriceListId: z.string().nullable().optional().default(null),
  // taxRate kept as a fraction (0.18) for the pricing engine; derived from
  // defaultGstRate when not supplied explicitly.
  taxRate: z.number().min(0).max(1).optional(),
  // Server-enforced caps so a malicious POS client can't bypass the UI.
  maxCashierDiscountPct: z.number().min(0).max(100).optional().default(10),
  maxManagerDiscountPct: z.number().min(0).max(100).optional().default(50),
});

const companyDefaults = {
  name: "Rathinam Crackers",
  gstin: "",
  email: "",
  phone: "",
  address: "Sivakasi, Tamil Nadu",
  bankName: "",
  accountNumber: "",
  ifscCode: "",
  invoiceStartNumber: 1,
  financialYear: "2025-2026",
  defaultHSN: "36049000",
};

const pricingDefaults = {
  wholesaleThreshold: 50,
  gstEnabled: true,
  defaultGstRate: 18,
  hsnRates: [] as Array<{ hsn: string; rate: number; label?: string; active?: boolean }>,
  loyaltyEarnRate: 1,
  loyaltyRedemptionRate: 1,
  defaultPriceListId: null,
  taxRate: 0.18,
  maxCashierDiscountPct: 10,
  maxManagerDiscountPct: 50,
};

// --- Routes ----------------------------------------------------------------

router.get("/settings/company", authenticate, async (_req, res) => {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, "company")).limit(1);
  // Merge stored value over defaults so newly-added fields don't disappear in
  // the UI for tenants that saved settings before the field existed.
  const stored = (rows[0]?.value as Record<string, unknown> | undefined) ?? {};
  res.json({ success: true, data: { ...companyDefaults, ...stored } });
});

router.put(
  "/settings/company",
  authenticate,
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req: AuthRequest, res) => {
    const parsed = companySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid company settings", details: parsed.error.issues },
      });
      return;
    }
    const value = parsed.data;
    const before = (await db.select().from(settingsTable).where(eq(settingsTable.key, "company")).limit(1))[0]?.value ?? null;
    await db
      .insert(settingsTable)
      .values({ key: "company", value })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
    await auditWrite(req, { action: "UPDATE", entityType: "settings.company", entityId: "company", before, after: value });
    res.json({ success: true, data: value });
  },
);

router.get("/settings/pricing", authenticate, async (_req, res) => {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, "pricing")).limit(1);
  const stored = (rows[0]?.value as Record<string, unknown> | undefined) ?? {};
  res.json({ success: true, data: { ...pricingDefaults, ...stored } });
});

router.put(
  "/settings/pricing",
  authenticate,
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req: AuthRequest, res) => {
    const parsed = pricingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid pricing settings", details: parsed.error.issues },
      });
      return;
    }
    // Keep taxRate consistent with the human-friendly defaultGstRate so the
    // pricing engine and the UI never drift apart.
    const value = { ...parsed.data, taxRate: parsed.data.taxRate ?? parsed.data.defaultGstRate / 100 };
    const before = (await db.select().from(settingsTable).where(eq(settingsTable.key, "pricing")).limit(1))[0]?.value ?? null;
    await db
      .insert(settingsTable)
      .values({ key: "pricing", value })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
    await auditWrite(req, { action: "UPDATE", entityType: "settings.pricing", entityId: "pricing", before, after: value });
    res.json({ success: true, data: value });
  },
);

// --- Audit retention -------------------------------------------------------
// The audit_log table grows on every admin write, so a configurable retention
// window keeps the Activity log fast and the database lean. The scheduled
// prune in lib/audit-retention.ts reads this same setting on every run.

const auditSchema = z.object({
  retentionDays: z
    .number()
    .int()
    .min(MIN_RETENTION_DAYS)
    .max(MAX_RETENTION_DAYS)
    .default(DEFAULT_RETENTION_DAYS),
});

const auditDefaults = {
  retentionDays: DEFAULT_RETENTION_DAYS,
};

router.get("/settings/audit", authenticate, requireRole("SUPER_ADMIN", "ADMIN"), async (_req, res) => {
  const rows = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, AUDIT_SETTINGS_KEY))
    .limit(1);
  const stored = (rows[0]?.value as Record<string, unknown> | undefined) ?? {};
  res.json({
    success: true,
    data: {
      ...auditDefaults,
      ...stored,
      lastPrune: getLastPruneResult(),
    },
  });
});

// Mutating retention or pruning is restricted to SUPER_ADMIN: ADMINs are
// themselves audited, so allowing them to shorten retention or trigger a
// prune would let them erase evidence of their own actions.
router.put(
  "/settings/audit",
  authenticate,
  requireRole("SUPER_ADMIN"),
  async (req: AuthRequest, res) => {
    const parsed = auditSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid audit settings",
          details: parsed.error.issues,
        },
      });
      return;
    }
    const value = parsed.data;
    const before =
      (
        await db
          .select()
          .from(settingsTable)
          .where(eq(settingsTable.key, AUDIT_SETTINGS_KEY))
          .limit(1)
      )[0]?.value ?? null;
    await db
      .insert(settingsTable)
      .values({ key: AUDIT_SETTINGS_KEY, value })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: { value, updatedAt: new Date() },
      });
    await auditWrite(req, {
      action: "UPDATE",
      entityType: "settings.audit",
      entityId: AUDIT_SETTINGS_KEY,
      before,
      after: value,
    });
    res.json({ success: true, data: value });
  },
);

// Manual trigger so admins can prune immediately after shortening the window
// rather than waiting for the next scheduled run.
router.post(
  "/settings/audit/prune",
  authenticate,
  requireRole("SUPER_ADMIN"),
  async (req: AuthRequest, res) => {
    const result = await pruneOldAuditLogs();
    await auditWrite(req, {
      action: "DELETE",
      entityType: "settings.audit",
      entityId: "prune",
      before: null,
      after: result,
    });
    res.json({ success: result.ok, data: result });
  },
);

export default router;
