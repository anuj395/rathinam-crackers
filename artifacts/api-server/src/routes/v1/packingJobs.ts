import { Router } from "express";
import { db, packingJobsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { WAREHOUSE_ROLES } from "../../lib/auth-roles.js";
import { nextPackingJobNo } from "../../lib/counter.js";
import { appendLedger } from "../../lib/stockService.js";
import type { AuthRequest } from "../../middleware/authenticate.js";

const router = Router();

router.get("/packing-jobs", authenticate, async (req, res) => {
  const { status, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pg = Math.max(1, parseInt(page));
  const lim = Math.min(100, parseInt(limit));
  const offset = (pg - 1) * lim;
  const conditions = [];
  if (status) conditions.push(eq(packingJobsTable.status, status as any));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, countRows] = await Promise.all([
    db.select().from(packingJobsTable).where(where).limit(lim).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(packingJobsTable).where(where),
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  res.json({ success: true, data: rows, meta: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) } });
});

router.post("/packing-jobs", authenticate, requireRole(...WAREHOUSE_ROLES), async (req: AuthRequest, res) => {
  const { locationId, rawMaterials, finishedGoods, notes } = req.body;
  const jobNumber = await nextPackingJobNo();
  const [job] = await db.insert(packingJobsTable).values({
    id: crypto.randomUUID(),
    jobNumber,
    locationId,
    rawMaterials,
    finishedGoods,
    notes,
    status: "pending",
    createdBy: req.user?.id,
  }).returning();
  res.status(201).json({ success: true, data: job });
});

router.put("/packing-jobs/:id/complete", authenticate, requireRole(...WAREHOUSE_ROLES), async (req: AuthRequest, res) => {
  const rows = await db.select().from(packingJobsTable).where(eq(packingJobsTable.id, req.params["id"] as string)).limit(1);
  if (!rows[0]) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Job not found" } }); return; }
  const job = rows[0];

  // Deduct raw materials
  const rawMaterials = (job.rawMaterials ?? []) as any[];
  for (const item of rawMaterials) {
    await appendLedger({ productId: item.productId, variantId: item.variantId, locationId: job.locationId, type: "OUT", qty: -item.qty, refType: "PACKING", refId: job.id, createdBy: req.user?.id });
  }
  // Add finished goods
  const finishedGoods = (job.finishedGoods ?? []) as any[];
  for (const item of finishedGoods) {
    await appendLedger({ productId: item.productId, variantId: item.variantId, locationId: job.locationId, type: "IN", qty: item.qty, refType: "PACKING", refId: job.id, createdBy: req.user?.id });
  }

  const [updated] = await db.update(packingJobsTable).set({ status: "completed", completedAt: new Date() }).where(eq(packingJobsTable.id, job.id)).returning();
  res.json({ success: true, data: updated });
});

export default router;
