import { Router } from "express";
import { db, couponsTable, insertCouponSchema } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { authenticate, requireRole, type AuthRequest } from "../../middleware/authenticate.js";
import { CATALOG_ADMIN } from "../../lib/auth-roles.js";
import { auditWrite } from "../../lib/audit.js";

const router = Router();
const updateCouponSchema = insertCouponSchema.partial();

router.get("/coupons", authenticate, async (req, res) => {
  const { status, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pg = Math.max(1, parseInt(page));
  const lim = Math.min(100, parseInt(limit));
  const offset = (pg - 1) * lim;
  const conditions = [];
  if (status) conditions.push(eq(couponsTable.status, status as any));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, countRows] = await Promise.all([
    db.select().from(couponsTable).where(where).limit(lim).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(couponsTable).where(where),
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  res.json({ success: true, data: rows, meta: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) } });
});

router.get("/coupons/public", async (req, res) => {
  const conditions = [eq(couponsTable.status, "active")];
  if (req.query["autoApply"] === "true") conditions.push(eq(couponsTable.autoApply, true));
  const rows = await db.select().from(couponsTable).where(and(...conditions)).limit(50);
  res.json({ success: true, data: rows, meta: { page: 1, limit: 50, total: rows.length, pages: 1 } });
});

router.post("/coupons/validate", async (req, res) => {
  const { code, cartTotal, channel, customerType } = req.body as {
    code: string; cartTotal: number; customerId?: string; channel?: string; customerType?: string;
  };
  const fail = (error: string) => {
    res.json({ success: true, data: { valid: false, discountAmount: 0, discountDescription: "", couponId: null, error } });
  };
  const rows = await db.select().from(couponsTable).where(eq(couponsTable.code, code.toUpperCase())).limit(1);
  const coupon = rows[0];
  if (!coupon) { fail("Coupon not found"); return; }
  if (coupon.status !== "active") { fail("Coupon is not active"); return; }
  const now = new Date().toISOString().slice(0, 10);
  if (now < coupon.validFrom || now > coupon.validUntil) { fail("Coupon expired or not yet valid"); return; }
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) { fail("Coupon usage limit reached"); return; }
  if (coupon.minOrderValue && cartTotal < Number(coupon.minOrderValue)) { fail(`Minimum order value: ₹${coupon.minOrderValue}`); return; }

  // Channel & customer-type gating. Empty arrays mean "no restriction" so
  // existing coupons keep working without a backfill.
  const channels = (coupon.applicableChannels ?? []) as string[];
  if (channels.length > 0 && channel && !channels.includes(channel)) {
    fail(`Coupon not valid for ${channel === "pos" ? "in-store" : channel} orders`);
    return;
  }
  const types = (coupon.applicableCustomerTypes ?? []) as string[];
  if (types.length > 0 && customerType && !types.includes(customerType)) {
    fail(`Coupon not valid for ${customerType} customers`);
    return;
  }

  let discountAmount = 0;
  if (coupon.type === "percent") {
    discountAmount = (cartTotal * Number(coupon.discountValue)) / 100;
    if (coupon.maxDiscountCap) discountAmount = Math.min(discountAmount, Number(coupon.maxDiscountCap));
  } else if (coupon.type === "flat") {
    discountAmount = Number(coupon.discountValue);
  }

  res.json({
    success: true,
    data: {
      valid: true,
      discountAmount,
      discountDescription: `${coupon.type === "percent" ? coupon.discountValue + "% off" : "₹" + coupon.discountValue + " off"} — ${coupon.description ?? ""}`,
      couponId: coupon.id,
      error: null,
    },
  });
});

router.post("/coupons", authenticate, requireRole(...CATALOG_ADMIN), async (req: AuthRequest, res) => {
  const parsed = insertCouponSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: z.prettifyError(parsed.error) } });
    return;
  }
  const [coupon] = await db.insert(couponsTable).values({ ...parsed.data, id: crypto.randomUUID(), code: parsed.data.code.toUpperCase() }).returning();
  await auditWrite(req, { action: "CREATE", entityType: "coupon", entityId: coupon?.id, after: coupon });
  res.status(201).json(coupon);
});

router.get("/coupons/:id", authenticate, async (req, res) => {
  const rows = await db.select().from(couponsTable).where(eq(couponsTable.id, req.params["id"] as string)).limit(1);
  if (!rows[0]) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Coupon not found" } }); return; }
  res.json(rows[0]);
});

router.put("/coupons/:id", authenticate, requireRole(...CATALOG_ADMIN), async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const parsed = updateCouponSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: z.prettifyError(parsed.error) } });
    return;
  }
  const patch: Record<string, unknown> = { ...parsed.data };
  if (typeof patch["code"] === "string") patch["code"] = (patch["code"] as string).toUpperCase();
  const before = (await db.select().from(couponsTable).where(eq(couponsTable.id, id)).limit(1))[0] ?? null;
  const [coupon] = await db.update(couponsTable).set(patch).where(eq(couponsTable.id, id)).returning();
  if (!coupon) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Coupon not found" } }); return; }
  await auditWrite(req, { action: "UPDATE", entityType: "coupon", entityId: id, before, after: coupon });
  res.json(coupon);
});

// Soft-delete: coupons are referenced by coupon_usages history, so we can't
// hard-delete without breaking the audit trail. Mark as expired instead.
router.delete("/coupons/:id", authenticate, requireRole(...CATALOG_ADMIN), async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const before = (await db.select().from(couponsTable).where(eq(couponsTable.id, id)).limit(1))[0] ?? null;
  if (!before) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Coupon not found" } }); return; }
  const [coupon] = await db.update(couponsTable).set({ status: "expired" }).where(eq(couponsTable.id, id)).returning();
  await auditWrite(req, { action: "DELETE", entityType: "coupon", entityId: id, before, after: coupon });
  res.json({ success: true, data: { id } });
});

export default router;
