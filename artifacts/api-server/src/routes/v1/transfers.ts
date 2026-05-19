import { Router } from "express";
import { db, transfersTable, locationsTable } from "@workspace/db";
import { eq, and, sql, or } from "drizzle-orm";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { WAREHOUSE_ROLES } from "../../lib/auth-roles.js";
import { nextTransferNo } from "../../lib/counter.js";
import { appendLedger } from "../../lib/stockService.js";
import type { AuthRequest } from "../../middleware/authenticate.js";

// Module-level test-hook gate. See pos.ts for full rationale; production
// deployments never set this env var so the body flag is inert.
const E2E_TEST_HOOKS = process.env["E2E_TEST_HOOKS"] === "1";

const router = Router();

router.get("/transfers", authenticate, async (req, res) => {
  const { status, fromLocationId, toLocationId, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pg = Math.max(1, parseInt(page));
  const lim = Math.min(100, parseInt(limit));
  const offset = (pg - 1) * lim;
  const conditions = [];
  if (status) conditions.push(eq(transfersTable.status, status as any));
  if (fromLocationId) conditions.push(eq(transfersTable.fromLocationId, fromLocationId));
  if (toLocationId) conditions.push(eq(transfersTable.toLocationId, toLocationId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, countRows] = await Promise.all([
    db.select().from(transfersTable).where(where).limit(lim).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(transfersTable).where(where),
  ]);
  const total = Number(countRows[0]?.count ?? 0);
  res.json({ success: true, data: rows, meta: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) } });
});

router.get("/transfers/pending", authenticate, async (_req, res) => {
  const rows = await db.select().from(transfersTable).where(
    or(eq(transfersTable.status, "pending_approval"), eq(transfersTable.status, "in_transit"))
  ).limit(50);
  res.json({ success: true, data: rows, meta: { page: 1, limit: 50, total: rows.length, pages: 1 } });
});

router.post("/transfers", authenticate, requireRole(...WAREHOUSE_ROLES), async (req: AuthRequest, res) => {
  const { fromLocationId, toLocationId, items, notes } = req.body;
  const [fromLoc, toLoc] = await Promise.all([
    db.select().from(locationsTable).where(eq(locationsTable.id, fromLocationId)).limit(1),
    db.select().from(locationsTable).where(eq(locationsTable.id, toLocationId)).limit(1),
  ]);
  const transferNo = await nextTransferNo();
  const [transfer] = await db.insert(transfersTable).values({
    id: crypto.randomUUID(),
    transferNo,
    fromLocationId,
    fromLocationName: fromLoc[0]?.name,
    toLocationId,
    toLocationName: toLoc[0]?.name,
    items: items.map((i: any) => ({ ...i, receivedQty: 0 })),
    notes,
    status: "draft",
    createdBy: req.user?.id,
  }).returning();
  res.status(201).json({ success: true, data: transfer });
});

router.get("/transfers/:id", authenticate, async (req, res) => {
  const rows = await db.select().from(transfersTable).where(eq(transfersTable.id, req.params["id"] as string)).limit(1);
  if (!rows[0]) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Transfer not found" } }); return; }
  res.json({ success: true, data: rows[0] });
});

router.put("/transfers/:id/dispatch", authenticate, requireRole(...WAREHOUSE_ROLES), async (req: AuthRequest, res) => {
  const tRows = await db.select().from(transfersTable).where(eq(transfersTable.id, req.params["id"] as string)).limit(1);
  if (!tRows[0]) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Transfer not found" } }); return; }
  const t = tRows[0];
  const items = (t.items ?? []) as any[];

  const forceFail =
    E2E_TEST_HOOKS &&
    (req.body as { __forceFailAfterLedger?: boolean })?.__forceFailAfterLedger === true;

  // Atomic: deduct source stock + flip transfer to in_transit together.
  await db.transaction(async (tx) => {
    for (const item of items) {
      await appendLedger(
        {
          productId: item.productId,
          variantId: item.variantId,
          locationId: t.fromLocationId,
          type: "MOVE",
          qty: -item.qty,
          batchNo: item.batchNo,
          refType: "TRANSFER",
          refId: t.id,
          notes: `Transfer out to ${t.toLocationName}`,
          createdBy: req.user?.id,
        },
        tx,
      );
    }
    if (forceFail) throw new Error("__test_force_fail_after_ledger");
    await tx.update(transfersTable).set({
      status: "in_transit",
      vehicleNo: req.body.vehicleNo,
      dispatchedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(transfersTable.id, t.id));
  });

  res.json({ success: true, message: "Transfer dispatched" });
});

router.put("/transfers/:id/receive", authenticate, requireRole(...WAREHOUSE_ROLES), async (req: AuthRequest, res) => {
  const tRows = await db.select().from(transfersTable).where(eq(transfersTable.id, req.params["id"] as string)).limit(1);
  if (!tRows[0]) { res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Transfer not found" } }); return; }
  const t = tRows[0];
  const { items } = req.body as { items: Array<{ productId: string; variantId: string; receivedQty: number }> };

  const forceFailRecv =
    E2E_TEST_HOOKS &&
    (req.body as { __forceFailAfterLedger?: boolean })?.__forceFailAfterLedger === true;

  // Atomic: credit destination stock + close the transfer together.
  await db.transaction(async (tx) => {
    for (const item of items) {
      if (item.receivedQty > 0) {
        await appendLedger(
          {
            productId: item.productId,
            variantId: item.variantId,
            locationId: t.toLocationId,
            type: "MOVE",
            qty: item.receivedQty,
            refType: "TRANSFER",
            refId: t.id,
            notes: `Transfer in from ${t.fromLocationName}`,
            createdBy: req.user?.id,
          },
          tx,
        );
      }
    }
    if (forceFailRecv) throw new Error("__test_force_fail_after_ledger");
    await tx.update(transfersTable).set({
      status: "received",
      receivedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(transfersTable.id, t.id));
  });

  res.json({ success: true, message: "Transfer received" });
});

export default router;
